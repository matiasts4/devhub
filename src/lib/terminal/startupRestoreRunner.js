import { RESTORE_ACTION } from './startupRestoreCoordinator';

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
import { inferPanelSessionKind } from './restorePolicyResolver';

export const STARTUP_RESTORE_MAX_CONCURRENCY = 2;
export const STARTUP_RESTORE_DELAY_MS = 350;
export const STARTUP_RESTORE_MUTEX_POLL_MS = 120;
export const STARTUP_RESTORE_MUTEX_TIMEOUT_MS = 45000;

const GENERIC_MUTEX_KEYS = ['devhub_generic_restore_in_progress', 'devhub_restore_in_progress'];

const OPENCODE_MUTEX_KEYS = ['devhub_opencode_restore_in_progress'];

export const RELAUNCH_RESTORE_ACTIONS = new Set([
  RESTORE_ACTION.RESUME_OPENCODE_SESSION,
  RESTORE_ACTION.PROCESS_ORPHAN,
  RESTORE_ACTION.RESTORE_SHELL_EMERGENT,
]);

/** Survives SPA remounts; cleared on full page reload or new browser tab session. */
export const STARTUP_RESTORE_SESSION_KEY = 'devhub_startup_restore_completed';

export function getPageNavigationType() {
  if (typeof performance === 'undefined' || typeof performance.getEntriesByType !== 'function') {
    return null;
  }
  const entry = performance.getEntriesByType('navigation')[0];
  return entry?.type || null;
}

/**
 * Run startup restore only on cold load (first entry or F5), not when TerminalWorkspacesManager remounts in-app.
 */
export function shouldRunStartupRestoreThisPageLoad(sessionStorage) {
  if (!sessionStorage || typeof sessionStorage.getItem !== 'function') {
    return true;
  }

  if (getPageNavigationType() === 'reload') {
    try {
      sessionStorage.removeItem(STARTUP_RESTORE_SESSION_KEY);
    } catch {
      // ignore
    }
    return true;
  }

  return sessionStorage.getItem(STARTUP_RESTORE_SESSION_KEY) !== '1';
}

export function markStartupRestoreCompletedForSession(sessionStorage) {
  if (!sessionStorage || typeof sessionStorage.setItem !== 'function') return;
  try {
    sessionStorage.setItem(STARTUP_RESTORE_SESSION_KEY, '1');
  } catch {
    // ignore
  }
}

function isMutexHeld(storage, keys) {
  if (!storage || typeof storage.getItem !== 'function') return false;
  return keys.some((key) => storage.getItem(key) === 'true');
}

export async function waitForRestoreMutexClear(
  storage,
  {
    keys = GENERIC_MUTEX_KEYS,
    timeoutMs = STARTUP_RESTORE_MUTEX_TIMEOUT_MS,
    pollMs = STARTUP_RESTORE_MUTEX_POLL_MS,
  } = {}
) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (!isMutexHeld(storage, keys)) {
      return true;
    }
    await sleep(pollMs);
  }

  return !isMutexHeld(storage, keys);
}

export function buildOpenCodeResumeCommand(panel, action) {
  const sessionKind =
    action?.sessionKind ||
    inferPanelSessionKind({
      initialCommand: panel?.initialCommand,
      panel,
    });

  if (sessionKind === 'swarm') {
    return null;
  }

  const fromPanel = String(panel?.initialCommand || '')
    .replace(/\s*#recovery-\d+\s*$/i, '')
    .trim();
  if (fromPanel) return fromPanel;

  if (action?.opencodeSessionId) {
    return `opencode --session ${action.opencodeSessionId}`;
  }

  return null;
}

export function shouldBumpRelaunchCommand(currentCommand, nextCommand) {
  const normalizedCurrent = String(currentCommand || '')
    .replace(/\s*#recovery-\d+\s*$/i, '')
    .trim();
  const normalizedNext = String(nextCommand || '').trim();
  if (!normalizedNext) return false;
  return normalizedCurrent !== normalizedNext;
}

/**
 * Runs relaunch actions with bounded concurrency so 20 OpenCode sessions do not spawn at once.
 */
export async function dispatchStartupRestoreQueue({
  actions = [],
  getPanel,
  onRelaunch,
  onPanelLive,
  maxConcurrency = STARTUP_RESTORE_MAX_CONCURRENCY,
  delayMs = STARTUP_RESTORE_DELAY_MS,
  shouldSkipAction,
} = {}) {
  const relaunchActions = actions.filter((action) => RELAUNCH_RESTORE_ACTIONS.has(action.action));
  const manualPanelIds = new Set(
    actions
      .filter(
        (action) =>
          action.action === RESTORE_ACTION.TERMINATED && action.reason === 'restore-policy-manual'
      )
      .map((action) => action.terminalId)
      .filter(Boolean)
  );

  const livePanelIds = new Set(
    actions
      .filter(
        (action) =>
          action.action === RESTORE_ACTION.RESTORE_READY ||
          action.action === RESTORE_ACTION.REATTACH_LIVE_TERMINAL
      )
      .map((action) => action.terminalId)
      .filter(Boolean)
  );

  let cursor = 0;

  async function worker() {
    while (cursor < relaunchActions.length) {
      const index = cursor;
      cursor += 1;
      const action = relaunchActions[index];
      const panel = getPanel(action.terminalId);

      if (shouldSkipAction?.(action, panel)) {
        continue;
      }

      const command = buildOpenCodeResumeCommand(panel, action);
      if (!action.terminalId || !command) {
        continue;
      }

      await onRelaunch(action, panel, command);

      if (delayMs > 0) {
        await sleep(delayMs);
      }
    }
  }

  const workerCount = Math.max(1, Math.min(maxConcurrency, relaunchActions.length || 1));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  livePanelIds.forEach((panelId) => {
    onPanelLive?.(panelId, { reason: 'runtime-already-live' });
  });

  return {
    relaunchedCount: relaunchActions.length,
    manualPanelIds: Array.from(manualPanelIds),
    livePanelIds: Array.from(livePanelIds),
  };
}

export async function runOpenCodeStartupRestoreMutex(storage, runner) {
  try {
    if (storage && typeof storage.setItem === 'function') {
      storage.setItem('devhub_opencode_restore_in_progress', 'true');
    }
  } catch {
    // ignore
  }

  try {
    await waitForRestoreMutexClear(storage, { keys: GENERIC_MUTEX_KEYS });
    return await runner();
  } finally {
    try {
      if (storage && typeof storage.removeItem === 'function') {
        storage.removeItem('devhub_opencode_restore_in_progress');
      }
    } catch {
      // ignore
    }
  }
}

export { GENERIC_MUTEX_KEYS, OPENCODE_MUTEX_KEYS };
