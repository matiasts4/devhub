/**
 * @jest-environment node
 */

const {
  scheduleGrokWheelBootstrap,
  GROK_WHEEL_BOOTSTRAP_DELAYS_MS,
} = require('../grokWheelBootstrap');

describe('scheduleGrokWheelBootstrap', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('no-ops for non-grok commands', () => {
    const reset = jest.fn();
    const cancel = scheduleGrokWheelBootstrap({
      getTerm: () => ({}),
      initialCommand: 'opencode',
      resetTerminalModesForReattach: reset,
      delaysMs: [100, 200],
    });
    jest.advanceTimersByTime(500);
    expect(reset).not.toHaveBeenCalled();
    cancel();
  });

  test('promotes flags and avoids native passthrough; full reset at most once', () => {
    const reset = jest.fn();
    const prepare = jest.fn();
    const setNative = jest.fn();
    const grokTuiReadyRef = { current: false };
    const isGrokSessionRef = { current: false };
    const tuiSessionActiveRef = { current: false };
    const term = { id: 't1' };

    const cancel = scheduleGrokWheelBootstrap({
      getTerm: () => term,
      initialCommand: 'grok',
      tuiSessionActiveRef,
      isGrokSessionRef,
      grokTuiReadyRef,
      setNativeWheelPassthrough: setNative,
      resetTerminalModesForReattach: reset,
      prepareActiveTuiTerminalFocus: prepare,
      terminalHasActiveMouseReporting: () => false,
      delaysMs: [100, 200, 300],
    });

    jest.advanceTimersByTime(100);
    expect(isGrokSessionRef.current).toBe(true);
    // attempt 0 without chrome: prepare only, no full reset yet
    expect(prepare).toHaveBeenCalled();
    expect(reset).not.toHaveBeenCalled();

    jest.advanceTimersByTime(100);
    // attemptIndex >= 1 forces ready; still inject-only (native off)
    expect(grokTuiReadyRef.current).toBe(true);
    expect(setNative).toHaveBeenCalledWith(false);

    jest.advanceTimersByTime(100);
    // attemptIndex >= 2: one full reset
    expect(reset).toHaveBeenCalledTimes(1);

    cancel();
  });

  test('cancel stops further ticks', () => {
    const prepare = jest.fn();
    const cancel = scheduleGrokWheelBootstrap({
      getTerm: () => ({}),
      initialCommand: 'grok',
      prepareActiveTuiTerminalFocus: prepare,
      delaysMs: [50, 100, 150],
    });
    jest.advanceTimersByTime(50);
    expect(prepare).toHaveBeenCalledTimes(1);
    cancel();
    jest.advanceTimersByTime(500);
    expect(prepare).toHaveBeenCalledTimes(1);
  });

  test('exports multi-second delay schedule covering cold start', () => {
    expect(GROK_WHEEL_BOOTSTRAP_DELAYS_MS.length).toBeGreaterThanOrEqual(5);
    expect(
      GROK_WHEEL_BOOTSTRAP_DELAYS_MS[GROK_WHEEL_BOOTSTRAP_DELAYS_MS.length - 1]
    ).toBeGreaterThanOrEqual(10000);
  });
});
