/**
 * Guard tests for useTerminalWorkspaceShowRecovery — workspace-show sync.
 */

const { installDom } = require('@/test-support/domHarness');
const { renderHook, act } = require('@testing-library/react');

const useTerminalWorkspaceShowRecovery = require('../useTerminalWorkspaceShowRecovery').default;

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
    workspaceShowSyncTimerRef: { current: null },
    prevVisibleInLayoutRef: { current: true },
    prevWorkspaceShellVisibleRef: { current: true },
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
    scheduleBoundedFitRepaintRef: { current: null },
    scheduleBoundedGpuRecoverRef: { current: null },
    notifyViewportReady: jest.fn(),
    restoreInitialCommandDispatchGuard: jest.fn(),
    scheduleInitialCommandAfterViewport: jest.fn(),
    logViewportDiagnostic: jest.fn(),
    scrollTerminalToBottom: jest.fn(),
    scrollIfActivePanel: jest.fn(),
    disposeWebglAddonForContextLoss: jest.fn(),
    scheduleWebglRecovery: jest.fn(),
    coalescedForceRepaint: jest.fn(),
    buildViewportSnapshot: jest.fn(() => ({})),
    confirmViewportFit: jest.fn(),
    maybeConnectAfterViewportFit: jest.fn(),
    fitAndResize: jest.fn(() => true),
    scheduleInactiveViewportRepaint: jest.fn(),
    syncTerminalViewportOnWorkspaceShow: jest.fn(),
    scheduleWorkspaceShowRecovery: jest.fn(),
    sendResize: jest.fn(),
    reactivateTerminalViewport: jest.fn(),
    scheduleBoundedGpuRecover: jest.fn(),
    scheduleBoundedFitRepaint: jest.fn(),
    scheduleBoundedForceRepaint: jest.fn(),
  };
}

describe('useTerminalWorkspaceShowRecovery', () => {
  beforeAll(() => {
    installDom();
  });

  it('returns workspace-show recovery handlers', () => {
    const ctxRef = { current: createCtx() };
    const { result } = renderHook(() => useTerminalWorkspaceShowRecovery({ ctxRef }));
    expect(typeof result.current.syncTerminalViewportOnWorkspaceShow).toBe('function');
    expect(typeof result.current.scheduleWorkspaceShowRecovery).toBe('function');
    expect(typeof result.current.scheduleBoundedForceRepaint).toBe('function');
    expect(typeof result.current.scheduleBoundedFitRepaint).toBe('function');
    expect(typeof result.current.scheduleBoundedGpuRecover).toBe('function');
    expect(typeof result.current.scheduleInactiveViewportRepaint).toBe('function');
  });
});

describe('scheduleBoundedForceRepaint verified stop (sin-parpadeo fase 2)', () => {
  let originalRaf;

  beforeEach(() => {
    originalRaf = global.requestAnimationFrame;
    global.requestAnimationFrame = jest.fn(() => 0);
  });

  afterEach(() => {
    global.requestAnimationFrame = originalRaf;
  });

  it('stops at the first tick when the repaint was only coalesced and dims+GPU are settled', () => {
    const ctx = createCtx();
    ctx.fitRef = { current: { proposeDimensions: () => ({ cols: 80, rows: 24 }) } };
    ctx.coalescedForceRepaint = jest.fn(() => false); // coalesced: one already landed
    const ctxRef = { current: ctx };
    const { result } = renderHook(() => useTerminalWorkspaceShowRecovery({ ctxRef }));

    act(() => result.current.scheduleBoundedForceRepaint(16));

    expect(ctx.coalescedForceRepaint).toHaveBeenCalledTimes(1);
    expect(global.requestAnimationFrame).not.toHaveBeenCalled();
  });

  it('keeps retrying while the GPU addon is unattached', () => {
    const ctx = createCtx();
    ctx.fitRef = { current: { proposeDimensions: () => ({ cols: 80, rows: 24 }) } };
    ctx.operationalRendererModeRef = { current: 'xterm-canvas' };
    ctx.canvasAddonRef = { current: null }; // reattach pending
    ctx.coalescedForceRepaint = jest.fn(() => false);
    const ctxRef = { current: ctx };
    const { result } = renderHook(() => useTerminalWorkspaceShowRecovery({ ctxRef }));

    act(() => result.current.scheduleBoundedForceRepaint(16));

    expect(ctx.coalescedForceRepaint).toHaveBeenCalledTimes(1);
    expect(global.requestAnimationFrame).toHaveBeenCalled();
  });
});
