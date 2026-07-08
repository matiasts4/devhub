import { spawn, spawnSync } from 'child_process';
import os from 'os';
import { buildSwarmTmuxSessionName } from './viewportReadyMarker.js';

export function normalizePanelTmuxSessionName(terminalId) {
  const cleaned = String(terminalId || 'terminal')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 64);
  return `devhub-${cleaned || 'terminal'}`;
}

export function resolvePanelTmuxSessionName(session) {
  if (!session) return null;

  const explicit = String(session.tmuxSession || '').trim();
  if (explicit) return explicit;

  if (session.swarmId && session.swarmRole?.roleKey) {
    return buildSwarmTmuxSessionName(session.swarmId, session.swarmRole.roleKey);
  }

  if (session.id) {
    return normalizePanelTmuxSessionName(session.id);
  }

  return null;
}

/**
 * Kill a tmux session without blocking the event loop.
 * Uses detached spawn so DELETE/close handlers return immediately.
 */
export function killPanelTmuxSessionBestEffort(
  session,
  { hasTmux = defaultHasTmux, spawnImpl = spawn, spawnSyncImpl = spawnSync } = {}
) {
  if (!hasTmux() || os.platform() === 'win32') return false;

  const tmuxSession = resolvePanelTmuxSessionName(session);
  if (!tmuxSession) return false;

  try {
    if (typeof spawnImpl === 'function') {
      const child = spawnImpl('tmux', ['kill-session', '-t', tmuxSession], {
        stdio: 'ignore',
        detached: true,
      });
      child.unref?.();
      child.on?.('error', () => {});
      return true;
    }
    // Test/legacy fallback: spawnSync with a short timeout.
    const result = spawnSyncImpl('tmux', ['kill-session', '-t', tmuxSession], {
      stdio: 'ignore',
      timeout: 1500,
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

export function abortOpenCodeSessionBestEffort(
  opencodeSessionId,
  { fetchImpl = typeof fetch === 'function' ? fetch : null } = {}
) {
  const normalized = String(opencodeSessionId || '').trim();
  if (!normalized || !fetchImpl) return false;

  const port = Number(process.env.OPENCODE_PORT || 4154);
  const url = `http://127.0.0.1:${port}/session/${encodeURIComponent(normalized)}/abort`;

  try {
    void fetchImpl(url, { method: 'POST' }).catch(() => {});
    return true;
  } catch {
    return false;
  }
}

/**
 * Best-effort list of direct child PIDs on Unix. Falls back to empty array
 * if pgrep is unavailable or the parent is already gone.
 */
function getUnixChildPids(pid, { spawnSyncImpl = spawnSync } = {}) {
  try {
    const result = spawnSyncImpl('pgrep', ['-P', String(pid)], {
      encoding: 'utf-8',
      timeout: 1000,
    });
    if (result.status !== 0) return [];
    return result.stdout
      .split('\n')
      .map((line) => Number(line.trim()))
      .filter((n) => Number.isInteger(n) && n > 0);
  } catch {
    return [];
  }
}

/**
 * Hard-kill a Unix process tree immediately (SIGKILL), like closing a native
 * terminal window. No graceful SIGTERM grace period — agent TUIs (OpenCode,
 * Grok, Kimi) must not linger and keep consuming RAM.
 */
function killUnixProcessTree(pid, { spawnSyncImpl = spawnSync } = {}) {
  if (!Number.isInteger(pid) || pid <= 0) return false;

  const children = getUnixChildPids(pid, { spawnSyncImpl });
  for (const child of children) {
    killUnixProcessTree(child, { spawnSyncImpl });
  }

  // Process-group kill first (node-pty shells are typically session leaders).
  try {
    process.kill(-pid, 'SIGKILL');
  } catch {
    // Not a group leader or already gone.
  }

  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    // already gone
  }

  return true;
}

/**
 * Terminate a Windows process tree using taskkill /T /F (tree + force).
 */
function killWindowsProcessTree(pid, { spawnSyncImpl = spawnSync } = {}) {
  if (!Number.isInteger(pid) || pid <= 0) return false;

  try {
    const result = spawnSyncImpl('taskkill', ['/T', '/F', '/PID', String(pid)], {
      stdio: 'ignore',
      timeout: 3000,
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

/**
 * Kill the shell/agent process tree for a session. Best-effort: does not throw.
 * Hard-kill only — mirrors native terminal close (PowerShell / VTE).
 */
export function killProcessTreeBestEffort(pid, { spawnSyncImpl = spawnSync } = {}) {
  if (!Number.isInteger(pid) || pid <= 0) return false;

  if (os.platform() === 'win32') {
    return killWindowsProcessTree(pid, { spawnSyncImpl });
  }

  return killUnixProcessTree(pid, { spawnSyncImpl });
}

/**
 * Resolve the best PID for process-tree kill from a session object.
 */
export function resolveSessionKillPid(session) {
  if (!session) return null;
  const candidates = [session.ptyPid, session.pty?.pid, session.ptyProcess?.pid, session.pid];
  for (const value of candidates) {
    const n = Number(value);
    if (Number.isInteger(n) && n > 0) return n;
  }
  return null;
}

/**
 * Tear down all OS resources for a panel session.
 *
 * Design:
 * - OpenCode abort + tmux kill + process-tree kill are fire-and-forget.
 * - Never blocks the HTTP DELETE / closeSession caller (no spawnSync sleep).
 * - Hard-kills the full process tree so Grok/OpenCode/etc. cannot zombie.
 */
export function teardownPanelSessionProcesses(session, { hasTmux, spawnSyncImpl, fetchImpl } = {}) {
  if (!session) return;

  abortOpenCodeSessionBestEffort(session.opencodeSessionId, { fetchImpl });

  const pid = resolveSessionKillPid(session);

  // Defer ALL OS process work so the frontend close path returns immediately.
  setImmediate(() => {
    killPanelTmuxSessionBestEffort(session, { hasTmux, spawnSyncImpl });
    if (pid) {
      killProcessTreeBestEffort(pid, { spawnSyncImpl });
    }
  });
}

function defaultHasTmux() {
  if (os.platform() === 'win32') return false;
  try {
    const result = spawnSync('tmux', ['-V'], { stdio: 'ignore' });
    return result.status === 0;
  } catch {
    return false;
  }
}
