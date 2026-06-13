/**
 * Client-side Zed orchestration debug bus (Phase 0 baseline).
 * Enable with `localStorage.setItem('devhub:zed-debug', '1')` or
 * `window.__ZED_DEBUG__ = true`.
 */

export const ZED_DEBUG_STORAGE_KEY = 'devhub:zed-debug';
export const ZED_DEBUG_EVENT = 'devhub:zed-debug-event';

/** @typedef {'tool_called'|'tool_result'|'client_dispatch'|'dispatch_skipped'|'execute_404'|'stream_event'|'error'} ZedDebugKind */

/**
 * @returns {boolean}
 */
export function isZedClientDebugEnabled() {
  if (typeof window === 'undefined') return false;
  if (window.__ZED_DEBUG__ === true) return true;
  try {
    return window.localStorage.getItem(ZED_DEBUG_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * @param {ZedDebugKind} kind
 * @param {Record<string, unknown>} [payload]
 */
export function zedClientDebug(kind, payload = {}) {
  if (!isZedClientDebugEnabled()) return;
  const entry = {
    ts: new Date().toISOString(),
    kind,
    ...payload,
  };
  // eslint-disable-next-line no-console
  console.debug('[ZedDebug]', kind, payload);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(ZED_DEBUG_EVENT, { detail: entry }));
  }
}

export default zedClientDebug;
