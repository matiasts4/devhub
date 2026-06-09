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

export function teardownPanelSessionProcesses(
  session,
  { hasTmux, spawnSyncImpl, fetchImpl } = {}
) {
  if (!session) return;

  abortOpenCodeSessionBestEffort(session.opencodeSessionId, { fetchImpl });
  killPanelTmuxSessionBestEffort(session, { hasTmux, spawnSyncImpl });
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