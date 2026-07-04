/**
 * Guard tests for useTerminalEngine — dispose/boot surface.
 */

const React = require('react');
const { installDom } = require('@/test-support/domHarness');
const { renderHook } = require('@testing-library/react');

const useTerminalEngine = require('../useTerminalEngine').default;

function createCtx() {
  return {
    id: 'panel-1',
    isDisposingRef: { current: false },
    connectEpochRef: { current: 0 },
    panelActivityTrackerRef: { current: null },
    connectAbortRef: { current: null },
    requestedRendererModeRef: { current: 'xterm-webgl' },
    isVisibleInLayoutRef: { current: true },
    termRef: { current: null },
    resizeObserverRef: { current: null },
    clearTimers: jest.fn(),
    clearConnectDeferTimer: jest.fn(),
    clearOutputQueue: jest.fn(),
    wsRef: { current: null },
    isEngineV2Ref: { current: false },
    serializeAddonRef: { current: null },
    currentPtyOffsetRef: { current: 0 },
    terminalBlurCleanupRef: { current: null },
    webglAddonRef: { current: null },
    canvasAddonRef: { current: null },
    fitRef: { current: null },
    searchRef: { current: null },
    containerRef: { current: null },
    outputPendingRef: { current: { value: '' } },
    hiddenOutputBufferRef: { current: { value: '' } },
    hiddenOutputCatchupPendingRef: { current: false },
    connectPendingUntilFitRef: { current: false },
    connectDeferTimerRef: { current: null },
    surfaceHostRef: { current: 'workspace' },
    lastPtySizeRef: { current: { cols: 0, rows: 0 } },
    shouldBootXterm: false,
    runtimePhase: 'fallback-xterm',
    setInitError: jest.fn(),
    setIsInitializing: jest.fn(),
    setConnectionState: jest.fn(),
    waitForVisibleDimensions: jest.fn(async () => true),
    maybeConnectAfterViewportFit: jest.fn(),
    coalescedSoftGpuVisibilityReveal: jest.fn(),
    scheduleInactiveViewportRepaint: jest.fn(),
    logViewportDiagnostic: jest.fn(),
    disposeXtermRuntime: jest.fn(),
    reconnect: jest.fn(),
    hasSentInitialCommand: { current: false },
    nativeResizeObserverRef: { current: null },
    nativeResizeRafRef: { current: null },
    transportRef: { current: 'json' },
  };
}

const defaultHookProps = {
  requestedRendererMode: 'xterm-webgl',
  runtimePhase: 'fallback-xterm',
  shouldBootXterm: false,
  xtermBootNonce: 0,
  coldMountOrdinal: 0,
  id: 'panel-1',
  initialCommand: '',
};

describe('useTerminalEngine', () => {
  beforeAll(() => {
    installDom();
  });

  it('returns disposeXtermRuntime', () => {
    const ctxRef = { current: createCtx() };
    const { result } = renderHook(() => useTerminalEngine({ ctxRef, ...defaultHookProps }));
    expect(typeof result.current.disposeXtermRuntime).toBe('function');
  });

  it('disposeXtermRuntime is a no-op when already disposing', () => {
    const ctx = createCtx();
    ctx.isDisposingRef.current = true;
    const ctxRef = { current: ctx };
    const { result } = renderHook(() =>
      useTerminalEngine({ ctxRef, ...defaultHookProps, shouldBootXterm: true })
    );
    result.current.disposeXtermRuntime();
    expect(ctx.connectEpochRef.current).toBe(0);
  });
});
