/**
 * legacyTerminalSurvivorRecovery.js — survivor recovery orchestration.
 *
 * Schedules `devhub:terminal-survivor-recover` bursts after workspace close.
 * engine-v2 panels share the soft-repaint path (no GPU recycle); legacy panels
 * keep the fuller churn recovery for window switches.
 */

/**
 * @param {boolean} isEngineV2
 * @returns {boolean}
 */
export function usesLegacyTerminalSurvivorRecovery(isEngineV2) {
  return !isEngineV2;
}

function getBrowserWindow() {
  return typeof globalThis !== 'undefined' ? globalThis.window : undefined;
}

/** Survivor recovery after workspace close — same golden path as route hide/show. */
export function dispatchTerminalSurvivorRecover(detail = {}) {
  const win = getBrowserWindow();
  if (!win) return;
  win.dispatchEvent(
    new CustomEvent('devhub:terminal-survivor-recover', {
      detail: { ...detail, at: Date.now() },
    })
  );
}

/** Context loss from peer unmount often lands after the first recover pass. */
export const SURVIVOR_RECOVER_DELAYS_MS = Object.freeze([0, 50, 150, 350, 600, 1000, 1600]);

/**
 * Moderate burst for workspace/window switches under Option B: panels stay
 * mounted and the GPU addon remains attached, so delayed context loss is far
 * less likely than on a workspace removal.
 */
export const SWITCH_SURVIVOR_RECOVER_DELAYS_MS = Object.freeze([0, 50, 150, 350, 600]);

/**
 * Exclude terminal-engine-v2 panels from legacy survivor-recovery bursts.
 */
export function filterLegacySurvivorPanelIds(panelIds = [], engineV2PanelIds = new Set()) {
  if (!Array.isArray(panelIds) || panelIds.length === 0) return [];
  return panelIds.filter((panelId) => panelId && !engineV2PanelIds.has(panelId));
}

/**
 * Double-rAF then lifecycle burst + staggered survivor-recover events.
 * Returns cancel fn (use in effects; one-shot close can skip storing it).
 */
export function scheduleSurvivorRecoverAfterClose({
  panelIds = [],
  workspaceId = null,
  reason = 'workspace-removed',
  onLifecycleSync,
  dispatchSurvivorRecover = dispatchTerminalSurvivorRecover,
  immediate = false,
  delays = SURVIVOR_RECOVER_DELAYS_MS,
} = {}) {
  const ids = panelIds.filter(Boolean);
  const win = getBrowserWindow();
  if (ids.length === 0 || !win) return () => {};

  let cancelled = false;
  let burstCleanup = null;
  const timerIds = [];

  if (immediate) {
    dispatchSurvivorRecover({ panelIds: ids, workspaceId, reason });
    burstCleanup = typeof onLifecycleSync === 'function' ? onLifecycleSync() : null;
  }

  let raf2 = 0;
  if (typeof win.requestAnimationFrame !== 'function') {
    return () => {};
  }
  const raf1 = win.requestAnimationFrame(() => {
    raf2 = win.requestAnimationFrame(() => {
      if (cancelled) return;
      if (!immediate) {
        burstCleanup = typeof onLifecycleSync === 'function' ? onLifecycleSync() : null;
      }
      const activeDelays = immediate ? delays.slice(1) : delays;
      for (const delayMs of activeDelays) {
        timerIds.push(
          win.setTimeout(() => {
            if (cancelled) return;
            dispatchSurvivorRecover({ panelIds: ids, workspaceId, reason });
          }, delayMs)
        );
      }
    });
  });

  return () => {
    cancelled = true;
    win.cancelAnimationFrame(raf1);
    if (raf2) win.cancelAnimationFrame(raf2);
    burstCleanup?.();
    timerIds.forEach((timerId) => win.clearTimeout(timerId));
  };
}
