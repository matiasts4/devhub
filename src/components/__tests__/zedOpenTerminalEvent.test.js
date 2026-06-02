/**
 * zedOpenTerminalEvent unit tests — T-025 (fix consumer guard)
 * and T-029a (propagate `session_id`).
 *
 * Spec requirement (T-025, session-workspace-restore):
 * - The producer (ChatPanel) only dispatches `devhub:zed-open-terminal`
 *   when an `open_terminal` tool result has a `session_id`.
 * - The consumer (TerminalWorkspacesManager) must accept the event
 *   whether `command` is null (open empty shell) OR a string (open + run).
 * - The consumer must still reject events with no payload at all
 *   (defensive: no `detail`).
 *
 * Spec requirement (T-029a):
 * - The detail now carries `session_id` (string|null) so the consumer
 *   can reuse the model-created PTY instead of minting a fresh one.
 * - The validator must still accept the event whether `session_id`
 *   is null (e.g. a future explicit-shell-open producer) or a string
 *   (Zed's open_terminal result).
 *
 * The decision logic is extracted into a small pure helper to keep the
 * test surface JSDOM-free. The helper lives in
 * `src/components/zedOpenTerminalEvent.js`.
 */

const {
  isValidZedOpenTerminalEvent,
  dispatchZedOpenTerminal,
} = require('../zedOpenTerminalEvent.js');

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

describe('isValidZedOpenTerminalEvent — session_id (T-029a)', () => {
  test('accepts detail with session_id=null (e.g. future explicit-shell-open producer)', () => {
    expect(isValidZedOpenTerminalEvent({ command: null, cwd: null, session_id: null })).toBe(true);
  });

  test('accepts detail with session_id=string (Zed open_terminal result)', () => {
    expect(
      isValidZedOpenTerminalEvent({
        command: 'ls',
        cwd: '/tmp',
        session_id: 'term-1780361321206-upe6n',
      })
    ).toBe(true);
  });
});

describe('resolveZedOpenTerminalPanelId (T-029b)', () => {
  const { resolveZedOpenTerminalPanelId } = require('../zedOpenTerminalEvent.js');

  test('returns session_id when present (Zed open_terminal result)', () => {
    expect(
      resolveZedOpenTerminalPanelId({ command: 'ls', cwd: null, session_id: 'term-123-abc' })
    ).toBe('term-123-abc');
  });

  test('returns fallback when session_id is null (legacy or non-Zed producers)', () => {
    expect(
      resolveZedOpenTerminalPanelId({ command: null, cwd: null, session_id: null }, 'p7')
    ).toBe('p7');
  });

  test('returns fallback when session_id is missing (defensive)', () => {
    expect(resolveZedOpenTerminalPanelId({ command: 'ls' }, 'p9')).toBe('p9');
  });
});

describe('dispatchZedOpenTerminal (T-WSR-zed-001, ZEB-005/ZEB-006)', () => {
  let savedWindow;
  let savedCustomEvent;

  beforeEach(() => {
    savedWindow = global.window;
    savedCustomEvent = global.CustomEvent;
  });

  afterEach(() => {
    if (savedWindow === undefined) {
      delete global.window;
    } else {
      global.window = savedWindow;
    }
    if (savedCustomEvent === undefined) {
      delete global.CustomEvent;
    } else {
      global.CustomEvent = savedCustomEvent;
    }
  });

  test('SSR: window === undefined → no throw, no error', () => {
    // The helper MUST be SSR-safe (ZEB-006). Removing `window` simulates
    // a Node.js / Server Component runtime. The helper is a no-op.
    delete global.window;
    expect(() => dispatchZedOpenTerminal({ session_id: 'term-X' })).not.toThrow();
  });

  test('happy path: window defined → exactly one CustomEvent "devhub:zed-open-terminal" with the right detail', () => {
    const { JSDOM } = require('jsdom');
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    global.window = dom.window;
    global.CustomEvent = dom.window.CustomEvent;

    const dispatchSpy = jest.spyOn(dom.window, 'dispatchEvent');

    dispatchZedOpenTerminal({ session_id: 'term-X', command: 'ls', cwd: '/tmp' });

    const calls = dispatchSpy.mock.calls.filter(
      (call) => call[0] && call[0].type === 'devhub:zed-open-terminal'
    );
    expect(calls).toHaveLength(1);
    const ev = calls[0][0];
    expect(ev).toBeInstanceOf(dom.window.CustomEvent);
    expect(ev.detail).toEqual({ session_id: 'term-X', command: 'ls', cwd: '/tmp' });

    dispatchSpy.mockRestore();
    dom.window.close();
  });
});
