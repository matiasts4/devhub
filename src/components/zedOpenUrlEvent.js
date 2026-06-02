/**
 * Helper for the `devhub:zed-open-url` CustomEvent contract (ZEB-003, ZEB-004).
 *
 * Producer: `src/lib/asistente/tools/browser.js` (T-WSR-zed-003) dispatches
 *   `devhub:zed-open-url` with detail `{ url, label, focus }` AFTER the
 *   `isSafeHttpUrl` check, alongside the existing xdg-open fallback. The
 *   system browser still opens (existing behavior preserved) — the in-app
 *   browser pane navigates too, in parallel.
 *
 * Consumer: `src/components/workspace/WorkspaceBrowserPane.jsx`
 *   (T-WSR-zed-003) registers a `useEffect` listener that calls
 *   `onDockStateChange` with the new URL and (when `focus === true` and
 *   pizarra is maximized) de-maximizes pizarra. Idempotent on (url, label)
 *   via a `useRef` of the last applied pair.
 *
 * Pure function surface (validators, resolvers) is testable without a DOM.
 * The dispatch helper is the ONLY place that touches `window.dispatchEvent`
 * for this event name (ZEB-005).
 */

import { isSafeHttpUrl } from '@/lib/asistente/tools/urlSafety';

/**
 * @typedef {object} ZedOpenUrlEventDetail
 * @property {string}      url   - normalized https URL
 * @property {string|null} label - optional human label
 * @property {boolean}     focus - opt-in flag, default false
 */

/**
 * Returns true when the event payload passes the URL safety check.
 * Pure function — does not access `window`. SSR-safe.
 *
 * @param {unknown} detail
 * @returns {boolean}
 */
export function isValidZedOpenUrlEvent(detail) {
  if (!detail || typeof detail !== 'object') return false;
  const safety = isSafeHttpUrl(detail.url);
  return Boolean(safety && safety.url);
}

/**
 * Returns the browser shape id for an event detail, or null when no label
 * is present. Pure function.
 *
 * @param {unknown} detail
 * @returns {string|null}
 */
export function resolveZedOpenUrlBrowserShape(detail) {
  if (!detail || typeof detail !== 'object') return null;
  return typeof detail.label === 'string' && detail.label.length > 0 ? detail.label : null;
}

/**
 * Dispatches `devhub:zed-open-url` on `window`. SSR-safe (no-op when
 * `window` is undefined). This is the ONLY allowed site for an inline
 * `new CustomEvent('devhub:zed-…', …)` for this event name (ZEB-005).
 *
 * Re-validates the URL with `isSafeHttpUrl` and silently drops anything
 * that is not `http:`/`https:` — defense-in-depth so a future
 * misbehaving caller cannot leak a `javascript:` URL into the event
 * bus (the browser tool already validates before calling, but the
 * helper is the trust boundary for the event bus itself).
 *
 * @param {{ url: string, label?: string|null, focus?: boolean }} detail
 * @returns {void}
 */
export function dispatchZedOpenUrl(detail) {
  if (typeof window === 'undefined') return;
  const safety = isSafeHttpUrl(detail && detail.url);
  if (!safety || !safety.url) return; // silently drop malformed or unsafe payloads
  const payload = {
    url: safety.url,
    label: detail && typeof detail.label === 'string' ? detail.label : null,
    focus: Boolean(detail && detail.focus === true),
  };
  window.dispatchEvent(new CustomEvent('devhub:zed-open-url', { detail: payload }));
}
