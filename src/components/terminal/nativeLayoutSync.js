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

  // Start with full rect. For each overlapping avoid, consider carving by
  // removing the avoid overlap from one of the 4 sides, and keep the candidate
  // with the largest remaining area that no longer overlaps that avoid.
  // This gives a better "max visible subrect" than pure heuristic top/bottom.
  // Successive for multiple avoids. Prefers largest possible live area.
  let best = { ...panelRect };
  let bestArea = Math.max(0, best.width * best.height);

  for (const avoid of avoidRects) {
    if (!rectsOverlap(best, avoid)) continue;

    const candidates = [];

    // Carve top strip (remove from top up to avoid bottom)
    if (avoid.y > best.y) {
      const h = Math.max(0, avoid.y - best.y);
      if (h > 0) candidates.push({ ...best, height: h });
    }
    // Carve bottom strip (remove from avoid top down)
    const panelBottom = best.y + best.height;
    const avoidBottom = avoid.y + avoid.height;
    if (avoidBottom < panelBottom) {
      const newY = avoidBottom;
      const h = Math.max(0, panelBottom - newY);
      if (h > 0) candidates.push({ ...best, y: newY, height: h });
    }
    // Carve left strip
    if (avoid.x > best.x) {
      const w = Math.max(0, avoid.x - best.x);
      if (w > 0) candidates.push({ ...best, width: w });
    }
    // Carve right strip
    const panelRight = best.x + best.width;
    const avoidRight = avoid.x + avoid.width;
    if (avoidRight < panelRight) {
      const newX = avoidRight;
      const w = Math.max(0, panelRight - newX);
      if (w > 0) candidates.push({ ...best, x: newX, width: w });
    }

    for (const c of candidates) {
      if (c.width <= 0 || c.height <= 0) continue;
      if (!rectsOverlap(c, avoid)) {
        const area = c.width * c.height;
        if (area > bestArea) {
          best = { ...c };
          bestArea = area;
        }
      }
    }
  }

  if (best.width < 40 || best.height < 16) return null; // too little visible -> caller may full hide
  return {
    x: Math.round(best.x),
    y: Math.round(best.y),
    width: Math.round(best.width),
    height: Math.round(best.height),
  };
}

/**
 * Helper for any component (modals, pizarra palette, custom popups, etc.)
 * to register a rect that should "carve" under it so terminal stays live
 * (no full suspend). Returns unregister fn.
 * Usage:
 *   const unreg = registerTerminalAvoidRect(myRect, 'my-popup');
 *   // later unreg();
 * This feeds overlayAvoidRects in TWM -> carve in TTY.
 */
export function registerTerminalAvoidRect(rect, source) {
  if (typeof window === 'undefined' || !rect || !source) return () => {};
  const payload = {
    rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    source,
  };
  window.dispatchEvent(
    new CustomEvent('devhub:register-avoid-rect', { detail: { ...payload, action: 'add' } })
  );
  return () => {
    window.dispatchEvent(
      new CustomEvent('devhub:register-avoid-rect', { detail: { source, action: 'remove' } })
    );
  };
}
