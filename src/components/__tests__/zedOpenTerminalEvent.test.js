/**
 * zedOpenTerminalEvent unit tests — T-025 (fix consumer guard).
 *
 * Spec requirement (T-025, session-workspace-restore):
 * - The producer (ChatPanel) only dispatches `devhub:zed-open-terminal`
 *   when an `open_terminal` tool result has a `session_id`.
 * - The consumer (TerminalWorkspacesManager) must accept the event
 *   whether `command` is null (open empty shell) OR a string (open + run).
 * - The consumer must still reject events with no payload at all
 *   (defensive: no `detail`).
 *
 * The decision logic is extracted into a small pure helper to keep the
 * test surface JSDOM-free. The helper lives in
 * `src/components/zedOpenTerminalEvent.js`.
 */

const { isValidZedOpenTerminalEvent } = require('../zedOpenTerminalEvent.js');

describe('isValidZedOpenTerminalEvent (T-025)', () => {
  test('accepts detail with command=null (open empty shell — repro for the bug)', () => {
    expect(isValidZedOpenTerminalEvent({ command: null, cwd: null })).toBe(true);
  });

  test('accepts detail with command=string and cwd=string (open + run)', () => {
    expect(isValidZedOpenTerminalEvent({ command: 'ls -la', cwd: '/tmp' })).toBe(true);
  });

  test('rejects undefined detail (no event payload at all)', () => {
    expect(isValidZedOpenTerminalEvent(undefined)).toBe(false);
  });

  test('rejects null detail (no event payload at all)', () => {
    expect(isValidZedOpenTerminalEvent(null)).toBe(false);
  });
});
