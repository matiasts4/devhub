/**
 * Helper for the `devhub:zed-open-terminal` CustomEvent contract.
 *
 * Producer: `src/components/asistente/ChatPanel.jsx` (T-024) dispatches
 *   `devhub:zed-open-terminal` with detail `{ command, cwd }` whenever an
 *   `open_terminal` tool result has a `session_id`. `command` is null when
 *   the user did not request a specific command (open empty shell), and a
 *   string when the user wants to run something on open.
 *
 * Consumer: `src/components/TerminalWorkspacesManager.jsx` opens a new
 *   panel via `handleSplit` based on the event. Before T-025, the consumer
 *   guard was `if (!command) return;` which dropped the no-command case
 *   (`!null === true`). T-025 fixes that by replacing the guard with a
 *   check on the event payload itself.
 *
 * Extracted here as a pure function so it can be unit-tested without
 * mounting the full TerminalWorkspacesManager (4380 lines, heavy
 * dependencies).
 */

/**
 * Returns true when the event payload is present (i.e. the producer
 * dispatched the event). Accepts any non-undefined detail because the
 * producer already filters to `session_id`-only events. `command` may
 * be null (empty shell) or a string (open + run).
 *
 * @param {unknown} detail - The `detail` field from the CustomEvent.
 * @returns {boolean} True if the consumer should proceed.
 */
export function isValidZedOpenTerminalEvent(detail) {
  return detail !== undefined && detail !== null;
}
