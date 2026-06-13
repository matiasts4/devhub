/**
 * Helper for the `devhub:zed-open-terminal` CustomEvent contract.
 *
 * Producer: `useZedChat` dispatches after `open_terminal` with
 *   `{ command, cwd, workspace: true, focus }`. Workspace opens use the
 *   same panel flow as Split right (`p1`, `p2`, …) — not orphan `term-*`
 *   ids from a headless POST PTY.
 *
 * Consumer: `TerminalWorkspacesManager.jsx` calls `handleSplit` (vertical
 *   when the workspace already has 2+ columns, else horizontal) with a
 *   normal panel id. Legacy events may still pass `session_id` for reattach.
 *
 * Extracted here as a pure function so it can be unit-tested without
 * mounting the full TerminalWorkspacesManager (4380 lines, heavy
 * dependencies).
 */

/**
 * Returns true when the event payload is present (i.e. the producer
 * dispatched the event). Accepts any non-undefined detail because the
 * producer already filters to `session_id`-only events. `command` may
 * be null (empty shell) or a string (open + run). `session_id` is
 * optional because other producers (e.g. a future explicit-shell-open
 * button) may dispatch this event without a model-created session.
 *
 * @typedef {object} ZedOpenTerminalEventDetail
 * @property {string|null} command   - Initial command to run, or null for empty shell.
 * @property {string|null} cwd       - Working directory, or null to inherit.
 * @property {string|null} session_id - PTY session id to reuse, or null to mint a new one.
 *
 * @param {unknown} detail - The `detail` field from the CustomEvent.
 * @returns {boolean} True if the consumer should proceed.
 */
export function isValidZedOpenTerminalEvent(detail) {
  return detail !== undefined && detail !== null;
}

/**
 * Resolves the panel id to use for a `devhub:zed-open-terminal` event.
 * Prefers the model's `session_id` (so the visual panel connects to the
 * same PTY the model opened). Falls back to the supplied id when no
 * session_id is present (e.g. a legacy producer or an explicit-shell-open
 * button).
 *
 * @param {unknown} detail   - The event detail.
 * @param {string} fallback  - Panel id to use when detail.session_id is null/missing.
 * @returns {string} The panel id to pass to `handleSplit`.
 */
export function resolveZedOpenTerminalPanelId(detail, fallback) {
  if (detail && typeof detail === 'object') {
    const terminalId =
      typeof detail.terminalId === 'string' && detail.terminalId.length > 0
        ? detail.terminalId
        : null;
    if (terminalId) return terminalId;
    const sid = typeof detail.session_id === 'string' && detail.session_id.length > 0
      ? detail.session_id
      : null;
    if (sid) return sid;
  }
  return fallback;
}

/**
 * Dispatches `devhub:zed-open-terminal` on `window`. SSR-safe (no-op
 * when `window` is undefined). This is the ONLY allowed site for an
 * inline `new CustomEvent('devhub:zed-…', …)` for this event name
 * (ZEB-005). The producer (useZedChat) calls this; the consumer
 * (TerminalWorkspacesManager) registers a `window.addEventListener` for
 * the same name.
 *
 * @param {object} detail - Event detail ({ command, cwd, session_id, focus }).
 * @returns {void}
 */
export function dispatchZedOpenTerminal(detail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('devhub:zed-open-terminal', { detail: detail ?? {} }));
}
