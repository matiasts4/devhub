/**
 * Contract: TUI mouse injection must not steal text selection gestures.
 * - Shift/alt/meta / non-primary → skip injection
 * - Drag past threshold → no inject on mouseup
 * - Short click → inject once
 * - Active selection defers TUI mouse-mode rebind
 */

const {
  TERMINAL_DISABLE_FOCUS_REPORTING_SEQ,
  TERMINAL_DISABLE_MOUSE_REPORTING_SEQ,
  TERMINAL_ENABLE_TUI_MOUSE_REPORTING_SEQ,
  TERMINAL_TUI_CLICK_DRAG_THRESHOLD_PX,
  shouldSkipTuiMouseInjectionForSelectionGesture,
  terminalHasActiveSelection,
  prepareActiveTuiTerminalFocusRespectingSelection,
  scheduleTuiTranscriptMouseInjection,
} = require('../TerminalTTY.helpers');

describe('shouldSkipTuiMouseInjectionForSelectionGesture', () => {
  test('skips shift / alt / meta and non-primary buttons', () => {
    expect(shouldSkipTuiMouseInjectionForSelectionGesture({ button: 0, shiftKey: true })).toBe(
      true
    );
    expect(shouldSkipTuiMouseInjectionForSelectionGesture({ button: 0, altKey: true })).toBe(true);
    expect(shouldSkipTuiMouseInjectionForSelectionGesture({ button: 0, metaKey: true })).toBe(true);
    expect(shouldSkipTuiMouseInjectionForSelectionGesture({ button: 2 })).toBe(true);
  });

  test('allows primary click without selection modifiers', () => {
    expect(
      shouldSkipTuiMouseInjectionForSelectionGesture({
        button: 0,
        shiftKey: false,
        altKey: false,
        metaKey: false,
      })
    ).toBe(false);
  });
});

describe('terminalHasActiveSelection', () => {
  test('reads hasSelection / getSelection', () => {
    expect(terminalHasActiveSelection({ hasSelection: () => true })).toBe(true);
    expect(terminalHasActiveSelection({ hasSelection: () => false, getSelection: () => '' })).toBe(
      false
    );
    expect(
      terminalHasActiveSelection({ hasSelection: () => false, getSelection: () => 'copied' })
    ).toBe(true);
  });
});

describe('scheduleTuiTranscriptMouseInjection', () => {
  test('shiftKey does not call inject', () => {
    const inject = jest.fn();
    const listeners = new Map();
    const windowRef = {
      addEventListener: (type, fn) => {
        listeners.set(type, fn);
      },
      removeEventListener: (type) => {
        listeners.delete(type);
      },
    };

    scheduleTuiTranscriptMouseInjection({
      event: { button: 0, shiftKey: true, clientX: 10, clientY: 10 },
      cell: { col: 1, row: 2 },
      eligible: true,
      inject,
      windowRef,
    });

    expect(inject).not.toHaveBeenCalled();
    expect(listeners.size).toBe(0);
  });

  test('short click injects on mouseup; drag past threshold does not', () => {
    const inject = jest.fn();
    const listeners = new Map();
    const windowRef = {
      addEventListener: (type, fn) => {
        listeners.set(type, fn);
      },
      removeEventListener: (type) => {
        listeners.delete(type);
      },
    };

    scheduleTuiTranscriptMouseInjection({
      event: { button: 0, clientX: 10, clientY: 10 },
      cell: { col: 3, row: 4 },
      eligible: true,
      inject,
      dragThresholdPx: TERMINAL_TUI_CLICK_DRAG_THRESHOLD_PX,
      windowRef,
    });

    listeners.get('mouseup')();
    expect(inject).toHaveBeenCalledTimes(1);
    expect(inject).toHaveBeenCalledWith({ col: 3, row: 4 });

    inject.mockClear();
    listeners.clear();

    scheduleTuiTranscriptMouseInjection({
      event: { button: 0, clientX: 10, clientY: 10 },
      cell: { col: 3, row: 4 },
      eligible: true,
      inject,
      dragThresholdPx: TERMINAL_TUI_CLICK_DRAG_THRESHOLD_PX,
      windowRef,
    });

    listeners.get('mousemove')({
      clientX: 10 + TERMINAL_TUI_CLICK_DRAG_THRESHOLD_PX + 1,
      clientY: 10,
    });
    listeners.get('mouseup')();
    expect(inject).not.toHaveBeenCalled();
  });
});

describe('prepareActiveTuiTerminalFocusRespectingSelection', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  test('defers TUI mouse enable while selection is active, then enables after clear + mouseup', () => {
    const writes = [];
    let selected = true;
    const term = {
      write: (seq) => writes.push(seq),
      hasSelection: () => selected,
      getSelection: () => (selected ? 'block' : ''),
      onSelectionChange: (cb) => {
        term._selCb = cb;
        return { dispose: () => {} };
      },
    };
    const listeners = new Map();
    const documentRef = {
      addEventListener: (type, fn, opts) => listeners.set(`${type}:${Boolean(opts)}`, fn),
      removeEventListener: (type, fn, opts) => listeners.delete(`${type}:${Boolean(opts)}`),
    };

    prepareActiveTuiTerminalFocusRespectingSelection(
      term,
      { tuiSessionActive: true },
      { documentRef }
    );

    expect(writes).toContain(TERMINAL_DISABLE_FOCUS_REPORTING_SEQ);
    expect(writes).not.toContain(TERMINAL_ENABLE_TUI_MOUSE_REPORTING_SEQ);

    selected = false;
    term._selCb?.();
    expect(writes).toContain(TERMINAL_ENABLE_TUI_MOUSE_REPORTING_SEQ);
  });

  test('deferMouseUntilPointerUp waits for mouseup before enabling mouse modes', () => {
    const writes = [];
    const term = {
      write: (seq) => writes.push(seq),
      hasSelection: () => false,
      getSelection: () => '',
    };
    const listeners = new Map();
    const documentRef = {
      addEventListener: (type, fn) => listeners.set(type, fn),
      removeEventListener: (type) => listeners.delete(type),
    };

    prepareActiveTuiTerminalFocusRespectingSelection(
      term,
      { tuiSessionActive: true, deferMouseUntilPointerUp: true },
      { documentRef }
    );

    expect(writes).toEqual([TERMINAL_DISABLE_FOCUS_REPORTING_SEQ]);
    listeners.get('mouseup')();
    jest.runOnlyPendingTimers();
    expect(writes).toContain(TERMINAL_ENABLE_TUI_MOUSE_REPORTING_SEQ);
  });

  test('non-TUI path disables mouse immediately', () => {
    const writes = [];
    const term = { write: (seq) => writes.push(seq) };
    prepareActiveTuiTerminalFocusRespectingSelection(term, { tuiSessionActive: false });
    expect(writes).toEqual([
      TERMINAL_DISABLE_FOCUS_REPORTING_SEQ,
      TERMINAL_DISABLE_MOUSE_REPORTING_SEQ,
    ]);
  });
});
