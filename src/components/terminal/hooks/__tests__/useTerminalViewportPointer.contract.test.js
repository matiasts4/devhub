/**
 * @jest-environment jsdom
 *
 * Contract: TUI pointer inject vs shell / input-zone / mouse rebind.
 */

const { installDom } = require('@/test-support/domHarness');
const { act } = require('react');
const { renderHook } = require('@testing-library/react');

const mockSendPaste = jest.fn(() => true);
const mockPrepareFocus = jest.fn(() => () => {});
const mockScheduleInject = jest.fn(({ eligible, inject, cell }) => {
  if (eligible && cell) inject(cell);
  return () => {};
});
const mockResolveCell = jest.fn();

jest.mock('@/components/terminal/TerminalTTY.helpers', () => {
  const actual = jest.requireActual('@/components/terminal/TerminalTTY.helpers');
  return {
    ...actual,
    sendTerminalPasteInput: (...args) => mockSendPaste(...args),
    prepareActiveTuiTerminalFocusRespectingSelection: (...args) => mockPrepareFocus(...args),
    scheduleTuiTranscriptMouseInjection: (...args) => mockScheduleInject(...args),
    resolveTerminalCellFromPointer: (...args) => mockResolveCell(...args),
  };
});

const useTerminalViewportPointer = require('../useTerminalViewportPointer').default;
const { buildTerminalMousePressSequence } = require('../../TerminalTTY.helpers');

beforeAll(() => {
  installDom();
});

beforeEach(() => {
  mockSendPaste.mockClear().mockReturnValue(true);
  mockPrepareFocus.mockClear().mockReturnValue(() => {});
  mockScheduleInject.mockClear().mockImplementation(({ eligible, inject, cell }) => {
    if (eligible && cell) inject(cell);
    return () => {};
  });
  mockResolveCell.mockReset();
});

function createCtx(overrides = {}) {
  const term = {
    rows: 24,
    cols: 80,
    focus: jest.fn(),
    write: jest.fn(),
  };
  return {
    id: 'p1',
    initialCommand: overrides.initialCommand ?? 'opencode',
    shouldUseNativeRenderer: false,
    nativeVteOpened: false,
    onActivatePanel: jest.fn(),
    termRef: { current: term },
    viewportShellRef: { current: document.createElement('div') },
    isGrokSessionRef: { current: Boolean(overrides.grokSession) },
    grokTuiReadyRef: { current: overrides.grokTuiReady ?? false },
    kimiReadyNotifiedRef: { current: false },
    tuiSessionActiveRef: { current: overrides.tuiSessionActive ?? false },
    tuiSessionFooterConfirmedRef: { current: overrides.footerConfirmed ?? false },
    lastPointerZoneRef: { current: 'transcript' },
    wsRef: { current: {} },
    transportRef: { current: 'json' },
    isVisibleInLayoutRef: { current: overrides.visible ?? true },
    isActivePanelRef: { current: true },
    focusNativeVtePanel: jest.fn(),
    handleNativeLeaseCommandError: jest.fn(),
    ...overrides.ctx,
  };
}

function fireMouseDown(handler, clientY = 10) {
  handler({
    button: 0,
    clientX: 40,
    clientY,
    shiftKey: false,
    altKey: false,
    metaKey: false,
  });
}

describe('useTerminalViewportPointer contracts', () => {
  test('shell (no TUI identity) does not inject', () => {
    mockResolveCell.mockReturnValue({ col: 5, row: 5 });
    const ctxRef = {
      current: createCtx({ initialCommand: 'bash', tuiSessionActive: false }),
    };
    const { result } = renderHook(() => useTerminalViewportPointer({ ctxRef }));
    act(() => fireMouseDown(result.current.handleViewportMouseDown));

    expect(mockPrepareFocus).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tuiSessionActive: false })
    );
    expect(mockScheduleInject).toHaveBeenCalledWith(expect.objectContaining({ eligible: false }));
    expect(mockSendPaste).not.toHaveBeenCalled();
  });

  test('OpenCode launch injects even when tuiSessionActiveRef is still false', () => {
    mockResolveCell.mockReturnValue({ col: 10, row: 8 });
    const ctxRef = {
      current: createCtx({
        initialCommand: 'opencode',
        tuiSessionActive: false,
        footerConfirmed: false,
      }),
    };
    const { result } = renderHook(() => useTerminalViewportPointer({ ctxRef }));
    act(() => fireMouseDown(result.current.handleViewportMouseDown));

    expect(mockPrepareFocus).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tuiSessionActive: true })
    );
    expect(mockSendPaste).toHaveBeenCalled();
    const text = mockSendPaste.mock.calls[0][0].text;
    // press + release, no mouse-mode toggle-off
    // eslint-disable-next-line no-control-regex -- SGR mouse
    expect(text).toMatch(/\x1b\[<0;\d+;\d+M\x1b\[<0;\d+;\d+m/);
    expect(text).not.toContain('?1000l');
  });

  test('input-zone (footer) click injects for Grok TUI', () => {
    // row 22 of 24 with Grok's 5-row input zone → input
    mockResolveCell.mockReturnValue({ col: 12, row: 22 });
    const ctxRef = {
      current: createCtx({
        initialCommand: 'grok',
        grokSession: true,
        tuiSessionActive: false,
        grokTuiReady: false,
      }),
    };
    const { result } = renderHook(() => useTerminalViewportPointer({ ctxRef }));
    act(() => fireMouseDown(result.current.handleViewportMouseDown, 400));

    expect(mockScheduleInject).toHaveBeenCalledWith(expect.objectContaining({ eligible: true }));
    expect(mockSendPaste).toHaveBeenCalled();
    expect(ctxRef.current.lastPointerZoneRef.current).toBe('input');
  });

  test('transcript short click injects when TUI active', () => {
    mockResolveCell.mockReturnValue({ col: 3, row: 4 });
    const ctxRef = {
      current: createCtx({
        initialCommand: 'opencode',
        tuiSessionActive: true,
        footerConfirmed: true,
      }),
    };
    const { result } = renderHook(() => useTerminalViewportPointer({ ctxRef }));
    act(() => fireMouseDown(result.current.handleViewportMouseDown));

    expect(mockSendPaste).toHaveBeenCalled();
    expect(ctxRef.current.lastPointerZoneRef.current).toBe('transcript');
  });
});

describe('buildTerminalMousePressSequence', () => {
  test('emits press+release without disabling mouse modes', () => {
    const seq = buildTerminalMousePressSequence(0, 0);
    expect(seq).toBe('\x1b[<0;1;1M\x1b[<0;1;1m');
    expect(seq).not.toContain('?1000');
    expect(seq).not.toContain('?1006');
  });
});
