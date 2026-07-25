/**
 * @jest-environment jsdom
 *
 * Regression: layout-settled must call the imported refreshTerminalViewport.
 * viewportCtxRef does not carry that helper — destructuring it shadowed with undefined.
 */

const React = require('react');
const { renderHook, act } = require('@testing-library/react');

const mockRefreshTerminalViewport = jest.fn(() => true);
const mockForceTerminalViewportRepaint = jest.fn(() => true);

jest.mock('../../TerminalTTY.helpers', () => {
  const actual = jest.requireActual('../../TerminalTTY.helpers');
  return {
    ...actual,
    refreshTerminalViewport: (...args) => mockRefreshTerminalViewport(...args),
    forceTerminalViewportRepaint: (...args) => mockForceTerminalViewportRepaint(...args),
    isTerminalRendererReady: () => true,
    scheduleTerminalViewportSyncBurst: () => () => {},
  };
});

const useTerminalLayoutChurnRecovery = require('../useTerminalLayoutChurnRecovery').default;

function createCtx(overrides = {}) {
  const term = {
    cols: 80,
    rows: 24,
    refresh: jest.fn(),
    resize: jest.fn(),
  };
  return {
    id: 'p1',
    initialCommand: null,
    isDisposingRef: { current: false },
    termRef: { current: term },
    fitRef: { current: { proposeDimensions: () => ({ cols: 80, rows: 24 }) } },
    isEngineV2Ref: { current: false },
    isVisibleInLayoutRef: { current: true },
    projectionReadyRef: { current: false },
    hasSentInitialCommand: { current: true },
    sendInitialCommandIfReady: jest.fn(),
    containerRef: { current: { clientWidth: 800, clientHeight: 600 } },
    wsRef: { current: null },
    lastPtySizeRef: { current: { cols: 80, rows: 24 } },
    tuiSessionActiveRef: { current: false },
    kimiReadyNotifiedRef: { current: false },
    hasConnectedOnceRef: { current: true },
    operationalRendererModeRef: { current: 'xterm-canvas' },
    pendingWebglRecoveryRef: { current: false },
    webglReleasedOnLayoutHideRef: { current: false },
    canvasReleasedOnLayoutHideRef: { current: false },
    canvasAddonRef: { current: null },
    webglAddonRef: { current: null },
    needsViewportSyncOnShowRef: { current: false },
    layoutChurnedWhileHiddenRef: { current: false },
    tryReattachCanvasAddonRef: { current: jest.fn() },
    fitTerminalViewport: jest.fn(() => true),
    maybeConnectAfterViewportFit: jest.fn(),
    logViewportDiagnostic: jest.fn(),
    syncTerminalViewportOnWorkspaceShow: jest.fn(),
    disposeWebglAddonForContextLoss: jest.fn(),
    stabilizeTerminalRenderer: jest.fn(),
    nudgeTerminalPtyResize: jest.fn(),
    scheduleWorkspaceShowRecovery: jest.fn(),
    scheduleBoundedForceRepaint: jest.fn(),
    scheduleBoundedFitRepaint: jest.fn(),
    scheduleBoundedGpuRecover: jest.fn(),
    scrollTerminalToBottom: jest.fn(),
    windowSwitchTuiRecoverAtRef: { current: 0 },
    survivorGpuRecycleAtRef: { current: 0 },
    syncTerminalViewportOnWorkspaceShowRef: { current: jest.fn() },
    coalescedForceRepaint: jest.fn(),
    ...overrides,
  };
}

describe('useTerminalLayoutChurnRecovery', () => {
  beforeEach(() => {
    mockRefreshTerminalViewport.mockClear();
    mockForceTerminalViewportRepaint.mockClear();
  });

  test('layout-settled pizarra exit uses imported refresh (ctx has no refreshTerminalViewport)', () => {
    const ctx = createCtx();
    expect(ctx.refreshTerminalViewport).toBeUndefined();
    const ctxRef = { current: ctx };

    renderHook(() => useTerminalLayoutChurnRecovery({ ctxRef, isEngineV2: false }));

    expect(() => {
      act(() => {
        window.dispatchEvent(
          new CustomEvent('devhub:terminal-layout-settled', {
            detail: { reason: 'pizarra-mode-exit', panelIds: ['p1'] },
          })
        );
      });
    }).not.toThrow();

    expect(mockRefreshTerminalViewport).toHaveBeenCalledWith(ctx.termRef.current);
    // The pizarra path now prefers the ctx's coalescedForceRepaint so the 1-cell
    // nudge collapses with the sync pass's own repaint (no double resize flicker).
    // The imported raw forceTerminalViewportRepaint is only a fallback when the
    // ctx does not provide a coalesced variant.
    expect(ctx.coalescedForceRepaint).toHaveBeenCalledWith(
      ctx.termRef.current,
      expect.objectContaining({ reason: expect.stringContaining('pizarra-mode-transition') })
    );
    expect(mockForceTerminalViewportRepaint).not.toHaveBeenCalled();
  });

  test('pizarra exit falls back to imported force repaint when ctx lacks coalescedForceRepaint', () => {
    const ctx = createCtx({ coalescedForceRepaint: undefined });
    const ctxRef = { current: ctx };

    renderHook(() => useTerminalLayoutChurnRecovery({ ctxRef, isEngineV2: false }));

    act(() => {
      window.dispatchEvent(
        new CustomEvent('devhub:terminal-layout-settled', {
          detail: { reason: 'pizarra-mode-exit', panelIds: ['p1'] },
        })
      );
    });

    expect(mockRefreshTerminalViewport).toHaveBeenCalledWith(ctx.termRef.current);
    expect(mockForceTerminalViewportRepaint).toHaveBeenCalledWith(ctx.termRef.current);
  });
});
