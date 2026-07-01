/**
 * panelActivityStore — module-level store for event-driven panel activity status.
 *
 * keyed by panelId. TerminalTTY's WS activity tracker publishes 'running'/'idle'
 * here; usePanelAgentStatus subscribes via useSyncExternalStore.
 *
 * Snapshots are primitives ('running' | 'idle' | null) so Object.is is stable
 * for useSyncExternalStore — no version counter needed.
 */

export const ACTIVITY_DEBOUNCE_MS = 2000;
export const NOISE_MIN_BYTES = 50;
export const WS_SILENT_FALLBACK_MS = 10000;
export const BOOTSTRAP_WINDOW_MS = 1500;

/**
 * Matches a string that is ENTIRELY cursor-control / whitespace / OSC noise.
 * Hoisted at module level (hot path is socket.onmessage).
 */
export const PURE_NOISE_RE =
  // eslint-disable-next-line no-control-regex -- ANSI escape sequences require control chars
  /^(?:\x1b\[[0-9;?]*[a-zA-Z]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|[\r\n\t ])*$/;

const states = new Map();
const lastSubstantialAts = new Map();
const listeners = new Map();

export function getPanelActivity(panelId) {
  return states.get(panelId) ?? null;
}

export function getPanelActivityAgeMs(panelId) {
  const ts = lastSubstantialAts.get(panelId);
  if (!ts) return null;
  return Date.now() - ts;
}

export function setPanelActivity(panelId, state) {
  const prev = states.get(panelId) ?? null;
  if (prev === state) return;
  if (state === 'running') {
    lastSubstantialAts.set(panelId, Date.now());
  }
  states.set(panelId, state);
  const cbs = listeners.get(panelId);
  if (cbs) {
    for (const cb of cbs) {
      try {
        cb(state);
      } catch {
        /* listener error should not break other listeners */
      }
    }
  }
}

export function subscribePanelActivity(panelId, cb) {
  let cbs = listeners.get(panelId);
  if (!cbs) {
    cbs = new Set();
    listeners.set(panelId, cbs);
  }
  cbs.add(cb);
  return () => {
    const set = listeners.get(panelId);
    if (set) {
      set.delete(cb);
      if (set.size === 0) listeners.delete(panelId);
    }
  };
}

export function clearPanelActivity(panelId) {
  states.delete(panelId);
  lastSubstantialAts.delete(panelId);
  const cbs = listeners.get(panelId);
  if (cbs) {
    for (const cb of cbs) {
      try {
        cb(null);
      } catch {
        /* ignore */
      }
    }
    listeners.delete(panelId);
  }
}
