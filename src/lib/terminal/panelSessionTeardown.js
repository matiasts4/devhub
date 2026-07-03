import { spawnSync } from 'child_process';
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

export function killPanelTmuxSessionBestEffort(
  session,
  { hasTmux = defaultHasTmux, spawnSyncImpl = spawnSync } = {}
) {
  if (!hasTmux() || os.platform() === 'win32') return false;

  const tmuxSession = resolvePanelTmuxSessionName(session);
  if (!tmuxSession) return false;

  try {
    const result = spawnSyncImpl('tmux', ['kill-session', '-t', tmuxSession], {
      stdio: 'ignore',
      timeout: 5000,
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
      timeout: 2000,
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
 * Recursively terminate a Unix process tree.
 *
 * First tries SIGTERM on the process group (so grandchildren die too), then
 * SIGTERM each known child recursively, waits a short grace period, and
 * finally SIGKILL anything still alive.
 */
function killUnixProcessTree(pid, { spawnSyncImpl = spawnSync, sleepMs = 2000 } = {}) {
  if (!Number.isInteger(pid) || pid <= 0) return false;

  // Try group kill first — node-pty usually makes the shell a group leader.
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    // Not a group leader or already gone; fall through to child enumeration.
  }

  const children = getUnixChildPids(pid, { spawnSyncImpl });
  for (const child of children) {
    killUnixProcessTree(child, { spawnSyncImpl, sleepMs: 0 });
  }

  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    // already gone
  }

  if (sleepMs > 0) {
    try {
      spawnSyncImpl(process.execPath, ['-e', `setTimeout(()=>{},${sleepMs})`], {
        timeout: sleepMs + 500,
      });
    } catch {
      // ignore sleep failures
    }
  }

  // Final SIGKILL sweep for anything still alive.
  const remaining = [pid, ...getUnixChildPids(pid, { spawnSyncImpl })];
  for (const p of remaining) {
    try {
      process.kill(-p, 'SIGKILL');
    } catch {
      // ignore
    }
    try {
      process.kill(p, 'SIGKILL');
    } catch {
      // ignore
    }
  }

  return true;
}

/**
 * Terminate a Windows process tree using taskkill.
 */
function killWindowsProcessTree(pid, { spawnSyncImpl = spawnSync } = {}) {
  if (!Number.isInteger(pid) || pid <= 0) return false;

  try {
    const result = spawnSyncImpl('taskkill', ['/T', '/F', '/PID', String(pid)], {
      stdio: 'ignore',
      timeout: 5000,
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

/**
 * Kill the shell/agent process tree for a session. Best-effort: does not throw.
 */
export function killProcessTreeBestEffort(pid, { spawnSyncImpl = spawnSync } = {}) {
  if (!Number.isInteger(pid) || pid <= 0) return false;

  if (os.platform() === 'win32') {
    return killWindowsProcessTree(pid, { spawnSyncImpl });
  }

  return killUnixProcessTree(pid, { spawnSyncImpl });
}

export function teardownPanelSessionProcesses(session, { hasTmux, spawnSyncImpl, fetchImpl } = {}) {
  if (!session) return;

  abortOpenCodeSessionBestEffort(session.opencodeSessionId, { fetchImpl });
  killPanelTmuxSessionBestEffort(session, { hasTmux, spawnSyncImpl });
  killProcessTreeBestEffort(session.ptyPid, { spawnSyncImpl });
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
