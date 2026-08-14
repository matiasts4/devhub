/**
 * @jest-environment jsdom
 *
 * Regression: auto-reconnect used to loop forever (backoff capped at 5s but
 * never at attempt count). A panel whose PTY spawn fails persistently in the
 * sidecar produced an endless fetch + WS + term.clear() churn that stalled
 * the whole restored workspace. The hook must stop after
 * MAX_AUTO_RECONNECT_ATTEMPTS and only recover via connect / focus /
 * visibility reset paths.
 */

const { renderHook, act } = require('@testing-library/react');

jest.mock('@/lib/debug/terminalSessionDebug', () => ({
  logTerminalSession: jest.fn(),
}));

const {
  default: useTerminalAutoReconnect,
  MAX_AUTO_RECONNECT_ATTEMPTS,
} = require('../useTerminalAutoReconnect');
const { logTerminalSession } = require('@/lib/debug/terminalSessionDebug');

function createCtxRef() {
  return { current: { sessionClosingRef: { current: false } } };
}

function baseProps(overrides = {}) {
  return {
    ctxRef: createCtxRef(),
    autoFocus: true,
    isVisibleInLayout: true,
    connectionState: 'error',
    initError: null,
    id: 'p1',
    reconnect: jest.fn(),
    ...overrides,
  };
}

function renderAutoReconnect(overrides = {}) {
  const props = baseProps(overrides);
  const utils = renderHook((p) => useTerminalAutoReconnect(p), { initialProps: props });
  return { props, reconnect: props.reconnect, ...utils };
}

/**
 * In production each reconnect() flips connectionState through 'connecting'
 * and back to 'error' when it fails, which re-runs the effect and schedules
 * the next attempt. Simulate one full failed cycle.
 */
function failCycle(rerender, props, reconnect, advanceMs = 5000) {
  act(() => jest.advanceTimersByTime(advanceMs));
  rerender({ ...props, reconnect, connectionState: 'connecting' });
  rerender({ ...props, reconnect, connectionState: 'error' });
}

describe('useTerminalAutoReconnect attempt cap', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    logTerminalSession.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('schedules reconnect with exponential backoff', () => {
    const { reconnect } = renderAutoReconnect();
    expect(reconnect).not.toHaveBeenCalled();

    act(() => jest.advanceTimersByTime(300));
    expect(reconnect).toHaveBeenCalledTimes(1);

    const scheduled = logTerminalSession.mock.calls
      .filter(([event]) => event === 'terminal-auto-reconnect-scheduled')
      .map(([, payload]) => payload.delayMs);
    expect(scheduled[0]).toBe(300);
  });

  it('stops scheduling after MAX_AUTO_RECONNECT_ATTEMPTS and logs exhaustion once', () => {
    const { props, reconnect, rerender } = renderAutoReconnect();

    for (let i = 0; i < MAX_AUTO_RECONNECT_ATTEMPTS; i++) {
      failCycle(rerender, props, reconnect);
    }
    expect(reconnect).toHaveBeenCalledTimes(MAX_AUTO_RECONNECT_ATTEMPTS);

    // Far beyond any backoff: no further reconnects, ever.
    act(() => jest.advanceTimersByTime(120000));
    expect(reconnect).toHaveBeenCalledTimes(MAX_AUTO_RECONNECT_ATTEMPTS);

    const exhaustedLogs = logTerminalSession.mock.calls.filter(
      ([event]) => event === 'terminal-auto-reconnect-exhausted'
    );
    expect(exhaustedLogs).toHaveLength(1);
  });

  it('resets the counter when connection recovers', () => {
    const { props, reconnect, rerender } = renderAutoReconnect();

    for (let i = 0; i < MAX_AUTO_RECONNECT_ATTEMPTS; i++) {
      failCycle(rerender, props, reconnect);
    }
    expect(reconnect).toHaveBeenCalledTimes(MAX_AUTO_RECONNECT_ATTEMPTS);

    rerender({ ...props, reconnect, connectionState: 'connected' });
    rerender({ ...props, reconnect, connectionState: 'error' });

    act(() => jest.advanceTimersByTime(300));
    expect(reconnect).toHaveBeenCalledTimes(MAX_AUTO_RECONNECT_ATTEMPTS + 1);
  });

  it('resets the counter when the panel becomes visible again', () => {
    const { props, reconnect, rerender } = renderAutoReconnect({
      isVisibleInLayout: false,
      autoFocus: false,
    });

    // Not visible: never schedules.
    act(() => jest.advanceTimersByTime(60000));
    expect(reconnect).not.toHaveBeenCalled();

    rerender({ ...props, isVisibleInLayout: true });
    for (let i = 0; i < MAX_AUTO_RECONNECT_ATTEMPTS; i++) {
      failCycle(rerender, { ...props, isVisibleInLayout: true }, reconnect);
    }
    expect(reconnect).toHaveBeenCalledTimes(MAX_AUTO_RECONNECT_ATTEMPTS);
    act(() => jest.advanceTimersByTime(120000));
    expect(reconnect).toHaveBeenCalledTimes(MAX_AUTO_RECONNECT_ATTEMPTS);

    // Hide, then show again: recovery path resets the cap.
    rerender({ ...props, isVisibleInLayout: false });
    rerender({ ...props, isVisibleInLayout: true });
    act(() => jest.advanceTimersByTime(300));
    expect(reconnect).toHaveBeenCalledTimes(MAX_AUTO_RECONNECT_ATTEMPTS + 1);
  });

  it('does not schedule while the session is closing', () => {
    const ctxRef = createCtxRef();
    ctxRef.current.sessionClosingRef.current = true;
    const { reconnect } = renderAutoReconnect({ ctxRef });
    act(() => jest.advanceTimersByTime(60000));
    expect(reconnect).not.toHaveBeenCalled();
  });
});
