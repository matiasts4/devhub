/**
 * Pending native bootstrap paste reservations keyed by panel / terminal id.
 */

/** @type {Map<string, { text: string, program: string|null, timeoutMs: number|null, initialCommand: string|null, reservedAt: number }>} */
const pending = new Map();

/** @type {Set<string>} */
const done = new Set();

/**
 * @param {string} panelId
 * @param {{ text: string, program?: string|null, timeoutMs?: number|null, initialCommand?: string|null }} reservation
 * @returns {boolean}
 */
export function reserveNativeTuiBootstrap(panelId, reservation) {
  if (typeof panelId !== 'string' || !panelId.trim()) return false;
  const text = typeof reservation?.text === 'string' ? reservation.text : '';
  if (!text.trim()) return false;
  if (done.has(panelId)) return false;

  pending.set(panelId, {
    text,
    program: typeof reservation?.program === 'string' ? reservation.program : null,
    timeoutMs:
      typeof reservation?.timeoutMs === 'number' && Number.isFinite(reservation.timeoutMs)
        ? reservation.timeoutMs
        : null,
    initialCommand:
      typeof reservation?.initialCommand === 'string' ? reservation.initialCommand : null,
    reservedAt: Date.now(),
  });
  return true;
}

/**
 * Consume (remove) a pending reservation. Does not mark done.
 * @param {string} panelId
 * @returns {{ text: string, program: string|null, timeoutMs: number|null, initialCommand: string|null, reservedAt: number }|null}
 */
export function consumeNativeTuiBootstrap(panelId) {
  if (typeof panelId !== 'string' || !panelId) return null;
  if (done.has(panelId)) {
    pending.delete(panelId);
    return null;
  }
  const row = pending.get(panelId) || null;
  if (row) pending.delete(panelId);
  return row;
}

/**
 * Peek without removing.
 * @param {string} panelId
 */
export function peekNativeTuiBootstrap(panelId) {
  if (typeof panelId !== 'string' || !panelId) return null;
  if (done.has(panelId)) return null;
  return pending.get(panelId) || null;
}

/**
 * @param {string} panelId
 */
export function markNativeTuiBootstrapDone(panelId) {
  if (typeof panelId !== 'string' || !panelId) return;
  pending.delete(panelId);
  done.add(panelId);
}

/**
 * @param {string} panelId
 * @returns {boolean}
 */
export function isNativeTuiBootstrapDone(panelId) {
  return typeof panelId === 'string' && done.has(panelId);
}

/** Test / recovery helper */
export function clearNativeTuiBootstrapRegistry() {
  pending.clear();
  done.clear();
}
