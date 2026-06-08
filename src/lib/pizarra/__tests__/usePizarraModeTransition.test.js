const { act, renderHook } = require('@testing-library/react');

function advance(ms) {
  act(() => {
    jest.advanceTimersByTime(ms);
  });
}

function getHook() {
  delete require.cache[require.resolve('../usePizarraModeTransition')];
  return require('../usePizarraModeTransition');
}

describe('usePizarraModeTransition — deferred commit', () => {
  test('runs leaving → commit → entering → idle', async () => {
    jest.useFakeTimers('modern');
    try {
      const { usePizarraModeTransition, resolveModeTransitionScrimOpacity } = getHook();
      const commit = jest.fn();
      const { result } = renderHook(() => usePizarraModeTransition());

      let promise;
      act(() => {
        promise = result.current.runTransition(commit);
      });
      advance(5);
      expect(result.current.phase).toBe('leaving');
      expect(commit).not.toHaveBeenCalled();
      expect(resolveModeTransitionScrimOpacity('leaving', 0.5, false)).toBeGreaterThan(0);

      advance(160);
      expect(result.current.phase).toBe('entering');
      expect(commit).toHaveBeenCalledTimes(1);

      advance(240);
      expect(result.current.phase).toBe('idle');
      await act(async () => {
        await promise;
      });
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('resolveModeTransitionScrimOpacity', () => {
  test('covers during leaving and reveals during entering', () => {
    const { resolveModeTransitionScrimOpacity } = getHook();
    expect(resolveModeTransitionScrimOpacity('leaving', 0, false)).toBe(0);
    expect(resolveModeTransitionScrimOpacity('leaving', 1, false)).toBe(1);
    expect(resolveModeTransitionScrimOpacity('entering', 0, false)).toBe(1);
    expect(resolveModeTransitionScrimOpacity('entering', 1, false)).toBe(0);
    expect(resolveModeTransitionScrimOpacity('idle', 0, false)).toBe(0);
  });
});