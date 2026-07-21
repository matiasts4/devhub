/**
 * Cold-start / reattach Grok wheel readiness — first session after app open.
 */

const {
  reconcileGrokTuiWheelReadiness,
  TERMINAL_ENABLE_TUI_MOUSE_REPORTING_SEQ,
  TERMINAL_DISABLE_FOCUS_REPORTING_SEQ,
} = require('../TerminalTTY.helpers');

describe('reconcileGrokTuiWheelReadiness', () => {
  function makeRefs() {
    return {
      tuiSessionActiveRef: { current: false },
      isGrokSessionRef: { current: false },
      grokTuiReadyRef: { current: false },
    };
  }

  test('returns false for non-grok commands', () => {
    expect(
      reconcileGrokTuiWheelReadiness({
        initialCommand: 'opencode',
        assumeTuiIfReattached: true,
      })
    ).toBe(false);
  });

  test('assumeTuiIfReattached promotes ready + rebinds mouse modes', () => {
    const refs = makeRefs();
    const writes = [];
    const term = { write: (s) => writes.push(s) };
    const setNative = jest.fn();

    const ok = reconcileGrokTuiWheelReadiness({
      term,
      initialCommand: 'grok',
      tuiSessionActiveRef: refs.tuiSessionActiveRef,
      isGrokSessionRef: refs.isGrokSessionRef,
      grokTuiReadyRef: refs.grokTuiReadyRef,
      setNativeWheelPassthrough: setNative,
      assumeTuiIfReattached: true,
    });

    expect(ok).toBe(true);
    expect(refs.tuiSessionActiveRef.current).toBe(true);
    expect(refs.isGrokSessionRef.current).toBe(true);
    expect(refs.grokTuiReadyRef.current).toBe(true);
    // Grok is inject-only — native passthrough stays off
    expect(setNative).toHaveBeenCalledWith(false);
    expect(writes.join('')).toContain(TERMINAL_DISABLE_FOCUS_REPORTING_SEQ);
    expect(writes.join('')).toContain(TERMINAL_ENABLE_TUI_MOUSE_REPORTING_SEQ);
  });

  test('scans buffer for chrome when not assuming reattach', () => {
    const refs = makeRefs();
    const term = {
      write: jest.fn(),
      buffer: {
        active: {
          length: 1,
          getLine: () => ({ translateToString: () => 'Shift+Tab mode' }),
        },
      },
    };

    expect(
      reconcileGrokTuiWheelReadiness({
        term,
        initialCommand: 'grok',
        tuiSessionActiveRef: refs.tuiSessionActiveRef,
        isGrokSessionRef: refs.isGrokSessionRef,
        grokTuiReadyRef: refs.grokTuiReadyRef,
        assumeTuiIfReattached: false,
      })
    ).toBe(true);
    expect(refs.grokTuiReadyRef.current).toBe(true);
  });

  test('does not promote ready without buffer or assume flag', () => {
    const refs = makeRefs();
    expect(
      reconcileGrokTuiWheelReadiness({
        term: { write: jest.fn(), buffer: { active: { length: 0 } } },
        initialCommand: 'grok',
        grokTuiReadyRef: refs.grokTuiReadyRef,
        assumeTuiIfReattached: false,
      })
    ).toBe(false);
    expect(refs.grokTuiReadyRef.current).toBe(false);
  });
});
