/**
 * DevHub Sidecar Backend
 *
 * Responsabilidades:
 * 1. Gestionar sesiones PTY persistentes (sobreviven al cierre de ventana)
 * 2. Escribir PID en $DEVHUB_HOME/sidecar.pid (o ~/.devhub) para que Tauri detecte si ya corre
 * 3. Escribir puerto en $DEVHUB_HOME/sidecar-port.txt para el shutdown graceful
 * 4. Exponer POST /shutdown para que Tauri cierre el sidecar limpiamente
 */

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const pty = require('node-pty');
const os = require('os');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const { resolveSidecarSessionCwd } = require('./sessionCwd');
const { buildSidecarSpawnConfig, parseBooleanQueryFlag } = require('./sessionSpawn');
const {
  buildHistoryReplay,
  buildServerMessage,
  detectOpenCodeSessionId,
  detectOpenCodeTuiReady,
  filterTerminalInputForSession,
  filterTerminalOutputForSession,
  getTransportMode,
  parseClientMessage,
  updateSessionModeFromInput,
} = require('./sessionTransport');
const { writeOpencodeReadyMarker } = require('./opencodeReadyMarker');

// ─── Directorios de estado ────────────────────────────────────────────────────
// Respeta DEVHUB_HOME cuando el wrapper / Tauri lo pasan (permite tests con home
// temporal y consistencia con la lógica de extracción del wrapper). Fallback al
// default para compatibilidad.
const DEVHUB_DIR = process.env.DEVHUB_HOME || path.join(os.homedir(), '.devhub');
const PID_FILE = path.join(DEVHUB_DIR, 'sidecar.pid');
const PORT_FILE = path.join(DEVHUB_DIR, 'sidecar-port.txt');
const PORT = parseInt(process.env.SIDECAR_PORT || '4000', 10);

// Crear directorio de estado si no existe
if (!fs.existsSync(DEVHUB_DIR)) {
  fs.mkdirSync(DEVHUB_DIR, { recursive: true });
}

// Limpiar archivos al salir (cualquier señal)
let isCleaningUp = false;

function writeRuntimeFiles() {
  fs.writeFileSync(PID_FILE, String(process.pid), 'utf8');
  fs.writeFileSync(PORT_FILE, String(PORT), 'utf8');
  console.log(`[Sidecar] PID ${process.pid} → ${PID_FILE}`);
  console.log(`[Sidecar] Port ${PORT} → ${PORT_FILE}`);
}

function cleanup(exitCode = 0) {
  if (isCleaningUp) return;
  isCleaningUp = true;
  try {
    fs.unlinkSync(PID_FILE);
  } catch (_) {}
  try {
    fs.unlinkSync(PORT_FILE);
  } catch (_) {}
  console.log('[Sidecar] Archivos PID/port eliminados. Bye.');
  process.exit(exitCode);
}

process.on('SIGTERM', () => cleanup(0));
process.on('SIGINT', () => cleanup(0));

// ─── Sesiones PTY persistentes ────────────────────────────────────────────────
// Clave: sessionId → { ptyProcess, history: string[], clients: Set<WebSocket> }
const sessions = new Map();

function killTmuxSessionBestEffort(sessionName) {
  const normalized = String(sessionName || '').trim();
  if (!normalized || os.platform() === 'win32') return;
  try {
    spawnSync('tmux', ['kill-session', '-t', normalized], { stdio: 'ignore', timeout: 5000 });
  } catch (_) {}
}

function abortOpenCodeSessionBestEffort(opencodeSessionId) {
  const normalized = String(opencodeSessionId || '').trim();
  if (!normalized) return;
  const port = Number(process.env.OPENCODE_PORT || 4154);
  const url = `http://127.0.0.1:${port}/session/${encodeURIComponent(normalized)}/abort`;
  try {
    void fetch(url, { method: 'POST' }).catch(() => {});
  } catch (_) {}
}

function sendToClient(ws, payload) {
  if (ws.readyState !== WebSocket.OPEN) return;
  try {
    ws.send(buildServerMessage(ws.__devhubTransport || 'raw', payload));
  } catch (_) {}
}

function broadcastSessionPayload(session, payload) {
  for (const ws of session.clients) {
    sendToClient(ws, payload);
  }
}

function getOrCreateSession(sessionId, cwd, swarmContext = {}) {
  if (sessions.has(sessionId)) {
    return sessions.get(sessionId);
  }

  const cwdResolution = resolveSidecarSessionCwd(cwd || os.homedir());
  const effectiveCwd = cwdResolution.effectiveCwd;
  const spawnConfig = buildSidecarSpawnConfig({
    sessionId,
    cwd: effectiveCwd,
    isSwarmRole: Boolean(swarmContext.isSwarmRole),
    launchId: swarmContext.launchId || null,
    roleKey: swarmContext.roleKey || null,
    env: process.env,
  });
  const shell =
    os.platform() === 'win32' ? 'powershell.exe' : spawnConfig.shell || process.env.SHELL || 'bash';
  const ptyProcess = pty.spawn(shell, spawnConfig.args, {
    name: 'xterm-256color',
    cols: 120,
    rows: 36,
    cwd: effectiveCwd,
    env: spawnConfig.env,
  });

  const session = {
    ptyProcess,
    history: [], // Buffer de los últimos 5000 chars para replay al reconectar
    clients: new Set(),
    cwd: effectiveCwd,
    createdAt: Date.now(),
    mode: 'shell',
    historyEnabled: true,
    opencodeSessionId: null,
    pendingInput: '',
    tmuxSession: spawnConfig.tmuxSession || null,
    swarmContext: {
      isSwarmRole: Boolean(swarmContext.isSwarmRole),
      launchId: swarmContext.launchId || null,
      roleKey: swarmContext.roleKey || null,
    },
  };

  // Capturar output del PTY y enviarlo a todos los clientes conectados
  ptyProcess.on('data', (data) => {
    const filteredData = filterTerminalOutputForSession(session, data);

    if (typeof filteredData === 'string' && filteredData.length === 0) {
      return;
    }

    // Guardar en buffer (máx 10000 chars)
    if (session.historyEnabled) {
      session.history.push(filteredData);
    }
    const totalLen = session.history.reduce((acc, s) => acc + s.length, 0);
    while (session.history.length > 1 && totalLen > 10000) {
      session.history.shift();
    }

    // Enviar a todos los clientes activos
    const detectedSessionId = detectOpenCodeSessionId(filteredData);
    if (detectedSessionId && session.opencodeSessionId !== detectedSessionId) {
      session.opencodeSessionId = detectedSessionId;
      broadcastSessionPayload(session, {
        type: 'opencode-session-detected',
        sessionId: detectedSessionId,
      });
    }

    if (session.tmuxSession && detectOpenCodeTuiReady(filteredData)) {
      writeOpencodeReadyMarker(session.tmuxSession, {
        sessionId,
        opencodeSessionId: session.opencodeSessionId || null,
        reason: 'sidecar-tui-footer',
      });
    }

    broadcastSessionPayload(session, { type: 'output', data: filteredData });
  });

  ptyProcess.on('exit', () => {
    console.log(`[Sidecar] Session ${sessionId} exited.`);
    broadcastSessionPayload(session, { type: 'exit', exitCode: 0, signal: null });
    for (const client of session.clients) {
      try {
        client.close();
      } catch (_) {}
    }
    sessions.delete(sessionId);
  });

  sessions.set(sessionId, session);
  console.log('[Sidecar] Nueva sesión PTY', {
    sessionId,
    shell,
    requestedCwd: cwdResolution.requestedCwd,
    effectiveCwd,
    usedFallback: cwdResolution.usedFallback,
    tmuxSession: spawnConfig.tmuxSession || null,
    tmuxEnabled: spawnConfig.tmuxEnabled,
    isSwarmRole: Boolean(swarmContext.isSwarmRole),
  });
  return session;
}
// ─── HTTP Server ──────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    pid: process.pid,
    port: PORT,
    sessions: sessions.size,
    uptime: process.uptime(),
  });
});

app.get('/sessions', (_req, res) => {
  const list = Array.from(sessions.entries()).map(([id, s]) => ({
    id,
    cwd: s.cwd,
    clients: s.clients.size,
    createdAt: s.createdAt,
  }));
  res.json({ sessions: list });
});

// Output buffer for a specific session (for external observers like Zed assistant to "see" contents)
app.get('/sessions/:id/output', (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  const output = (session.history || []).join('');
  res.json({
    output,
    session_id: req.params.id,
    cwd: session.cwd || null,
    createdAt: session.createdAt || null,
  });
});

app.delete('/sessions/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = sessions.get(sessionId);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  for (const client of session.clients) {
    try {
      client.close();
    } catch (_) {}
  }

  abortOpenCodeSessionBestEffort(session.opencodeSessionId);
  killTmuxSessionBestEffort(session.tmuxSession);

  try {
    session.ptyProcess.kill();
  } catch (_) {}

  sessions.delete(sessionId);
  console.log(`[Sidecar] Session ${sessionId} terminada por cierre explícito.`);
  return res.json({ success: true, sessionId });
});

// Endpoint de shutdown graceful — llamado por Tauri al cerrar la app
app.post('/shutdown', (_req, res) => {
  console.log('[Sidecar] Recibida señal de shutdown graceful...');
  res.json({ ok: true, message: 'Shutting down...' });

  // Dar tiempo a que la respuesta HTTP llegue
  setTimeout(() => {
    // Matar todos los PTY activos
    for (const [id, session] of sessions) {
      try {
        session.ptyProcess.kill();
      } catch (_) {}
      console.log(`[Sidecar] PTY ${id} terminado.`);
    }
    cleanup();
  }, 300);
});

const server = http.createServer(app);

// ─── WebSocket Server ─────────────────────────────────────────────────────────
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws, req) => {
  // Extraer parámetros de la URL: ?sessionId=xxx&cwd=/path
  const urlParams = new URL(req.url || '/', `http://localhost:${PORT}`).searchParams;
  const sessionId = urlParams.get('sessionId') || 'default';
  const cwd = urlParams.get('cwd') || os.homedir();
  const swarmContext = {
    isSwarmRole: parseBooleanQueryFlag(urlParams.get('isSwarmRole')),
    roleKey: urlParams.get('roleKey') || null,
    launchId: urlParams.get('launchId') || null,
  };
  ws.__devhubTransport = getTransportMode(req.url || '/');

  const session = getOrCreateSession(sessionId, cwd, swarmContext);
  session.clients.add(ws);

  console.log(
    `[Sidecar] WS conectado a sesión ${sessionId} (${session.clients.size} clientes, transport=${ws.__devhubTransport})`
  );

  // Replay del historial al reconectar
  if (session.history.length > 0) {
    const replay = buildHistoryReplay(session);
    if (replay) {
      sendToClient(ws, { type: 'output', data: replay });
    }
  }

  if (session.opencodeSessionId) {
    sendToClient(ws, {
      type: 'opencode-session-detected',
      sessionId: session.opencodeSessionId,
    });
  }

  ws.on('message', (msg) => {
    const payload = parseClientMessage(msg, ws.__devhubTransport || 'raw');

    if (payload.type === 'resize' && payload.cols && payload.rows) {
      session.ptyProcess.resize(payload.cols, payload.rows);
      return;
    }

    if (payload.type !== 'input') {
      return;
    }

    const filteredInput = filterTerminalInputForSession(session, payload.data);
    if (filteredInput === null) return;

    updateSessionModeFromInput(session, filteredInput);

    const detectedSessionId = detectOpenCodeSessionId(filteredInput);
    if (detectedSessionId && session.opencodeSessionId !== detectedSessionId) {
      session.opencodeSessionId = detectedSessionId;
      broadcastSessionPayload(session, {
        type: 'opencode-session-detected',
        sessionId: detectedSessionId,
      });
    }

    // Input de teclado al PTY
    try {
      session.ptyProcess.write(filteredInput);
    } catch (_) {}
  });

  ws.on('close', () => {
    session.clients.delete(ws);
    console.log(
      `[Sidecar] WS desconectado de sesión ${sessionId} (${session.clients.size} clientes restantes)`
    );
    // IMPORTANTE: NO matamos el PTY aquí — persiste aunque no haya clientes
  });

  ws.on('error', (err) => {
    console.error(`[Sidecar] WS error en sesión ${sessionId}:`, err.message);
    session.clients.delete(ws);
  });
});

// ─── Arrancar servidor ────────────────────────────────────────────────────────
server.on('error', (error) => {
  console.error('[Sidecar] Error de arranque del servidor:', error);
  cleanup(1);
});

server.listen(PORT, '127.0.0.1', () => {
  writeRuntimeFiles();
  console.log(`[Sidecar] ✅ Sidecar escuchando en http://127.0.0.1:${PORT}`);
  console.log(`[Sidecar]    PID: ${process.pid}`);
  console.log(`[Sidecar]    Shell: ${process.env.SHELL || 'bash'}`);
});
