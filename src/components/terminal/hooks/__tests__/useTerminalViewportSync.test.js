/**
 * Guard tests for useTerminalViewportSync — fit/resize coalescing.
 */

const { installDom } = require('@/test-support/domHarness');
const { renderHook, act } = require('@testing-library/react');

const useTerminalViewportSync = require('../useTerminalViewportSync').default;

function createCtx() {
  const term = { cols: 80, rows: 24, scrollToBottom: jest.fn() };
  return {
    id: 'p1',
    cwd: '/tmp',
    initialCommand: null,
    autoFocus: false,
    coldMountOrdinal: 0,
    restored: false,
    termRef: { current: term },
    fitRef: { current: { fit: jest.fn() } },
    containerRef: { current: { getBoundingClientRect: () => ({ width: 400, height: 300 }) } },
    wsRef: { current: null },
    rafRef: { current: null },
    timeoutRef: { current: null },
    isDisposingRef: { current: false },
    isActivePanelRef: { current: true },
    isVisibleInLayoutRef: { current: true },
    operationalRendererModeRef: { current: 'xterm' },
    visibleTerminalPanelCountRef: { current: 1 },
    lastPtySizeRef: { current: { cols: 80, rows: 24 } },
    connectPendingUntilFitRef: { current: false },
    connectDeferTimerRef: { current: null },
    connectRef: { current: null },
    sessionClosingRef: { current: false },
    hasConnectedOnceRef: { current: false },
    needsViewportSyncOnShowRef: { current: false },
    layoutChurnedWhileHiddenRef: { current: false },
    layoutHiddenGenerationRef: { current: 0 },
    containerWasZeroSizedOnShowRef: { current: false },
    workspaceShowRecoverTimerRef: { current: null },
    workspaceShowZeroSizeObserverRef: { current: null },
    inactiveRepaintRafRef: { current: null },
    pendingWebglRecoveryRef: { current: false },
    webglReleasedOnLayoutHideRef: { current: false },
    canvasReleasedOnLayoutHideRef: { current: false },
    hiddenOutputBufferRef: { current: { value: '' } },
    hiddenOutputCatchupPendingRef: { current: false },
    sessionReattachedRef: { current: false },
    tuiSessionActiveRef: { current: false },
    kimiReadyNotifiedRef: { current: false },
    isEngineV2Ref: { current: false },
    webglFallbackRef: { current: null },
    webglAddonRef: { current: null },
    canvasAddonRef: { current: null },
    viewportFitConfirmedRef: { current: false },
    lastViewportReadyPostedRef: { current: { cols: 0, rows: 0 } },
    hasSentInitialCommand: { current: false },
    isGrokSessionRef: { current: false },
    clearTimers: jest.fn(),
    clearConnectDeferTimer: jest.fn(),
    scheduleConnectDeferForce: jest.fn(),
    sendResizeRef: { current: null },
    tryReattachWebglAddonRef: { current: null },
    tryReattachCanvasAddonRef: { current: null },
    syncTerminalViewportOnWorkspaceShowRef: { current: null },
    scheduleWorkspaceShowRecoveryRef: { current: null },
    reactivateTerminalViewportRef: { current: null },
    notifyViewportReady: jest.fn(),
    restoreInitialCommandDispatchGuard: jest.fn(),
    scheduleInitialCommandAfterViewport: jest.fn(),
    logViewportDiagnostic: jest.fn(),
    scrollTerminalToBottom: jest.fn(),
    scrollIfActivePanel: jest.fn(),
    disposeWebglAddonForContextLoss: jest.fn(),
    scheduleWebglRecovery: jest.fn(),
    coalescedForceRepaint: jest.fn(),
    scheduleBoundedGpuRecover: jest.fn(),
    scheduleBoundedFitRepaint: jest.fn(),
    scheduleBoundedForceRepaint: jest.fn(),
    buildViewportSnapshot: jest.fn(() => ({})),
    confirmViewportFit: jest.fn(),
    maybeConnectAfterViewportFit: jest.fn(),
    fitAndResize: jest.fn(() => true),
    scheduleInactiveViewportRepaint: jest.fn(),
    syncTerminalViewportOnWorkspaceShow: jest.fn(),
    scheduleWorkspaceShowRecovery: jest.fn(),
    sendResize: jest.fn(),
    reactivateTerminalViewport: jest.fn(),
  };
}

describe('useTerminalViewportSync', () => {
  beforeAll(() => {
    installDom();
  });

  it('returns fit and resize handlers', () => {
    const ctxRef = { current: createCtx() };
    const { result } = renderHook(() => useTerminalViewportSync({ ctxRef }));
    expect(typeof result.current.fitAndResize).toBe('function');
    expect(typeof result.current.sendResize).toBe('function');
    expect(typeof result.current.reactivateTerminalViewport).toBe('function');
    expect(typeof result.current.waitForVisibleDimensions).toBe('function');
  });

  it('sendResize no-ops when container has zero size', () => {
    const ctx = createCtx();
    ctx.containerRef.current.getBoundingClientRect = () => ({ width: 0, height: 0 });
    const ctxRef = { current: ctx };
    const { result } = renderHook(() => useTerminalViewportSync({ ctxRef }));

    act(() => {
      result.current.sendResize();
    });

    expect(ctx.fitAndResize).not.toHaveBeenCalled();
  });
});
