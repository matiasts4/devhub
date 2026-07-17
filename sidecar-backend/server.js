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
  ensureAgentDetectionSession,
  ingestAgentDetectionFromFilteredOutput,
  processOscTitle,
  stripOscTitleSequences,
  processOscProgress,
} = require('./bundled/agentDetection.cjs');
const {
  applyAgentTuiDetection,
  buildHistoryReplay,
  buildServerMessage,
  detectKimiTuiReady,
  detectOpenCodeSessionId,
  detectOpenCodeTuiReady,
  filterTerminalInputForSession,
  filterTerminalOutputForSession,
  getTransportMode,
  parseClientMessage,
  synthesizeAgentSessionId,
  updateSessionModeFromInput,
} = require('./sessionTransport');
const { writeOpencodeReadyMarker } = require('./opencodeReadyMarker');
const { shouldRespawnShellAfterPtyExit } = require('../src/lib/terminal/ptyRespawnPolicy.cjs');

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

function spawnSidecarPtyProcess(session) {
  const spawnConfig = buildSidecarSpawnConfig({
    sessionId: session.id,
    cwd: session.cwd,
    isSwarmRole: Boolean(session.swarmContext?.isSwarmRole),
    launchId: session.swarmContext?.launchId || null,
    roleKey: session.swarmContext?.roleKey || null,
    env: process.env,
  });
  const shell =
    spawnConfig.shell ||
    (os.platform() === 'win32' ? 'powershell.exe' : process.env.SHELL || 'bash');
  const cols = session.termsize?.cols || 120;
  const rows = session.termsize?.rows || 36;
  const ptyProcess = pty.spawn(shell, spawnConfig.args, {
    name: 'xterm-256color',
    cols,
    rows,
    cwd: session.cwd,
    env: spawnConfig.env,
  });
  session.ptyProcess = ptyProcess;
  session.termsize = { cols, rows };
  session.tmuxSession = spawnConfig.tmuxSession || null;
  return { ptyProcess, shell, spawnConfig };
}

function resetSessionAfterTuiPtyDeath(session) {
  session.mode = 'shell';
  session.historyEnabled = true;
  session.history = [];
  session.outputTail = '';
  session.pendingInput = '';
  session.agentTuiState = null;
  session.agentTuiStateAt = null;
  // Keep opencodeSessionId for Relanzar; drop live TUI markers so a later
  // intentional `exit` is not treated as another Ctrl+C TUI death.
  session.agentType = null;
  session.agentSessionId = null;
}

function finalizeSidecarSessionExit(session, exitCode, signal) {
  console.log(`[Sidecar] Session ${session.id} exited.`, { exitCode, signal });
  broadcastSessionPayload(session, {
    type: 'exit',
    exitCode: exitCode ?? 0,
    signal: signal ?? null,
  });
  for (const client of session.clients) {
    try {
      client.close();
    } catch (_) {}
  }
  sessions.delete(session.id);
}

function tryRespawnShellAfterTuiExit(session, exitCode, signal) {
  const should = shouldRespawnShellAfterPtyExit({
    platform: os.platform(),
    mode: session.mode,
    agentType: session.agentType,
    exitCode,
    respawnCount: session._tuiCtrlCRespawnCount || 0,
  });
  if (!should) return false;

  session._tuiCtrlCRespawnCount = (session._tuiCtrlCRespawnCount || 0) + 1;
  console.log(`[Sidecar] Win Ctrl+C killed TUI PTY — respawning shell`, {
    sessionId: session.id,
    exitCode,
    signal,
    respawnCount: session._tuiCtrlCRespawnCount,
  });

  resetSessionAfterTuiPtyDeath(session);

  let spawnResult;
  try {
    spawnResult = spawnSidecarPtyProcess(session);
  } catch (err) {
    console.error(`[Sidecar] TUI shell respawn FAILED`, {
      sessionId: session.id,
      error: err?.message,
    });
    return false;
  }

  attachSidecarPtyHandlers(session);
  broadcastSessionPayload(session, {
    type: 'output',
    data: '\r\n\x1b[33m[DevHub]\x1b[0m La TUI cerró el PTY (Ctrl+C). Shell nueva lista.\r\n',
  });
  console.log('[Sidecar] TUI shell respawned', {
    sessionId: session.id,
    shell: spawnResult.shell,
  });
  return true;
}

function attachSidecarPtyHandlers(session) {
  const sessionId = session.id;
  const ptyProcess = session.ptyProcess;

  ptyProcess.on('data', (data) => {
    const now = Date.now();
    session.lastSeenAt = new Date().toISOString();
    session.lastActivityAt = now;
    session.lastOutputAt = now;

    processOscTitle(session, data);
    processOscProgress(session, data);
    let filteredData = data;
    if (typeof filteredData === 'string') {
      filteredData = stripOscTitleSequences(filteredData);
    }
    filteredData = filterTerminalOutputForSession(session, filteredData);

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

    // Las TUIs de agentes apagan historyEnabled (para no re-pintar frames en el
    // replay WS), pero Zed necesita leer el contenido igual vía /sessions/:id/output.
    // ponytail: cola string de 32KB; si algún día duele el GC, pasar a ring buffer.
    if (typeof filteredData === 'string') {
      session.outputTail = (session.outputTail + filteredData).slice(-32768);
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

    // Detect TUI readiness for agents started without an explicit initialCommand.
    if (detectKimiTuiReady(filteredData)) {
      if (!session.agentType) {
        applyAgentTuiDetection(session, 'kimi');
      }
    } else if (detectOpenCodeTuiReady(filteredData)) {
      if (session.mode !== 'tui') {
        session.mode = 'tui';
        session.historyEnabled = false;
      }
      if (!session.agentType) {
        applyAgentTuiDetection(session, 'opencode');
      }
      if (session.tmuxSession) {
        writeOpencodeReadyMarker(session.tmuxSession, {
          sessionId,
          opencodeSessionId: session.opencodeSessionId || null,
          reason: 'sidecar-tui-footer',
        });
      }
    }

    if (typeof filteredData === 'string' && filteredData.length > 0) {
      const ingestResult = ingestAgentDetectionFromFilteredOutput(session, filteredData, now);
      if (ingestResult.published && session.agentTuiState) {
        broadcastSessionPayload(session, {
          type: 'agent-state',
          agentTuiState: session.agentTuiState,
          at: session.agentTuiStateAt,
        });
      }
    }

    broadcastSessionPayload(session, { type: 'output', data: filteredData });
  });

  ptyProcess.on('exit', (code, sig) => {
    // node-pty may emit (exitCode, signal) or a single options object.
    const exitCode = typeof code === 'object' && code !== null ? code.exitCode : code;
    const signal = typeof code === 'object' && code !== null ? code.signal : sig;
    if (tryRespawnShellAfterTuiExit(session, exitCode ?? 0, signal ?? null)) {
      return;
    }
    finalizeSidecarSessionExit(session, exitCode ?? 0, signal ?? null);
  });
}

function getOrCreateSession(sessionId, cwd, swarmContext = {}) {
  if (sessions.has(sessionId)) {
    return sessions.get(sessionId);
  }

  const cwdResolution = resolveSidecarSessionCwd(cwd || os.homedir());
  const effectiveCwd = cwdResolution.effectiveCwd;

  const session = {
    id: sessionId,
    ptyProcess: null,
    history: [], // Buffer de los últimos 5000 chars para replay al reconectar
    clients: new Set(),
    cwd: effectiveCwd,
    createdAt: Date.now(),
    lastSeenAt: new Date().toISOString(),
    lastActivityAt: Date.now(),
    lastOutputAt: Date.now(),
    mode: 'shell',
    historyEnabled: true,
    outputTail: '', // Cola siempre activa (aunque history se apague en modo TUI) para /sessions/:id/output
    opencodeSessionId: null,
    agentType: null,
    agentSessionId: null,
    agentTuiState: null,
    agentTuiStateAt: null,
    pendingInput: '',
    title: null,
    _oscTitleBuffer: '',
    oscProgress: '',
    _oscProgressBuffer: '',
    agentStateMachine: null,
    detectionBuffer: '',
    tmuxSession: null,
    termsize: { cols: 120, rows: 36 },
    _tuiCtrlCRespawnCount: 0,
    swarmContext: {
      isSwarmRole: Boolean(swarmContext.isSwarmRole),
      launchId: swarmContext.launchId || null,
      roleKey: swarmContext.roleKey || null,
    },
  };

  ensureAgentDetectionSession(session);
  const { shell, spawnConfig } = spawnSidecarPtyProcess(session);
  attachSidecarPtyHandlers(session);

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

// Single session snapshot for panel status polling.
app.get('/sessions/:id', (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  res.json({
    terminalId: req.params.id,
    mode: session.mode || 'shell',
    socketCount: session.clients?.size || 0,
    createdAt: session.createdAt || null,
    lastActivityAt: session.lastActivityAt || null,
    lastOutputAt: session.lastOutputAt || null,
    lastSeenAt: session.lastSeenAt || null,
    cwd: session.cwd || null,
    shell: session.ptyProcess?.shell || null,
    title: null,
    restored: false,
    alive: true,
    opencodeSessionId: session.opencodeSessionId || null,
    hermesSessionId: null,
    agentType: session.agentType || null,
    agentSessionId: session.agentSessionId || null,
    agentTuiState: session.agentTuiState || null,
    agentTuiStateAt: session.agentTuiStateAt || null,
    initialCommand: null,
  });
});

// Output buffer for a specific session (for external observers like Zed assistant to "see" contents)
app.get('/sessions/:id/output', (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  // history se vacía al detectar una TUI de agente; outputTail sigue vivo siempre.
  const output = (session.history || []).join('') || session.outputTail || '';
  res.json({
    output,
    session_id: req.params.id,
    cwd: session.cwd || null,
    createdAt: session.createdAt || null,
  });
});

// HTTP input for Zed assistant (symmetric to /output — Phase 1)
app.put('/sessions/:id/input', (req, res) => {
  const sessionId = req.params.id;
  const session = sessions.get(sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const data = req.body?.data;
  if (data === undefined || data === null || typeof data !== 'string') {
    return res.status(400).json({ error: 'data field (string) is required' });
  }

  const filteredInput = filterTerminalInputForSession(session, data);
  if (filteredInput === null) {
    return res.status(400).json({ error: 'input rejected by session filter' });
  }

  updateSessionModeFromInput(session, filteredInput);

  const detectedSessionId = detectOpenCodeSessionId(filteredInput);
  if (detectedSessionId && session.opencodeSessionId !== detectedSessionId) {
    session.opencodeSessionId = detectedSessionId;
    broadcastSessionPayload(session, {
      type: 'opencode-session-detected',
      sessionId: detectedSessionId,
    });
  }

  try {
    session.ptyProcess.write(filteredInput);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'write failed' });
  }

  return res.json({ session_id: sessionId, sent: true, source: 'sidecar' });
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

  // El frontend espera este mensaje para decidir si inyectar el comando inicial.
  // En reattach (sesión ya existente) NO se reenvía, porque el PTY puede tener
  // una TUI viva. En sesión fresca el frontend inyecta initialCommand vía WebSocket.
  // Este contrato debe mantenerse en paralelo con src/lib/terminal/ttyServer.js.
  const isReattach = sessions.has(sessionId);
  const session = getOrCreateSession(sessionId, cwd, swarmContext);
  session.clients.add(ws);

  console.log(
    `[Sidecar] WS conectado a sesión ${sessionId} (${session.clients.size} clientes, transport=${ws.__devhubTransport}, reattach=${isReattach})`
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

  // Notificar al cliente que la sesión está lista. El frontend usa esto para
  // enviar (o no) el comando inicial. Se envía DESPUÉS del replay para que
  // el historial ya esté escrito antes de que el comando inicial corra.
  sendToClient(ws, {
    type: 'ready',
    reattached: isReattach,
    mode: session?.mode || 'shell',
    lastActivityAgeMs: Date.now() - (session?.lastActivityAt || 0),
  });

  ws.on('message', (msg) => {
    const payload = parseClientMessage(msg, ws.__devhubTransport || 'raw');

    if (payload.type === 'resize' && payload.cols && payload.rows) {
      session.termsize = { cols: payload.cols, rows: payload.rows };
      try {
        session.ptyProcess.resize(payload.cols, payload.rows);
      } catch (_) {}
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
