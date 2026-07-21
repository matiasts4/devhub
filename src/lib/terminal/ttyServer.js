import fs from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
import { spawnSync } from 'child_process';
import cwdGuard from './cwdGuard.js';
import { saveSessions, loadSessions, classifySession } from './sessionStore.js';
import {
  filterTerminalInputForSession,
  filterTerminalOutputForSession,
} from './terminalNoiseFilter.js';
import { buildTmuxPanelAttachCommand } from './tmuxStatusBar.js';
import { buildSwarmTmuxSessionName } from './viewportReadyMarker.js';
import { claimSessionFlagOnce, detectOpenCodeTuiReady } from './opencodeReadyMarker.js';
import { detectKimiTuiReady } from './kimiReadyMarker.js';
import { detectGrokSessionFromOutput } from './grokReadyMarker.js';
import { writeAgentReadyMarker, writeOpencodeReadyMarker } from './opencodeReadyMarker.node.js';
import { teardownPanelSessionProcesses } from './panelSessionTeardown.js';
import {
  detectAgentTypeFromCommand,
  extractAgentSessionId,
  synthesizeAgentSessionId,
  AgentStateMachine,
} from './agentTuiMetadata.node.js';
import { processOscTitle, stripOscTitleSequences } from './oscTitleParser.js';
import { processOscProgress } from './oscProgressParser.js';
import {
  ingestAgentDetectionFromFilteredOutput,
  tickAgentDetection,
} from './sessionAgentDetector.js';
import { buildSessionHookEnv, generateSessionHookToken } from './agentHooks/hookEnv.js';
import { createScrollbackStore } from './terminalScrollbackStore.js';
import { createOscCwdParser } from './oscCwdParser.js';
import {
  applyOpencodeDurableMetadata,
  registerOpencodeSession,
  shouldSkipBackendRestore,
  unregisterOpencodeSession,
} from './opencodeSessionRegistry.js';

const requireCjs = createRequire(
  typeof __filename !== 'undefined' ? __filename : path.join(process.cwd(), 'package.json')
);

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
// Panels are kept mounted while their workspace is hidden, so the PTY should
// stay alive for reactivation even if the client socket drops briefly. Use a
// long grace period (1 hour) to avoid killing TUIs/shells during workspace
// switches or transient disconnections. Real cleanup still happens on explicit
// panel close or app exit.
// These defaults can be overridden via environment variables for QA/ad-hoc tuning.
const DEFAULT_AUTO_KILL_GRACE_MS = Number(process.env.DEVHUB_TTY_AUTO_KILL_GRACE_MS) || 3_600_000;
const TUI_AUTO_KILL_GRACE_MS = Number(process.env.DEVHUB_TTY_TUI_AUTO_KILL_GRACE_MS) || 3_600_000;

function resolveAutoKillGraceMs(session) {
  if (session?.swarmId) return TUI_AUTO_KILL_GRACE_MS;
  if (session?.mode === 'tui') return TUI_AUTO_KILL_GRACE_MS;
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
      lastOutputAt: session.lastOutputAt,
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

function resolvePtyRespawnPolicy() {
  const candidates = [
    typeof __dirname !== 'undefined' ? path.join(__dirname, 'ptyRespawnPolicy.cjs') : null,
    typeof __dirname !== 'undefined'
      ? path.resolve(__dirname, '../../../sidecar-backend/ptyRespawnPolicy.cjs')
      : null,
    findPathUpwards(process.cwd(), 'src', 'lib', 'terminal', 'ptyRespawnPolicy.cjs'),
    findPathUpwards(process.cwd(), 'sidecar-backend', 'ptyRespawnPolicy.cjs'),
  ].filter(Boolean);

  for (const cand of candidates) {
    if (fs.existsSync(cand)) {
      try {
        return eval('require')(cand);
      } catch {
        /* try next candidate */
      }
    }
  }

  // Fallback inline implementation if file cannot be found in Next build bundles
  return {
    shouldRespawnShellAfterPtyExit({
      launchCommand = null,
      mode = null,
      agentType = null,
      platform = typeof process !== 'undefined' ? process.platform : '',
      exitCode = null,
      respawnCount = 0,
      maxRespawns = 3,
    } = {}) {
      if (Number(respawnCount) >= Number(maxRespawns)) return false;
      if (typeof launchCommand === 'string' && launchCommand.trim().length > 0) return true;
      const wasTui = mode === 'tui' || Boolean(agentType);
      if (!wasTui) return false;
      if (platform !== 'win32') return false;
      const n = Number(exitCode);
      return n === -1073741510 || n === 0xc000013a;
    },
    shouldRelaunchAgentAfterCtrlCRespawn({
      inputFocused = false,
      launchCommand = null,
      agentType = null,
    } = {}) {
      if (inputFocused) return false;
      return (typeof launchCommand === 'string' && launchCommand.trim().length > 0) || Boolean(agentType);
    },
  };
}

const { shouldRespawnShellAfterPtyExit, shouldRelaunchAgentAfterCtrlCRespawn } =
  resolvePtyRespawnPolicy();

function resolveMcpServerPath() {
  return (
    findPathUpwards(process.cwd(), 'devhub-mcp', 'server.js') ||
    (typeof __dirname !== 'undefined'
      ? findPathUpwards(__dirname, 'devhub-mcp', 'server.js')
      : null) ||
    path.join(process.cwd(), 'devhub-mcp', 'server.js')
  );
}

function loadTerminalDependency(globalKey, moduleName) {
  if (globalThis[globalKey]) {
    return globalThis[globalKey];
  }
  try {
    // Reuse module-scoped requireCjs only — a second createRequire()/import mid-file
    // makes Turbopack fail with "createRequire is defined multiple times" and stalls
    // every route that pulls ttyServer (health → runtime-diagnostics).
    return requireCjs(moduleName);
  } catch (err) {
    ttyLog('loadDepErr', `failed to load ${moduleName} via requireCjs, trying eval`, {
      error: err?.message,
    });
    return eval('require')(moduleName);
  }
}

// Native .node addons must load via CJS require (not ESM import) under Next/Turbopack.
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
  if (!claimSessionFlagOnce(session, '_opencodeReadyMarkerWritten')) return;
  try {
    writeOpencodeReadyMarker(tmuxSession, {
      sessionId: session.id,
      opencodeSessionId: session.opencodeSessionId || null,
      ...payload,
    });
  } catch {
    // Best-effort marker for bootstrap polling in swarm wrappers.
    if (session) session._opencodeReadyMarkerWritten = false;
  }
}

function maybeWriteAgentReadyMarker(session, program = 'opencode', payload = {}) {
  const tmuxSession = resolveSessionTmuxName(session);
  if (!tmuxSession) return;
  const flagKey = `_agentReadyMarkerWritten:${program || 'opencode'}`;
  if (!claimSessionFlagOnce(session, flagKey)) return;
  try {
    writeAgentReadyMarker(tmuxSession, program, {
      sessionId: session.id,
      opencodeSessionId: session.opencodeSessionId || null,
      ...payload,
    });
  } catch {
    // Best-effort marker for bootstrap polling in swarm wrappers.
    if (session) session[flagKey] = false;
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

function markOpencodeDurableSession(
  session,
  { initialCommand = null, opencodeSessionId = null } = {}
) {
  if (!session) return false;

  const enriched = applyOpencodeDurableMetadata(session, { initialCommand, opencodeSessionId });
  if (!enriched.opencodeSessionId) return false;

  session.opencodeSessionId = enriched.opencodeSessionId;
  session.sessionType = enriched.sessionType;
  session.skipBackendRestore = enriched.skipBackendRestore;
  session.durableRestore = enriched.durableRestore;
  if (enriched.initialCommand) {
    session.initialCommand = enriched.initialCommand;
  }

  registerOpencodeSession(session.id, {
    opencodeSessionId: enriched.opencodeSessionId,
    initialCommand: session.initialCommand,
  });

  return true;
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

/**
 * Apply agent TUI identity to a session once a command/input is recognized as an agent launcher.
 */
function applyAgentTuiDetection(session, command) {
  const type = detectAgentTypeFromCommand(command);
  if (!type) return false;

  session.mode = 'tui';
  // Mark ready for input filtering so SGR wheel/click inject is not stripped.
  // Without tuiReady/agentType the noise filter drops ESC[<64/65 (dead Grok scroll).
  session.tuiReady = true;
  session.historyEnabled = false;
  session.history = '';
  session.agentType = type;

  const explicitSessionId = extractAgentSessionId(type, command);
  session.agentSessionId = explicitSessionId || synthesizeAgentSessionId(type, session.id) || null;

  if (type === 'opencode') {
    if (explicitSessionId && !session.opencodeSessionId) {
      markOpencodeDurableSession(session, {
        initialCommand: command,
        opencodeSessionId: explicitSessionId,
      });
      broadcastOpenCodeSessionDetected(session, explicitSessionId);
    }
  } else if (type === 'hermes') {
    if (!session.hermesSessionId) {
      const hermesId = ensureHermesSessionId(session);
      broadcastHermesSessionDetected(session, hermesId);
    }
  }

  return true;
}

function detectSessionModeFromInput(session, input) {
  if (!input || typeof input !== 'string') return;

  // Fast path: the whole command came in one chunk.
  if (applyAgentTuiDetection(session, input)) {
    return;
  }

  session.pendingInput = `${session.pendingInput || ''}${input}`;

  // Parse line-based shell commands to detect transitions into TUI mode.
  const lines = session.pendingInput.split(/\r\n|\n|\r/);
  session.pendingInput = lines.pop() || '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (applyAgentTuiDetection(session, trimmed)) {
      return;
    }
  }
}

/**
 * getOrInitSessions — returns the global terminal sessions map, initializing if needed.
 */
export function getOrInitSessions() {
  if (!globalThis[GLOBAL_TTY_SESSIONS_KEY]) {
    globalThis[GLOBAL_TTY_SESSIONS_KEY] = new Map();
  }
  return globalThis[GLOBAL_TTY_SESSIONS_KEY];
}

/**
 * getSessionOutput — read the accumulated output buffer of a session.
 * Returns the history string or null if the session is unknown.
 *
 * Agent TUIs (opencode/kimi/grok/…) disable `history` on detection so the
 * WS replay never re-paints stale TUI frames — but external observers
 * (Zed `review_terminal_output` / `summarize_terminal`) still need to read
 * the panel. The scrollbackStore ring keeps appending regardless of
 * `historyEnabled`, so serve its tail as fallback.
 */
const CAPTURE_SCROLLBACK_TAIL_BYTES = 32 * 1024;

export function getSessionOutput(id) {
  const sessions = getOrInitSessions();
  const session = sessions.get(id);
  if (!session) return null;
  if (session.history) return session.history;
  const store = session.scrollbackStore;
  if (store && typeof store.read === 'function' && store.getSize() > 0) {
    const from = Math.max(0, store.getOffset() - CAPTURE_SCROLLBACK_TAIL_BYTES);
    return store.read(from);
  }
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

/**
 * getSessionMetadata — returns the canonical session metadata for a terminal.
 *
 * @param {string} sessionId
 * @returns {{ shell, title, initialCommand, cwd, termsize, agentTuiState }|null}
 */
export function getSessionMetadata(sessionId) {
  const sessions = getOrInitSessions();
  const session = sessions.get(sessionId);
  if (!session) return null;

  return {
    shell: session.shell || null,
    title: session.title || null,
    initialCommand: session.initialCommand || null,
    cwd: session.cwd || null,
    termsize: session.termsize ? { ...session.termsize } : null,
    agentTuiState: session.agentTuiState || null,
  };
}

/**
 * saveSnapshot — stores a full xterm.js serialized snapshot for a session.
 *
 * @param {string} sessionId
 * @param {{ serialized: string, ptyOffset: number, termsize: { cols: number, rows: number } }} snapshot
 */
export function saveSnapshot(sessionId, snapshot) {
  const sessions = getOrInitSessions();
  const session = sessions.get(sessionId);
  if (!session || !snapshot) return false;

  session.snapshot = {
    serialized: typeof snapshot.serialized === 'string' ? snapshot.serialized : null,
    ptyOffset: Number.isFinite(snapshot.ptyOffset) ? snapshot.ptyOffset : null,
    termsize:
      snapshot.termsize &&
      Number.isFinite(snapshot.termsize.cols) &&
      Number.isFinite(snapshot.termsize.rows)
        ? { cols: snapshot.termsize.cols, rows: snapshot.termsize.rows }
        : null,
    savedAt: Date.now(),
  };

  return true;
}

/**
 * getSnapshot — returns the stored snapshot for a session, or null fields if none.
 *
 * @param {string} sessionId
 * @returns {{ serialized: string|null, ptyOffset: number|null, termsize: {cols,rows}|null }}
 */
export function getSnapshot(sessionId) {
  const sessions = getOrInitSessions();
  const session = sessions.get(sessionId);
  if (!session || !session.snapshot) {
    return { serialized: null, ptyOffset: null, termsize: null };
  }

  return {
    serialized: session.snapshot.serialized,
    ptyOffset: session.snapshot.ptyOffset,
    termsize: session.snapshot.termsize ? { ...session.snapshot.termsize } : null,
  };
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

function buildSessionSpawnConfig(
  cwd,
  terminalId,
  swarmContext = null,
  initialCommand = null,
  options = {}
) {
  const { isEngineV2 = false } = options;
  const tmuxEnabled = hasTmux();
  const isSwarm = Boolean(
    swarmContext?.isSwarmRole && swarmContext?.launchId && swarmContext?.roleKey
  );
  const tmuxSession = isSwarm
    ? `devhub-swarm-${swarmContext.launchId}-${swarmContext.roleKey}`
    : normalizeTmuxSessionName(terminalId);
  const resolvedShell = resolveShell();
  // Hook environment for agent lifecycle state reporting
  const ttyPort = process.env.PORT || '3000';
  const hookUrl = process.env.DEVHUB_HOOK_URL || `http://127.0.0.1:${ttyPort}/api/terminal/agent-hook`;
  const hookEnv = buildSessionHookEnv({
    session: { id: terminalId, hookToken: options.hookToken },
    hookUrl,
  });

  const env = Object.assign(sanitizeTerminalSpawnEnv(process.env), hookEnv, {
    DEVHUB_PROJECT_DIR: cwd,
    DEVHUB_MCP_CMD: `node ${MCP_SERVER_PATH}`,
    GEMINI_MCP_HINT: 'Use DEVHUB_MCP_CMD to connect Gemini CLI to your local server.',
    DEVHUB_TMUX_SESSION: tmuxSession,
    MOTD_SHOWN: 'true',
    SSH_CONNECTION: '',
    HUSHLOGIN: 'true',
  });

  // Phase 2 terminal-engine-v2: expose session identifiers to the shell so
  // shell-integration snippets can emit OSC 7 with the right context.
  env.DEVHUB_SESSION_ID = terminalId;
  env.DEVHUB_BLOCK_ID = terminalId;
  if (isEngineV2) {
    env.DEVHUB_TERM_VERSION = '2';
    env.DEVHUB_SHELL_INTEGRATION = '1';
  }

  const safeInitialCommand =
    typeof initialCommand === 'string' && initialCommand.trim() ? initialCommand.trim() : null;

  let spawnArgs = [];
  if (tmuxEnabled && os.platform() !== 'win32') {
    // Disable tmux status bar to save vertical space, then create/attach session.
    // If an initial command is provided, start the session with the shell running it
    // instead of relying on a later WebSocket injection, which races with tmux/shell.
    const baseAttachCommand = buildTmuxPanelAttachCommand(tmuxSession, cwd);
    let attachCommand;
    if (safeInitialCommand) {
      const launchCommand = `${escapeShellArg(resolvedShell)} -lc ${escapeShellArg(safeInitialCommand)}`;
      attachCommand = `${baseAttachCommand} ${launchCommand}`;
    } else {
      attachCommand = baseAttachCommand;
    }
    spawnArgs = ['-lc', attachCommand];
  } else if (path.basename(resolvedShell) === 'zsh') {
    if (safeInitialCommand) {
      spawnArgs = ['-lic', safeInitialCommand, 'devhub-shell', '--no-use'];
    } else {
      spawnArgs = ['-lic', 'exec zsh -i', 'devhub-shell', '--no-use'];
    }
  } else if (os.platform() === 'win32') {
    const shellBase = path.basename(resolvedShell).toLowerCase();
    if (shellBase.includes('powershell') || shellBase.includes('pwsh')) {
      // Suppress the standard Windows PowerShell copyright / "Instale la versión más reciente..." banner.
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
export function createSession({
  id,
  cwd,
  shell,
  restored = false,
  swarmContext = null,
  initialCommand = null,
} = {}) {
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

  const hookToken = generateSessionHookToken();

  const { env, spawnArgs, tmuxEnabled, tmuxSession } = buildSessionSpawnConfig(
    resolvedCwd,
    id,
    swarmContext,
    initialCommand,
    { isEngineV2: false, hookToken }
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
    hasInitialCommand: Boolean(initialCommand),
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
    lastOutputAt: Date.now(),
    cwd: resolvedCwd,
    shell: resolvedShell,
    title: null,
    restored,
    id,
    initialCommand: initialCommand || null,
    swarmRole: swarmContext?.roleKey ? { roleKey: swarmContext.roleKey } : null,
    swarmId: swarmContext?.launchId || null,
    tmuxSession: tmuxSession || null,
    tmuxEnabled: Boolean(tmuxEnabled),
    agentTuiState: null,
    agentTuiStateAt: null,
    hookToken,
    hookState: null,
    agentStateMachine: new AgentStateMachine(),
    detectionBuffer: '',
    _oscTitleBuffer: '',
    _saveDebounceTimer: null,
    _lastDiagnosticSnapshot: null,
    scrollbackStore: createScrollbackStore(id),
    v2Subscribers: new Set(),
    isEngineV2: false,
    termsize: { cols: 120, rows: 32 },
    _oscCwdParser: createOscCwdParser(),
    snapshot: null,
    inputFocused: false,
    launchCommand: initialCommand || null,
    _tuiCtrlCRespawnCount: 0,
  };

  sessions.set(id, session);

  // Pre-detect agent TUI from the initial command so the first snapshot already
  // knows this is an agent panel, even before the user sends any input.
  if (session.initialCommand) {
    applyAgentTuiDetection(session, session.initialCommand);
    markOpencodeDurableSession(session, { initialCommand: session.initialCommand });
  }

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

  unregisterOpencodeSession(id);
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
  session.lastOutputAt = Date.now();
  _debouncedSave(sessions, session);

  // Capture OSC 0/2 title changes directly from PTY output so we do not need
  // to forward them over the WebSocket (which could leak into the TUI prompt).
  processOscTitle(session, chunk);
  processOscProgress(session, chunk);

  let filtered = chunk;
  if (typeof filtered === 'string') {
    // Strip the title sequences before forwarding; xterm.js on the client still
    // parses them, but removing them server-side guarantees they never render
    // as visible text if a chunk boundary or encoding issue confuses the parser.
    filtered = stripOscTitleSequences(filtered);
  }
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
          markOpencodeDurableSession(session, { opencodeSessionId: detectedId });
          broadcastOpenCodeSessionDetected(session, detectedId);
        }
      }
    }

    // Swarm agents start OpenCode inside tmux before the DevHub client attaches,
    // so session.mode may still be 'shell' when the TUI footer first appears.
    if (detectKimiTuiReady(filtered)) {
      if (!session.agentType) {
        applyAgentTuiDetection(session, 'kimi');
      }
      session.mode = 'tui';
      session.tuiReady = true;
      maybeWriteAgentReadyMarker(session, 'kimi', { reason: 'tty-tui-footer' });
    } else if (detectOpenCodeTuiReady(filtered)) {
      if (session.mode !== 'tui') {
        session.mode = 'tui';
        session.historyEnabled = false;
      }
      if (!session.agentType) {
        applyAgentTuiDetection(session, 'opencode');
      }
      session.tuiReady = true;
      maybeWriteOpencodeReadyMarker(session, { reason: 'tty-tui-footer' });
    } else if (detectGrokSessionFromOutput(filtered)) {
      if (!session.agentType) {
        applyAgentTuiDetection(session, 'grok');
      }
      session.mode = 'tui';
      session.tuiReady = true;
    }

    session._lastAgentStateEvent = ingestAgentDetectionFromFilteredOutput(
      session,
      filtered,
      Date.now()
    );
  }

  // Phase 2 terminal-engine-v2: capture cwd from OSC 7 sequences emitted by
  // shell-integration snippets. The parser is stateful so split sequences work.
  if (typeof filtered === 'string' && session._oscCwdParser) {
    const { cwd: oscCwd } = session._oscCwdParser.parse(filtered);
    if (oscCwd) {
      session.cwd = oscCwd;
      _debouncedSave(sessions, session);
    }
  }

  if (typeof filtered === 'string' && filtered.length === 0) {
    return;
  }

  // Phase 1 terminal-engine-v2: write every non-empty filtered byte into the
  // per-session ring buffer, then route output to the appropriate subscribers.
  // v2 panels receive terminal:append frames; legacy v1 panels receive the
  // original output event. Dual paths coexist behind the per-panel flag.
  const appendResult = session.scrollbackStore.append(filtered);

  if (session.historyEnabled) {
    session.history += filtered;
    if (session.history.length > 100000) {
      session.history = session.history.slice(-100000);
    }
  }

  const agentStateEvent =
    session._lastAgentStateEvent?.published && session.agentTuiState
      ? {
          type: 'agent-state',
          agentTuiState: session.agentTuiState,
          at: session.agentTuiStateAt,
        }
      : null;

  for (const socket of session.sockets) {
    if (socket.readyState !== socket.OPEN) continue;

    if (agentStateEvent) {
      try {
        socket.send(JSON.stringify(agentStateEvent));
      } catch {
        /* stale socket */
      }
    }

    if (session.v2Subscribers.has(socket)) {
      try {
        socket.send(
          JSON.stringify({
            type: 'append',
            sessionId: session.id,
            offset: appendResult.endOffset,
            data: session.scrollbackStore.read(appendResult.startOffset, { encoding: 'base64' }),
          })
        );
      } catch {
        // ignore send errors on stale sockets
      }
    } else {
      try {
        socket.send(JSON.stringify({ type: 'output', data: filtered }));
      } catch {
        // ignore send errors on stale sockets
      }
    }
  }
}

export function broadcastSessionPayload(session, payload) {
  if (!session || !session.sockets) return;
  const data = JSON.stringify(payload);
  for (const socket of session.sockets) {
    if (socket.readyState === socket.OPEN) {
      try {
        socket.send(data);
      } catch {
        /* stale socket */
      }
    }
  }
}

function tryRespawnShellAfterTuiCtrlC(sessions, session, exitCode, signal) {
  const priorAgentType = session.agentType;
  const priorLaunchCommand = session.launchCommand || session.initialCommand || null;
  const wasFocused = session.inputFocused === true;
  const should = shouldRespawnShellAfterPtyExit({
    platform: os.platform(),
    mode: session.mode,
    agentType: session.agentType,
    launchCommand: priorLaunchCommand,
    exitCode,
    respawnCount: session._tuiCtrlCRespawnCount || 0,
  });
  if (!should || !sessions.has(session.id)) return false;

  session._tuiCtrlCRespawnCount = (session._tuiCtrlCRespawnCount || 0) + 1;
  const bootstrapped = Boolean(priorLaunchCommand && String(priorLaunchCommand).trim());
  const relaunchAgent = shouldRelaunchAgentAfterCtrlCRespawn({
    inputFocused: wasFocused,
    launchCommand: priorLaunchCommand,
    agentType: priorAgentType,
  });
  ttyLog('PTY_EXIT', `Agent TUI PTY exited — respawning usable shell`, {
    id: session.id,
    exitCode,
    signal,
    respawnCount: session._tuiCtrlCRespawnCount,
    inputFocused: wasFocused,
    bootstrapped,
    relaunchAgent,
  });

  // Do not taskkill here — the ConPTY is already exiting. /T races have killed
  // sibling panel trees on Windows when PIDs were recycled mid-teardown.

  // Fresh interactive shell; collateral (unfocused) deaths re-inject launchCommand.
  const { env, spawnArgs, tmuxEnabled, tmuxSession } = buildSessionSpawnConfig(
    session.cwd,
    session.id,
    session.swarmId || session.swarmRole
      ? {
          isSwarmRole: Boolean(session.swarmRole),
          launchId: session.swarmId || null,
          roleKey: session.swarmRole?.roleKey || null,
        }
      : null,
    null,
    { isEngineV2: Boolean(session.isEngineV2), hookToken: session.hookToken }
  );

  let terminal;
  try {
    terminal = pty.spawn(session.shell || resolveShell(), spawnArgs, {
      name: 'xterm-256color',
      cols: session.termsize?.cols || 120,
      rows: session.termsize?.rows || 32,
      cwd: session.cwd,
      env,
    });
  } catch (spawnErr) {
    ttyLog('PTY_EXIT', `TUI shell respawn FAILED`, {
      id: session.id,
      error: spawnErr?.message,
    });
    return false;
  }

  session.pty = terminal;
  session.ptyPid = terminal.pid;
  session.mode = 'shell';
  session.historyEnabled = true;
  session.history = '';
  session.pendingInput = '';
  session.agentType = null;
  session.agentTuiState = null;
  session.agentTuiStateAt = null;
  session.hookState = null;
  session.launchCommand = priorLaunchCommand || null;
  session.tmuxEnabled = Boolean(tmuxEnabled);
  session.tmuxSession = tmuxSession || null;
  session._ptyWired = false;
  session.lastActivityAt = Date.now();
  session.lastOutputAt = Date.now();
  session.lastSeenAt = new Date().toISOString();

  wireSessionPty(session, sessions);
  tryUpdatePtyIdentity(session);
  saveSessions(sessions);

  if (bootstrapped) {
    const notice = relaunchAgent
      ? '\r\n\x1b[33m[DevHub]\x1b[0m Panel hermano recuperado — relanzando agente…\r\n'
      : '\r\n\x1b[33m[DevHub]\x1b[0m TUI cerrada. Shell lista.\r\n';
    handleSessionOutput(sessions, session, notice);
  }

  if (relaunchAgent && priorLaunchCommand) {
    const cmd = String(priorLaunchCommand)
      .replace(/\s*#recovery-\d+\s*$/, '')
      .trim();
    if (cmd) {
      setTimeout(() => {
        if (!sessions.has(session.id) || !session.pty) return;
        try {
          session.pty.write(`${cmd}\r`);
        } catch {
          // ignore write failures on mid-dispose
        }
      }, 50);
    }
  }

  return true;
}

function handleSessionExit(sessions, session, exitCode, signal) {
  ttyLog('PTY_EXIT', `session exited`, {
    id: session.id,
    exitCode,
    signal,
    socketCount: session.sockets?.size ?? 0,
  });

  if (tryRespawnShellAfterTuiCtrlC(sessions, session, exitCode, signal)) {
    return;
  }

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

  // Best-effort cleanup of child processes/tmux/opencode sessions so exits do
  // not leave agent subprocesses alive after the PTY is gone.
  try {
    teardownPanelSessionProcesses(session, { hasTmux });
  } catch {
    // ignore cleanup failures during shutdown
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

/**
 * Single-viewer policy: each panel session should have one live WebSocket client.
 * Stale sockets (React strict-mode remount, fast reconnect) must not receive duplicate
 * PTY output — that manifests as double PS1 lines and doubled keystroke echo in xterm.
 */
function replaceSessionSockets(session, socket) {
  if (!session?.sockets || !socket) return;
  for (const existingSocket of session.sockets) {
    if (existingSocket === socket) continue;
    existingSocket.onopen = null;
    existingSocket.onmessage = null;
    existingSocket.onerror = null;
    existingSocket.onclose = null;
    try {
      if (
        existingSocket.readyState === existingSocket.OPEN ||
        existingSocket.readyState === existingSocket.CONNECTING
      ) {
        existingSocket.close();
      }
    } catch {
      // ignore
    }
    session.sockets.delete(existingSocket);
  }
  session.sockets.add(socket);
}

function wireSessionPty(session, sessions) {
  if (session._ptyWired) {
    ttyLog('wireSessionPty', `already wired — skip duplicate handlers`, { id: session.id });
    return;
  }
  session._ptyWired = true;
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
      if (shouldSkipBackendRestore({ ...s, sessionType })) {
        ttyLog('RESTORE', `skipping opencode-durable session — React handles it`, {
          id: s.id,
          opencodeSessionId: s.opencodeSessionId || null,
        });
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
    // ponytail: no per-call ttyLog — health polls hit this every ~1s and the
    // appendFileSync spam contended with cold Terminales (upgrade: debug flag).
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
    let requestedIsEngineV2 = false;
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
        const isV2Flag = parseBooleanQueryFlag(dummyUrl.searchParams.get('v2'));
        if (wsRequestedCwd) requestedCwd = wsRequestedCwd;
        if (reqSessionId) terminalId = reqSessionId;
        else if (reqTermId) terminalId = reqTermId;
        swarmContext = {
          isSwarmRole: isSwarmRoleFlag,
          roleKey: roleKey || null,
          launchId: launchId || null,
        };
        if (isV2Flag) {
          requestedIsEngineV2 = true;
        }
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
      const hookToken = generateSessionHookToken();
      const { env, spawnArgs, tmuxEnabled } = buildSessionSpawnConfig(
        cwd,
        terminalId,
        swarmContext,
        null,
        { isEngineV2: requestedIsEngineV2, hookToken }
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
        sockets: new Set(),
        history: '',
        mode: 'shell',
        historyEnabled: true,
        pendingInput: '',
        createdAt: now,
        lastSeenAt: now,
        lastActivityAt: Date.now(),
        lastOutputAt: Date.now(),
        id: terminalId,
        cwd,
        shell,
        title: null,
        restored: false,
        swarmRole: swarmContext?.roleKey ? { roleKey: swarmContext.roleKey } : null,
        swarmId: swarmContext?.launchId || null,
        agentTuiState: null,
        agentTuiStateAt: null,
        hookToken,
        hookState: null,
        agentStateMachine: new AgentStateMachine(),
        detectionBuffer: '',
        _oscTitleBuffer: '',
        _saveDebounceTimer: null,
        _lastDiagnosticSnapshot: null,
        scrollbackStore: createScrollbackStore(terminalId),
        v2Subscribers: new Set(),
        isEngineV2: false,
        termsize: { cols: 120, rows: 32 },
        _oscCwdParser: createOscCwdParser(),
        snapshot: null,
      };

      terminalSessions.set(terminalId, session);
      replaceSessionSockets(session, socket);

      // Phase 2 terminal-engine-v2: if the client requested v2 via query param,
      // opt this socket into the v2 append stream immediately so the initial
      // ready frame can carry canonical termsize + cwd.
      if (requestedIsEngineV2) {
        session.isEngineV2 = true;
        session.v2Subscribers.add(socket);
      }

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
      replaceSessionSockets(session, socket);

      // Phase 2 terminal-engine-v2: opt v2 query-param clients into the v2
      // stream on reattach so the ready frame includes canonical metadata.
      if (requestedIsEngineV2) {
        session.isEngineV2 = true;
        session.v2Subscribers.add(socket);
      }

      session.lastActivityAt = Date.now();
      const isFirstClientAttach = session.sockets.size === 1;
      if (
        !isSessionReattach &&
        session.historyEnabled &&
        session.history &&
        socket.readyState === socket.OPEN
      ) {
        socket.send(
          JSON.stringify({
            type: 'output',
            data: sanitizeHistoryReplay(session, session.history),
          })
        );
      }

      // Full-screen TUIs and live shell reattaches: redraw from the live PTY instead of
      // replaying stale history onto a fresh canvas (double PS1). Skip redraw on the first
      // client attach after a server-only pre-spawn — the canvas is empty and Ctrl+L duplicates prompts.
      if (
        isSessionReattach &&
        !isFirstClientAttach &&
        (session.mode === 'tui' || session.mode === 'shell')
      ) {
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

      if (message.type === 'panel-focus') {
        session.inputFocused = message.focused === true;
        return;
      }

      if (message.type === 'session-meta') {
        const launch =
          typeof message.launchCommand === 'string' ? message.launchCommand.trim() : '';
        if (launch) session.launchCommand = launch;
        return;
      }

      if (message.type === 'input' && typeof message.data === 'string') {
        // Build an explicit filter ctx — never pass the raw session alone.
        // session.tuiReady must be honored; agentType covers launch-detected TUIs.
        const filteredInput = filterTerminalInputForSession(
          {
            mode: session.mode === 'tui' ? 'tui' : 'shell',
            tuiReady: session.tuiReady === true,
            agentType: session.agentType || null,
          },
          message.data
        );
        if (filteredInput === null) return;
        detectSessionModeFromInput(session, filteredInput);
        session.lastActivityAt = Date.now();
        try {
          session.pty.write(filteredInput);
        } catch (err) {
          // PTY file descriptor already closed (EBADF) — treat as terminal death.
          ttyLog('EBADF', `pty.write failed`, { id: session.id, error: err?.message });
          console.warn(`[ttyServer] pty.write failed for session ${session.id}:`, err.message);
          handleSessionExit(terminalSessions, session, 1, null);
          return;
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

        // Phase 2 terminal-engine-v2: the server is the canonical owner of
        // termsize. Store the requested size, apply it to the PTY, and
        // broadcast it to all v2 subscribers so every client stays in sync.
        session.termsize = { cols: message.cols, rows: message.rows };

        try {
          session.pty.resize(message.cols, message.rows);
        } catch (err) {
          // PTY file descriptor already closed (EBADF) — treat as terminal death.
          ttyLog('EBADF', `pty.resize failed`, { id: session.id, error: err?.message });
          console.warn(`[ttyServer] pty.resize failed for session ${session.id}:`, err.message);
          handleSessionExit(terminalSessions, session, 1, null);
          return;
        }

        if (session.isEngineV2) {
          const termsizeFrame = JSON.stringify({
            type: 'termsize',
            cols: message.cols,
            rows: message.rows,
          });
          for (const subscriber of session.v2Subscribers) {
            if (subscriber.readyState === subscriber.OPEN) {
              try {
                subscriber.send(termsizeFrame);
              } catch {
                // ignore send errors on stale sockets
              }
            }
          }
        }
      }

      // Phase 1 terminal-engine-v2: explicit pub/sub messages for v2 panels.
      // subscribe upgrades this socket to the v2 append stream; unsubscribe
      // removes it without killing the PTY.
      // Phase 3 terminal-engine-v2: subscribe may carry a fromOffset to replay
      // the ring-buffer delta (snapshot ptyOffset → current tail) before the
      // socket starts receiving live append frames.
      if (
        message.type === 'subscribe' &&
        (message.v2 === true ||
          typeof message.sessionId === 'string' ||
          Number.isFinite(message.fromOffset))
      ) {
        session.isEngineV2 = true;
        if (session._autoKillTimer) {
          clearTimeout(session._autoKillTimer);
          session._autoKillTimer = null;
        }

        const requestedFromOffset = Number(message.fromOffset);
        const currentOffset = session.scrollbackStore.getOffset();
        const approxStartOffset = Math.max(0, currentOffset - session.scrollbackStore.getSize());
        const fromOffset = Number.isFinite(requestedFromOffset)
          ? Math.max(requestedFromOffset, approxStartOffset)
          : currentOffset;

        // Replay missed bytes (if any) directly to this socket before adding it
        // to the live subscriber set. This keeps the delta ordered before live
        // output and lets the client flush it after the serialized snapshot.
        if (fromOffset < currentOffset) {
          const replayData = session.scrollbackStore.read(fromOffset, { encoding: 'base64' });
          if (replayData) {
            try {
              socket.send(
                JSON.stringify({
                  type: 'append',
                  sessionId: session.id,
                  offset: currentOffset,
                  data: replayData,
                })
              );
            } catch {
              // ignore send errors on stale sockets
            }
          }
        }

        session.v2Subscribers.add(socket);

        // Phase 2 terminal-engine-v2: send canonical metadata so the frontend
        // can apply termsize + cwd after replaying buffered output. The
        // replayComplete flag tells the client that the snapshot+delta replay
        // phase is finished and it may flush held live output.
        const metadata = getSessionMetadata(session.id);
        if (metadata) {
          try {
            socket.send(
              JSON.stringify({
                type: 'metadata',
                ...metadata,
                ptyOffset: currentOffset,
                replayComplete: true,
              })
            );
          } catch {
            // ignore send errors on stale sockets
          }
        }
        return;
      }

      if (message.type === 'unsubscribe') {
        session.v2Subscribers.delete(socket);
        // Phase 4 terminal-engine-v2: explicit unsubscribe detaches the client
        // from the append stream but leaves the PTY running. Record the state so
        // callers can distinguish a hidden panel from a dead session.
        session.subscribed = false;
        session.ptyAlive = true;
        if (session._autoKillTimer) {
          clearTimeout(session._autoKillTimer);
          session._autoKillTimer = null;
        }
        return;
      }

      // Phase 3 terminal-engine-v2: store/serve full xterm.js serialized snapshots.
      if (
        (message.type === 'save-snapshot' || message.type === 'cache:term:full') &&
        typeof message.serialized === 'string' &&
        Number.isFinite(message.ptyOffset) &&
        message.termsize &&
        Number.isFinite(message.termsize.cols) &&
        Number.isFinite(message.termsize.rows)
      ) {
        saveSnapshot(session.id, {
          serialized: message.serialized,
          ptyOffset: message.ptyOffset,
          termsize: { cols: message.termsize.cols, rows: message.termsize.rows },
        });
        return;
      }

      if (message.type === 'get-snapshot') {
        const snapshot = getSnapshot(session.id);
        try {
          socket.send(JSON.stringify({ type: 'snapshot', ...snapshot }));
        } catch {
          // ignore send errors on stale sockets
        }
        return;
      }

      // Phase 2 terminal-engine-v2: explicit metadata query for v2 panels on
      // (re)connect. The ready frame already includes metadata; this message is
      // available for clients that need to refresh it later.
      if (message.type === 'get-metadata') {
        const metadata = getSessionMetadata(session.id);
        if (metadata) {
          try {
            socket.send(JSON.stringify({ type: 'metadata', ...metadata }));
          } catch {
            // ignore send errors on stale sockets
          }
        }
        return;
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
        session.v2Subscribers.delete(socket);
        session.lastActivityAt = Date.now();

        // AUTO-KILL: legacy v1 sessions keep the grace timer when the last
        // socket closes. v2 sessions (terminal-engine-v2) rely on explicit
        // unsubscribe/close lifecycle, so we skip the timer for them — the
        // timer machinery itself stays intact for v1.
        if (remainingSockets <= 0 && session.pty && !session.isEngineV2) {
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

    // Replay del estado semántico del agente al conectar: los frames
    // agent-state solo se emiten en transiciones, así que sin esto un cliente
    // nuevo no vería badge hasta el próximo cambio de estado.
    if (session?.agentTuiState) {
      socket.send(
        JSON.stringify({
          type: 'agent-state',
          agentTuiState: session.agentTuiState,
          at: session.agentTuiStateAt ?? Date.now(),
        })
      );
    }

    // Phase 2 terminal-engine-v2: v2 subscribers receive canonical termsize,
    // cwd, and ptyOffset in the ready frame so the frontend can apply them
    // before replaying buffered output.
    const isV2Subscriber = session?.v2Subscribers?.has(socket);
    if (isV2Subscriber) {
      const metadata = getSessionMetadata(session.id);
      socket.send(
        JSON.stringify({
          type: 'ready',
          reattached: isSessionReattach,
          mode: session?.mode || 'shell',
          v2: true,
          ptyOffset: session.scrollbackStore.getOffset(),
          cols: metadata?.termsize?.cols ?? session.termsize?.cols ?? 120,
          rows: metadata?.termsize?.rows ?? session.termsize?.rows ?? 32,
          cwd: metadata?.cwd ?? session?.cwd ?? null,
        })
      );
    } else {
      socket.send(
        JSON.stringify({
          type: 'ready',
          reattached: isSessionReattach,
          mode: session?.mode || 'shell',
        })
      );
    }
  });

  const serverState = { port, wsPath };
  globalThis[GLOBAL_TTY_KEY] = serverState;

  // Restore persisted sessions from previous run
  restoreSessions();

  // Start periodic idle-session cleanup to prevent unbounded Map growth
  startIdleCleanup(terminalSessions);

  // Start periodic agent state detection tick
  if (globalThis.__DEVHUB_TTY_AGENT_TICK__) {
    clearInterval(globalThis.__DEVHUB_TTY_AGENT_TICK__);
  }
  const tickMs = Number(process.env.AGENT_DETECTION_TICK_MS || 500);
  globalThis.__DEVHUB_TTY_AGENT_TICK__ = setInterval(() => {
    for (const session of terminalSessions.values()) {
      if (session.agentType) {
        const tickResult = tickAgentDetection(session, Date.now());
        if (tickResult.published && session.agentTuiState) {
          const agentStateEvent = {
            type: 'agent-state',
            agentTuiState: session.agentTuiState,
            at: session.agentTuiStateAt,
          };
          for (const socket of session.sockets) {
            if (socket.readyState !== socket.OPEN) continue;
            try {
              socket.send(JSON.stringify(agentStateEvent));
            } catch {
              /* stale socket */
            }
          }
        }
      }
    }
  }, tickMs);
  // Do not keep the process (or a jest worker) alive just for the tick.
  globalThis.__DEVHUB_TTY_AGENT_TICK__.unref?.();

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
      lastOutputAt: session.lastOutputAt || null,
      lastSeenAt: session.lastSeenAt || null,
      cwd: session.cwd || null,
      shell: session.shell || null,
      title: session.title || null,
      restored: session.restored || false,
      alive: true,
      opencodeSessionId: session.opencodeSessionId || null,
      hermesSessionId: session.hermesSessionId || null,
      agentType: session.agentType || null,
      agentSessionId: session.agentSessionId || null,
      agentTuiState: session.agentTuiState || null,
      agentTuiStateAt: session.agentTuiStateAt || null,
      initialCommand: session.initialCommand || null,
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
