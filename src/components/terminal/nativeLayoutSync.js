/**
 * Native VTE layout sync — helpers for keeping GTK terminal bounds aligned
 * with React layout without hide/show suspend during resize drags.
 */

/** Follow-up sync delays after the first frame (ms). Keep minimal for snappy UX. */
export const NATIVE_SURFACE_SETTLE_DELAYS_MS = [16];

export function dispatchTerminalLayoutSettled(detail = {}) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('devhub:terminal-layout-settled', {
      detail: { ...detail, at: Date.now() },
    })
  );
}

export function dispatchNativeVteWorkspaceSync(detail = {}) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('devhub:native-vte-workspace-sync', {
      detail: { ...detail, at: Date.now() },
    })
  );
}

/**
 * Run an immediate native-surface sync, then one rAF + short settle timers.
 */
export function scheduleNativeSurfaceActivation(runSync, { includeSettleDelays = true } = {}) {
  if (typeof runSync !== 'function') return () => {};

  runSync();

  let rafId = null;
  const timers = [];

  if (typeof requestAnimationFrame === 'function') {
    rafId = requestAnimationFrame(() => {
      rafId = null;
      runSync();
    });
  }

  if (includeSettleDelays) {
    NATIVE_SURFACE_SETTLE_DELAYS_MS.forEach((delayMs) => {
      timers.push(setTimeout(runSync, delayMs));
    });
  }

  return () => {
    if (rafId !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(rafId);
    }
    timers.forEach((timerId) => clearTimeout(timerId));
  };
}

/**
 * After split/dock drag or panel-group layout changes, re-align native VTE bounds with React chrome.
 */
export function schedulePostLayoutNativeSync({ layoutReason, workspaceDetail = null } = {}) {
  const run = () => {
    if (layoutReason) {
      dispatchTerminalLayoutSettled({ reason: layoutReason });
    }
    if (workspaceDetail) {
      dispatchNativeVteWorkspaceSync(workspaceDetail);
    }
  };

  run();
  return scheduleNativeSurfaceActivation(run);
}

/**
 * Simple rect overlap test for carve/avoid calculations.
 */
export function rectsOverlap(a, b) {
  if (!a || !b) return false;
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  );
}

/**
 * Given a panel's full rect and a list of popup "avoid" rects that must be on top,
 * return a carved (reduced) bounds for the VTE widget so that the popup area is
 * not covered by the native terminal (web content can paint there cleanly).
 * The VTE keeps its *logical* pty size (no winch to child TUIs like OpenCode/Grok).
 * Strategy: clip overlapping avoids, prefer keeping the bottom portion of the
 * terminal (where new output/follow usually is). If remaining area too small,
 * return null (caller should fully hide/suspend that panel).
 *
 * This is the core of "mostrar cosas sobre la terminal sin suspenderla".
 */
export function computeCarvedBounds(panelRect, avoidRects = []) {
  if (!panelRect || !avoidRects || avoidRects.length === 0) return panelRect;
  const x = panelRect.x || 0;
  let y = panelRect.y || 0;
  const width = panelRect.width || 0;
  let height = panelRect.height || 0;
  for (const avoid of avoidRects) {
    if (!rectsOverlap({ x, y, width, height }, avoid)) continue;
    const overlapTop = Math.max(y, avoid.y);
    const overlapBottom = Math.min(y + height, avoid.y + avoid.height);
    if (overlapTop < y + height && overlapBottom > y) {
      if (overlapTop - y < 8) {
        // popup mostly covers from the top of this panel area -> carve top
        const clip = overlapBottom - y;
        y += clip;
        height = Math.max(0, height - clip);
      } else if (y + height - overlapBottom < 8) {
        // covers near bottom -> keep top
        height = Math.max(0, overlapTop - y);
      } else {
        // middle or large; prefer bottom slice (live output)
        height = Math.max(0, y + height - overlapBottom);
        y = overlapBottom;
      }
    }
    // (left/right clips could be added for side panels)
  }
  if (width < 40 || height < 16) return null; // too little visible, better full hide for this panel
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
  };
}
