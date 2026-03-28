/**
 * DevHub Sidecar Backend
 * 
 * Responsabilidades:
 * 1. Gestionar sesiones PTY persistentes (sobreviven al cierre de ventana)
 * 2. Escribir PID en ~/.devhub/sidecar.pid para que Tauri detecte si ya corre
 * 3. Escribir puerto en ~/.devhub/sidecar-port.txt para el shutdown graceful
 * 4. Exponer POST /shutdown para que Tauri cierre el sidecar limpiamente
 */

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const pty = require('node-pty');
const os = require('os');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

// ─── Directorios de estado ────────────────────────────────────────────────────
const DEVHUB_DIR = path.join(os.homedir(), '.devhub');
const PID_FILE   = path.join(DEVHUB_DIR, 'sidecar.pid');
const PORT_FILE  = path.join(DEVHUB_DIR, 'sidecar-port.txt');
const PORT       = parseInt(process.env.SIDECAR_PORT || '4000', 10);

// Crear directorio de estado si no existe
if (!fs.existsSync(DEVHUB_DIR)) {
  fs.mkdirSync(DEVHUB_DIR, { recursive: true });
}

// ─── Escribir PID y Puerto al arrancar ────────────────────────────────────────
fs.writeFileSync(PID_FILE, String(process.pid), 'utf8');
fs.writeFileSync(PORT_FILE, String(PORT), 'utf8');
console.log(`[Sidecar] PID ${process.pid} → ${PID_FILE}`);
console.log(`[Sidecar] Port ${PORT} → ${PORT_FILE}`);

// Limpiar archivos al salir (cualquier señal)
function cleanup() {
  try { fs.unlinkSync(PID_FILE); } catch (_) {}
  try { fs.unlinkSync(PORT_FILE); } catch (_) {}
  console.log('[Sidecar] Archivos PID/port eliminados. Bye.');
  process.exit(0);
}

process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);

// ─── Sesiones PTY persistentes ────────────────────────────────────────────────
// Clave: sessionId → { ptyProcess, history: string[], clients: Set<WebSocket> }
const sessions = new Map();

function getOrCreateSession(sessionId, cwd) {
  if (sessions.has(sessionId)) {
    return sessions.get(sessionId);
  }

  const shell = os.platform() === 'win32' ? 'powershell.exe' : (process.env.SHELL || 'bash');
  const ptyProcess = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols: 120,
    rows: 36,
    cwd: cwd || os.homedir(),
    env: { ...process.env, TERM: 'xterm-256color' },
  });

  const session = {
    ptyProcess,
    history: [],     // Buffer de los últimos 5000 chars para replay al reconectar
    clients: new Set(),
    cwd: cwd || os.homedir(),
    createdAt: Date.now(),
  };

  // Capturar output del PTY y enviarlo a todos los clientes conectados
  ptyProcess.on('data', (data) => {
    // Guardar en buffer (máx 10000 chars)
    session.history.push(data);
    const totalLen = session.history.reduce((acc, s) => acc + s.length, 0);
    while (session.history.length > 1 && totalLen > 10000) {
      session.history.shift();
    }

    // Enviar a todos los clientes activos
    for (const ws of session.clients) {
      if (ws.readyState === WebSocket.OPEN) {
        try { ws.send(data); } catch (_) {}
      }
    }
  });

  ptyProcess.on('exit', () => {
    console.log(`[Sidecar] Session ${sessionId} exited.`);
    sessions.delete(sessionId);
  });

  sessions.set(sessionId, session);
  console.log(`[Sidecar] Nueva sesión PTY: ${sessionId} (${shell}) en ${cwd || os.homedir()}`);
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

// Endpoint de shutdown graceful — llamado por Tauri al cerrar la app
app.post('/shutdown', (_req, res) => {
  console.log('[Sidecar] Recibida señal de shutdown graceful...');
  res.json({ ok: true, message: 'Shutting down...' });
  
  // Dar tiempo a que la respuesta HTTP llegue
  setTimeout(() => {
    // Matar todos los PTY activos
    for (const [id, session] of sessions) {
      try { session.ptyProcess.kill(); } catch (_) {}
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
  const cwd       = urlParams.get('cwd') || os.homedir();

  const session = getOrCreateSession(sessionId, cwd);
  session.clients.add(ws);

  console.log(`[Sidecar] WS conectado a sesión ${sessionId} (${session.clients.size} clientes)`);

  // Replay del historial al reconectar
  if (session.history.length > 0) {
    const replay = session.history.join('');
    try { ws.send(replay); } catch (_) {}
  }

  ws.on('message', (msg) => {
    const msgStr = typeof msg === 'string' ? msg : msg.toString();
    
    // Comandos de control (JSON)
    if (msgStr.startsWith('{')) {
      try {
        const cmd = JSON.parse(msgStr);
        if (cmd.type === 'resize' && cmd.cols && cmd.rows) {
          session.ptyProcess.resize(cmd.cols, cmd.rows);
        }
        return;
      } catch (_) { /* no es JSON, tratar como input */ }
    }

    // Input de teclado al PTY
    try { session.ptyProcess.write(msgStr); } catch (_) {}
  });

  ws.on('close', () => {
    session.clients.delete(ws);
    console.log(`[Sidecar] WS desconectado de sesión ${sessionId} (${session.clients.size} clientes restantes)`);
    // IMPORTANTE: NO matamos el PTY aquí — persiste aunque no haya clientes
  });

  ws.on('error', (err) => {
    console.error(`[Sidecar] WS error en sesión ${sessionId}:`, err.message);
    session.clients.delete(ws);
  });
});

// ─── Arrancar servidor ────────────────────────────────────────────────────────
server.listen(PORT, '127.0.0.1', () => {
  console.log(`[Sidecar] ✅ Sidecar escuchando en http://127.0.0.1:${PORT}`);
  console.log(`[Sidecar]    PID: ${process.pid}`);
  console.log(`[Sidecar]    Shell: ${process.env.SHELL || 'bash'}`);
});
