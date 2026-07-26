/**
 * Guard tests for useTerminalV2Session — connect lifecycle and stopV2Session.
 */

const { installDom } = require('@/test-support/domHarness');
const { renderHook, act } = require('@testing-library/react');

const useTerminalV2Session = require('../useTerminalV2Session').default;

function createCtx(overrides = {}) {
  const ws = {
    readyState: 0,
    close: jest.fn(),
    onopen: null,
    onmessage: null,
    onerror: null,
    onclose: null,
  };
  return {
    id: 'panel-test',
    cwd: '/tmp',
    initialCommand: null,
    restored: false,
    swarmContext: null,
    autoFocus: false,
    connectInFlightRef: { current: false },
    sessionClosingRef: { current: false },
    wsRef: { current: ws },
    transportRef: { current: 'json' },
    connectEpochRef: { current: 0 },
    connectAbortRef: { current: null },
    hasConnectedOnceRef: { current: false },
    initialCommandDelayScheduledRef: { current: false },
    sessionReattachedRef: { current: false },
    serverReadyReceivedRef: { current: false },
    hasSentInitialCommand: { current: false },
    processExitedRef: { current: false },
    isEngineV2Ref: { current: true },
    isDisposingRef: { current: false },
    termRef: { current: null },
    serializeAddonRef: { current: null },
    rehydrationRef: { current: { loaded: false, heldData: [] } },
    dataProcessedSinceSnapshotRef: { current: 0 },
    snapshotIntervalRef: { current: null },
    currentPtyOffsetRef: { current: 0 },
    serverTermsizeRef: { current: { cols: 0, rows: 0 } },
    panelActivityTrackerRef: { current: null },
    hiddenOutputBufferRef: { current: { value: '' } },
    hiddenOutputCatchupPendingRef: { current: false },
    tuiOutputTailRef: { current: '' },
    tuiSessionActiveRef: { current: false },
    kimiReadyNotifiedRef: { current: false },
    isGrokSessionRef: { current: false },
    grokTuiReadyRef: { current: false },
    tuiSessionFooterConfirmedRef: { current: false },
    initialCommandConnectSnapshotRef: { current: null },
    setConnectionState: jest.fn(),
    setHasConnectedOnce: jest.fn(),
    setRestoredToast: jest.fn(),
    setNativeWheelPassthrough: jest.fn(),
    clearConnectDeferTimer: jest.fn(),
    sendResize: jest.fn(),
    writeTerminalOutput: jest.fn(),
    scrollIfActivePanel: jest.fn(),
    sendInitialCommandIfReady: jest.fn(),
    applyTerminalSessionExit: jest.fn(),
    notifyAgentReady: jest.fn(),
    notifyOpencodeReady: jest.fn(),
    onFlushWriteRef: { current: null },
    sendResizeRef: { current: null },
    ...overrides,
  };
}

describe('useTerminalV2Session', () => {
  beforeAll(() => {
    installDom();
  });

  it('returns connect aliases startV2Session and stopV2Session', () => {
    const ctxRef = { current: createCtx() };
    const { result } = renderHook(() => useTerminalV2Session({ ctxRef }));
    expect(result.current.connect).toBe(result.current.startV2Session);
    expect(typeof result.current.stopV2Session).toBe('function');
  });

  it('stopV2Session silences and closes an open websocket', () => {
    const ctx = createCtx();
    const ws = ctx.wsRef.current;
    const ctxRef = { current: ctx };
    const { result } = renderHook(() => useTerminalV2Session({ ctxRef }));

    act(() => {
      result.current.stopV2Session();
    });

    expect(ws.close).toHaveBeenCalled();
    expect(ctx.wsRef.current).toBeNull();
    expect(ctx.connectInFlightRef.current).toBe(false);
  });

  it('skips connect when socket is already open and calls sendResize', async () => {
    const ctx = createCtx();
    ctx.wsRef.current.readyState = 1; // WebSocket.OPEN
    global.WebSocket = { OPEN: 1 };
    const ctxRef = { current: ctx };
    const { result } = renderHook(() => useTerminalV2Session({ ctxRef }));

    await act(async () => {
      await result.current.startV2Session();
    });

    expect(ctx.setConnectionState).toHaveBeenCalledWith('connected');
    expect(ctx.sendResize).toHaveBeenCalled();
    expect(ctx.connectInFlightRef.current).toBe(false);
  });
});
