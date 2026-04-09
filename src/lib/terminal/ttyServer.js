import net from 'net';
import os from 'os';
import { spawnSync } from 'child_process';

// Use global require via eval to bypass Webpack's statically analyzed requires
// This guarantees that the native .node addons for 'node-pty' and 'ws' load correctly
// instead of getting stubbed or mangled by Next.js's dev compiler.
const pty = eval('require')('node-pty');
const { WebSocketServer } = eval('require')('ws');

const GLOBAL_TTY_KEY = '__DEVHUB_TTY_SERVER__';
const GLOBAL_TTY_SESSIONS_KEY = '__DEVHUB_TTY_SESSIONS__';
let tmuxAvailabilityCache;

function resolveShell() {
  if (process.env.SHELL) return process.env.SHELL;
  return os.platform() === 'win32' ? 'powershell.exe' : '/bin/zsh';
}

function resolveHomeDirectory() {
  return process.env.HOME || process.cwd();
}

function escapeShellArg(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function normalizeTmuxSessionName(terminalId) {
  const cleaned = String(terminalId || 'terminal')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 64);
  return `devhub-${cleaned || 'terminal'}`;
}

function hasTmux() {
  if (typeof tmuxAvailabilityCache === 'boolean') return tmuxAvailabilityCache;
  if (os.platform() === 'win32') {
    tmuxAvailabilityCache = false;
    return tmuxAvailabilityCache;
  }

  try {
    const result = spawnSync('tmux', ['-V'], { stdio: 'ignore' });
    tmuxAvailabilityCache = result.status === 0;
  } catch {
    tmuxAvailabilityCache = false;
  }

  return tmuxAvailabilityCache;
}

function pickFreePort(startPort) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();

    server.once('error', (err) => reject(err));
    server.once('listening', () => {
      const addr = server.address();
      server.close(() => resolve(addr.port));
    });

    server.listen(startPort, '127.0.0.1');
  });
}

async function findAvailablePort(basePort = 4077, attempts = 20) {
  for (let offset = 0; offset < attempts; offset += 1) {
    const candidate = basePort + offset;
    try {
      const port = await pickFreePort(candidate);
      return port;
    } catch {
      // Try next candidate.
    }
  }

  throw new Error('No available port found for PTY websocket server.');
}

function parseClientMessage(rawMessage) {
  try {
    return JSON.parse(rawMessage.toString());
  } catch {
    return null;
  }
}

function detectSessionModeFromInput(session, input) {
  if (!input || typeof input !== 'string') return;

  // Fast path for the launcher case, where the whole command comes in one chunk.
  if (/\bopencode\b/i.test(input)) {
    session.mode = 'tui';
    session.historyEnabled = false;
    session.history = '';

    // Extract OpenCode session ID from --session <id> pattern immediately
    if (!session.opencodeSessionId) {
      const sessionMatch = input.match(/opencode\s+(?:--session\s+)(ses_[\w]+)/i);
      if (sessionMatch?.[1]) {
        session.opencodeSessionId = sessionMatch[1];
      }
    }
    return;
  }

  session.pendingInput = `${session.pendingInput || ''}${input}`;

  // Parse line-based shell commands to detect transitions into TUI mode.
  const lines = session.pendingInput.split(/\r\n|\n|\r/);
  session.pendingInput = lines.pop() || '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^\s*opencode\b/i.test(trimmed)) {
      session.mode = 'tui';
      session.historyEnabled = false;
      session.history = '';

      // Extract session ID from the command line
      if (!session.opencodeSessionId) {
        const sessionMatch = trimmed.match(/opencode\s+(?:--session\s+)(ses_[\w]+)/i);
        if (sessionMatch?.[1]) {
          session.opencodeSessionId = sessionMatch[1];
        }
      }
      return;
    }
  }
}

export async function ensureTTYServer() {
  if (globalThis[GLOBAL_TTY_KEY]) {
    return globalThis[GLOBAL_TTY_KEY];
  }

  // A map to keep PTY instances alive across WebSocket reconnects
  // Key: terminalId, Value: { pty, sockets: Set, history, mode, historyEnabled }
  const terminalSessions = new Map();
  globalThis[GLOBAL_TTY_SESSIONS_KEY] = terminalSessions;

  const basePort = Number(process.env.DEVHUB_TTY_PORT || 4077);
  const wsPath = '/terminal';
  const port = await findAvailablePort(basePort);
  const wss = new WebSocketServer({ host: '127.0.0.1', port, path: wsPath });

  wss.on('connection', (socket, request) => {
    let cwd = resolveHomeDirectory();
    let terminalId = `term-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;

    try {
      if (request?.url) {
        const dummyUrl = new URL(request.url, 'http://localhost');
        const requestedCwd = dummyUrl.searchParams.get('cwd');
        const reqTermId = dummyUrl.searchParams.get('id');
        if (requestedCwd) cwd = requestedCwd;
        if (reqTermId) terminalId = reqTermId;
      }
    } catch (e) {
      console.error('Error parsing WS URL:', e);
    }

    let session = terminalSessions.get(terminalId);

    if (!session) {
      const shell = resolveShell();
      const tmuxEnabled = hasTmux();
      const tmuxSession = normalizeTmuxSessionName(terminalId);

      const env = Object.assign({}, process.env, {
        DEVHUB_PROJECT_DIR: cwd,
        DEVHUB_MCP_CMD: 'node /home/matias/devhub/devhub-mcp/server.js',
        GEMINI_MCP_HINT: 'Use DEVHUB_MCP_CMD to connect Gemini CLI to your local server.',
        DEVHUB_TMUX_SESSION: tmuxSession,
        // Suppress shell MOTD (Kali "minimal installation" banner, etc.)
        MOTD_SHOWN: 'true',
        SSH_CONNECTION: '',
        HUSHLOGIN: 'true',
      });

      let spawnArgs = [];
      if (tmuxEnabled && os.platform() !== 'win32') {
        const attachCommand = `tmux new-session -A -s ${escapeShellArg(tmuxSession)} -c ${escapeShellArg(cwd)}`;
        spawnArgs = ['-lc', attachCommand];
      }

      const terminal = pty.spawn(shell, spawnArgs, {
        name: 'xterm-256color',
        cols: 120,
        rows: 32,
        cwd,
        env,
      });

      session = {
        pty: terminal,
        sockets: new Set([socket]),
        history: '',
        mode: 'shell',
        historyEnabled: true,
        pendingInput: '',
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
      };

      terminalSessions.set(terminalId, session);

      if (!tmuxEnabled && os.platform() !== 'win32') {
        terminal.write(
          '\r\n\x1b[33m[DevHub]\x1b[0m tmux no está instalado. Para una recuperación más robusta de sesiones por panel, instalá tmux.\r\n\r\n'
        );
      }

      terminal.onData((chunk) => {
        session.lastActivityAt = Date.now();

        // Suppress Kali MOTD and zsh history corruption messages
        let filtered = chunk;
        if (typeof filtered === 'string') {
          // Remove Kali minimal installation banner
          filtered = filtered.replace(
            /┃\s*This is a minimal installation of Kali Linux[\s\S]*?┃\s*\(Run: "touch ~\/\.hushlogin" to hide this message\)\s*\n?/g,
            ''
          );
          // Remove zsh corrupt history message
          filtered = filtered.replace(/zsh: corrupt history file[^\n]*\n?/g, '');
        }

        if (session.historyEnabled) {
          session.history += filtered;
          if (session.history.length > 100000) {
            session.history = session.history.slice(-100000);
          }
        }

        for (const s of session.sockets) {
          if (s.readyState === s.OPEN) {
            s.send(JSON.stringify({ type: 'output', data: filtered }));
          }
        }
      });

      terminal.onExit(({ exitCode, signal }) => {
        for (const s of session.sockets) {
          if (s.readyState === s.OPEN) {
            s.send(JSON.stringify({ type: 'exit', exitCode, signal }));
            s.close();
          }
        }
        terminalSessions.delete(terminalId);
      });
    } else {
      // Attach to existing session
      session.sockets.add(socket);
      session.lastActivityAt = Date.now();
      if (session.historyEnabled && session.history && socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify({ type: 'output', data: session.history }));
      }

      // For full-screen TUI apps (OpenCode/Vim/Nano style), replaying stale history
      // tends to corrupt rendering on a fresh xterm canvas after reload.
      if (session.mode === 'tui') {
        setTimeout(() => {
          try {
            session.pty.write('\x0c'); // Ctrl+L redraw
          } catch {
            // Ignore redraw errors on stale PTY handles.
          }
        }, 30);
      }
    }

    socket.on('message', (rawMessage) => {
      const message = parseClientMessage(rawMessage);
      if (!message?.type) return;

      if (message.type === 'input' && typeof message.data === 'string') {
        detectSessionModeFromInput(session, message.data);
        session.lastActivityAt = Date.now();
        session.pty.write(message.data);
      }

      if (
        message.type === 'resize' &&
        Number.isInteger(message.cols) &&
        Number.isInteger(message.rows) &&
        message.cols > 0 &&
        message.rows > 0
      ) {
        session.pty.resize(message.cols, message.rows);
      }
    });

    socket.on('close', () => {
      if (session) {
        session.sockets.delete(socket);
        session.lastActivityAt = Date.now();
        // Do NOT kill the pty process here. Let it run in background.
      }
    });

    socket.send(JSON.stringify({ type: 'ready' }));
  });

  const serverState = { port, wsPath };
  globalThis[GLOBAL_TTY_KEY] = serverState;
  return serverState;
}

export function getTTYSessionsSnapshot() {
  const sessions = globalThis[GLOBAL_TTY_SESSIONS_KEY];
  if (!sessions || typeof sessions.values !== 'function') return [];

  const snapshot = [];
  for (const [terminalId, session] of sessions.entries()) {
    snapshot.push({
      terminalId,
      mode: session.mode || 'shell',
      socketCount: session.sockets?.size || 0,
      createdAt: session.createdAt || null,
      lastActivityAt: session.lastActivityAt || null,
      alive: true,
      opencodeSessionId: session.opencodeSessionId || null,
    });
  }

  return snapshot;
}

/**
 * getActiveOpenCodeSessionIds — Inspects live PTY sessions to detect running OpenCode processes.
 *
 * Strategy (in order):
 * 1. If session has a stored opencodeSessionId (set when initialCommand matched pattern), return it.
 * 2. Scan the session history buffer for `--session <id>` patterns.
 * 3. Return a map of { terminalId → opencodeSessionId } for all sessions where OpenCode is active.
 */
export function getActiveOpenCodeSessionIds() {
  const sessions = globalThis[GLOBAL_TTY_SESSIONS_KEY];
  if (!sessions || typeof sessions.values !== 'function') return {};

  const OPENCODE_SESSION_RE = /opencode\s+(?:--session\s+|session\s+resume\s+)(ses_[\w]+)/i;
  const OPENCODE_ACTIVE_RE = /opencode/i;

  const result = {};

  for (const [terminalId, session] of sessions.entries()) {
    // Fast path: already detected and stored
    if (session.opencodeSessionId) {
      result[terminalId] = session.opencodeSessionId;
      continue;
    }

    // Only check TUI sessions (opencode triggers TUI mode detection in detectSessionModeFromInput)
    if (session.mode !== 'tui') continue;

    // Scan history for session ID pattern
    if (session.history) {
      const match = session.history.match(OPENCODE_SESSION_RE);
      if (match?.[1]) {
        session.opencodeSessionId = match[1];
        result[terminalId] = match[1];
      }
    }
  }

  return result;
}
