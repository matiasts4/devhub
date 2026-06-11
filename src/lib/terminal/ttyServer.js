import fs from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import cwdGuard from './cwdGuard.js';
import { saveSessions, loadSessions, classifySession } from './sessionStore.js';
import {
  filterTerminalInputForSession,
  filterTerminalOutputForSession,
} from './terminalNoiseFilter.js';
import { buildSwarmTmuxSessionName } from './viewportReadyMarker.js';
import { detectOpenCodeTuiReady } from './opencodeReadyMarker.js';
import { writeOpencodeReadyMarker } from './opencodeReadyMarker.node.js';
import { teardownPanelSessionProcesses } from './panelSessionTeardown.js';

const { resolveTerminalSpawnCwd, validateSwarmCwd } = cwdGuard;

// Lazy-loaded DB helpers — loaded on first use to avoid circular/ESM issues at module load time.
let _ptyDbHelpers = null;
function getPtyDbHelpers() {
  if (!_ptyDbHelpers) {
    try {
      // localDb is CJS — use eval require to bypass Next.js static analysis
      const localDb = eval('require')('../../lib/db/localDb.js');
      _ptyDbHelpers = {
        getDb: localDb.getDb,
        updateWorkspacePtyIdentity: localDb.updateWorkspacePtyIdentity,
        clearWorkspacePtyIdentity: localDb.clearWorkspacePtyIdentity,
      };
    } catch {
      // DB not available (e.g., test environment, Edge runtime) — no-op
      _ptyDbHelpers = null;
    }
  }
  return _ptyDbHelpers;
}

/**
 * Try to update PTY identity on a workspace (session activation).
 * Looks up the workspace by matching the terminal cwd to workspace_path.
 * Best-effort — silently skips if DB or workspace is unavailable.
 */
function tryUpdatePtyIdentity(session) {
  const helpers = getPtyDbHelpers();
  if (!helpers) return;

  try {
    const db = helpers.getDb();
    let workspace = null;

    const swarmId = session?.swarmId ? String(session.swarmId).trim() : '';
    const roleKey = session?.swarmRole?.roleKey ? String(session.swarmRole.roleKey).trim() : '';
    if (swarmId && roleKey) {
      const agentId = `${swarmId}-${roleKey}`;
      workspace =
        db
          .prepare(
            `SELECT id FROM agent_workspaces WHERE agent_id = ? AND status NOT IN ('completed', 'failed') ORDER BY updated_at DESC LIMIT 1`
          )
          .get(agentId) || null;
    }

    if (!workspace && session?.cwd) {
      workspace =
        db
          .prepare(
            `SELECT id FROM agent_workspaces WHERE workspace_path = ? AND status NOT IN ('completed', 'failed') ORDER BY updated_at DESC LIMIT 1`
          )
          .get(session.cwd) || null;
    }

    if (!workspace && session?.id) {
      workspace =
        db
          .prepare(`SELECT id FROM agent_workspaces WHERE terminal_id = ? OR pane_id = ? LIMIT 1`)
          .get(session.id, session.id) || null;
    }

    if (workspace) {
      helpers.updateWorkspacePtyIdentity(db, {
        workspaceId: workspace.id,
        paneId: session.id || null,
        terminalId: session.id || null,
        opencodePid: session.ptyPid || null,
      });
    }
  } catch {
    // Never let PTY identity DB operations crash the terminal server
  }
}

/**
 * Try to clear PTY identity for a workspace (session termination).
 * Looks up workspace by terminal ID and clears PTY columns.
 * Best-effort — silently skips if DB is unavailable.
 */
function tryClearPtyIdentity(session) {
  const helpers = getPtyDbHelpers();
  if (!helpers) return;

  try {
    const db = helpers.getDb();
    // Find workspace whose terminal_id matches this session
    const workspace = db
      .prepare(`SELECT id FROM agent_workspaces WHERE terminal_id = ? OR pane_id = ? LIMIT 1`)
      .get(session.id, session.id);

    if (workspace) {
      helpers.clearWorkspacePtyIdentity(db, workspace.id);
    }
  } catch {
    // Never let PTY identity DB operations crash the terminal server
  }
}

// ─── Diagnostic file logger ───────────────────────────────────────────────────
// Writes to data/logs/terminal-debug.log (relative to project root / cwd).
// Safe for concurrent calls — appendFileSync is atomic per call.
const TTY_LOG_FILE = path.resolve(process.cwd(), 'data', 'logs', 'terminal-debug.log');
const CRASH_DUMP_DIR = path.resolve(process.cwd(), 'data', 'logs', 'crash-dumps');
const DEFAULT_AUTO_KILL_GRACE_MS = 15_000;
const SWARM_AUTO_KILL_GRACE_MS = 120_000;

function resolveAutoKillGraceMs(session) {
  if (session?.swarmId) return SWARM_AUTO_KILL_GRACE_MS;
  if (session?.mode === 'tui') return SWARM_AUTO_KILL_GRACE_MS;
  return DEFAULT_AUTO_KILL_GRACE_MS;
}

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

// ─── Crash dump writer ───────────────────────────────────────────────────────
// Generates a JSON crash dump file when a terminal session exits abnormally.
// Dumps are written to data/logs/crash-dumps/ with timestamped filenames.
function writeCrashDump(session, exitCode, signal, reason = 'unknown') {
  try {
    fs.mkdirSync(CRASH_DUMP_DIR, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `crash-${session.id}-${timestamp}.json`;
    const dumpPath = path.join(CRASH_DUMP_DIR, filename);

    const dump = {
      timestamp: new Date().toISOString(),
      terminalId: session.id,
      reason,
      exitCode,
      signal,
      cwd: session.cwd,
      shell: session.shell,
      mode: session.mode,
      createdAt: session.createdAt,
      lastSeenAt: session.lastSeenAt,
      lastActivityAt: session.lastActivityAt,
      socketCount: session.sockets?.size ?? 0,
      restored: session.restored,
      title: session.title,
      opencodeSessionId: session.opencodeSessionId,
      hermesSessionId: session.hermesSessionId,
      historyLength: session.history?.length ?? 0,
      // Last 2KB of terminal history for context
      recentHistory: session.history?.slice(-2000) || '',
    };

    fs.writeFileSync(dumpPath, JSON.stringify(dump, null, 2), 'utf8');
    ttyLog('CRASH_DUMP', `crash dump written`, { path: dumpPath, terminalId: session.id, reason });
    return dumpPath;
  } catch (err) {
    ttyLog('CRASH_DUMP', `failed to write crash dump`, {
      error: err?.message,
      terminalId: session.id,
    });
    return null;
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

import { createRequire } from 'module';

function loadTerminalDependency(globalKey, moduleName) {
  if (globalThis[globalKey]) {
    return globalThis[globalKey];
  }
  try {
    const nativeRequire = createRequire(path.resolve(process.cwd(), 'package.json'));
    return nativeRequire(moduleName);
  } catch (err) {
    ttyLog('loadDepErr', `failed to load ${moduleName} via nativeRequire, trying eval`, {
      error: err?.message,
    });
    return eval('require')(moduleName);
  }
}

// Use global require via eval or createRequire to bypass Webpack's statically analyzed requires
// This guarantees that the native .node addons for 'node-pty' and 'ws' load correctly
// instead of getting stubbed or mangled by Next.js's dev compiler.
const pty = loadTerminalDependency('__DEVHUB_TTY_NODE_PTY__', 'node-pty');
const { WebSocketServer } = loadTerminalDependency('__DEVHUB_TTY_WS__', 'ws');

const MCP_SERVER_PATH = resolveMcpServerPath();

const GLOBAL_TTY_KEY = '__DEVHUB_TTY_SERVER__';
const GLOBAL_TTY_SESSIONS_KEY = '__DEVHUB_TTY_SESSIONS__';
const STRIPPED_SHELL_ENV_KEYS = ['npm_config_prefix', 'NPM_CONFIG_PREFIX'];
const MAX_SESSIONS = 50;
const IDLE_CLEANUP_INTERVAL_MS = 60_000; // 60s
const IDLE_SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
let tmuxAvailabilityCache;
let idleCleanupTimer = null;

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

async function openWebSocketServer(port, wsPath) {
  const wss = new WebSocketServer({ host: '127.0.0.1', port, path: wsPath });

  if (typeof wss.once !== 'function') {
    return { wss, port };
  }

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      if (typeof wss.off === 'function') {
        wss.off('listening', handleListening);
        wss.off('error', handleError);
      }
    };

    const handleListening = () => {
      cleanup();
      const actualPort = typeof wss.address === 'function' ? wss.address()?.port || port : port;
      resolve({ wss, port: actualPort });
    };

    const handleError = (error) => {
      cleanup();
      if (typeof wss.close === 'function') {
        try {
          wss.close();
        } catch {
          // Ignore close failures during startup retry.
        }
      }
      reject(error);
    };

    wss.once('listening', handleListening);
    wss.once('error', handleError);
  });
}

function isTestRuntime() {
  return (
    process.env.NODE_ENV === 'test' ||
    Boolean(process.env.JEST_WORKER_ID) ||
    typeof globalThis.jest !== 'undefined' ||
    typeof globalThis.expect !== 'undefined' ||
    process.argv.some((arg) => String(arg).includes('jest'))
  );
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

function resolveSessionTmuxName(session) {
  if (session?.swarmId && session?.swarmRole?.roleKey) {
    return buildSwarmTmuxSessionName(session.swarmId, session.swarmRole.roleKey);
  }
  return null;
}

function maybeWriteOpencodeReadyMarker(session, payload = {}) {
  const tmuxSession = resolveSessionTmuxName(session);
  if (!tmuxSession) return;
  try {
    writeOpencodeReadyMarker(tmuxSession, {
      sessionId: session.id,
      opencodeSessionId: session.opencodeSessionId || null,
      ...payload,
    });
  } catch {
    // Best-effort marker for bootstrap polling in swarm wrappers.
  }
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
      const sessionMatch = input.match(/opencode\s+(?:--session\s+)([\w-]+)/i);
      if (sessionMatch?.[1] && !sessionMatch[1].startsWith('-')) {
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

  // Grok Build TUI (groc is a legacy launcher alias)
  if (/\b(?:grok|groc)\b/i.test(input)) {
    session.mode = 'tui';
    session.historyEnabled = false;
    session.history = '';
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
        const sessionMatch = trimmed.match(/opencode\s+(?:--session\s+)([\w-]+)/i);
        if (sessionMatch?.[1] && !sessionMatch[1].startsWith('-')) {
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

    if (/^\s*(?:grok|groc)\b/i.test(trimmed)) {
      session.mode = 'tui';
      session.historyEnabled = false;
      session.history = '';
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

/**
 * getSessionOutput — read the accumulated output buffer of a session.
 * Returns the history string or null if the session is unknown.
 */
export function getSessionOutput(id) {
  const sessions = getOrInitSessions();
  const session = sessions.get(id);
  if (!session) return null;
  return session.history || '';
}

/**
 * pushSessionInput — write keystrokes to a session's PTY.
 * Returns true on success, false if the session is unknown.
 */
export function pushSessionInput(id, data) {
  const sessions = getOrInitSessions();
  const session = sessions.get(id);
  if (!session || !session.pty) return false;
  try {
    session.pty.write(String(data ?? ''));
    return true;
  } catch {
    return false;
  }
}

function normalizePtyRuntimeEvidence(session, terminalId) {
  if (!session) {
    return {
      provider: 'pty',
      availability: 'missing',
      handle_ref: null,
      evidence: terminalId ? { terminalId } : null,
    };
  }

  return {
    provider: 'pty',
    availability: 'live',
    handle_ref: session.id,
    evidence: {
      terminalId: session.id,
      cwd: session.cwd || null,
      restored: Boolean(session.restored),
      opencodeSessionId: session.opencodeSessionId || null,
    },
  };
}

export function readPtyRuntime({ terminalId } = {}) {
  const sessions = getOrInitSessions();
  return normalizePtyRuntimeEvidence(
    terminalId ? sessions.get(terminalId) : null,
    terminalId || null
  );
}

export function openPtyLifecycle({ runtimeHint } = {}) {
  const terminalId = runtimeHint?.terminalId || null;
  const existingRuntime = readPtyRuntime({ terminalId });

  if (existingRuntime.availability === 'live') {
    return {
      outcome: 'ok',
      reason: 'runtime_handle_live',
      runtime: existingRuntime,
    };
  }

  const session = createSession({ id: terminalId || `term-${Date.now()}` });

  return {
    outcome: 'ok',
    reason: 'runtime_handle_created',
    runtime: normalizePtyRuntimeEvidence(session, session.id),
  };
}

export function attachPtyLifecycle({ runtimeHint } = {}) {
  const terminalId = runtimeHint?.terminalId || null;
  const runtime = readPtyRuntime({ terminalId });

  if (runtime.availability !== 'live') {
    return {
      outcome: 'degraded',
      reason: 'runtime_handle_missing',
      runtime,
    };
  }

  return {
    outcome: 'ok',
    reason: 'runtime_handle_live',
    runtime,
  };
}

function buildSessionSpawnConfig(cwd, terminalId, swarmContext = null) {
  const tmuxEnabled = hasTmux();
  const isSwarm = Boolean(
    swarmContext?.isSwarmRole && swarmContext?.launchId && swarmContext?.roleKey
  );
  const tmuxSession = isSwarm
    ? `devhub-swarm-${swarmContext.launchId}-${swarmContext.roleKey}`
    : normalizeTmuxSessionName(terminalId);
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
    // Disable tmux status bar to save vertical space, then create/attach session
    const attachCommand = `tmux set -g status off 2>/dev/null || true; tmux new-session -A -s ${escapeShellArg(tmuxSession)} -c ${escapeShellArg(cwd)}`;
    spawnArgs = ['-lc', attachCommand];
  } else if (path.basename(resolvedShell) === 'zsh') {
    spawnArgs = ['-lic', 'exec zsh -i', 'devhub-shell', '--no-use'];
  } else if (os.platform() === 'win32') {
    const shellBase = path.basename(resolvedShell).toLowerCase();
    if (shellBase.includes('powershell') || shellBase.includes('pwsh')) {
      // Suppress the standard Windows PowerShell copyright / "Instale la versión más reciente..." banner.
      // This gives a much cleaner initial view (just the prompt + any command output).
      // -NoLogo is the official way; we keep it minimal so user profiles can still run if present.
      // Applies to both regular terminals and swarm agent worktree shells.
      spawnArgs = ['-NoLogo'];
    }
  }

  return { env, spawnArgs, tmuxEnabled, tmuxSession: tmuxEnabled ? tmuxSession : null };
}

/**
 * createSession — creates a PTY session and adds it to the sessions map.
 * Calls saveSessions after creation.
 *
 * @param {{ id: string, cwd?: string, shell?: string, restored?: boolean }} opts
 */
export function createSession({ id, cwd, shell, restored = false, swarmContext = null } = {}) {
  // Auto-generate id when caller does not provide one (e.g. POST /api/terminal/session).
  // Without this, the route returns { id: undefined } → JSON.stringify drops the key → the
  // open_terminal tool sees { port, wsPath } and reports "missing required fields".
  if (!id) {
    id = `term-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  }
  const sessions = getOrInitSessions();
  const requestedCwd = cwd || resolveHomeDirectory();
  const cwdResolution = resolveTerminalSpawnCwd(requestedCwd, {
    processCwd: process.cwd(),
    homeDir: resolveHomeDirectory(),
  });
  const resolvedCwd = cwdResolution.effectiveCwd;
  const resolvedShell = shell || resolveShell();

  // T1.4: Validate cwd — for worktree paths enforce full validation; for Plyrium paths reject always
  {
    const explicitSwarmRole = Boolean(swarmContext?.isSwarmRole);
    const cwdValidation = validateSwarmCwd({
      requestedCwd: resolvedCwd,
      roleKey: swarmContext?.roleKey || 'swarm-agent',
      isSwarmRole: explicitSwarmRole,
    });
    if (!cwdValidation.valid) {
      ttyLog('createSession', `swarm cwd validation FAILED`, {
        id,
        requestedCwd: resolvedCwd,
        explicitSwarmRole,
        launchId: swarmContext?.launchId || null,
        error: cwdValidation.error,
      });
      throw new Error(`Swarm worktree cwd validation failed: ${cwdValidation.error}`);
    }
    if (explicitSwarmRole) {
      ttyLog('createSession', `swarm cwd validation passed`, {
        id,
        roleKey: swarmContext?.roleKey || 'swarm-agent',
        launchId: swarmContext?.launchId || null,
        effectiveCwd: cwdValidation.effectiveCwd,
      });
    }
  }

  const { env, spawnArgs, tmuxEnabled, tmuxSession } = buildSessionSpawnConfig(
    resolvedCwd,
    id,
    swarmContext
  );

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
    ptyPid: terminal.pid,
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
    swarmRole: swarmContext?.roleKey ? { roleKey: swarmContext.roleKey } : null,
    swarmId: swarmContext?.launchId || null,
    tmuxSession: tmuxSession || null,
    tmuxEnabled: Boolean(tmuxEnabled),
    _saveDebounceTimer: null,
    _lastDiagnosticSnapshot: null,
  };

  sessions.set(id, session);

  // PTY-3: Update workspace PTY identity on session activation
  tryUpdatePtyIdentity(session);

  // Evict oldest idle sessions if we exceed the cap
  if (sessions.size > MAX_SESSIONS) {
    evictOldestIdleSessions(sessions);
  }

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
    // PTY-4: Clear workspace PTY identity on session termination
    tryClearPtyIdentity(session);

    teardownPanelSessionProcesses(session, { hasTmux });

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

const OPENCODE_OUTPUT_SESSION_RE =
  /(?:session[ _]id|sesión[ _]id|session_id|opencode_session_id)[:\s]+([\w-]+)|\b(ses_[\w-]+)\b|\b(oc_[\w-]+)\b/i;
const SHELL_NVM_ENV_WARNING_RE =
  /nvm is not compatible with the "[^"]+" environment variable:[^\n]*\nRun `unset [^`]+` to unset it\.\n?/g;
const SHELL_NVM_NPMRC_WARNING_RE =
  /Your user.?s \.npmrc file \(\$\{HOME\}\/\.npmrc\)\nhas a `globalconfig` and\/or a `prefix` setting, which are incompatible with nvm\.\nRun `nvm use --delete-prefix [^`]+` to unset it\.\n?/g;

function stripShellStartupNoise(chunk) {
  if (typeof chunk !== 'string' || !chunk) return chunk;

  return chunk.replace(SHELL_NVM_ENV_WARNING_RE, '').replace(SHELL_NVM_NPMRC_WARNING_RE, '');
}

function sanitizeHistoryReplay(session, history) {
  if (!session?.historyEnabled || session?.mode !== 'shell') return history;
  return filterTerminalOutputForSession(session, history);
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

    filtered = filterTerminalOutputForSession(session, filtered);

    if (!session.opencodeSessionId && session.mode === 'tui') {
      const outputMatch = filtered.match(OPENCODE_OUTPUT_SESSION_RE);
      if (outputMatch) {
        const detectedId = (outputMatch[1] || outputMatch[2] || outputMatch[3])?.trim();
        if (detectedId && !detectedId.startsWith('-')) {
          session.opencodeSessionId = detectedId;
          broadcastOpenCodeSessionDetected(session, detectedId);
        }
      }
    }

    // Swarm agents start OpenCode inside tmux before the DevHub client attaches,
    // so session.mode may still be 'shell' when the TUI footer first appears.
    if (detectOpenCodeTuiReady(filtered)) {
      if (session.mode !== 'tui') {
        session.mode = 'tui';
        session.historyEnabled = false;
      }
      maybeWriteOpencodeReadyMarker(session, { reason: 'tty-tui-footer' });
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

  // PTY-4: Clear workspace PTY identity on PTY process exit
  tryClearPtyIdentity(session);

  if (!sessions.has(session.id)) return;

  // Generate crash dump for abnormal exits
  const isAbnormalExit = exitCode !== 0 || signal !== null;
  if (isAbnormalExit) {
    writeCrashDump(session, exitCode, signal, 'pty_abnormal_exit');
  }

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
 * evictOldestIdleSessions — removes the oldest idle sessions when the Map exceeds MAX_SESSIONS.
 * "Idle" = no connected WebSocket sockets.
 */
function evictOldestIdleSessions(sessions) {
  const excess = sessions.size - MAX_SESSIONS;
  if (excess <= 0) return;

  const idleSessions = [];
  for (const [id, session] of sessions.entries()) {
    if (session.sockets.size === 0) {
      idleSessions.push({ id, session });
    }
  }

  // Sort by lastActivityAt ascending (oldest first)
  idleSessions.sort((a, b) => (a.session.lastActivityAt || 0) - (b.session.lastActivityAt || 0));

  const toEvict = idleSessions.slice(0, excess);
  for (const { id, session } of toEvict) {
    ttyLog('EVICTION', `evicting idle session (MAX_SESSIONS cap)`, { id, pid: session.ptyPid });
    try {
      session.pty?.kill?.();
    } catch {
      // ignore
    }
    if (session._saveDebounceTimer) {
      clearTimeout(session._saveDebounceTimer);
      session._saveDebounceTimer = null;
    }
    if (session._autoKillTimer) {
      clearTimeout(session._autoKillTimer);
      session._autoKillTimer = null;
    }
    sessions.delete(id);
  }

  if (toEvict.length > 0) {
    saveSessions(sessions);
    ttyLog('EVICTION', `evicted ${toEvict.length} idle session(s)`);
  }
}

/**
 * startIdleCleanup — starts a periodic timer that removes sessions with no connected
 * WebSocket sockets and lastActivity older than IDLE_SESSION_TIMEOUT_MS.
 */
function startIdleCleanup(sessions) {
  if (idleCleanupTimer) return; // already running

  idleCleanupTimer = setInterval(() => {
    const now = Date.now();
    let cleaned = 0;

    for (const [id, session] of sessions.entries()) {
      if (session.sockets.size > 0) continue; // still connected

      const lastActivity = session.lastActivityAt || 0;
      if (now - lastActivity < IDLE_SESSION_TIMEOUT_MS) continue; // not idle long enough

      ttyLog('IDLE_CLEANUP', `removing idle session`, {
        id,
        pid: session.ptyPid,
        lastActivityAt: lastActivity,
      });

      try {
        session.pty?.kill?.();
      } catch {
        // ignore
      }
      if (session._saveDebounceTimer) {
        clearTimeout(session._saveDebounceTimer);
        session._saveDebounceTimer = null;
      }
      if (session._autoKillTimer) {
        clearTimeout(session._autoKillTimer);
        session._autoKillTimer = null;
      }
      sessions.delete(id);
      cleaned++;
    }

    if (cleaned > 0) {
      saveSessions(sessions);
      ttyLog('IDLE_CLEANUP', `cleaned ${cleaned} idle session(s)`);
    }
  }, IDLE_CLEANUP_INTERVAL_MS);

  // Allow Node to exit even if timer is still running
  if (idleCleanupTimer.unref) idleCleanupTimer.unref();
}

/**
 * restoreSessions — loads persisted sessions from disk and recreates PTY processes.
 * Called once at startup. No-op if no file exists.
 *
 * Session branching:
 * - opencode-durable: skip (React handles via opencode --session)
 * - pty-durable: verify PTY pid still alive via process.kill(pid, 0), then createSession
 * - shell-ephemeral: respawn via createSession({ cwd, shell, restored: true }) — no ptyPid check
 *
 * Mutex: sets devhub_restore_in_progress flag in localStorage before restore begins,
 * clears it after all restores complete. React reads this flag to block relaunch dispatches.
 */
export function restoreSessions() {
  const saved = loadSessions();
  let zombieCount = 0;
  let skippedNoPid = 0;
  let shellEphemeralRestored = 0;
  const sessions = getOrInitSessions();

  // Set mutex flag before restore begins
  // Note: devhub_generic_restore_in_progress is for generic (pty-durable + shell-ephemeral) restores.
  // opencode-durable sessions are skipped here (React handles them via opencode --session).
  // For backward compatibility, startupRestoreCoordinator.js and TerminalWorkspacesManager.jsx
  // still read devhub_restore_in_progress (Phase 6 will switch them to devhub_opencode_restore_in_progress).
  try {
    if (typeof globalThis.localStorage !== 'undefined') {
      globalThis.localStorage.setItem('devhub_generic_restore_in_progress', 'true');
    }
  } catch {
    // localStorage not available — skip mutex
  }

  for (const s of saved) {
    try {
      const sessionType = s.sessionType || classifySession(s);

      // opencode-durable: React handles via opencode --session; skip backend restore
      if (sessionType === 'opencode-durable') {
        ttyLog('RESTORE', `skipping opencode-durable session — React handles it`, { id: s.id });
        continue;
      }

      // pty-durable: must have a saved ptyPid — verify process is still alive
      if (sessionType === 'pty-durable') {
        if (!s.ptyPid) {
          ttyLog('RESTORE', `skipping pty-durable session without ptyPid`, { id: s.id });
          skippedNoPid++;
          continue;
        }

        try {
          process.kill(s.ptyPid, 0); // Signal 0 = check if process exists
        } catch {
          // Process is dead — skip restoration and log
          ttyLog('ZOMBIE_CLEANUP', `skipping dead pty-durable session`, {
            id: s.id,
            pid: s.ptyPid,
          });
          zombieCount++;
          continue;
        }

        const restored = createSession({
          id: s.id,
          cwd: s.cwd,
          shell: s.shell,
          restored: true,
          swarmContext:
            s.swarmRole || s.swarmId
              ? {
                  isSwarmRole: true,
                  roleKey: s.swarmRole?.roleKey || null,
                  launchId: s.swarmId || null,
                }
              : null,
        });

        // Verify the newly spawned PTY is actually alive
        if (restored.ptyPid && typeof process.kill === 'function') {
          try {
            process.kill(restored.ptyPid, 0);
          } catch {
            // Spawned process died immediately — remove from disk
            ttyLog(
              'ZOMBIE_CLEANUP',
              `restored pty-durable session died on spawn, removing from disk`,
              {
                id: s.id,
                pid: restored.ptyPid,
              }
            );
            sessions.delete(s.id);
            zombieCount++;
          }
        }
        continue;
      }

      // shell-ephemeral: respawn without ptyPid check
      if (sessionType === 'shell-ephemeral') {
        if (!s.cwd || !s.shell) {
          ttyLog('RESTORE', `skipping shell-ephemeral without cwd/shell`, { id: s.id });
          skippedNoPid++;
          continue;
        }

        try {
          const restored = createSession({
            id: s.id,
            cwd: s.cwd,
            shell: s.shell,
            restored: true,
            swarmContext:
              s.swarmRole || s.swarmId
                ? {
                    isSwarmRole: true,
                    roleKey: s.swarmRole?.roleKey || null,
                    launchId: s.swarmId || null,
                  }
                : null,
          });
          ttyLog('RESTORE', `restored shell-ephemeral session`, {
            id: s.id,
            cwd: s.cwd,
            shell: s.shell,
            newPid: restored.ptyPid,
          });
          shellEphemeralRestored++;
        } catch (ephemeralErr) {
          ttyLog('RESTORE', `failed to restore shell-ephemeral session`, {
            id: s.id,
            error: ephemeralErr?.message,
          });
        }
        continue;
      }

      // Fallback for sessions without sessionType and no identifiable type markers
      // (legacy v1 sessions that somehow weren't migrated)
      if (!s.ptyPid) {
        ttyLog('RESTORE', `skipping legacy session without ptyPid or sessionType`, { id: s.id });
        skippedNoPid++;
        continue;
      }

      // Legacy pty-durable without sessionType — treat as pty-durable
      try {
        process.kill(s.ptyPid, 0);
      } catch {
        ttyLog('ZOMBIE_CLEANUP', `skipping dead legacy session`, { id: s.id, pid: s.ptyPid });
        zombieCount++;
        continue;
      }

      const restored = createSession({
        id: s.id,
        cwd: s.cwd,
        shell: s.shell,
        restored: true,
        swarmContext:
          s.swarmRole || s.swarmId
            ? {
                isSwarmRole: true,
                roleKey: s.swarmRole?.roleKey || null,
                launchId: s.swarmId || null,
              }
            : null,
      });
      if (restored.ptyPid && typeof process.kill === 'function') {
        try {
          process.kill(restored.ptyPid, 0);
        } catch {
          sessions.delete(s.id);
          zombieCount++;
        }
      }
    } catch (err) {
      console.warn(`[ttyServer] Failed to restore session ${s.id}:`, err);
      ttyLog('RESTORE', `restore failed`, { id: s.id, error: err?.message });
    }
  }

  // Clear mutex flag after all restores complete
  // Uses devhub_generic_restore_in_progress — the generic restore mutex key.
  try {
    if (typeof globalThis.localStorage !== 'undefined') {
      globalThis.localStorage.removeItem('devhub_generic_restore_in_progress');
    }
  } catch {
    // localStorage not available — skip
  }

  if (zombieCount > 0) {
    console.log(
      `[ttyServer][ZOMBIE_CLEANUP] Cleaned up ${zombieCount} dead session(s) from previous run`
    );
  }
  if (skippedNoPid > 0) {
    console.log(`[ttyServer][RESTORE] Skipped ${skippedNoPid} session(s) without saved ptyPid`);
  }
  if (shellEphemeralRestored > 0) {
    console.log(
      `[ttyServer][RESTORE] Restored ${shellEphemeralRestored} shell-ephemeral session(s)`
    );
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

  const basePort = Number(process.env.DEVHUB_TTY_PORT || (isTestRuntime() ? 0 : 4077));
  const wsPath = '/terminal';
  let port = await findAvailablePort(basePort);
  let wss;

  try {
    ({ wss, port } = await openWebSocketServer(port, wsPath));
  } catch (error) {
    if (error?.code !== 'EADDRINUSE') throw error;
    ({ wss, port } = await openWebSocketServer(0, wsPath));
  }

  ttyLog('ensureTTYServer', `WSS ready`, { port, wsPath });

  wss.on('connection', (socket, request) => {
    let requestedCwd = resolveHomeDirectory();
    let terminalId = `term-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    let swarmContext = {
      isSwarmRole: false,
      roleKey: null,
      launchId: null,
    };

    try {
      const parseBooleanQueryFlag = (value) => {
        const normalized = String(value || '')
          .trim()
          .toLowerCase();
        return normalized === '1' || normalized === 'true' || normalized === 'yes';
      };

      if (request?.url) {
        const dummyUrl = new URL(request.url, 'http://localhost');
        const wsRequestedCwd = dummyUrl.searchParams.get('cwd');
        const reqTermId = dummyUrl.searchParams.get('id');
        const reqSessionId = dummyUrl.searchParams.get('sessionId');
        const isSwarmRoleFlag = parseBooleanQueryFlag(dummyUrl.searchParams.get('isSwarmRole'));
        const roleKey = dummyUrl.searchParams.get('roleKey');
        const launchId = dummyUrl.searchParams.get('launchId');
        if (wsRequestedCwd) requestedCwd = wsRequestedCwd;
        if (reqSessionId) terminalId = reqSessionId;
        else if (reqTermId) terminalId = reqTermId;
        swarmContext = {
          isSwarmRole: isSwarmRoleFlag,
          roleKey: roleKey || null,
          launchId: launchId || null,
        };
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

    // T1.4: Validate cwd — for worktree paths enforce full validation; for Plyrium paths reject always
    {
      const cwdValidation = validateSwarmCwd({
        requestedCwd: cwd,
        roleKey: swarmContext.roleKey || 'swarm-agent',
        isSwarmRole: Boolean(swarmContext.isSwarmRole),
      });
      if (!cwdValidation.valid) {
        ttyLog('WS_CONN', `swarm cwd validation FAILED`, {
          terminalId,
          requestedCwd: cwd,
          explicitSwarmRole: Boolean(swarmContext.isSwarmRole),
          launchId: swarmContext.launchId || null,
          error: cwdValidation.error,
        });
        socket.close();
        return;
      }
      if (swarmContext.isSwarmRole) {
        ttyLog('WS_CONN', `swarm cwd validation passed`, {
          terminalId,
          roleKey: swarmContext.roleKey || 'swarm-agent',
          launchId: swarmContext.launchId || null,
          effectiveCwd: cwdValidation.effectiveCwd,
        });
      }
    }

    ttyLog('WS_CONN', `new WebSocket connection`, {
      terminalId,
      requestedCwd: cwdResolution.requestedCwd,
      effectiveCwd: cwd,
      usedFallback: cwdResolution.usedFallback,
    });

    let session = terminalSessions.get(terminalId);
    const isSessionReattach = Boolean(session);

    if (!session) {
      const shell = resolveShell();
      const { env, spawnArgs, tmuxEnabled } = buildSessionSpawnConfig(
        cwd,
        terminalId,
        swarmContext
      );

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
        ptyPid: terminal.pid,
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
        swarmRole: swarmContext?.roleKey ? { roleKey: swarmContext.roleKey } : null,
        swarmId: swarmContext?.launchId || null,
        _saveDebounceTimer: null,
        _lastDiagnosticSnapshot: null,
      };

      terminalSessions.set(terminalId, session);
      wireSessionPty(session, terminalSessions);
      saveSessions(terminalSessions);

      // PTY-3: Update workspace PTY identity on WS session creation
      tryUpdatePtyIdentity(session);

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
        const filteredInput = filterTerminalInputForSession(session, message.data);
        if (filteredInput === null) return;
        detectSessionModeFromInput(session, filteredInput);
        session.lastActivityAt = Date.now();
        try {
          session.pty.write(filteredInput);
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
      const closeCode = code ?? 0;
      const isAbruptClose = closeCode === 1006 || closeCode === 1005; // 1006=abnormal, 1005=no status
      const remainingSockets = session ? session.sockets.size - 1 : 0;

      ttyLog('WS_CLOSE', `socket closed`, {
        terminalId,
        code: closeCode,
        abrupt: isAbruptClose,
        reason: reason?.toString?.() || '',
        remainingSockets,
      });

      if (session) {
        session.sockets.delete(socket);
        session.lastActivityAt = Date.now();

        // AUTO-KILL: If this was the last socket, start a grace timer
        // If no one reconnects within 15s, kill the PTY to prevent zombies
        if (remainingSockets <= 0 && session.pty) {
          const autoKillGraceMs = resolveAutoKillGraceMs(session);
          ttyLog('WS_CLOSE', `last socket disconnected, starting auto-kill grace timer`, {
            terminalId,
            gracePeriodMs: autoKillGraceMs,
            swarmId: session.swarmId || null,
            mode: session.mode || 'shell',
          });

          // Clear any existing timer (reconnect scenario)
          if (session._autoKillTimer) {
            clearTimeout(session._autoKillTimer);
            session._autoKillTimer = null;
          }

          session._autoKillTimer = setTimeout(() => {
            // Check if sockets are still empty (no one reconnected)
            if (session && session.sockets.size === 0) {
              ttyLog('AUTO_KILL', `grace period expired, killing orphaned PTY`, {
                terminalId,
                pid: session.pty.pid,
                cwd: session.cwd,
                command: session.command,
                uptime: Date.now() - (session.createdAt || Date.now()),
              });

              try {
                session.pty.kill();
                console.log(
                  `[ttyServer][AUTO_KILL] Killed orphaned PTY session ${terminalId} (pid: ${session.pty.pid})`
                );
              } catch (err) {
                console.error(
                  `[ttyServer][AUTO_KILL] Failed to kill PTY ${terminalId}:`,
                  err.message
                );
              }

              // Clean up session
              terminalSessions.delete(terminalId);
              try {
                saveSessions(terminalSessions);
              } catch {
                // ignore save failures during cleanup
              }
            } else {
              ttyLog('AUTO_KILL', `client reconnected, cancelling auto-kill timer`, {
                terminalId,
                socketCount: session?.sockets?.size || 0,
              });
            }
            session._autoKillTimer = null;
          }, autoKillGraceMs);
        }

        // If client reconnected and cancelled the auto-kill timer, log it
        if (remainingSockets > 0 && session._autoKillTimer) {
          clearTimeout(session._autoKillTimer);
          session._autoKillTimer = null;
          ttyLog('AUTO_KILL', `client reconnected, auto-kill timer cancelled`, {
            terminalId,
            socketCount: session.sockets.size,
          });
        }
      }
    });

    ttyLog('WS_CONN', `sending ready to client`, {
      terminalId,
      reattached: isSessionReattach,
      mode: session?.mode || 'shell',
    });
    socket.send(
      JSON.stringify({
        type: 'ready',
        reattached: isSessionReattach,
        mode: session?.mode || 'shell',
      })
    );
  });

  const serverState = { port, wsPath };
  globalThis[GLOBAL_TTY_KEY] = serverState;

  // Restore persisted sessions from previous run
  restoreSessions();

  // Start periodic idle-session cleanup to prevent unbounded Map growth
  startIdleCleanup(terminalSessions);

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

  const OPENCODE_SESSION_RE = /opencode\s+(?:--session\s+|session\s+resume\s+)([\w-]+)/i;

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
      if (match?.[1] && !match[1].startsWith('-')) {
        session.opencodeSessionId = match[1];
        result[terminalId] = match[1];
      }
    }
  }

  return result;
}

/**
 * getAllActiveSessions — list every live PTY session in the global map.
 *
 * Unlike `getActiveOpenCodeSessionIds`, this includes plain shell/pty
 * sessions created by the open_terminal tool (which do not set
 * opencodeSessionId). Without it, list_terminals returns `{processes:[]}`
 * and the assistant loops on open_terminal.
 *
 * `type` is 'opencode' when opencodeSessionId is set, otherwise the
 * session's mode (e.g. 'pty', 'shell', 'tui'). Sorted ascending by
 * createdAt; sessions missing createdAt are pushed to the end.
 */
export function getAllActiveSessions() {
  const sessions = globalThis[GLOBAL_TTY_SESSIONS_KEY];
  if (!sessions || typeof sessions.values !== 'function') return [];

  const result = [];
  for (const [, session] of sessions.entries()) {
    if (!session || !session.id) continue;
    result.push({
      id: session.id,
      cwd: session.cwd || null,
      shell: session.shell || null,
      createdAt: session.createdAt || null,
      type: session.opencodeSessionId ? 'opencode' : session.mode || 'pty',
      opencodeSessionId: session.opencodeSessionId || null,
    });
  }

  result.sort((a, b) => {
    if (!a.createdAt && !b.createdAt) return 0;
    if (!a.createdAt) return 1;
    if (!b.createdAt) return -1;
    return String(a.createdAt).localeCompare(String(b.createdAt));
  });

  return result;
}
