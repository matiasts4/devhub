/**
 * @jest-environment jsdom
 *
 * Regression: layout-settled must call the imported refreshTerminalViewport.
 * viewportCtxRef does not carry that helper — destructuring it shadowed with undefined.
 */

const { renderHook, act, cleanup } = require('@testing-library/react');

const mockRefreshTerminalViewport = jest.fn(() => true);
const mockForceTerminalViewportRepaint = jest.fn(() => true);
const mockScheduleBurst = jest.fn(() => () => {});

jest.mock('../../TerminalTTY.helpers', () => {
  const actual = jest.requireActual('../../TerminalTTY.helpers');
  return {
    ...actual,
    refreshTerminalViewport: (...args) => mockRefreshTerminalViewport(...args),
    forceTerminalViewportRepaint: (...args) => mockForceTerminalViewportRepaint(...args),
    isTerminalRendererReady: () => true,
    scheduleTerminalViewportSyncBurst: (...args) => mockScheduleBurst(...args),
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

// pizarra-instant-enter A1 defers the pizarra-mode pass to requestAnimationFrame.
// Queue rAF manually so tests can flush deterministically (sync rAF stubs break
// the ref-clearing order inside the deferred callback).
let rafQueue = [];
let originalRaf;
let originalCancelRaf;

function flushRafQueue() {
  const pending = rafQueue;
  rafQueue = [];
  for (const cb of pending) cb(performance.now());
}

beforeEach(() => {
  rafQueue = [];
  originalRaf = window.requestAnimationFrame;
  originalCancelRaf = window.cancelAnimationFrame;
  window.requestAnimationFrame = (cb) => {
    rafQueue.push(cb);
    return rafQueue.length;
  };
  window.cancelAnimationFrame = (id) => {
    if (id >= 1 && id <= rafQueue.length) rafQueue[id - 1] = () => {};
  };
});

afterEach(() => {
  window.requestAnimationFrame = originalRaf;
  window.cancelAnimationFrame = originalCancelRaf;
});

describe('useTerminalLayoutChurnRecovery', () => {
  beforeEach(() => {
    mockRefreshTerminalViewport.mockClear();
    mockForceTerminalViewportRepaint.mockClear();
    mockScheduleBurst.mockClear();
  });

  // Hooks from earlier tests must not keep listening to window events — a stale
  // hook also fires on later dispatches and double-counts the burst scheduler.
  afterEach(() => {
    cleanup();
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
        flushRafQueue();
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
      flushRafQueue();
    });

    expect(mockRefreshTerminalViewport).toHaveBeenCalledWith(ctx.termRef.current);
    expect(mockForceTerminalViewportRepaint).toHaveBeenCalledWith(ctx.termRef.current);
  });
});

describe('layout-settled burst gating (sin-parpadeo fase 2)', () => {
  beforeEach(() => {
    mockRefreshTerminalViewport.mockClear();
    mockForceTerminalViewportRepaint.mockClear();
    mockScheduleBurst.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  function createBurstCtx(overrides = {}) {
    return createCtx({
      containerRef: { current: { getBoundingClientRect: () => ({ width: 800, height: 600 }) } },
      canvasAddonRef: { current: {} }, // xterm-canvas addon attached
      ...overrides,
    });
  }

  function dispatchLayoutSettled(reason) {
    act(() => {
      window.dispatchEvent(
        new CustomEvent('devhub:terminal-layout-settled', {
          detail: { reason, panelIds: ['p1'] },
        })
      );
    });
  }

  test('panel-closed burst is skipped entirely when dims match and the GPU addon is attached', () => {
    const ctx = createBurstCtx();
    const ctxRef = { current: ctx };
    renderHook(() => useTerminalLayoutChurnRecovery({ ctxRef, isEngineV2: false }));

    dispatchLayoutSettled('workspace-panel-closed');

    expect(mockScheduleBurst).not.toHaveBeenCalled();
    expect(ctx.syncTerminalViewportOnWorkspaceShow).not.toHaveBeenCalled();
    expect(ctx.logViewportDiagnostic).toHaveBeenCalledWith(
      'workspace-panel-closed-burst-skipped-no-change'
    );
  });

  test('panel-closed burst still schedules when the GPU addon is unattached (recovery wins)', () => {
    const ctx = createBurstCtx({ canvasAddonRef: { current: null } });
    const ctxRef = { current: ctx };
    renderHook(() => useTerminalLayoutChurnRecovery({ ctxRef, isEngineV2: false }));

    dispatchLayoutSettled('workspace-panel-closed');

    expect(mockScheduleBurst).toHaveBeenCalledTimes(1);
  });

  test('deferred phases re-check the gate and no-op once dims settle', () => {
    let runSync = null;
    mockScheduleBurst.mockImplementationOnce((fn) => {
      runSync = fn;
      return () => {};
    });
    // Gate fails initially: container proposes 60 cols vs term 80.
    const fitRef = { current: { proposeDimensions: () => ({ cols: 60, rows: 24 }) } };
    const ctx = createBurstCtx({ fitRef });
    const ctxRef = { current: ctx };
    renderHook(() => useTerminalLayoutChurnRecovery({ ctxRef, isEngineV2: false }));

    dispatchLayoutSettled('workspace-panel-closed');
    expect(mockScheduleBurst).toHaveBeenCalledTimes(1);

    act(() => runSync('immediate'));
    expect(ctx.syncTerminalViewportOnWorkspaceShow).toHaveBeenCalledTimes(1);
    expect(ctx.scheduleBoundedForceRepaint).toHaveBeenCalledTimes(1);

    // Container settles at the term's grid before the delayed phase fires.
    fitRef.current.proposeDimensions = () => ({ cols: 80, rows: 24 });
    act(() => runSync('delay-120'));

    expect(ctx.syncTerminalViewportOnWorkspaceShow).toHaveBeenCalledTimes(1);
    expect(ctx.scheduleBoundedForceRepaint).toHaveBeenCalledTimes(1);
    expect(ctx.logViewportDiagnostic).toHaveBeenCalledWith(
      'workspace-panel-closed-burst-phase-skipped-no-change',
      { phase: 'delay-120' }
    );
  });

  test('burst still runs every phase while dims never settle (recovery ladder intact)', () => {
    let runSync = null;
    mockScheduleBurst.mockImplementationOnce((fn) => {
      runSync = fn;
      return () => {};
    });
    const ctx = createBurstCtx({
      fitRef: { current: { proposeDimensions: () => ({ cols: 60, rows: 24 }) } },
    });
    const ctxRef = { current: ctx };
    renderHook(() => useTerminalLayoutChurnRecovery({ ctxRef, isEngineV2: false }));

    dispatchLayoutSettled('workspace-panel-closed');
    act(() => runSync('immediate'));
    act(() => runSync('raf'));
    act(() => runSync('delay-120'));

    expect(ctx.syncTerminalViewportOnWorkspaceShow).toHaveBeenCalledTimes(3);
    expect(ctx.scheduleBoundedGpuRecover).toHaveBeenCalledTimes(3);
  });
});

describe('survivor-recover gating (sin-parpadeo fase 3)', () => {
  beforeEach(() => {
    mockRefreshTerminalViewport.mockClear();
    mockForceTerminalViewportRepaint.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  function createSurvivorCtx(overrides = {}) {
    return createCtx({
      containerRef: { current: { getBoundingClientRect: () => ({ width: 800, height: 600 }) } },
      canvasAddonRef: { current: {} },
      ...overrides,
    });
  }

  function dispatchSurvivorRecover(reason) {
    act(() => {
      window.dispatchEvent(
        new CustomEvent('devhub:terminal-survivor-recover', {
          detail: { reason, panelIds: ['p1'] },
        })
      );
    });
  }

  test('skips the soft reveal when the survivor is verified clean (storm no-ops)', () => {
    const ctx = createSurvivorCtx();
    const ctxRef = { current: ctx };
    renderHook(() => useTerminalLayoutChurnRecovery({ ctxRef, isEngineV2: false }));

    dispatchSurvivorRecover('workspace-removed');

    expect(ctx.fitTerminalViewport).not.toHaveBeenCalled();
    expect(ctx.coalescedForceRepaint).not.toHaveBeenCalled();
    expect(ctx.logViewportDiagnostic).toHaveBeenCalledWith(
      'workspace-removed-recover-skipped-verified-clean'
    );
  });

  test('recovers when dims shifted after the close (gate fails open)', () => {
    const ctx = createSurvivorCtx({
      fitRef: { current: { proposeDimensions: () => ({ cols: 60, rows: 24 }) } },
    });
    const ctxRef = { current: ctx };
    renderHook(() => useTerminalLayoutChurnRecovery({ ctxRef, isEngineV2: false }));

    dispatchSurvivorRecover('workspace-removed');

    expect(ctx.fitTerminalViewport).toHaveBeenCalled();
  });

  test('recovers when the GPU addon is unattached', () => {
    const ctx = createSurvivorCtx({ canvasAddonRef: { current: null } });
    const ctxRef = { current: ctx };
    renderHook(() => useTerminalLayoutChurnRecovery({ ctxRef, isEngineV2: false }));

    dispatchSurvivorRecover('workspace-removed');

    expect(ctx.fitTerminalViewport).toHaveBeenCalled();
  });
});

describe('pizarra transition gating (sin-parpadeo fase 4)', () => {
  beforeEach(() => {
    mockRefreshTerminalViewport.mockClear();
    mockForceTerminalViewportRepaint.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  test('pizarra exit skips sync+repaint on a verified-clean keep-alive sibling', () => {
    const ctx = createCtx({
      containerRef: { current: { getBoundingClientRect: () => ({ width: 800, height: 600 }) } },
      canvasAddonRef: { current: {} },
      viewportFitConfirmedRef: { current: true },
    });
    const ctxRef = { current: ctx };
    renderHook(() => useTerminalLayoutChurnRecovery({ ctxRef, isEngineV2: false }));

    act(() => {
      window.dispatchEvent(
        new CustomEvent('devhub:terminal-layout-settled', {
          detail: { reason: 'pizarra-mode-exit' },
        })
      );
      flushRafQueue();
    });

    expect(ctx.syncTerminalViewportOnWorkspaceShow).not.toHaveBeenCalled();
    expect(ctx.coalescedForceRepaint).not.toHaveBeenCalled();
    // A2: no safety-net retries on the verified-clean skip path.
    expect(ctx.scheduleBoundedForceRepaint).not.toHaveBeenCalled();
    expect(ctx.logViewportDiagnostic).toHaveBeenCalledWith(
      'pizarra-mode-exit-skipped-verified-clean'
    );
  });

  test('pizarra exit keeps the full path on a fresh re-targeted instance', () => {
    const ctx = createCtx({
      containerRef: { current: { getBoundingClientRect: () => ({ width: 800, height: 600 }) } },
      canvasAddonRef: { current: {} },
      viewportFitConfirmedRef: { current: false },
    });
    const ctxRef = { current: ctx };
    renderHook(() => useTerminalLayoutChurnRecovery({ ctxRef, isEngineV2: false }));

    act(() => {
      window.dispatchEvent(
        new CustomEvent('devhub:terminal-layout-settled', {
          detail: { reason: 'pizarra-mode-exit' },
        })
      );
      flushRafQueue();
    });

    expect(ctx.syncTerminalViewportOnWorkspaceShow).toHaveBeenCalledWith(
      'layout-settled-pizarra-mode-exit-immediate',
      expect.objectContaining({ clearAtlas: false })
    );
    // A2: the full path arms the verified-stop retry so a repaint lost to an
    // async GPU reattach still lands without user interaction.
    expect(ctx.scheduleBoundedForceRepaint).toHaveBeenCalledTimes(1);
  });
});

describe('pizarra transition coalescing (pizarra-instant-enter A1)', () => {
  afterEach(() => {
    cleanup();
  });

  function dispatchPizarra(reason) {
    window.dispatchEvent(
      new CustomEvent('devhub:terminal-layout-settled', {
        detail: { reason, panelIds: ['p1'] },
      })
    );
  }

  test('collapses the enter storm (broadcast + portal immediate + portal rAF) into one pass', () => {
    const ctx = createCtx();
    const ctxRef = { current: ctx };
    renderHook(() => useTerminalLayoutChurnRecovery({ ctxRef, isEngineV2: false }));

    act(() => {
      dispatchPizarra('pizarra-mode-enter');
      dispatchPizarra('pizarra-mode-enter');
      dispatchPizarra('pizarra-mode-exit'); // latest wins if a fast exit lands
      expect(rafQueue).toHaveLength(1); // absorbed, not re-scheduled
      flushRafQueue();
    });

    expect(ctx.syncTerminalViewportOnWorkspaceShow).toHaveBeenCalledTimes(1);
    expect(ctx.syncTerminalViewportOnWorkspaceShow).toHaveBeenCalledWith(
      'layout-settled-pizarra-mode-exit-immediate',
      expect.objectContaining({ clearAtlas: false })
    );
    expect(ctx.coalescedForceRepaint).toHaveBeenCalledTimes(1);
  });

  test('runs one pass per frame across frames (not blocked after flush)', () => {
    const ctx = createCtx();
    const ctxRef = { current: ctx };
    renderHook(() => useTerminalLayoutChurnRecovery({ ctxRef, isEngineV2: false }));

    act(() => {
      dispatchPizarra('pizarra-mode-enter');
      flushRafQueue();
    });
    act(() => {
      dispatchPizarra('pizarra-mode-enter');
      flushRafQueue();
    });

    expect(ctx.syncTerminalViewportOnWorkspaceShow).toHaveBeenCalledTimes(2);
  });

  test('hidden terminal only marks churn flags (deferred pass else-branch)', () => {
    const ctx = createCtx({ isVisibleInLayoutRef: { current: false } });
    const ctxRef = { current: ctx };
    renderHook(() => useTerminalLayoutChurnRecovery({ ctxRef, isEngineV2: false }));

    act(() => {
      dispatchPizarra('pizarra-mode-enter');
      flushRafQueue();
    });

    expect(ctx.needsViewportSyncOnShowRef.current).toBe(true);
    expect(ctx.layoutChurnedWhileHiddenRef.current).toBe(true);
    expect(ctx.syncTerminalViewportOnWorkspaceShow).not.toHaveBeenCalled();
    expect(ctx.scheduleBoundedForceRepaint).not.toHaveBeenCalled();
  });
});
