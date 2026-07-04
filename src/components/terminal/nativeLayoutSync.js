/**
 * Terminal layout sync — survivor recovery and layout-settled dispatch helpers.
 */

/**
 * Monotonic generation counter for every `devhub:terminal-layout-settled`
 * dispatch. Lets hidden panels detect that layout churn happened somewhere
 * (including another workspace) while they were opacity-hidden, even when the
 * event itself is filtered to the active workspace's panelIds.
 */
let terminalLayoutSettledGeneration = 0;

export function getTerminalLayoutSettledGeneration() {
  return terminalLayoutSettledGeneration;
}

export function dispatchTerminalLayoutSettled(detail = {}) {
  if (typeof window === 'undefined') return;
  terminalLayoutSettledGeneration += 1;
  window.dispatchEvent(
    new CustomEvent('devhub:terminal-layout-settled', {
      detail: { ...detail, at: Date.now(), generation: terminalLayoutSettledGeneration },
    })
  );
}

/** Survivor recovery after workspace close — same golden path as route hide/show. */
export function dispatchTerminalSurvivorRecover(detail = {}) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('devhub:terminal-survivor-recover', {
      detail: { ...detail, at: Date.now() },
    })
  );
}

/**
 * Single-shot reveal event for a panel that just became visible inside a stacked
 * window. Mirrors the layout-show useLayoutEffect path used by workspace tab
 * switches, so window switches get the same soft-reveal/fit/recovery pipeline
 * instead of relying only on the survivor-recover burst.
 */
export function dispatchTerminalWindowVisible(detail = {}) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('devhub:terminal-window-visible', {
      detail: { ...detail, at: Date.now() },
    })
  );
}

/** Context loss from peer unmount often lands after the first recover pass. */
export const SURVIVOR_RECOVER_DELAYS_MS = Object.freeze([0, 50, 150, 350, 600, 1000, 1600]);

/**
 * Moderate burst for workspace/window switches under Option B: panels stay
 * mounted and the GPU addon remains attached, so delayed context loss is far
 * less likely than on a workspace removal. We keep a few follow-ups to catch
 * async WebGL context loss and late compositor flushes, but stop earlier than
 * the full removal burst to avoid dragging the flicker out for 1.6 s.
 */
export const SWITCH_SURVIVOR_RECOVER_DELAYS_MS = Object.freeze([0, 50, 150, 350, 600]);

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
  if (ids.length === 0 || typeof window === 'undefined') return () => {};

  let cancelled = false;
  let burstCleanup = null;
  const timerIds = [];

  // Fast path for window/workspace switches where the layout is already
  // settled: fire the first recovery immediately instead of waiting for the
  // double-rAF bootstrap. Follow-up timers still cover delayed context loss.
  if (immediate) {
    dispatchSurvivorRecover({ panelIds: ids, workspaceId, reason });
    burstCleanup = typeof onLifecycleSync === 'function' ? onLifecycleSync() : null;
  }

  let raf2 = 0;
  if (typeof window.requestAnimationFrame !== 'function') {
    return () => {};
  }
  const raf1 = window.requestAnimationFrame(() => {
    raf2 = window.requestAnimationFrame(() => {
      if (cancelled) return;
      if (!immediate) {
        burstCleanup = typeof onLifecycleSync === 'function' ? onLifecycleSync() : null;
      }
      const activeDelays = immediate ? delays.slice(1) : delays;
      for (const delayMs of activeDelays) {
        timerIds.push(
          window.setTimeout(() => {
            if (cancelled) return;
            dispatchSurvivorRecover({ panelIds: ids, workspaceId, reason });
          }, delayMs)
        );
      }
    });
  });

  return () => {
    cancelled = true;
    window.cancelAnimationFrame(raf1);
    if (raf2) window.cancelAnimationFrame(raf2);
    burstCleanup?.();
    timerIds.forEach((id) => window.clearTimeout(id));
  };
}
