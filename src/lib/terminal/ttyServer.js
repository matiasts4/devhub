import fs from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import cwdGuard from './cwdGuard.js';
import { saveSessions, loadSessions } from './sessionStore.js';

const { resolveTerminalSpawnCwd } = cwdGuard;

// ─── Diagnostic file logger ───────────────────────────────────────────────────
// Writes to data/logs/terminal-debug.log (relative to project root / cwd).
// Safe for concurrent calls — appendFileSync is atomic per call.
const TTY_LOG_FILE = path.resolve(process.cwd(), 'data', 'logs', 'terminal-debug.log');
function ttyLog(tag, msg, extra = {}) {
  try {
    const ts = new Date().toISOString();
    const extraStr = Object.keys(extra).length ? ' ' + JSON.stringify(extra) : '';
    const line = `${ts} [${tag}] ${msg}${extraStr}\n`;
    fs.mkdirSync(path.dirname(TTY_LOG_FILE), { recursive: true });
    fs.appendFileSync(TTY_LOG_FILE, line);
  } catch {
    // Never crash the server because of logging
  }
}
// ─────────────────────────────────────────────────────────────────────────────

function findPathUpwards(startDir, ...relativeSegments) {
  let currentDir = path.resolve(startDir);

  for (let depth = 0; depth <= 6; depth += 1) {
    const candidate = path.join(currentDir, ...relativeSegments);
    if (fs.existsSync(candidate)) return candidate;

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }

  return null;
}

function resolveMcpServerPath() {
  return (
    findPathUpwards(process.cwd(), 'devhub-mcp', 'server.js') ||
    (typeof __dirname !== 'undefined'
      ? findPathUpwards(__dirname, 'devhub-mcp', 'server.js')
      : null) ||
    path.join(process.cwd(), 'devhub-mcp', 'server.js')
  );
}

const MCP_SERVER_PATH = resolveMcpServerPath();

// Use global require via eval to bypass Webpack's statically analyzed requires
// This guarantees that the native .node addons for 'node-pty' and 'ws' load correctly
// instead of getting stubbed or mangled by Next.js's dev compiler.
const pty = eval('require')('node-pty');
const { WebSocketServer } = eval('require')('ws');

const GLOBAL_TTY_KEY = '__DEVHUB_TTY_SERVER__';
const GLOBAL_TTY_SESSIONS_KEY = '__DEVHUB_TTY_SESSIONS__';
const STRIPPED_SHELL_ENV_KEYS = ['npm_config_prefix', 'NPM_CONFIG_PREFIX'];
let tmuxAvailabilityCache;

function resolveShell() {
  if (process.env.SHELL) return process.env.SHELL;
  return os.platform() === 'win32' ? 'powershell.exe' : '/bin/zsh';
}

function resolveHomeDirectory() {
  return process.env.HOME || process.cwd();
}

function sanitizeTerminalSpawnEnv(sourceEnv = process.env) {
  const env = { ...sourceEnv };

  for (const key of STRIPPED_SHELL_ENV_KEYS) {
    delete env[key];
  }

  return env;
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

export function buildTTYSessionDiagnosticSnapshot(session, { reason, cols, rows } = {}) {
  return {
    terminalId: session?.id || 'unknown',
    mode: session?.mode || 'shell',
    historyEnabled: Boolean(session?.historyEnabled),
    socketCount: session?.sockets?.size || 0,
    cwd: session?.cwd || null,
    cols: Number(cols ?? 0),
    rows: Number(rows ?? 0),
    opencodeSessionId: session?.opencodeSessionId || null,
    hermesSessionId: session?.hermesSessionId || null,
    reason: reason || 'unknown',
  };
}

export function shouldLogTTYSessionDiagnostic(previousSnapshot, nextSnapshot) {
  if (!nextSnapshot) return false;
  if (!previousSnapshot) return true;

  return JSON.stringify(previousSnapshot) !== JSON.stringify(nextSnapshot);
}

function maybeLogTTYSessionDiagnostic(session, previousSnapshot, nextSnapshot) {
  if (!shouldLogTTYSessionDiagnostic(previousSnapshot, nextSnapshot)) {
    return previousSnapshot;
  }

  ttyLog('TTY_DIAG', 'session diagnostic', nextSnapshot);
  session._lastDiagnosticSnapshot = nextSnapshot;
  return nextSnapshot;
}

function broadcastOpenCodeSessionDetected(session, sessionId) {
  for (const s of session.sockets) {
    if (s.readyState === s.OPEN) {
      try {
        s.send(JSON.stringify({ type: 'opencode-session-detected', sessionId }));
      } catch {
        // Ignore send errors on stale sockets.
      }
    }
  }
}

function broadcastHermesSessionDetected(session, sessionId) {
  for (const s of session.sockets) {
    if (s.readyState === s.OPEN) {
      try {
        s.send(JSON.stringify({ type: 'hermes-session-detected', sessionId }));
      } catch {
        // Ignore send errors on stale sockets.
      }
    }
  }
}

function ensureHermesSessionId(session) {
  if (session.hermesSessionId) {
    return session.hermesSessionId;
  }

  const stableSessionId = session.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  session.hermesSessionId = `hermes-${stableSessionId}`;
  return session.hermesSessionId;
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
        broadcastOpenCodeSessionDetected(session, sessionMatch[1]);
      }
    }
    return;
  }

  // Hermes detection
  if (/\bhermes\b/i.test(input)) {
    session.mode = 'tui';
    session.historyEnabled = false;
    session.history = '';

    if (!session.hermesSessionId) {
      const hermesId = ensureHermesSessionId(session);
      broadcastHermesSessionDetected(session, hermesId);
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
          broadcastOpenCodeSessionDetected(session, sessionMatch[1]);
        }
      }
      return;
    }

    if (/^\s*hermes\b/i.test(trimmed)) {
      session.mode = 'tui';
      session.historyEnabled = false;
      session.history = '';

      if (!session.hermesSessionId) {
        const hermesId = ensureHermesSessionId(session);
        broadcastHermesSessionDetected(session, hermesId);
      }
      return;
    }
  }
}

/**
 * getOrInitSessions — returns the global terminal sessions map, initializing if needed.
 */
function getOrInitSessions() {
  if (!globalThis[GLOBAL_TTY_SESSIONS_KEY]) {
    globalThis[GLOBAL_TTY_SESSIONS_KEY] = new Map();
  }
  return globalThis[GLOBAL_TTY_SESSIONS_KEY];
}

function buildSessionSpawnConfig(cwd, terminalId) {
  const tmuxEnabled = hasTmux();
  const tmuxSession = normalizeTmuxSessionName(terminalId);
  const resolvedShell = resolveShell();
  const env = Object.assign(sanitizeTerminalSpawnEnv(process.env), {
    DEVHUB_PROJECT_DIR: cwd,
    DEVHUB_MCP_CMD: `node ${MCP_SERVER_PATH}`,
    GEMINI_MCP_HINT: 'Use DEVHUB_MCP_CMD to connect Gemini CLI to your local server.',
    DEVHUB_TMUX_SESSION: tmuxSession,
    MOTD_SHOWN: 'true',
    SSH_CONNECTION: '',
    HUSHLOGIN: 'true',
  });

  let spawnArgs = [];
  if (tmuxEnabled && os.platform() !== 'win32') {
    const attachCommand = `tmux new-session -A -s ${escapeShellArg(tmuxSession)} -c ${escapeShellArg(cwd)}`;
    spawnArgs = ['-lc', attachCommand];
  } else if (path.basename(resolvedShell) === 'zsh') {
    spawnArgs = ['-lic', 'exec zsh -i', 'devhub-shell', '--no-use'];
  }

  return { env, spawnArgs, tmuxEnabled };
}

/**
 * createSession — creates a PTY session and adds it to the sessions map.
 * Calls saveSessions after creation.
 *
 * @param {{ id: string, cwd?: string, shell?: string, restored?: boolean }} opts
 */
export function createSession({ id, cwd, shell, restored = false } = {}) {
  const sessions = getOrInitSessions();
  const requestedCwd = cwd || resolveHomeDirectory();
  const cwdResolution = resolveTerminalSpawnCwd(requestedCwd, {
    processCwd: process.cwd(),
    homeDir: resolveHomeDirectory(),
  });
  const resolvedCwd = cwdResolution.effectiveCwd;
  const resolvedShell = shell || resolveShell();
  const { env, spawnArgs, tmuxEnabled } = buildSessionSpawnConfig(resolvedCwd, id);

  ttyLog('createSession', `spawning PTY`, {
    id,
    requestedCwd: cwdResolution.requestedCwd,
    effectiveCwd: resolvedCwd,
    usedFallback: cwdResolution.usedFallback,
    shell: resolvedShell,
    tmux: tmuxEnabled,
    spawnArgs,
    restored,
  });

  let terminal;
  try {
    terminal = pty.spawn(resolvedShell, spawnArgs, {
      name: 'xterm-256color',
      cols: 120,
      rows: 32,
      cwd: resolvedCwd,
      env,
    });
    ttyLog('createSession', `PTY spawned ok`, { id, pid: terminal.pid });
  } catch (spawnErr) {
    ttyLog('createSession', `PTY spawn FAILED`, { id, error: spawnErr?.message });
    throw spawnErr;
  }

  const now = new Date().toISOString();
  const session = {
    pty: terminal,
    sockets: new Set(),
    history: '',
    mode: 'shell',
    historyEnabled: true,
    pendingInput: '',
    createdAt: now,
    lastSeenAt: now,
    lastActivityAt: Date.now(),
    cwd: resolvedCwd,
    shell: resolvedShell,
    title: null,
    restored,
    id,
    _saveDebounceTimer: null,
    _lastDiagnosticSnapshot: null,
  };

  sessions.set(id, session);

  wireSessionPty(session, sessions);

  saveSessions(sessions);
  return session;
}

/**
 * closeSession — removes a session from the map and persists.
 *
 * @param {string} id - terminal session id
 */
export function closeSession(id) {
  const sessions = getOrInitSessions();
  const session = sessions.get(id);

  if (session) {
    try {
      session.pty?.kill?.();
    } catch {
      // ignore PTY kill failures during explicit close
    }

    // Cancel any pending debounced save
    if (session._saveDebounceTimer) {
      clearTimeout(session._saveDebounceTimer);
      session._saveDebounceTimer = null;
    }

    // Notify and close sockets
    for (const s of session.sockets) {
      if (s.readyState === s.OPEN) {
        try {
          s.send(JSON.stringify({ type: 'exit', exitCode: 0, signal: null }));
          s.close();
        } catch {
          // ignore
        }
      }
    }
  }

  sessions.delete(id);
  saveSessions(sessions);
}

/**
 * _debouncedSave — debounce saveSessions to max once per 30s per session.
 */
function _debouncedSave(sessions, session) {
  if (session._saveDebounceTimer) return; // already scheduled
  session._saveDebounceTimer = setTimeout(() => {
    session._saveDebounceTimer = null;
    saveSessions(sessions);
  }, 30000);
}

const OPENCODE_OUTPUT_SESSION_RE = /\bses_([a-zA-Z0-9_]+)\b/;
// eslint-disable-next-line no-control-regex -- ANSI escape sequences must be matched literally.
const SHELL_TERMINAL_RESPONSE_RE =
  /(?:\x1b\[\?(?:\d+;)*\d+[cnR]|\x1b\[>(?:\d+;)*\d+c|\x1b\[(?:\d+;)*\d+n|\x1b\[(?:\d+;)*\d+R)/g;
const SHELL_NVM_ENV_WARNING_RE =
  /nvm is not compatible with the "[^"]+" environment variable:[^\n]*\nRun `unset [^`]+` to unset it\.\n?/g;
const SHELL_NVM_NPMRC_WARNING_RE =
  /Your user.?s \.npmrc file \(\$\{HOME\}\/\.npmrc\)\nhas a `globalconfig` and\/or a `prefix` setting, which are incompatible with nvm\.\nRun `nvm use --delete-prefix [^`]+` to unset it\.\n?/g;

function stripShellTerminalResponseNoise(chunk) {
  if (typeof chunk !== 'string' || !chunk) return chunk;
  return chunk.replace(SHELL_TERMINAL_RESPONSE_RE, '');
}

function stripShellStartupNoise(chunk) {
  if (typeof chunk !== 'string' || !chunk) return chunk;

  return chunk
    .replace(SHELL_NVM_ENV_WARNING_RE, '')
    .replace(SHELL_NVM_NPMRC_WARNING_RE, '');
}

function sanitizeHistoryReplay(session, history) {
  if (!session?.historyEnabled || session?.mode !== 'shell') return history;
  return stripShellTerminalResponseNoise(history);
}

function handleSessionOutput(sessions, session, chunk) {
  session.lastSeenAt = new Date().toISOString();
  session.lastActivityAt = Date.now();
  _debouncedSave(sessions, session);

  let filtered = chunk;
  if (typeof filtered === 'string') {
    filtered = filtered.replace(
      /┃\s*This is a minimal installation of Kali Linux[\s\S]*?┃\s*\(Run: "touch ~\/\.hushlogin" to hide this message\)\s*\n?/g,
      ''
    );
    filtered = filtered.replace(/zsh: corrupt history file[^\n]*\n?/g, '');
    filtered = stripShellStartupNoise(filtered);

    if (session.mode === 'shell') {
      filtered = stripShellTerminalResponseNoise(filtered);
    }

    if (!session.opencodeSessionId && session.mode === 'tui') {
      const outputMatch = filtered.match(OPENCODE_OUTPUT_SESSION_RE);
      if (outputMatch) {
        const detectedId = `ses_${outputMatch[1]}`;
        session.opencodeSessionId = detectedId;
        broadcastOpenCodeSessionDetected(session, detectedId);
      }
    }
  }

  if (typeof filtered === 'string' && filtered.length === 0) {
    return;
  }

  if (session.historyEnabled) {
    session.history += filtered;
    if (session.history.length > 100000) {
      session.history = session.history.slice(-100000);
    }
  }

  for (const socket of session.sockets) {
    if (socket.readyState === socket.OPEN) {
      socket.send(JSON.stringify({ type: 'output', data: filtered }));
    }
  }
}

function handleSessionExit(sessions, session, exitCode, signal) {
  ttyLog('PTY_EXIT', `session exited`, {
    id: session.id,
    exitCode,
    signal,
    socketCount: session.sockets?.size ?? 0,
  });

  if (!sessions.has(session.id)) return;

  if (session._saveDebounceTimer) {
    clearTimeout(session._saveDebounceTimer);
    session._saveDebounceTimer = null;
  }

  for (const socket of session.sockets) {
    if (socket.readyState === socket.OPEN) {
      socket.send(JSON.stringify({ type: 'exit', exitCode, signal }));
      socket.close();
    }
  }

  sessions.delete(session.id);
  saveSessions(sessions);
}

function wireSessionPty(session, sessions) {
  ttyLog('wireSessionPty', `wiring PTY handlers`, { id: session.id });

  session.pty.onData((chunk) => {
    handleSessionOutput(sessions, session, chunk);
  });

  session.pty.onExit(({ exitCode, signal } = {}) => {
    handleSessionExit(sessions, session, exitCode ?? 0, signal ?? null);
  });
}

/**
 * restoreSessions — loads persisted sessions from disk and recreates PTY processes.
 * Called once at startup. No-op if no file exists.
 */
export function restoreSessions() {
  const saved = loadSessions();
  for (const s of saved) {
    try {
      createSession({ id: s.id, cwd: s.cwd, shell: s.shell, restored: true });
    } catch (err) {
      console.warn(`[ttyServer] Failed to restore session ${s.id}:`, err);
    }
  }
}

export async function ensureTTYServer() {
  if (globalThis[GLOBAL_TTY_KEY]) {
    ttyLog('ensureTTYServer', `reusing existing server`, globalThis[GLOBAL_TTY_KEY]);
    return globalThis[GLOBAL_TTY_KEY];
  }

  ttyLog('ensureTTYServer', `starting new TTY server`, { pid: process.pid, cwd: process.cwd() });

  // A map to keep PTY instances alive across WebSocket reconnects
  // Key: terminalId, Value: { pty, sockets: Set, history, mode, historyEnabled }
  const terminalSessions = new Map();
  globalThis[GLOBAL_TTY_SESSIONS_KEY] = terminalSessions;

  const basePort = Number(process.env.DEVHUB_TTY_PORT || 4077);
  const wsPath = '/terminal';
  const port = await findAvailablePort(basePort);
  const wss = new WebSocketServer({ host: '127.0.0.1', port, path: wsPath });

  ttyLog('ensureTTYServer', `WSS ready`, { port, wsPath });

  wss.on('connection', (socket, request) => {
    let requestedCwd = resolveHomeDirectory();
    let terminalId = `term-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;

    try {
      if (request?.url) {
        const dummyUrl = new URL(request.url, 'http://localhost');
        const wsRequestedCwd = dummyUrl.searchParams.get('cwd');
        const reqTermId = dummyUrl.searchParams.get('id');
        if (wsRequestedCwd) requestedCwd = wsRequestedCwd;
        if (reqTermId) terminalId = reqTermId;
      }
    } catch (e) {
      ttyLog('WS_CONN', `URL parse error`, { error: e?.message });
      console.error('Error parsing WS URL:', e);
    }

    const cwdResolution = resolveTerminalSpawnCwd(requestedCwd, {
      processCwd: process.cwd(),
      homeDir: resolveHomeDirectory(),
    });
    const cwd = cwdResolution.effectiveCwd;

    ttyLog('WS_CONN', `new WebSocket connection`, {
      terminalId,
      requestedCwd: cwdResolution.requestedCwd,
      effectiveCwd: cwd,
      usedFallback: cwdResolution.usedFallback,
    });

    let session = terminalSessions.get(terminalId);

    if (!session) {
      const shell = resolveShell();
      const { env, spawnArgs, tmuxEnabled } = buildSessionSpawnConfig(cwd, terminalId);

      ttyLog('WS_CONN', `creating new session`, {
        terminalId,
        requestedCwd: cwdResolution.requestedCwd,
        effectiveCwd: cwd,
        usedFallback: cwdResolution.usedFallback,
        shell,
        tmux: tmuxEnabled,
        spawnArgs,
      });

      let terminal;
      try {
        terminal = pty.spawn(shell, spawnArgs, {
          name: 'xterm-256color',
          cols: 120,
          rows: 32,
          cwd,
          env,
        });
        ttyLog('WS_CONN', `PTY spawned`, { terminalId, pid: terminal.pid });
      } catch (spawnErr) {
        ttyLog('WS_CONN', `PTY spawn FAILED`, { terminalId, error: spawnErr?.message });
        socket.close();
        return;
      }

      const now = new Date().toISOString();
      session = {
        pty: terminal,
        sockets: new Set([socket]),
        history: '',
        mode: 'shell',
        historyEnabled: true,
        pendingInput: '',
        createdAt: now,
        lastSeenAt: now,
        lastActivityAt: Date.now(),
        id: terminalId,
        cwd,
        shell,
        title: null,
        restored: false,
        _saveDebounceTimer: null,
        _lastDiagnosticSnapshot: null,
      };

      terminalSessions.set(terminalId, session);
      wireSessionPty(session, terminalSessions);
      saveSessions(terminalSessions);

      if (!tmuxEnabled && os.platform() !== 'win32') {
        terminal.write(
          '\r\n\x1b[33m[DevHub]\x1b[0m tmux no está instalado. Para una recuperación más robusta de sesiones por panel, instalá tmux.\r\n\r\n'
        );
      }
    } else {
      // Attach to existing session
      ttyLog('WS_CONN', `reattaching to existing session`, {
        terminalId,
        socketCount: session.sockets.size,
        mode: session.mode,
        historyLen: session.history?.length ?? 0,
      });
      session.sockets.add(socket);
      session.lastActivityAt = Date.now();
      if (session.historyEnabled && session.history && socket.readyState === socket.OPEN) {
        socket.send(
          JSON.stringify({
            type: 'output',
            data: sanitizeHistoryReplay(session, session.history),
          })
        );
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
        try {
          session.pty.write(message.data);
        } catch (err) {
          // PTY file descriptor already closed (EBADF) — ignore silently
          ttyLog('EBADF', `pty.write failed`, { id: session.id, error: err?.message });
          console.warn(`[ttyServer] pty.write failed for session ${session.id}:`, err.message);
        }
      }

      if (
        message.type === 'resize' &&
        Number.isInteger(message.cols) &&
        Number.isInteger(message.rows) &&
        message.cols > 0 &&
        message.rows > 0
      ) {
        const diagnosticSnapshot = buildTTYSessionDiagnosticSnapshot(session, {
          reason: 'client-resize',
          cols: message.cols,
          rows: message.rows,
        });
        maybeLogTTYSessionDiagnostic(session, session._lastDiagnosticSnapshot, diagnosticSnapshot);

        try {
          session.pty.resize(message.cols, message.rows);
        } catch (err) {
          // PTY file descriptor already closed (EBADF) — ignore silently
          ttyLog('EBADF', `pty.resize failed`, { id: session.id, error: err?.message });
          console.warn(`[ttyServer] pty.resize failed for session ${session.id}:`, err.message);
        }
      }
    });

    socket.on('close', (code, reason) => {
      ttyLog('WS_CLOSE', `socket closed`, {
        terminalId,
        code,
        reason: reason?.toString?.() || '',
        remainingSockets: session ? session.sockets.size - 1 : 0,
      });
      if (session) {
        session.sockets.delete(socket);
        session.lastActivityAt = Date.now();
        // Do NOT kill the pty process here. Let it run in background.
      }
    });

    ttyLog('WS_CONN', `sending ready to client`, { terminalId });
    socket.send(JSON.stringify({ type: 'ready' }));
  });

  const serverState = { port, wsPath };
  globalThis[GLOBAL_TTY_KEY] = serverState;

  // Restore persisted sessions from previous run
  restoreSessions();

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
      lastSeenAt: session.lastSeenAt || null,
      cwd: session.cwd || null,
      shell: session.shell || null,
      title: session.title || null,
      restored: session.restored || false,
      alive: true,
      opencodeSessionId: session.opencodeSessionId || null,
      hermesSessionId: session.hermesSessionId || null,
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
