/**
 * Helper for the `devhub:zed-open-url` CustomEvent contract (ZEB-003, ZEB-004).
 *
 * Producer: `src/components/asistente/ChatPanel.jsx` dispatches after an
 *   `open_url` tool result (server-side tool only returns the URL; no
 *   xdg-open / system browser). In-app native GTK browser only.
 *
 * Consumer: `src/components/TerminalWorkspacesManager.jsx`
 *   (T-WSR-zed-003) registers a window listener that calls
 *   `updateRightDockState` + `applyZedOpenUrlDockUpdate` so the browser
 *   dock opens even when only Zed is visible. Idempotent on (url, label)
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

function safeParseJson(value) {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/**
 * Coerce model/tool `focus` params (boolean or string) for dock navigation.
 *
 * @param {unknown} value
 * @param {boolean} [defaultValue=true]
 * @returns {boolean}
 */
export function coerceZedOpenUrlFocus(value, defaultValue = true) {
  if (value === undefined || value === null || value === '') return defaultValue;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
  return defaultValue;
}

/**
 * Build an event detail from an `open_url` tool result object.
 *
 * @param {unknown} result
 * @returns {{ url: string, label: string|null, focus: boolean }|null}
 */
export function resolveZedOpenUrlFromToolResult(result) {
  const parsed = safeParseJson(result);
  if (!parsed || parsed.error || !parsed.url) return null;
  const safety = isSafeHttpUrl(parsed.url);
  if (!safety || !safety.url) return null;
  return {
    url: safety.url,
    label: typeof parsed.label === 'string' && parsed.label.length > 0 ? parsed.label : null,
    focus: coerceZedOpenUrlFocus(parsed.focus, true),
  };
}

/**
 * Dispatch one event per successful `open_url` entry in a tool_results array.
 *
 * @param {Array<{ tool: string, result: unknown }>|null|undefined} toolResults
 * @returns {void}
 */
export function dispatchZedOpenUrlFromToolResults(toolResults) {
  if (!Array.isArray(toolResults)) return;
  for (const entry of toolResults) {
    if (!entry || entry.tool !== 'open_url') continue;
    const detail = resolveZedOpenUrlFromToolResult(entry.result);
    if (!detail) continue;
    dispatchZedOpenUrl(detail);
  }
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
    focus: coerceZedOpenUrlFocus(detail && detail.focus, true),
  };
  window.dispatchEvent(new CustomEvent('devhub:zed-open-url', { detail: payload }));
}
