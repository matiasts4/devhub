/**
 * Guard tests for OS-resume transport recovery in useTerminalWindowEventRouter.
 * Viewport/WebGL paths are not re-tested here — only that resume may call reconnect.
 */

const { installDom } = require('@/test-support/domHarness');
const { renderHook, act } = require('@testing-library/react');

const useTerminalWindowEventRouter = require('../useTerminalWindowEventRouter').default;

function createCtx(overrides = {}) {
  const reconnect = jest.fn();
  return {
    requestedRendererModeRef: { current: 'xterm' },
    isVisibleInLayoutRef: { current: true },
    nativeLeaseRef: { current: null },
    showAndResizeNativeLease: jest.fn(),
    queueNativeVteProbeRetry: jest.fn(),
    operationalRendererModeRef: { current: 'xterm' },
    webglAddonRef: { current: null },
    disposeWebglAddonForContextLoss: jest.fn(),
    syncTerminalViewportOnWorkspaceShowRef: {
      current: jest.fn(() => Promise.resolve()),
    },
    needsViewportSyncOnShowRef: { current: false },
    isDisposingRef: { current: false },
    termRef: { current: { focus: jest.fn() } },
    tuiSessionActiveRef: { current: false },
    scheduleInactiveViewportRepaint: jest.fn(),
    sendResize: jest.fn(),
    fitAndResize: jest.fn(),
    reactivateCoalesceTimerRef: { current: null },
    logViewportDiagnostic: jest.fn(),
    reconnect,
    connectionStateRef: { current: 'disconnected' },
    wsRef: { current: { readyState: 3 } },
    hasConnectedOnceRef: { current: true },
    sessionClosingRef: { current: false },
    initErrorRef: { current: null },
    osResumeReconnectTimerRef: { current: null },
    lastOsResumeReconnectAtRef: { current: 0 },
    ...overrides,
  };
}

describe('useTerminalWindowEventRouter OS resume reconnect', () => {
  beforeAll(() => {
    installDom();
  });

  beforeEach(() => {
    jest.useFakeTimers();
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('visibilitychange → visible reconnects a disconnected visible panel', () => {
    const bag = createCtx();
    const ctxRef = { current: bag };

    renderHook(() =>
      useTerminalWindowEventRouter({
        ctxRef,
        isActivePanel: true,
        isVisibleInLayout: true,
        id: 'blake',
        autoFocus: true,
      })
    );

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
      jest.advanceTimersByTime(200);
    });

    expect(bag.reconnect).toHaveBeenCalledTimes(1);
  });

  test('split sibling (inactive, visible) also reconnects on window focus', () => {
    const bag = createCtx({
      connectionStateRef: { current: 'disconnected' },
    });
    const ctxRef = { current: bag };

    renderHook(() =>
      useTerminalWindowEventRouter({
        ctxRef,
        isActivePanel: false,
        isVisibleInLayout: true,
        id: 'casey',
        autoFocus: false,
      })
    );

    act(() => {
      window.dispatchEvent(new Event('focus'));
      jest.advanceTimersByTime(200);
    });

    expect(bag.reconnect).toHaveBeenCalledTimes(1);
  });

  test('hidden layout panel does not reconnect on pageshow', () => {
    const bag = createCtx({
      isVisibleInLayoutRef: { current: false },
      connectionStateRef: { current: 'disconnected' },
    });
    const ctxRef = { current: bag };

    renderHook(() =>
      useTerminalWindowEventRouter({
        ctxRef,
        isActivePanel: false,
        isVisibleInLayout: false,
        id: 'hidden',
        autoFocus: false,
      })
    );

    act(() => {
      window.dispatchEvent(new Event('pageshow'));
      jest.advanceTimersByTime(200);
    });

    expect(bag.reconnect).not.toHaveBeenCalled();
  });

  test('healthy connected OPEN socket does not reconnect on resume', () => {
    const bag = createCtx({
      connectionStateRef: { current: 'connected' },
      wsRef: { current: { readyState: 1 } },
    });
    const ctxRef = { current: bag };

    renderHook(() =>
      useTerminalWindowEventRouter({
        ctxRef,
        isActivePanel: true,
        isVisibleInLayout: true,
        id: 'ok',
        autoFocus: true,
      })
    );

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('focus'));
      jest.advanceTimersByTime(200);
    });

    expect(bag.reconnect).not.toHaveBeenCalled();
  });

  test('coalesces visibility+focus storms into a single reconnect', () => {
    const bag = createCtx();
    const ctxRef = { current: bag };

    renderHook(() =>
      useTerminalWindowEventRouter({
        ctxRef,
        isActivePanel: true,
        isVisibleInLayout: true,
        id: 'storm',
        autoFocus: true,
      })
    );

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('focus'));
      window.dispatchEvent(new Event('pageshow'));
      jest.advanceTimersByTime(200);
    });

    expect(bag.reconnect).toHaveBeenCalledTimes(1);
  });
});
