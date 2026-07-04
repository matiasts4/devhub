/**
 * Guard tests for useTerminalRendererController — WebGL context-loss fallback.
 */

const React = require('react');
const { installDom } = require('@/test-support/domHarness');
const { renderHook, act } = require('@testing-library/react');

const useTerminalRendererController = require('../useTerminalRendererController').default;

function createCtx(overrides = {}) {
  const term = { cols: 80, rows: 24, refresh: jest.fn() };
  return {
    id: 'panel-1',
    initialCommand: null,
    termRef: { current: term },
    fitRef: { current: { fit: jest.fn() } },
    containerRef: { current: { getBoundingClientRect: () => ({ width: 400, height: 300 }) } },
    wsRef: { current: null },
    webglAddonRef: { current: { dispose: jest.fn() } },
    canvasAddonRef: { current: null },
    webglFallbackRef: { current: null },
    pendingWebglRecoveryRef: { current: false },
    webglReleasedOnLayoutHideRef: { current: false },
    canvasReleasedOnLayoutHideRef: { current: false },
    webglRecoveryTimerRef: { current: null },
    isEngineV2Ref: { current: true },
    isVisibleInLayoutRef: { current: true },
    isActivePanelRef: { current: true },
    operationalRendererModeRef: { current: 'xterm-webgl' },
    visibleTerminalPanelCountRef: { current: 1 },
    lastPtySizeRef: { current: { cols: 80, rows: 24 } },
    tuiSessionActiveRef: { current: false },
    kimiReadyNotifiedRef: { current: false },
    hasConnectedOnceRef: { current: true },
    handleWebglContextLossRef: { current: null },
    setWebglFallback: jest.fn(),
    buildViewportSnapshot: jest.fn(() => ({})),
    scheduleInactiveViewportRepaint: jest.fn(),
    scheduleBoundedGpuRecoverRef: { current: null },
    scheduleBoundedFitRepaintRef: { current: null },
    scheduleWorkspaceShowRecoveryRef: { current: null },
    ...overrides,
  };
}

describe('useTerminalRendererController', () => {
  beforeAll(() => {
    installDom();
  });

  it('exposes attach/detach/context-loss aliases', () => {
    const ctxRef = { current: createCtx() };
    const { result } = renderHook(() => useTerminalRendererController({ ctxRef }));
    expect(result.current.attachRenderer).toBe(result.current.tryReattachWebglAddon);
    expect(result.current.handleContextLoss).toBe(result.current.handleWebglContextLoss);
  });

  it('disposeWebglAddonForContextLoss clears webgl ref and marks recovery pending', () => {
    const ctx = createCtx();
    const ctxRef = { current: ctx };
    const { result } = renderHook(() => useTerminalRendererController({ ctxRef }));

    act(() => {
      const ok = result.current.disposeWebglAddonForContextLoss('test-loss');
      expect(ok).toBe(true);
    });

    expect(ctx.webglAddonRef.current).toBeNull();
    expect(ctx.pendingWebglRecoveryRef.current).toBe(true);
    expect(ctx.webglReleasedOnLayoutHideRef.current).toBe(true);
  });

  it('v2 handleWebglContextLoss sets ref-only fallback without recovery timers', () => {
    const ctx = createCtx({ isEngineV2Ref: { current: true } });
    const ctxRef = { current: ctx };
    const { result } = renderHook(() => useTerminalRendererController({ ctxRef }));

    act(() => {
      result.current.handleWebglContextLoss();
    });

    expect(ctx.webglFallbackRef.current?.active).toBe(true);
    expect(ctx.setWebglFallback).not.toHaveBeenCalled();
    expect(ctx.pendingWebglRecoveryRef.current).toBe(false);
  });
});
