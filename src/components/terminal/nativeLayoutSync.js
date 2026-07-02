/**
 * Native VTE layout sync — helpers for keeping GTK terminal bounds aligned
 * with React layout without hide/show suspend during resize drags.
 */

/** Follow-up sync delays after the first frame (ms). Keep minimal for snappy UX. */
export const NATIVE_SURFACE_SETTLE_DELAYS_MS = [16];

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

/** Context loss from peer unmount often lands after the first recover pass. */
export const SURVIVOR_RECOVER_DELAYS_MS = Object.freeze([0, 50, 150, 350, 600, 1000, 1600]);

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
} = {}) {
  const ids = panelIds.filter(Boolean);
  if (ids.length === 0 || typeof window === 'undefined') return () => {};

  let cancelled = false;
  let burstCleanup = null;
  const timerIds = [];
  let raf2 = 0;
  const raf1 = window.requestAnimationFrame(() => {
    raf2 = window.requestAnimationFrame(() => {
      if (cancelled) return;
      burstCleanup = typeof onLifecycleSync === 'function' ? onLifecycleSync() : null;
      for (const delayMs of SURVIVOR_RECOVER_DELAYS_MS) {
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
export function schedulePostLayoutNativeSync({
  layoutReason,
  workspaceDetail = null,
  includeFollowUpPasses = true,
} = {}) {
  const run = () => {
    if (layoutReason) {
      dispatchTerminalLayoutSettled({ reason: layoutReason });
    }
    if (workspaceDetail) {
      dispatchNativeVteWorkspaceSync(workspaceDetail);
    }
  };

  run();
  if (!includeFollowUpPasses) {
    return () => {};
  }
  return scheduleNativeSurfaceActivation(run);
}

/**
 * Reasons that re-attach / re-position the native VTE against the *final*
 * layout. During a mode transition they must be deferred to idle and emitted
 * exactly once, as the very last sync, so the widget never paints against an
 * intermediate (mid-animation) rect. A.3.
 */
export const NATIVE_REATTACH_REASONS = Object.freeze(['pizarra-mode-enter', 'pizarra-mode-exit']);

const REATTACH_REASON_SET = new Set(NATIVE_REATTACH_REASONS);

/**
 * Serialized native-IPC layout sync queue (A.3 — terminal-pizarra-stability).
 *
 * Problem: while a workspace↔pizarra transition animates, `panel-group-layout`
 * / `popup-avoid-rects` syncs fire on every frame and the reattach can target
 * an intermediate rect → the native terminal "vanishes"/desyncs. This queue
 * serializes them:
 *   - Not animating: apply immediately (preserves legacy immediate+rAF+settle).
 *   - Animating: buffer + coalesce per reason; on `flushOnIdle()` apply the
 *     buffered syncs in insertion order, then emit a SINGLE final reattach
 *     (the last `pizarra-mode-*` seen) against the settled layout.
 *
 * `apply(reason, { workspaceDetail, includeFollowUpPasses })` is injected for
 * tests; it defaults to `schedulePostLayoutNativeSync`. The queue owns the
 * cleanup returned by the previous apply so callers don't have to.
 *
 * @param {{ apply?: (reason: string, opts: object) => (void | (() => void)) }} [deps]
 */
export function createNativeLayoutSyncQueue({ apply } = {}) {
  const applyFn =
    typeof apply === 'function'
      ? apply
      : (reason, opts = {}) =>
          schedulePostLayoutNativeSync({
            layoutReason: reason,
            workspaceDetail: opts.workspaceDetail ?? null,
            includeFollowUpPasses: opts.includeFollowUpPasses !== false,
          });

  let animating = false;
  let lastCleanup = null;
  let seq = 0;
  const pending = new Map(); // reason -> { opts, seq } (coalesced per reason)

  function runLastCleanup() {
    if (typeof lastCleanup === 'function') {
      try {
        lastCleanup();
      } catch {
        // diagnostic-only path; never crash layout
      }
    }
    lastCleanup = null;
  }

  function applyImmediate(reason, opts = {}) {
    runLastCleanup();
    const cleanup = applyFn(reason, opts);
    lastCleanup = typeof cleanup === 'function' ? cleanup : null;
  }

  return {
    isAnimating: () => animating,
    setAnimating(next) {
      animating = Boolean(next);
    },
    /**
     * Enqueue a layout sync. Applied now unless a transition is animating, in
     * which case it is buffered (coalesced by reason) until `flushOnIdle()`.
     */
    enqueue(reason, opts = {}) {
      if (!reason) return;
      if (!animating) {
        applyImmediate(reason, opts);
        return;
      }
      const existing = pending.get(reason);
      pending.set(reason, { opts, seq: existing ? existing.seq : seq++ });
    },
    /**
     * End the animating window and apply buffered syncs: non-reattach reasons
     * first (insertion order), then a single final reattach (last one seen).
     */
    flushOnIdle() {
      animating = false;
      if (pending.size === 0) return;

      const ordered = [...pending.entries()].sort((a, b) => a[1].seq - b[1].seq);
      pending.clear();

      const reattaches = [];
      for (const [reason, { opts }] of ordered) {
        if (REATTACH_REASON_SET.has(reason)) {
          reattaches.push([reason, opts]);
          continue;
        }
        applyImmediate(reason, opts);
      }
      if (reattaches.length > 0) {
        const [reason, opts] = reattaches[reattaches.length - 1];
        applyImmediate(reason, opts);
      }
    },
    /** Cancel the in-flight follow-up passes from the last applied sync. */
    cancel() {
      runLastCleanup();
    },
    /** Drop everything (unmount / safety reset). */
    reset() {
      animating = false;
      pending.clear();
      runLastCleanup();
    },
    /** Test seam. */
    _pendingSize: () => pending.size,
  };
}

/**
 * @param {string} reason
 * @returns {boolean} whether the reason is a deferred-to-idle native reattach.
 */
export function isNativeReattachReason(reason) {
  return REATTACH_REASON_SET.has(reason);
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
