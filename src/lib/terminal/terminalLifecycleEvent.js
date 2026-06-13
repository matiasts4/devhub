/**
 * Terminal lifecycle telemetry schema (A.0 — terminal-pizarra-stability).
 *
 * One structured shape for every terminal runtime lifecycle transition so the
 * dispose-count-per-toggle baseline (the headline metric A.1 must drive to 0)
 * and the renderer/atlas events can be correlated across panels and hosts.
 *
 * These events are emitted fire-and-forget through the existing `cliLog`
 * transport (POST /api/terminal/log → data/logs/terminal-debug.log); this
 * module is pure so the schema can be unit-tested without the network.
 */

/** Canonical lifecycle event names. */
export const TERMINAL_LIFECYCLE_EVENTS = Object.freeze([
  'boot',
  'dispose',
  'webgl-release',
  'webgl-reattach',
  'canvas-release',
  'native-sync',
  'fit-skip',
  'portal-activate',
  'portal-hide',
]);

const LIFECYCLE_EVENT_SET = new Set(TERMINAL_LIFECYCLE_EVENTS);

/**
 * @param {string} event - one of TERMINAL_LIFECYCLE_EVENTS
 * @returns {boolean}
 */
export function isTerminalLifecycleEvent(event) {
  return LIFECYCLE_EVENT_SET.has(event);
}

function coerceCount(value) {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function coerceBool(value) {
  if (value === null || value === undefined) return null;
  return Boolean(value);
}

function coerceString(value) {
  if (value === null || value === undefined) return null;
  return String(value);
}

/**
 * Build a normalized terminal lifecycle event record.
 *
 * Unknown / missing fields are normalized to `null` (never `undefined`) so the
 * log line shape is stable and greppable. `ts` defaults to `Date.now()` and is
 * overridable for deterministic tests.
 *
 * @param {object} input
 * @param {string} input.event
 * @param {string} [input.panelId]
 * @param {string} [input.surfaceId]
 * @param {string} [input.sessionId]
 * @param {string} [input.renderer]
 * @param {string} [input.reason]
 * @param {boolean} [input.isVisible]
 * @param {number} [input.refCount]
 * @param {number} [input.cols]
 * @param {number} [input.rows]
 * @param {number} [input.ts]
 * @returns {{
 *   ts: number, panelId: string|null, surfaceId: string|null,
 *   sessionId: string|null, renderer: string|null, event: string,
 *   reason: string|null, isVisible: boolean|null, refCount: number|null,
 *   cols: number|null, rows: number|null
 * }}
 */
export function buildTerminalLifecycleEvent(input = {}) {
  const {
    event,
    panelId,
    surfaceId,
    sessionId,
    renderer,
    reason,
    isVisible,
    refCount,
    cols,
    rows,
    ts,
  } = input;

  return {
    ts: Number.isFinite(Number(ts)) ? Number(ts) : Date.now(),
    panelId: coerceString(panelId),
    // surfaceId defaults to panelId — the A.1 map aligns them (surfaceId === panel.id).
    surfaceId: coerceString(surfaceId ?? panelId),
    sessionId: coerceString(sessionId ?? panelId),
    renderer: coerceString(renderer),
    event: isTerminalLifecycleEvent(event) ? event : coerceString(event),
    reason: coerceString(reason),
    isVisible: coerceBool(isVisible),
    refCount: coerceCount(refCount),
    cols: coerceCount(cols),
    rows: coerceCount(rows),
  };
}
