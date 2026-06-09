const React = require('react');
const { createRoot } = require('react-dom/client');
const { flushSync } = require('react-dom');
const { JSDOM } = require('jsdom');

const mockTerminalInstances = [];
const mountedRoots = [];
const mockWebSocketInstances = [];
const mockResizeObserverInstances = [];

const mockNativeVteBridge = {
  closeNativeVtePanel: jest.fn(),
  focusNativeVtePanel: jest.fn(),
  getCachedNativeVteProbeResult: jest.fn(() => null),
  isNativeVteRuntimeAvailable: jest.fn(() => false),
  openNativeVtePanel: jest.fn(async () => ({ opened: false, reason: 'tauri-unavailable' })),
  pasteNativeVtePanel: jest.fn(async () => ({ supported: false, reason: 'tauri-unavailable' })),
  probeNativeVte: jest.fn(async () => ({ ready: false, reason: 'tauri-unavailable' })),
  resetNativeVteProbeCache: jest.fn(),
  resizeNativeVtePanel: jest.fn(),
  setNativeVtePanelVisibility: jest.fn(),
  subscribeNativeVteEvents: jest.fn(() => jest.fn()),
  warmNativeVteProbe: jest.fn(async () => ({ ready: false, reason: 'tauri-unavailable' })),
};

jest.mock('framer-motion', () => ({
  motion: {
    div: (() => {
      const mockReact = require('react');
      return mockReact.forwardRef(({ children, ...props }, ref) =>
        mockReact.createElement('div', { ...props, ref }, children)
      );
    })(),
  },
}));

jest.mock('lucide-react', () => {
  const icon = (name) => (props) => {
    const mockReact = require('react');
    return mockReact.createElement('svg', { ...props, 'data-icon': name });
  };
  return new Proxy({}, { get: (_, key) => icon(String(key)) });
});

jest.mock(
  'xterm',
  () => ({
    Terminal: jest.fn().mockImplementation(() => {
      const instance = {
        rows: 24,
        cols: 80,
        loadAddon: jest.fn(),
        open: jest.fn(),
        onData: jest.fn(),
        focus: jest.fn(),
        write: jest.fn(),
        writeln: jest.fn(),
        paste: jest.fn(),
        refresh: jest.fn(),
        clearTextureAtlas: jest.fn(),
        dispose: jest.fn(),
        getSelection: jest.fn(() => ''),
        clear: jest.fn(),
        scrollToLine: jest.fn(),
      };
      mockTerminalInstances.push(instance);
      return instance;
    }),
  }),
  { virtual: true }
);

jest.mock(
  'xterm-addon-fit',
  () => ({
    FitAddon: jest.fn().mockImplementation(() => ({ fit: jest.fn() })),
  }),
  { virtual: true }
);

jest.mock(
  'xterm-addon-search',
  () => ({
    SearchAddon: jest.fn().mockImplementation(() => ({
      findNext: jest.fn(),
      findPrevious: jest.fn(),
    })),
  }),
  { virtual: true }
);

jest.mock('@/lib/terminal/nativeVteBridge', () => mockNativeVteBridge, { virtual: true });

/**
 * TerminalTTY unit tests — terminal-ux-redesign
 *
 * Per Extract-Before-Mock rule, we test pure functions extracted from TerminalTTY.
 *
 * Spec requirements:
 * - xterm container wraps with fade-in animation (opacity 0→1, 150ms)
 * - No inline hex colors override CSS var–derived theme
 *
 * We test the exported pure helper `getXtermContainerAnimProps(connected)`.
 */

const TerminalTTYModule = require('../TerminalTTY.jsx');
const TerminalTTY = TerminalTTYModule.default;

const {
  buildTerminalViewportDiagnosticPayload,
  getNativeTerminalBounds,
  createTerminalViewportDiagnosticLogger,
  fitTerminalViewport,
  proposeTerminalViewportDimensions,
  getTerminalRendererRecoveryActionLabel,
  getTerminalRendererStatusCopy,
  getXtermContainerAnimProps,
  refreshTerminalViewport,
  resolveTerminalRuntimePhase,
  resolveTerminalConnectionCloseState,
  resolveTerminalRendererViewModel,
  shouldShowTerminalStatusOverlay,
  shouldLogTerminalViewportDiagnostic,
  shouldOpenNativeVtePanel,
  shouldRunTerminalViewportReactivation,
  shouldRunPanelClickViewportRecovery,
  shouldRecoverPanelOnActivation,
  shouldClearWebglAtlasOnPanelActivation,
  shouldAttachWebglRenderer,
  shouldAttachCanvasRenderer,
  shouldRefitVisibleInactiveSplitPanel,
  sendTerminalPasteInput,
  scheduleTerminalViewportSyncBurst,
  shouldSyncTerminalViewportOnLayoutShow,
  shouldShowTerminalLoadingOverlay,
  shouldShowTerminalViewport,
  shouldAutoReconnectTerminal,
  shouldReinitializeTerminalForRenderer,
  shouldBlockTerminalViewportForWebglFallback,
  resolveTerminalFontFamily,
  isTerminalViewportNearBottom,
  getTerminalViewportScrollOffset,
  restoreTerminalViewportScroll,
  shouldUseTerminalScrollbackWheel,
  resolveTerminalWheelScrollDirection,
  resolveTerminalWheelPageSteps,
  buildTerminalWheelPageSequence,
  isTerminalTranscriptCell,
  resolveTerminalCellFromPointer,
  shouldRouteWheelToTranscript,
  TERMINAL_PAGE_UP_SEQ,
  TERMINAL_PAGE_DOWN_SEQ,
  stabilizeTerminalRenderer,
  TERMINAL_NATIVE_CONTENT_BODY_STYLE,
  TERMINAL_VIEWPORT_SHELL_STYLE,
} = TerminalTTYModule;

function installTerminalDom() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://devhub.test',
  });

  global.window = dom.window;
  global.document = dom.window.document;
  global.navigator = dom.window.navigator;
  global.CustomEvent = dom.window.CustomEvent;
  global.HTMLElement = dom.window.HTMLElement;
  global.Node = dom.window.Node;
  global.Event = dom.window.Event;
  global.MouseEvent = dom.window.MouseEvent;
  global.localStorage = dom.window.localStorage;
  global.requestAnimationFrame = (callback) => setTimeout(() => callback(Date.now()), 0);
  global.cancelAnimationFrame = (id) => clearTimeout(id);
  global.ResizeObserver = class {
    constructor(callback) {
      this.callback = callback;
      this.observe = jest.fn();
      this.disconnect = jest.fn();
      mockResizeObserverInstances.push(this);
    }
  };

  Object.defineProperty(global.HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value() {
      return { width: 1280, height: 720, top: 0, left: 0, right: 1280, bottom: 720 };
    },
  });

  return dom;
}

async function flushTerminalEffects() {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function renderIntoDom(element) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.push({ root, container });

  flushSync(() => {
    root.render(element);
  });
  await flushTerminalEffects();

  return { container, root };
}

async function rerenderIntoRoot(root, element) {
  flushSync(() => {
    root.render(element);
  });
  await flushTerminalEffects();
}

function cleanupMountedRoots() {
  while (mountedRoots.length > 0) {
    const { root, container } = mountedRoots.pop();
    flushSync(() => {
      root.unmount();
    });
    container.remove();
  }
}

function installTerminalRuntimeMocks() {
  global.fetch = jest.fn(async (url) => {
    if (String(url).startsWith('/api/terminal/session')) {
      return {
        ok: true,
        json: async () => ({ port: 4020, wsPath: '/ws' }),
      };
    }

    if (String(url) === '/api/terminal/log') {
      return {
        ok: true,
        json: async () => ({}),
        text: async () => '',
      };
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  });

  class MockWebSocket {
    static CONNECTING = 0;

    static OPEN = 1;

    static CLOSING = 2;

    static CLOSED = 3;

    constructor(url) {
      this.url = url;
      this.readyState = MockWebSocket.CONNECTING;
      this.send = jest.fn();
      this.close = jest.fn(() => {
        this.readyState = MockWebSocket.CLOSED;
      });
      this.onopen = null;
      this.onmessage = null;
      this.onerror = null;
      this.onclose = null;
      mockWebSocketInstances.push(this);

      setTimeout(() => {
        this.readyState = MockWebSocket.OPEN;
        this.onopen?.();
      }, 0);
    }
  }

  global.WebSocket = MockWebSocket;
  window.WebSocket = MockWebSocket;
}

describe('getXtermContainerAnimProps()', () => {
  test('does not re-fade from opacity 0 on every visibility toggle', () => {
    expect(getXtermContainerAnimProps(true).initial).toBe(false);
    expect(getXtermContainerAnimProps(false).initial).toBe(false);
  });

  test('returns opacity 1 as animate when visible=true', () => {
    const props = getXtermContainerAnimProps(true);
    expect(props.animate.opacity).toBe(1);
  });

  test('transition duration is 0.1s (ease-out)', () => {
    const props = getXtermContainerAnimProps(true);
    expect(props.transition.duration).toBe(0.1);
    expect(props.transition.ease).toBe('easeOut');
  });

  test('when visible=false, animate keeps opacity 0', () => {
    const props = getXtermContainerAnimProps(false);
    expect(props.animate.opacity).toBe(0);
  });
});

describe('shouldShowTerminalLoadingOverlay()', () => {
  test('blocks only during first init or first connect', () => {
    expect(shouldShowTerminalLoadingOverlay(true, 'idle', false)).toBe(true);
    expect(shouldShowTerminalLoadingOverlay(false, 'connecting', false)).toBe(true);
    expect(shouldShowTerminalLoadingOverlay(false, 'connecting', true)).toBe(false);
    expect(shouldShowTerminalLoadingOverlay(false, 'connected', true)).toBe(false);
  });
});

describe('shouldShowTerminalViewport()', () => {
  test('shows the viewport once initialization finishes without init error', () => {
    expect(shouldShowTerminalViewport(false, null)).toBe(true);
  });

  test('keeps the viewport hidden while initializing or after init failure', () => {
    expect(shouldShowTerminalViewport(true, null)).toBe(false);
    expect(shouldShowTerminalViewport(false, 'boom')).toBe(false);
  });
});

describe('resolveTerminalFontFamily()', () => {
  test('prefers the configured mono CSS variable when available', () => {
    installTerminalDom();
    document.documentElement.style.setProperty(
      '--font-family-mono',
      "'Fira Code', 'Liberation Mono', monospace"
    );

    expect(resolveTerminalFontFamily()).toBe("'Fira Code', 'Liberation Mono', monospace");
  });

  test('falls back to a stable system monospace stack when no CSS variable is set', () => {
    installTerminalDom();
    document.documentElement.style.removeProperty('--font-family-mono');

    expect(resolveTerminalFontFamily()).toBe(
      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace"
    );
  });
});

describe('shouldShowTerminalStatusOverlay()', () => {
  test('shows overlay for terminated sessions after initialization', () => {
    expect(shouldShowTerminalStatusOverlay(false, null, 'terminated')).toBe(true);
  });

  test('shows overlay for init errors and recoverable connection failures', () => {
    expect(shouldShowTerminalStatusOverlay(false, 'falló init', 'idle')).toBe(true);
    expect(shouldShowTerminalStatusOverlay(false, null, 'error')).toBe(true);
    expect(shouldShowTerminalStatusOverlay(false, null, 'disconnected')).toBe(true);
  });

  test('does not show overlay while initializing or when connected', () => {
    expect(shouldShowTerminalStatusOverlay(true, null, 'connecting')).toBe(false);
    expect(shouldShowTerminalStatusOverlay(false, null, 'connected')).toBe(false);
  });

  test('shows suspended overlay even while initializing (native VTE probe)', () => {
    expect(shouldShowTerminalStatusOverlay(true, null, 'suspended')).toBe(true);
  });
});

describe('refreshTerminalViewport()', () => {
  test('refreshes every visible row when the terminal has a rendered buffer', () => {
    const term = {
      rows: 24,
      refresh: jest.fn(),
    };

    expect(refreshTerminalViewport(term)).toBe(true);
    expect(term.refresh).toHaveBeenCalledWith(0, 23);
  });

  test('skips repaint when the terminal has no visible rows yet', () => {
    const term = {
      rows: 0,
      refresh: jest.fn(),
    };

    expect(refreshTerminalViewport(term)).toBe(false);
    expect(term.refresh).not.toHaveBeenCalled();
  });
});

describe('proposeTerminalViewportDimensions()', () => {
  function makeTerm(cell = { width: 10, height: 20 }) {
    return {
      _core: {
        viewport: { scrollBarWidth: 0 },
        _renderService: {
          _renderer: { value: {} },
          dimensions: { css: { cell } },
        },
      },
    };
  }

  test('adds one extra row when vertical slack is between ~28% and one cell', () => {
    const container = {
      getBoundingClientRect: () => ({ width: 800, height: 509 }),
    };

    expect(
      proposeTerminalViewportDimensions({
        container,
        fitAddon: { proposeDimensions: jest.fn() },
        term: makeTerm(),
      })
    ).toEqual({ cols: 80, rows: 26 });
  });

  test('keeps floor rows when slack is smaller than the extra-row threshold', () => {
    const container = {
      getBoundingClientRect: () => ({ width: 800, height: 504 }),
    };

    expect(
      proposeTerminalViewportDimensions({
        container,
        fitAddon: { proposeDimensions: jest.fn() },
        term: makeTerm(),
      })
    ).toEqual({ cols: 80, rows: 25 });
  });
});

describe('stabilizeTerminalRenderer()', () => {
  test('clears the xterm texture atlas before repainting when supported', () => {
    const term = {
      rows: 24,
      clearTextureAtlas: jest.fn(),
      refresh: jest.fn(),
    };

    expect(stabilizeTerminalRenderer(term)).toBe(true);
    expect(term.clearTextureAtlas).toHaveBeenCalledTimes(1);
    expect(term.refresh).toHaveBeenCalledWith(0, 23);
  });

  test('still repaints terminals that do not expose clearTextureAtlas', () => {
    const term = {
      rows: 12,
      refresh: jest.fn(),
    };

    expect(stabilizeTerminalRenderer(term)).toBe(true);
    expect(term.refresh).toHaveBeenCalledWith(0, 11);
  });

  test('can repaint inactive split siblings without clearing the WebGL atlas', () => {
    const term = {
      rows: 24,
      clearTextureAtlas: jest.fn(),
      refresh: jest.fn(),
    };

    expect(stabilizeTerminalRenderer(term, { clearAtlas: false })).toBe(true);
    expect(term.clearTextureAtlas).not.toHaveBeenCalled();
    expect(term.refresh).toHaveBeenCalledWith(0, 23);
  });
});

describe('isTerminalViewportNearBottom()', () => {
  test('returns true when the viewport is pinned to the latest output', () => {
    expect(
      isTerminalViewportNearBottom({
        buffer: { active: { baseY: 120, viewportY: 119 } },
      })
    ).toBe(true);
  });

  test('returns false when the user is reading older output', () => {
    expect(
      isTerminalViewportNearBottom({
        buffer: { active: { baseY: 120, viewportY: 80 } },
      })
    ).toBe(false);
  });
});

describe('shouldSyncTerminalViewportOnLayoutShow()', () => {
  test('only triggers a full viewport sync when a workspace shell becomes visible', () => {
    expect(shouldSyncTerminalViewportOnLayoutShow(false, true)).toBe(true);
    expect(shouldSyncTerminalViewportOnLayoutShow(true, true)).toBe(false);
    expect(shouldSyncTerminalViewportOnLayoutShow(false, false)).toBe(false);
    expect(shouldSyncTerminalViewportOnLayoutShow(true, false)).toBe(false);
  });
});

describe('shouldRunPanelClickViewportRecovery()', () => {
  test('skips heavy recovery when the clicked panel is already active', () => {
    expect(shouldRunPanelClickViewportRecovery(true)).toBe(false);
    expect(shouldRunPanelClickViewportRecovery(false)).toBe(true);
  });
});

describe('shouldRecoverPanelOnActivation()', () => {
  test('only recovers on false→true activation edges', () => {
    expect(shouldRecoverPanelOnActivation(false, true)).toBe(true);
    expect(shouldRecoverPanelOnActivation(true, true)).toBe(false);
    expect(shouldRecoverPanelOnActivation(true, false)).toBe(false);
    expect(shouldRecoverPanelOnActivation(false, false)).toBe(false);
  });
});

describe('shouldClearWebglAtlasOnPanelActivation()', () => {
  test('skips atlas clears when WebGL is already attached', () => {
    expect(shouldClearWebglAtlasOnPanelActivation(true)).toBe(false);
    expect(shouldClearWebglAtlasOnPanelActivation(false)).toBe(true);
  });
});

describe('shouldAttachWebglRenderer()', () => {
  test('allows WebGL only when the operational renderer is xterm-webgl', () => {
    expect(shouldAttachWebglRenderer({ operationalRendererMode: 'xterm-webgl' })).toBe(true);
    expect(shouldAttachWebglRenderer({ operationalRendererMode: 'xterm' })).toBe(false);
    expect(shouldAttachWebglRenderer({ operationalRendererMode: 'xterm-canvas' })).toBe(false);
  });
});

describe('shouldAttachCanvasRenderer()', () => {
  test('allows Canvas only when the operational renderer is xterm-canvas', () => {
    expect(shouldAttachCanvasRenderer({ operationalRendererMode: 'xterm-canvas' })).toBe(true);
    expect(shouldAttachCanvasRenderer({ operationalRendererMode: 'xterm-webgl' })).toBe(false);
    expect(shouldAttachCanvasRenderer({ operationalRendererMode: 'xterm' })).toBe(false);
  });
});

describe('sendTerminalPasteInput()', () => {
  test('sends JSON input when the websocket is open', () => {
    const socket = { readyState: 1, send: jest.fn() };
    expect(
      sendTerminalPasteInput({
        socket,
        transport: 'json',
        text: 'npm test\n',
        websocketOpenState: 1,
      })
    ).toBe(true);
    expect(socket.send).toHaveBeenCalledWith(JSON.stringify({ type: 'input', data: 'npm test\n' }));
  });

  test('returns false when the socket is not open', () => {
    const socket = { readyState: 0, send: jest.fn() };
    expect(sendTerminalPasteInput({ socket, text: 'x', websocketOpenState: 1 })).toBe(false);
    expect(socket.send).not.toHaveBeenCalled();
  });
});

describe('scheduleTerminalViewportSyncBurst()', () => {
  test('runs sync immediately and on delayed phases', () => {
    jest.useFakeTimers();
    const runSync = jest.fn();
    const cleanup = scheduleTerminalViewportSyncBurst(runSync, { extraDelaysMs: [180] });

    expect(runSync).toHaveBeenCalledWith('immediate');

    jest.runAllTimers();
    expect(runSync).toHaveBeenCalledWith('delay-180');

    cleanup();
    jest.useRealTimers();
  });
});

describe('shouldRefitVisibleInactiveSplitPanel()', () => {
  test('refits visible inactive split siblings on layout churn', () => {
    expect(
      shouldRefitVisibleInactiveSplitPanel({ isActivePanel: false, isVisibleInLayout: true })
    ).toBe(true);
    expect(
      shouldRefitVisibleInactiveSplitPanel({ isActivePanel: true, isVisibleInLayout: true })
    ).toBe(false);
    expect(
      shouldRefitVisibleInactiveSplitPanel({ isActivePanel: false, isVisibleInLayout: false })
    ).toBe(false);
  });
});

describe('shouldRunTerminalViewportReactivation()', () => {
  test('only reactivates visible active panels while the document is visible', () => {
    expect(
      shouldRunTerminalViewportReactivation({
        isActivePanel: true,
        isVisibleInLayout: true,
        documentVisibilityState: 'visible',
      })
    ).toBe(true);

    expect(
      shouldRunTerminalViewportReactivation({
        isActivePanel: false,
        isVisibleInLayout: true,
        documentVisibilityState: 'visible',
      })
    ).toBe(false);

    expect(
      shouldRunTerminalViewportReactivation({
        isActivePanel: true,
        isVisibleInLayout: false,
        documentVisibilityState: 'visible',
      })
    ).toBe(false);

    expect(
      shouldRunTerminalViewportReactivation({
        isActivePanel: true,
        isVisibleInLayout: true,
        documentVisibilityState: 'hidden',
      })
    ).toBe(false);
  });
});

describe('fitTerminalViewport()', () => {
  test('fits, repaints, and emits resize when the viewport is visible and socket is open', () => {
    const container = {
      getBoundingClientRect: () => ({ width: 1280, height: 720 }),
    };
    const fitAddon = { fit: jest.fn() };
    const term = {
      cols: 132,
      rows: 40,
      clearTextureAtlas: jest.fn(),
      refresh: jest.fn(),
    };
    const socket = {
      readyState: 1,
      send: jest.fn(),
    };

    expect(
      fitTerminalViewport({
        container,
        fitAddon,
        term,
        socket,
        websocketOpenState: 1,
      })
    ).toBe(true);
    expect(fitAddon.fit).toHaveBeenCalledTimes(1);
    expect(term.clearTextureAtlas).toHaveBeenCalledTimes(1);
    expect(term.refresh).toHaveBeenCalledWith(0, 39);
    expect(socket.send).toHaveBeenCalledWith(
      JSON.stringify({
        type: 'resize',
        cols: 132,
        rows: 40,
      })
    );
  });

  test('does nothing when the container is still hidden', () => {
    const container = {
      getBoundingClientRect: () => ({ width: 0, height: 320 }),
    };
    const fitAddon = { fit: jest.fn() };
    const term = {
      cols: 80,
      rows: 24,
      refresh: jest.fn(),
    };
    const socket = {
      readyState: 1,
      send: jest.fn(),
    };

    expect(
      fitTerminalViewport({
        container,
        fitAddon,
        term,
        socket,
        websocketOpenState: 1,
      })
    ).toBe(false);
    expect(fitAddon.fit).not.toHaveBeenCalled();
    expect(term.refresh).not.toHaveBeenCalled();
    expect(socket.send).not.toHaveBeenCalled();
  });

  test('skips stale xterm instances whose renderer was already disposed during view switches', () => {
    const container = {
      getBoundingClientRect: () => ({ width: 1280, height: 720 }),
    };
    const fitAddon = {
      fit: jest.fn(() => {
        throw new TypeError(
          "undefined is not an object (evaluating 'this._renderer.value.dimensions')"
        );
      }),
    };
    const term = {
      cols: 80,
      rows: 24,
      _core: {
        _renderService: {
          _renderer: {},
        },
      },
      refresh: jest.fn(),
    };
    const socket = {
      readyState: 1,
      send: jest.fn(),
    };

    expect(
      fitTerminalViewport({
        container,
        fitAddon,
        term,
        socket,
        websocketOpenState: 1,
      })
    ).toBe(false);
    expect(fitAddon.fit).not.toHaveBeenCalled();
    expect(term.refresh).not.toHaveBeenCalled();
    expect(socket.send).not.toHaveBeenCalled();
  });
});

describe('buildTerminalViewportDiagnosticPayload()', () => {
  test('captures actionable viewport diagnostics for resize/repaint investigation', () => {
    expect(
      buildTerminalViewportDiagnosticPayload({
        reason: 'focus-reactivate',
        containerRect: { width: 1280, height: 720 },
        term: { cols: 132, rows: 40 },
        documentVisibilityState: 'visible',
        connectionState: 'connected',
        transport: 'json',
        devicePixelRatio: 2,
      })
    ).toEqual({
      reason: 'focus-reactivate',
      width: 1280,
      height: 720,
      cols: 132,
      rows: 40,
      visibility: 'visible',
      connectionState: 'connected',
      transport: 'json',
      dpr: 2,
      zeroSized: false,
      requestedRendererMode: 'xterm',
      effectiveRendererMode: 'xterm',
      isActivePanel: false,
      isVisibleInLayout: true,
      webglAttached: false,
      webglFallbackReason: null,
      pendingWebglRecovery: false,
    });
  });

  test('marks zero-sized containers so hidden-panel fits are easy to identify', () => {
    expect(
      buildTerminalViewportDiagnosticPayload({
        reason: 'resize',
        containerRect: { width: 0, height: 320 },
        term: { cols: 80, rows: 24 },
      })
    ).toMatchObject({
      width: 0,
      height: 320,
      zeroSized: true,
    });
  });
});

describe('shouldLogTerminalViewportDiagnostic()', () => {
  test('skips duplicate viewport diagnostics for the same snapshot', () => {
    const snapshot = buildTerminalViewportDiagnosticPayload({
      reason: 'resize',
      containerRect: { width: 1280, height: 720 },
      term: { cols: 132, rows: 40 },
      documentVisibilityState: 'visible',
      connectionState: 'connected',
    });

    expect(shouldLogTerminalViewportDiagnostic(snapshot, snapshot)).toBe(false);
  });

  test('logs again when the actionable state changes', () => {
    const previous = buildTerminalViewportDiagnosticPayload({
      reason: 'resize',
      containerRect: { width: 1280, height: 720 },
      term: { cols: 132, rows: 40 },
      documentVisibilityState: 'visible',
      connectionState: 'connected',
    });
    const next = buildTerminalViewportDiagnosticPayload({
      reason: 'visibility-reactivate',
      containerRect: { width: 1280, height: 720 },
      term: { cols: 132, rows: 50 },
      documentVisibilityState: 'visible',
      connectionState: 'connected',
    });

    expect(shouldLogTerminalViewportDiagnostic(previous, next)).toBe(true);
  });
});

describe('createTerminalViewportDiagnosticLogger()', () => {
  test('uses the latest connection state without recreating the logger callback', () => {
    const connectionStateRef = { current: 'connecting' };
    const cliLog = jest.fn();
    const lastSnapshotRef = { current: null };

    const logViewportDiagnostic = createTerminalViewportDiagnosticLogger({
      id: 'term-01',
      cliLog,
      lastSnapshotRef,
      getSnapshot: (reason) =>
        buildTerminalViewportDiagnosticPayload({
          reason,
          containerRect: { width: 1280, height: 720 },
          term: { cols: 132, rows: 40 },
          documentVisibilityState: 'visible',
          connectionState: connectionStateRef.current,
          transport: 'json',
        }),
    });

    logViewportDiagnostic('fit-resize');
    connectionStateRef.current = 'connected';
    logViewportDiagnostic('window-focus');

    expect(cliLog).toHaveBeenNthCalledWith(
      1,
      'CLIENT:term-01',
      'viewport diagnostic',
      expect.objectContaining({ connectionState: 'connecting' })
    );
    expect(cliLog).toHaveBeenNthCalledWith(
      2,
      'CLIENT:term-01',
      'viewport diagnostic',
      expect.objectContaining({ connectionState: 'connected' })
    );
  });

  test('deduplicates repeated snapshots while preserving the stable logger instance', () => {
    const cliLog = jest.fn();
    const lastSnapshotRef = { current: null };

    const logViewportDiagnostic = createTerminalViewportDiagnosticLogger({
      id: 'term-01',
      cliLog,
      lastSnapshotRef,
      getSnapshot: (reason) =>
        buildTerminalViewportDiagnosticPayload({
          reason,
          containerRect: { width: 1280, height: 720 },
          term: { cols: 132, rows: 40 },
          documentVisibilityState: 'visible',
          connectionState: 'connected',
          transport: 'json',
        }),
    });

    logViewportDiagnostic('fit-resize');
    logViewportDiagnostic('fit-resize');

    expect(cliLog).toHaveBeenCalledTimes(1);
  });
});

describe('resolveTerminalRendererViewModel()', () => {
  test('keeps xterm as both requested and effective renderer by default', () => {
    expect(resolveTerminalRendererViewModel({ requestedRendererMode: undefined })).toEqual(
      expect.objectContaining({
        requestedMode: 'xterm',
        effectiveMode: 'xterm',
        didFallback: false,
        showRecoveryBanner: false,
      })
    );
  });

  test('falls back unready experimental selections to xterm without changing requested mode', () => {
    expect(resolveTerminalRendererViewModel({ requestedRendererMode: 'vte-experimental' })).toEqual(
      expect.objectContaining({
        requestedMode: 'vte-experimental',
        effectiveMode: 'xterm',
        didFallback: true,
        showRecoveryBanner: false,
      })
    );
  });
});

describe('getTerminalRendererStatusCopy()', () => {
  test('describes fallback clearly when experimental renderer is not ready', () => {
    expect(
      getTerminalRendererStatusCopy(
        resolveTerminalRendererViewModel({ requestedRendererMode: 'vte-experimental' })
      )
    ).toContain('GTK VTE');
  });

  test('normalizes legacy ghostty requests to xterm without showing a stale fallback banner', () => {
    expect(
      resolveTerminalRendererViewModel({ requestedRendererMode: 'ghostty-experimental' })
    ).toEqual(
      expect.objectContaining({
        requestedMode: 'xterm',
        effectiveMode: 'xterm',
        didFallback: false,
        showRecoveryBanner: false,
      })
    );
  });

  test('returns empty copy when no fallback happened', () => {
    expect(
      getTerminalRendererStatusCopy(
        resolveTerminalRendererViewModel({ requestedRendererMode: 'xterm' })
      )
    ).toBe('');
  });

  test('describes panel-local recovery without assuming only one active native panel exists', () => {
    expect(
      getTerminalRendererStatusCopy(
        resolveTerminalRendererViewModel({
          requestedRendererMode: 'vte-experimental',
          rendererCapabilities: {
            xterm: { mode: 'xterm', label: 'xterm', ready: true, reason: null },
            'vte-experimental': {
              mode: 'vte-experimental',
              label: 'GTK VTE',
              ready: false,
              reason: 'panel-not-active',
            },
          },
        })
      )
    ).toContain('sin bajar los paneles vecinos');
  });
});

describe('shouldOpenNativeVtePanel()', () => {
  test('opens native GTK VTE for visible split siblings even when they are not the focused panel', () => {
    expect(
      shouldOpenNativeVtePanel({
        isActivePanel: false,
        isVisibleInLayout: true,
        nativeVteOpenFailure: null,
        nativeVteProbe: { ready: true, reason: null },
        requestedRendererMode: 'vte-experimental',
        runtimePlatform: 'linux',
        tauriAvailable: true,
      })
    ).toBe(true);
  });

  test('does not open native GTK VTE for hidden workspace panels', () => {
    expect(
      shouldOpenNativeVtePanel({
        isActivePanel: true,
        isVisibleInLayout: false,
        nativeVteOpenFailure: null,
        nativeVteProbe: { ready: true, reason: null },
        requestedRendererMode: 'vte-experimental',
        runtimePlatform: 'linux',
        tauriAvailable: true,
      })
    ).toBe(false);
  });
});

describe('resolveTerminalRuntimePhase()', () => {
  test('keeps dock side-by-side native panels on native-suspended instead of forcing fallback-xterm', () => {
    expect(
      resolveTerminalRuntimePhase({
        isActivePanel: true,
        isVisibleInLayout: true,
        suspendNativeSurface: true,
        nativeSurfacePolicy: 'dock-side-by-side',
        nativeVteOpened: true,
        nativeVteProbe: { ready: true, reason: null },
        requestedRendererMode: 'vte-experimental',
        runtimePlatform: 'linux',
        tauriAvailable: true,
      })
    ).toBe('native-suspended');
  });

  test('keeps transient grid or drag suspension on native-suspended phase', () => {
    expect(
      resolveTerminalRuntimePhase({
        isActivePanel: true,
        isVisibleInLayout: true,
        suspendNativeSurface: true,
        nativeSurfacePolicy: 'transient-overlay',
        nativeVteOpened: true,
        nativeVteProbe: { ready: true, reason: null },
        requestedRendererMode: 'vte-experimental',
        runtimePlatform: 'linux',
        tauriAvailable: true,
      })
    ).toBe('native-suspended');
  });
});

describe('getTerminalRendererRecoveryActionLabel()', () => {
  test('always exposes a deterministic one-click recovery label back to xterm', () => {
    expect(getTerminalRendererRecoveryActionLabel()).toBe('Volver a xterm');
  });
});

describe('shouldBlockTerminalViewportForWebglFallback()', () => {
  test('keeps the viewport visible for recoverable WebGL context loss', () => {
    expect(
      shouldBlockTerminalViewportForWebglFallback({
        active: true,
        reason: 'webgl-context-lost',
      })
    ).toBe(false);
  });

  test('blocks the viewport for permanent WebGL failures', () => {
    expect(
      shouldBlockTerminalViewportForWebglFallback({
        active: true,
        reason: 'webgl-addon-register-failed',
      })
    ).toBe(true);
    expect(shouldBlockTerminalViewportForWebglFallback(null)).toBe(false);
  });
});

describe('shouldReinitializeTerminalForRenderer()', () => {
  test('does not reinitialize when requested mode changes but effective renderer stays xterm', () => {
    const previous = resolveTerminalRendererViewModel({ requestedRendererMode: 'xterm' });
    const next = resolveTerminalRendererViewModel({ requestedRendererMode: 'vte-experimental' });

    expect(shouldReinitializeTerminalForRenderer(previous.effectiveMode, next.effectiveMode)).toBe(
      false
    );
  });

  test('reinitializes only when the effective renderer actually changes', () => {
    expect(shouldReinitializeTerminalForRenderer('xterm', 'vte-experimental')).toBe(true);
  });
});

describe('resolveTerminalConnectionCloseState()', () => {
  test('marks the terminal as terminated after a process exit event', () => {
    expect(resolveTerminalConnectionCloseState('connected', true)).toBe('terminated');
  });

  test('preserves error state when the socket closes without a process exit', () => {
    expect(resolveTerminalConnectionCloseState('error', false)).toBe('error');
  });

  test('marks the terminal as disconnected for recoverable socket closes', () => {
    expect(resolveTerminalConnectionCloseState('connected', false)).toBe('disconnected');
  });
});

describe('shouldAutoReconnectTerminal()', () => {
  test('reconnects recoverable disconnected terminals when focused', () => {
    expect(shouldAutoReconnectTerminal('disconnected', true)).toBe(true);
    expect(shouldAutoReconnectTerminal('error', true)).toBe(true);
  });

  test('does not reconnect terminated sessions or background tabs', () => {
    expect(shouldAutoReconnectTerminal('terminated', true)).toBe(false);
    expect(shouldAutoReconnectTerminal('disconnected', false)).toBe(false);
  });

  test('does not reconnect when xterm init failed', () => {
    expect(shouldAutoReconnectTerminal('error', true, 'No se pudo inicializar la terminal')).toBe(
      false
    );
  });
});

describe('TERMINAL_VIEWPORT_SHELL_STYLE', () => {
  test('keeps only isolation to avoid aggressive compositor hints around xterm canvas', () => {
    expect(TERMINAL_VIEWPORT_SHELL_STYLE).toEqual({
      isolation: 'isolate',
    });
  });
});

describe('TERMINAL_NATIVE_CONTENT_BODY_STYLE', () => {
  test('keeps only isolation so native content body can host suspension without compositor hacks', () => {
    expect(TERMINAL_NATIVE_CONTENT_BODY_STYLE).toEqual({
      isolation: 'isolate',
    });
  });

  test('keeps the native placeholder inside the same safe viewport body across morphologies', async () => {
    installTerminalDom();
    document.documentElement.dataset.morphology = 'brutalist-stage';
    mockNativeVteBridge.isNativeVteRuntimeAvailable.mockReturnValue(true);
    mockNativeVteBridge.probeNativeVte.mockResolvedValue({ ready: true, reason: null });
    mockNativeVteBridge.openNativeVtePanel.mockResolvedValue({ opened: true, reason: null });

    const view = await renderIntoDom(
      React.createElement(TerminalTTY, {
        id: 'term-native-body-bounds-brutalist',
        requestedRendererMode: 'vte-experimental',
        autoFocus: true,
        isActivePanel: true,
        runtimePlatform: 'linux',
        showQuickCopyButton: false,
      })
    );

    await flushTerminalEffects();

    const body = view.container.querySelector('[data-testid="terminal-content-body"]');
    const placeholder = view.container.querySelector('[data-testid="terminal-native-placeholder"]');
    const viewportShell = view.container.querySelector('[data-testid="terminal-viewport-shell"]');

    expect(body).not.toBeNull();
    expect(placeholder).not.toBeNull();
    expect(body?.contains(placeholder)).toBe(true);
    expect(viewportShell?.contains(body)).toBe(true);
  });
});

describe('TerminalTTY renderer fallback UI', () => {
  beforeEach(() => {
    installTerminalDom();
    installTerminalRuntimeMocks();
    mockTerminalInstances.length = 0;
    mockWebSocketInstances.length = 0;
    mockResizeObserverInstances.length = 0;
  });

  afterEach(async () => {
    cleanupMountedRoots();
    await flushTerminalEffects();
    if (global.document?.body) {
      global.document.body.innerHTML = '';
    }
    mockTerminalInstances.length = 0;
    mockWebSocketInstances.length = 0;
    Object.values(mockNativeVteBridge).forEach((value) => {
      if (value && typeof value.mockReset === 'function') {
        value.mockReset();
      }
    });
    mockNativeVteBridge.isNativeVteRuntimeAvailable.mockReturnValue(false);
    mockNativeVteBridge.probeNativeVte.mockResolvedValue({
      ready: false,
      reason: 'tauri-unavailable',
    });
    mockNativeVteBridge.openNativeVtePanel.mockResolvedValue({
      opened: false,
      reason: 'tauri-unavailable',
    });
    mockNativeVteBridge.pasteNativeVtePanel.mockResolvedValue({
      supported: false,
      reason: 'tauri-unavailable',
    });
    mockNativeVteBridge.subscribeNativeVteEvents.mockReturnValue(jest.fn());
    jest.clearAllMocks();
  });

  test('restore with invalid experimental renderer keeps xterm surface visible', async () => {
    document.documentElement.style.setProperty(
      '--font-family-mono',
      "'Fira Code', 'Liberation Mono', monospace"
    );

    const view = await renderIntoDom(
      React.createElement(TerminalTTY, {
        id: 'term-restore-1',
        restored: true,
        requestedRendererMode: 'vte-experimental',
        onResetRendererToXterm: jest.fn(),
        showQuickCopyButton: false,
      })
    );

    await flushTerminalEffects();

    const shell = view.container.querySelector('[data-testid="terminal-viewport-shell"]');
    const terminalContainer = view.container.querySelector('.devhub-xterm-container');
    const fallbackBanner = view.container.querySelector(
      '[data-testid="terminal-renderer-fallback-banner"]'
    );

    expect(shell).not.toBeNull();
    expect(terminalContainer).not.toBeNull();
    expect(fallbackBanner).toBeNull();

    expect(mockTerminalInstances).toHaveLength(1);
    expect(mockTerminalInstances[0].open).toHaveBeenCalledWith(terminalContainer);
    expect(mockTerminalInstances[0].loadAddon).toHaveBeenCalledTimes(2);
    expect(require('xterm').Terminal).toHaveBeenCalledWith(
      expect.objectContaining({
        fontFamily: "'Fira Code', 'Liberation Mono', monospace",
        letterSpacing: 0,
      })
    );

    expect(mockWebSocketInstances).toHaveLength(1);
    expect(mockWebSocketInstances[0].url).toContain('127.0.0.1:4020/ws');
    expect(mockWebSocketInstances[0].send).toHaveBeenCalledWith(
      JSON.stringify({
        type: 'resize',
        cols: 80,
        rows: 24,
      })
    );
  });

  test('new output keeps bottom-pinned sessions anchored but does not yank users reading older content', async () => {
    await renderIntoDom(
      React.createElement(TerminalTTY, {
        id: 'term-scroll-output',
        restored: true,
        autoFocus: true,
        isActivePanel: true,
        isVisibleInLayout: true,
        showQuickCopyButton: false,
      })
    );

    await flushTerminalEffects();

    expect(mockTerminalInstances).toHaveLength(1);
    const terminal = mockTerminalInstances[0];
    terminal.scrollToBottom = jest.fn();
    terminal.buffer = { active: { baseY: 240, viewportY: 239 } };

    const socket = mockWebSocketInstances[0];
    socket.onmessage({ data: JSON.stringify({ type: 'output', data: 'latest\n' }) });
    await flushTerminalEffects();

    expect(terminal.write).toHaveBeenCalledWith('latest\n');
    expect(terminal.scrollToBottom).toHaveBeenCalledTimes(1);

    terminal.scrollToBottom.mockClear();
    terminal.buffer = { active: { baseY: 240, viewportY: 160 } };

    socket.onmessage({ data: JSON.stringify({ type: 'output', data: 'older-safe\n' }) });
    await flushTerminalEffects();

    expect(terminal.write).toHaveBeenCalledWith('older-safe\n');
    expect(terminal.scrollToBottom).not.toHaveBeenCalled();
  });

  test('focus reactivation does not force bottom scroll when the viewport is not near bottom', async () => {
    await renderIntoDom(
      React.createElement(TerminalTTY, {
        id: 'term-scroll-reactivate',
        restored: true,
        autoFocus: true,
        isActivePanel: true,
        isVisibleInLayout: true,
        showQuickCopyButton: false,
      })
    );

    await flushTerminalEffects();

    const terminal = mockTerminalInstances[0];
    terminal.scrollToBottom = jest.fn();
    terminal.buffer = { active: { baseY: 240, viewportY: 140 } };
    terminal.focus.mockClear();

    window.dispatchEvent(new window.Event('focus'));
    await flushTerminalEffects();
    await new Promise((resolve) => setTimeout(resolve, 180));
    await flushTerminalEffects();

    expect(terminal.focus).toHaveBeenCalled();
    expect(terminal.scrollToBottom).not.toHaveBeenCalled();
  });

  test('switching the active split panel does not clear the WebGL atlas on the panel that became inactive', async () => {
    const view = await renderIntoDom(
      React.createElement(
        React.Fragment,
        null,
        React.createElement(TerminalTTY, {
          id: 'term-split-a',
          requestedRendererMode: 'xterm',
          autoFocus: true,
          isActivePanel: true,
          isVisibleInLayout: true,
          showQuickCopyButton: false,
        }),
        React.createElement(TerminalTTY, {
          id: 'term-split-b',
          requestedRendererMode: 'xterm',
          autoFocus: false,
          isActivePanel: false,
          isVisibleInLayout: true,
          showQuickCopyButton: false,
        })
      )
    );

    await flushTerminalEffects();

    const formerlyActiveTerminal = mockTerminalInstances[0];
    formerlyActiveTerminal.clearTextureAtlas.mockClear();

    await rerenderIntoRoot(
      view.root,
      React.createElement(
        React.Fragment,
        null,
        React.createElement(TerminalTTY, {
          id: 'term-split-a',
          requestedRendererMode: 'xterm',
          autoFocus: false,
          isActivePanel: false,
          isVisibleInLayout: true,
          showQuickCopyButton: false,
        }),
        React.createElement(TerminalTTY, {
          id: 'term-split-b',
          requestedRendererMode: 'xterm',
          autoFocus: true,
          isActivePanel: true,
          isVisibleInLayout: true,
          showQuickCopyButton: false,
        })
      )
    );
    await flushTerminalEffects();
    await new Promise((resolve) => setTimeout(resolve, 180));
    await flushTerminalEffects();

    expect(formerlyActiveTerminal.clearTextureAtlas).not.toHaveBeenCalled();
  });

  test('clicking an already-active xterm panel does not rerun atlas-clearing recovery', async () => {
    const view = await renderIntoDom(
      React.createElement(TerminalTTY, {
        id: 'term-click-active',
        requestedRendererMode: 'xterm',
        autoFocus: true,
        isActivePanel: true,
        isVisibleInLayout: true,
        showQuickCopyButton: false,
      })
    );

    await flushTerminalEffects();
    await new Promise((resolve) => setTimeout(resolve, 200));

    const terminal = mockTerminalInstances[0];
    terminal.clearTextureAtlas.mockClear();

    const shell = view.container.querySelector('[data-testid="terminal-viewport-shell"]');
    shell.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
    await flushTerminalEffects();
    await new Promise((resolve) => setTimeout(resolve, 50));
    await flushTerminalEffects();

    expect(terminal.clearTextureAtlas).not.toHaveBeenCalled();
  });

  test('inactive visible xterm panels ignore aggressive focus reactivation while active panels still refresh', async () => {
    await renderIntoDom(
      React.createElement(
        React.Fragment,
        null,
        React.createElement(TerminalTTY, {
          id: 'term-scroll-active',
          restored: true,
          autoFocus: true,
          isActivePanel: true,
          isVisibleInLayout: true,
          showQuickCopyButton: false,
        }),
        React.createElement(TerminalTTY, {
          id: 'term-scroll-inactive',
          restored: true,
          autoFocus: false,
          isActivePanel: false,
          isVisibleInLayout: true,
          showQuickCopyButton: false,
        })
      )
    );

    await flushTerminalEffects();

    const activeTerminal = mockTerminalInstances[0];
    const inactiveTerminal = mockTerminalInstances[1];

    activeTerminal.focus.mockClear();
    inactiveTerminal.focus.mockClear();
    activeTerminal.scrollToBottom = jest.fn();
    inactiveTerminal.scrollToBottom = jest.fn().mockImplementation(() => {
      console.log('INACTIVE SCROLL TO BOTTOM CALLSTACK:', new Error().stack);
    });
    activeTerminal.buffer = { active: { baseY: 100, viewportY: 99 } };
    inactiveTerminal.buffer = { active: { baseY: 100, viewportY: 99 } };

    window.dispatchEvent(new window.Event('focus'));
    await flushTerminalEffects();
    await new Promise((resolve) => setTimeout(resolve, 180));
    await flushTerminalEffects();

    expect(activeTerminal.focus).toHaveBeenCalled();
    expect(activeTerminal.scrollToBottom).toHaveBeenCalled();
    expect(inactiveTerminal.focus).not.toHaveBeenCalled();
    expect(inactiveTerminal.scrollToBottom).not.toHaveBeenCalled();
  });

  test('preserves scroll position across workspace visibility changes', async () => {
    const view = await renderIntoDom(
      React.createElement(TerminalTTY, {
        id: 'term-scroll-preserve',
        restored: true,
        autoFocus: true,
        isActivePanel: true,
        isVisibleInLayout: true,
        showQuickCopyButton: false,
      })
    );

    await flushTerminalEffects();

    const terminal = mockTerminalInstances[0];
    terminal.scrollToLine = jest.fn();
    terminal.buffer = { active: { baseY: 120, viewportY: 80 } };

    // Hide workspace
    await rerenderIntoRoot(
      view.root,
      React.createElement(TerminalTTY, {
        id: 'term-scroll-preserve',
        restored: true,
        autoFocus: true,
        isActivePanel: true,
        isVisibleInLayout: false,
        showQuickCopyButton: false,
      })
    );
    await flushTerminalEffects();

    terminal.scrollToLine.mockClear();

    // Show workspace again
    await rerenderIntoRoot(
      view.root,
      React.createElement(TerminalTTY, {
        id: 'term-scroll-preserve',
        restored: true,
        autoFocus: true,
        isActivePanel: true,
        isVisibleInLayout: true,
        showQuickCopyButton: false,
      })
    );
    await flushTerminalEffects();
    await new Promise((resolve) => setTimeout(resolve, 200));
    await flushTerminalEffects();

    expect(terminal.scrollToLine).toHaveBeenCalledWith(80);
  });

  describe('terminal wheel scroll helpers', () => {
    test('shift+wheel routes to xterm scrollback', () => {
      expect(shouldUseTerminalScrollbackWheel({ shiftKey: true })).toBe(true);
      expect(shouldUseTerminalScrollbackWheel({ shiftKey: false })).toBe(false);
    });

    test('buildTerminalWheelPageSequence emits Page Up/Down sequences', () => {
      expect(buildTerminalWheelPageSequence('up', 2)).toBe(
        TERMINAL_PAGE_UP_SEQ + TERMINAL_PAGE_UP_SEQ
      );
      expect(buildTerminalWheelPageSequence('down', 1)).toBe(TERMINAL_PAGE_DOWN_SEQ);
    });

    test('resolveTerminalWheelPageSteps scales with wheel delta', () => {
      expect(resolveTerminalWheelScrollDirection(-120)).toBe('up');
      expect(resolveTerminalWheelScrollDirection(80)).toBe('down');
      expect(resolveTerminalWheelPageSteps(120)).toBe(3);
    });

    test('transcript vs input zones gate wheel routing', () => {
      expect(isTerminalTranscriptCell(10, 20, 4)).toBe(true);
      expect(isTerminalTranscriptCell(17, 20, 4)).toBe(false);
      expect(
        shouldRouteWheelToTranscript({
          cell: { col: 4, row: 10 },
          rows: 20,
          lastPointerZone: 'input',
        })
      ).toBe(true);
      expect(
        shouldRouteWheelToTranscript({
          cell: { col: 4, row: 18 },
          rows: 20,
          lastPointerZone: 'transcript',
        })
      ).toBe(false);
      expect(
        shouldRouteWheelToTranscript({
          lastPointerZone: 'transcript',
          rows: 20,
        })
      ).toBe(true);
    });

    test('resolveTerminalCellFromPointer maps viewport coordinates to cells', () => {
      const term = { cols: 80, rows: 24 };
      const element = {
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 480 }),
      };
      expect(resolveTerminalCellFromPointer(term, element, 400, 240)).toEqual({ col: 40, row: 12 });
    });
  });

  test('probes and opens native GTK VTE only for the active experimental panel', async () => {
    mockNativeVteBridge.isNativeVteRuntimeAvailable.mockReturnValue(true);
    mockNativeVteBridge.probeNativeVte.mockResolvedValue({ ready: true, reason: null });
    mockNativeVteBridge.openNativeVtePanel.mockResolvedValue({ opened: true, reason: null });

    const view = await renderIntoDom(
      React.createElement(TerminalTTY, {
        id: 'term-native-1',
        requestedRendererMode: 'vte-experimental',
        autoFocus: true,
        isActivePanel: true,
        runtimePlatform: 'linux',
        cwd: '/workspace/devhub',
        showQuickCopyButton: false,
      })
    );

    await flushTerminalEffects();

    expect(mockNativeVteBridge.probeNativeVte).toHaveBeenCalledWith(
      expect.objectContaining({
        panelId: 'term-native-1',
        requestedMode: 'vte-experimental',
      })
    );
    expect(mockNativeVteBridge.openNativeVtePanel).toHaveBeenCalledWith(
      expect.objectContaining({
        panelId: 'term-native-1',
        cwd: '/workspace/devhub',
      })
    );
    expect(mockNativeVteBridge.focusNativeVtePanel).toHaveBeenCalledWith({
      panelId: 'term-native-1',
    });
    expect(mockNativeVteBridge.resizeNativeVtePanel).toHaveBeenCalledWith(
      expect.objectContaining({
        panelId: 'term-native-1',
        bounds: expect.objectContaining({ width: 1278, height: 718 }),
      })
    );
    expect(mockTerminalInstances).toHaveLength(0);
    expect(mockWebSocketInstances).toHaveLength(0);
    expect(
      view.container.querySelector('[data-testid="terminal-native-placeholder"]')
    ).not.toBeNull();
  });

  test('opens native GTK VTE for each visible split panel instead of only the focused one', async () => {
    mockNativeVteBridge.isNativeVteRuntimeAvailable.mockReturnValue(true);
    mockNativeVteBridge.probeNativeVte.mockResolvedValue({ ready: true, reason: null });
    mockNativeVteBridge.openNativeVtePanel.mockResolvedValue({ opened: true, reason: null });

    await renderIntoDom(
      React.createElement(
        React.Fragment,
        null,
        React.createElement(TerminalTTY, {
          id: 'term-native-visible-a',
          requestedRendererMode: 'vte-experimental',
          autoFocus: true,
          isActivePanel: true,
          isVisibleInLayout: true,
          runtimePlatform: 'linux',
          showQuickCopyButton: false,
        }),
        React.createElement(TerminalTTY, {
          id: 'term-native-visible-b',
          requestedRendererMode: 'vte-experimental',
          autoFocus: false,
          isActivePanel: false,
          isVisibleInLayout: true,
          runtimePlatform: 'linux',
          showQuickCopyButton: false,
        })
      )
    );

    await flushTerminalEffects();

    expect(mockNativeVteBridge.openNativeVtePanel).toHaveBeenCalledTimes(2);
    expect(mockNativeVteBridge.openNativeVtePanel).toHaveBeenCalledWith(
      expect.objectContaining({ panelId: 'term-native-visible-a' })
    );
    expect(mockNativeVteBridge.openNativeVtePanel).toHaveBeenCalledWith(
      expect.objectContaining({ panelId: 'term-native-visible-b' })
    );
  });

  test('native open payload forwards cwd and initial command for real GTK/VTE shell startup', async () => {
    mockNativeVteBridge.isNativeVteRuntimeAvailable.mockReturnValue(true);
    mockNativeVteBridge.probeNativeVte.mockResolvedValue({ ready: true, reason: null });
    mockNativeVteBridge.openNativeVtePanel.mockResolvedValue({ opened: true, reason: null });

    await renderIntoDom(
      React.createElement(TerminalTTY, {
        id: 'term-native-shell-start',
        requestedRendererMode: 'vte-experimental',
        autoFocus: true,
        isActivePanel: true,
        runtimePlatform: 'linux',
        cwd: '/workspace/devhub',
        initialCommand: 'npm test -- --runTestsByPath src/components/__tests__/TerminalTTY.test.js',
        showQuickCopyButton: false,
      })
    );

    await flushTerminalEffects();

    expect(mockNativeVteBridge.openNativeVtePanel).toHaveBeenCalledWith(
      expect.objectContaining({
        panelId: 'term-native-shell-start',
        cwd: '/workspace/devhub',
        initialCommand: 'npm test -- --runTestsByPath src/components/__tests__/TerminalTTY.test.js',
      })
    );
    expect(mockTerminalInstances).toHaveLength(0);
    expect(mockWebSocketInstances).toHaveLength(0);
  });

  test('does not hide a native panel during its own opening phase transitions', async () => {
    mockNativeVteBridge.isNativeVteRuntimeAvailable.mockReturnValue(true);
    mockNativeVteBridge.probeNativeVte.mockResolvedValue({ ready: true, reason: null });
    mockNativeVteBridge.openNativeVtePanel.mockResolvedValue({ opened: true, reason: null });

    await renderIntoDom(
      React.createElement(TerminalTTY, {
        id: 'term-native-open-no-stale-hide',
        requestedRendererMode: 'vte-experimental',
        autoFocus: true,
        isActivePanel: true,
        isVisibleInLayout: true,
        runtimePlatform: 'linux',
        showQuickCopyButton: false,
      })
    );

    await flushTerminalEffects();

    expect(mockNativeVteBridge.openNativeVtePanel).toHaveBeenCalledWith(
      expect.objectContaining({ panelId: 'term-native-open-no-stale-hide' })
    );
    expect(mockNativeVteBridge.setNativeVtePanelVisibility).not.toHaveBeenCalledWith(
      expect.objectContaining({
        panelId: 'term-native-open-no-stale-hide',
        visible: false,
      })
    );
  });

  test('native placeholder lives inside the terminal body and keeps header chrome outside native bounds', async () => {
    mockNativeVteBridge.isNativeVteRuntimeAvailable.mockReturnValue(true);
    mockNativeVteBridge.probeNativeVte.mockResolvedValue({ ready: true, reason: null });
    mockNativeVteBridge.openNativeVtePanel.mockResolvedValue({ opened: true, reason: null });

    const view = await renderIntoDom(
      React.createElement(TerminalTTY, {
        id: 'term-native-body-bounds',
        requestedRendererMode: 'vte-experimental',
        autoFocus: true,
        isActivePanel: true,
        runtimePlatform: 'linux',
        showQuickCopyButton: false,
      })
    );

    await flushTerminalEffects();

    const body = view.container.querySelector('[data-testid="terminal-content-body"]');
    const placeholder = view.container.querySelector('[data-testid="terminal-native-placeholder"]');

    expect(body).not.toBeNull();
    expect(placeholder).not.toBeNull();
    expect(body?.contains(placeholder)).toBe(true);
  });

  test('opens native GTK VTE using the real xterm container bounds instead of the larger placeholder body', async () => {
    mockNativeVteBridge.isNativeVteRuntimeAvailable.mockReturnValue(true);
    mockNativeVteBridge.probeNativeVte.mockResolvedValue({ ready: true, reason: null });
    mockNativeVteBridge.openNativeVtePanel.mockResolvedValue({ opened: true, reason: null });

    const originalGetBoundingClientRect = global.HTMLElement.prototype.getBoundingClientRect;
    Object.defineProperty(global.HTMLElement.prototype, 'getBoundingClientRect', {
      configurable: true,
      value() {
        const dataTestId = this.getAttribute?.('data-testid');
        if (this.classList?.contains('devhub-xterm-container')) {
          return { left: 120, top: 180, right: 960, bottom: 700, width: 840, height: 520 };
        }
        if (dataTestId === 'terminal-content-body') {
          return { left: 96, top: 148, right: 1024, bottom: 756, width: 928, height: 608 };
        }
        return { left: 0, top: 0, right: 1280, bottom: 720, width: 1280, height: 720 };
      },
    });

    try {
      await renderIntoDom(
        React.createElement(TerminalTTY, {
          id: 'term-native-container-bounds',
          requestedRendererMode: 'vte-experimental',
          autoFocus: true,
          isActivePanel: true,
          runtimePlatform: 'linux',
          showQuickCopyButton: false,
        })
      );

      await flushTerminalEffects();

      expect(mockNativeVteBridge.openNativeVtePanel).toHaveBeenCalledWith(
        expect.objectContaining({
          panelId: 'term-native-container-bounds',
          bounds: expect.objectContaining({ x: 121, y: 181, width: 838, height: 518 }),
        })
      );
    } finally {
      Object.defineProperty(global.HTMLElement.prototype, 'getBoundingClientRect', {
        configurable: true,
        value: originalGetBoundingClientRect,
      });
    }
  });

  test('keeps TERM-03 same-window by never opening an external window for GTK VTE', async () => {
    mockNativeVteBridge.isNativeVteRuntimeAvailable.mockReturnValue(true);
    mockNativeVteBridge.probeNativeVte.mockResolvedValue({ ready: true, reason: null });
    mockNativeVteBridge.openNativeVtePanel.mockResolvedValue({ opened: true, reason: null });
    window.open = jest.fn();

    const view = await renderIntoDom(
      React.createElement(TerminalTTY, {
        id: 'term-native-no-window',
        requestedRendererMode: 'vte-experimental',
        autoFocus: true,
        isActivePanel: true,
        runtimePlatform: 'linux',
        showQuickCopyButton: false,
      })
    );

    await flushTerminalEffects();

    expect(
      view.container.querySelector('[data-testid="terminal-native-placeholder"]')
    ).not.toBeNull();
    expect(window.open).not.toHaveBeenCalled();
  });

  test('resizes the active native surface again when the window size changes', async () => {
    mockNativeVteBridge.isNativeVteRuntimeAvailable.mockReturnValue(true);
    mockNativeVteBridge.probeNativeVte.mockResolvedValue({ ready: true, reason: null });
    mockNativeVteBridge.openNativeVtePanel.mockResolvedValue({ opened: true, reason: null });

    await renderIntoDom(
      React.createElement(TerminalTTY, {
        id: 'term-native-resize',
        requestedRendererMode: 'vte-experimental',
        autoFocus: true,
        isActivePanel: true,
        runtimePlatform: 'linux',
        showQuickCopyButton: false,
      })
    );

    await flushTerminalEffects();
    mockNativeVteBridge.resizeNativeVtePanel.mockClear();

    window.dispatchEvent(new window.Event('resize'));
    await flushTerminalEffects();

    expect(mockNativeVteBridge.resizeNativeVtePanel).toHaveBeenCalledWith(
      expect.objectContaining({
        panelId: 'term-native-resize',
        bounds: expect.objectContaining({ width: 1278, height: 718 }),
      })
    );
  });

  test('resizes the active native surface when split-panel geometry changes without a window resize', async () => {
    mockNativeVteBridge.isNativeVteRuntimeAvailable.mockReturnValue(true);
    mockNativeVteBridge.probeNativeVte.mockResolvedValue({ ready: true, reason: null });
    mockNativeVteBridge.openNativeVtePanel.mockResolvedValue({ opened: true, reason: null });

    await renderIntoDom(
      React.createElement(TerminalTTY, {
        id: 'term-native-panel-resize',
        requestedRendererMode: 'vte-experimental',
        autoFocus: true,
        isActivePanel: true,
        runtimePlatform: 'linux',
        showQuickCopyButton: false,
      })
    );

    await flushTerminalEffects();
    mockNativeVteBridge.resizeNativeVtePanel.mockClear();

    Object.defineProperty(global.HTMLElement.prototype, 'getBoundingClientRect', {
      configurable: true,
      value() {
        return { width: 920, height: 680, top: 8, left: 24, right: 944, bottom: 688 };
      },
    });

    const nativeResizeObserver =
      mockResizeObserverInstances[mockResizeObserverInstances.length - 1];
    nativeResizeObserver.callback([{ contentRect: { width: 920, height: 680 } }]);
    await flushTerminalEffects();

    expect(mockNativeVteBridge.resizeNativeVtePanel).toHaveBeenCalledWith(
      expect.objectContaining({
        panelId: 'term-native-panel-resize',
        bounds: expect.objectContaining({ x: 25, y: 9, width: 918, height: 678 }),
      })
    );
  });

  test('re-sends native bounds after visible split layout settles when returning to a window', async () => {
    mockNativeVteBridge.isNativeVteRuntimeAvailable.mockReturnValue(true);
    mockNativeVteBridge.probeNativeVte.mockResolvedValue({ ready: true, reason: null });
    mockNativeVteBridge.openNativeVtePanel.mockResolvedValue({ opened: true, reason: null });

    const view = await renderIntoDom(
      React.createElement(TerminalTTY, {
        id: 'term-native-return-resize',
        requestedRendererMode: 'vte-experimental',
        autoFocus: true,
        isActivePanel: true,
        isVisibleInLayout: true,
        runtimePlatform: 'linux',
        showQuickCopyButton: false,
      })
    );

    await flushTerminalEffects();

    await rerenderIntoRoot(
      view.root,
      React.createElement(TerminalTTY, {
        id: 'term-native-return-resize',
        requestedRendererMode: 'vte-experimental',
        autoFocus: false,
        isActivePanel: false,
        isVisibleInLayout: false,
        runtimePlatform: 'linux',
        showQuickCopyButton: false,
      })
    );
    await flushTerminalEffects();

    mockNativeVteBridge.resizeNativeVtePanel.mockClear();

    let rectCallCount = 0;
    Object.defineProperty(global.HTMLElement.prototype, 'getBoundingClientRect', {
      configurable: true,
      value() {
        rectCallCount += 1;
        if (rectCallCount <= 1) {
          return { width: 1840, height: 900, top: 104, left: 64, right: 1904, bottom: 1004 };
        }
        return { width: 920, height: 900, top: 104, left: 984, right: 1904, bottom: 1004 };
      },
    });

    await rerenderIntoRoot(
      view.root,
      React.createElement(TerminalTTY, {
        id: 'term-native-return-resize',
        requestedRendererMode: 'vte-experimental',
        autoFocus: true,
        isActivePanel: true,
        isVisibleInLayout: true,
        runtimePlatform: 'linux',
        showQuickCopyButton: false,
      })
    );
    await flushTerminalEffects();
    await new Promise((resolve) => setTimeout(resolve, 220));
    await flushTerminalEffects();

    expect(mockNativeVteBridge.resizeNativeVtePanel).toHaveBeenCalledWith(
      expect.objectContaining({
        panelId: 'term-native-return-resize',
        bounds: expect.objectContaining({ x: 985, y: 105, width: 918, height: 898 }),
      })
    );
  });

  test('normalizes legacy Ghostty requests to xterm and never opens the TERM-03 native seam for them', async () => {
    mockNativeVteBridge.isNativeVteRuntimeAvailable.mockReturnValue(true);

    const view = await renderIntoDom(
      React.createElement(TerminalTTY, {
        id: 'term-ghostty-guardrail',
        requestedRendererMode: 'ghostty-experimental',
        autoFocus: true,
        isActivePanel: true,
        runtimePlatform: 'linux',
        showQuickCopyButton: false,
      })
    );

    await flushTerminalEffects();

    expect(mockNativeVteBridge.probeNativeVte).not.toHaveBeenCalled();
    expect(mockNativeVteBridge.openNativeVtePanel).not.toHaveBeenCalled();
    expect(view.container.querySelector('[data-testid="terminal-native-placeholder"]')).toBeNull();
    expect(
      view.container.querySelector('[data-testid="terminal-renderer-fallback-copy"]')
    ).toBeNull();
  });

  test('probe failure keeps the live xterm session without native open churn', async () => {
    mockNativeVteBridge.isNativeVteRuntimeAvailable.mockReturnValue(true);
    mockNativeVteBridge.probeNativeVte.mockResolvedValue({ ready: false, reason: 'probe-failed' });

    const view = await renderIntoDom(
      React.createElement(TerminalTTY, {
        id: 'term-native-fallback',
        requestedRendererMode: 'vte-experimental',
        autoFocus: true,
        isActivePanel: true,
        runtimePlatform: 'linux',
        showQuickCopyButton: false,
      })
    );

    await flushTerminalEffects();

    expect(mockNativeVteBridge.openNativeVtePanel).not.toHaveBeenCalled();
    expect(mockTerminalInstances).toHaveLength(1);
    expect(
      view.container.querySelector('[data-testid="terminal-renderer-fallback-banner"]')
    ).toBeNull();
    expect(view.container.querySelector('[data-testid="terminal-native-placeholder"]')).toBeNull();
  });

  test('re-probes after window focus when startup probe failed and opens native once the host becomes ready', async () => {
    mockNativeVteBridge.isNativeVteRuntimeAvailable.mockReturnValue(true);
    mockNativeVteBridge.probeNativeVte
      .mockResolvedValueOnce({ ready: false, reason: 'probe-failed' })
      .mockResolvedValueOnce({ ready: true, reason: null });
    mockNativeVteBridge.openNativeVtePanel.mockResolvedValue({ opened: true, reason: null });

    const view = await renderIntoDom(
      React.createElement(TerminalTTY, {
        id: 'term-native-reprobe-focus',
        requestedRendererMode: 'vte-experimental',
        autoFocus: true,
        isActivePanel: true,
        runtimePlatform: 'linux',
        showQuickCopyButton: false,
      })
    );

    await flushTerminalEffects();

    expect(mockNativeVteBridge.probeNativeVte).toHaveBeenCalledTimes(1);
    expect(mockNativeVteBridge.openNativeVtePanel).not.toHaveBeenCalled();

    window.dispatchEvent(new window.Event('focus'));
    await flushTerminalEffects();

    expect(mockNativeVteBridge.probeNativeVte).toHaveBeenCalledTimes(2);
    expect(mockNativeVteBridge.openNativeVtePanel).toHaveBeenCalledWith(
      expect.objectContaining({
        panelId: 'term-native-reprobe-focus',
      })
    );
    expect(
      view.container.querySelector('[data-testid="terminal-native-placeholder"]')
    ).not.toBeNull();
  });

  test('does not keep re-probing after a stronger native open failure takes over', async () => {
    mockNativeVteBridge.isNativeVteRuntimeAvailable.mockReturnValue(true);
    mockNativeVteBridge.probeNativeVte.mockResolvedValue({ ready: true, reason: null });
    mockNativeVteBridge.openNativeVtePanel.mockResolvedValue({
      opened: false,
      reason: 'open-failed',
    });

    await renderIntoDom(
      React.createElement(TerminalTTY, {
        id: 'term-native-no-reprobe-after-open-fail',
        requestedRendererMode: 'vte-experimental',
        autoFocus: true,
        isActivePanel: true,
        runtimePlatform: 'linux',
        showQuickCopyButton: false,
      })
    );

    await flushTerminalEffects();

    expect(mockNativeVteBridge.probeNativeVte).toHaveBeenCalledTimes(1);
    expect(mockNativeVteBridge.openNativeVtePanel).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new window.Event('focus'));
    await flushTerminalEffects();

    expect(mockNativeVteBridge.probeNativeVte).toHaveBeenCalledTimes(1);
    expect(mockNativeVteBridge.openNativeVtePanel).toHaveBeenCalledTimes(1);
  });

  test('clicking the fallback xterm shell focuses the live terminal when GTK VTE is not ready', async () => {
    mockNativeVteBridge.isNativeVteRuntimeAvailable.mockReturnValue(true);
    mockNativeVteBridge.probeNativeVte.mockResolvedValue({ ready: false, reason: 'probe-failed' });

    const view = await renderIntoDom(
      React.createElement(TerminalTTY, {
        id: 'term-native-fallback-focus',
        requestedRendererMode: 'vte-experimental',
        autoFocus: false,
        isActivePanel: true,
        runtimePlatform: 'linux',
        showQuickCopyButton: false,
      })
    );

    await flushTerminalEffects();

    const shell = view.container.querySelector('[data-testid="terminal-viewport-shell"]');
    expect(shell).not.toBeNull();
    expect(mockTerminalInstances).toHaveLength(1);

    mockTerminalInstances[0].focus.mockClear();
    shell.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
    await flushTerminalEffects();

    expect(mockTerminalInstances[0].focus).toHaveBeenCalledTimes(1);
  });

  test('clicking the shell focuses native GTK VTE without redirecting focus back into xterm', async () => {
    mockNativeVteBridge.isNativeVteRuntimeAvailable.mockReturnValue(true);
    mockNativeVteBridge.probeNativeVte.mockResolvedValue({ ready: true, reason: null });
    mockNativeVteBridge.openNativeVtePanel.mockResolvedValue({ opened: true, reason: null });

    const view = await renderIntoDom(
      React.createElement(TerminalTTY, {
        id: 'term-native-active-focus-guard',
        requestedRendererMode: 'vte-experimental',
        autoFocus: false,
        isActivePanel: true,
        runtimePlatform: 'linux',
        showQuickCopyButton: false,
      })
    );

    await flushTerminalEffects();

    const shell = view.container.querySelector('[data-testid="terminal-viewport-shell"]');
    expect(shell).not.toBeNull();
    expect(
      view.container.querySelector('[data-testid="terminal-native-placeholder"]')
    ).not.toBeNull();
    expect(mockTerminalInstances).toHaveLength(0);

    shell.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
    await flushTerminalEffects();

    expect(mockNativeVteBridge.focusNativeVtePanel).toHaveBeenCalledWith({
      panelId: 'term-native-active-focus-guard',
    });
  });

  test('clicking the native shell notifies React which panel should become active', async () => {
    mockNativeVteBridge.isNativeVteRuntimeAvailable.mockReturnValue(true);
    mockNativeVteBridge.probeNativeVte.mockResolvedValue({ ready: true, reason: null });
    mockNativeVteBridge.openNativeVtePanel.mockResolvedValue({ opened: true, reason: null });

    const onActivatePanel = jest.fn();
    const view = await renderIntoDom(
      React.createElement(TerminalTTY, {
        id: 'term-native-activate-react',
        requestedRendererMode: 'vte-experimental',
        autoFocus: false,
        isActivePanel: false,
        runtimePlatform: 'linux',
        showQuickCopyButton: false,
        onActivatePanel,
      })
    );

    await flushTerminalEffects();

    const shell = view.container.querySelector('[data-testid="terminal-viewport-shell"]');
    shell.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
    await flushTerminalEffects();

    expect(onActivatePanel).toHaveBeenCalledWith('term-native-activate-react');
    expect(mockNativeVteBridge.focusNativeVtePanel).toHaveBeenCalledWith({
      panelId: 'term-native-activate-react',
    });
  });

  test('computes native bounds from the dedicated content rect instead of the whole terminal shell', () => {
    const element = {
      getBoundingClientRect: () => ({ left: 40, top: 96, width: 880, height: 540 }),
    };

    expect(getNativeTerminalBounds(element)).toEqual({
      x: 41,
      y: 97,
      width: 878,
      height: 538,
    });
  });

  test('rejects offscreen native bounds so hidden workspace panels are not resized into view', () => {
    const element = {
      getBoundingClientRect: () => ({
        left: -2000,
        top: 96,
        right: -1120,
        bottom: 636,
        width: 880,
        height: 540,
      }),
    };

    expect(getNativeTerminalBounds(element)).toBeNull();
  });

  test('native open failure falls back in place without blanking the live xterm session', async () => {
    mockNativeVteBridge.isNativeVteRuntimeAvailable.mockReturnValue(true);
    mockNativeVteBridge.probeNativeVte.mockResolvedValue({ ready: true, reason: null });
    mockNativeVteBridge.openNativeVtePanel.mockResolvedValue({
      opened: false,
      reason: 'open-failed',
    });

    const view = await renderIntoDom(
      React.createElement(TerminalTTY, {
        id: 'term-native-open-fail',
        requestedRendererMode: 'vte-experimental',
        autoFocus: true,
        isActivePanel: true,
        runtimePlatform: 'linux',
        showQuickCopyButton: false,
      })
    );

    await flushTerminalEffects();

    expect(
      view.container.querySelector('[data-testid="terminal-renderer-fallback-banner"]')
    ).toBeNull();
    expect(view.container.querySelector('[data-testid="terminal-native-placeholder"]')).toBeNull();
    expect(mockNativeVteBridge.closeNativeVtePanel).not.toHaveBeenCalled();
  });

  test('boots xterm immediately even when startup visibility and dimensions are not ready yet', async () => {
    let visibilityState = 'hidden';
    let rect = { width: 0, height: 0 };
    const originalVisibilityDescriptor = Object.getOwnPropertyDescriptor(
      document,
      'visibilityState'
    );

    try {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => visibilityState,
      });

      Object.defineProperty(global.HTMLElement.prototype, 'getBoundingClientRect', {
        configurable: true,
        value() {
          return {
            width: rect.width,
            height: rect.height,
            top: 0,
            left: 0,
            right: rect.width,
            bottom: rect.height,
          };
        },
      });

      const view = await renderIntoDom(
        React.createElement(TerminalTTY, {
          id: 'term-hidden-startup',
          autoFocus: true,
          isActivePanel: true,
          isVisibleInLayout: true,
          showQuickCopyButton: false,
        })
      );

      expect(mockTerminalInstances).toHaveLength(1);
      expect(mockTerminalInstances[0].open).toHaveBeenCalledTimes(1);
      expect(mockWebSocketInstances).toHaveLength(1);
      expect(view.container.textContent).not.toContain('Iniciando terminal...');

      rect = { width: 1280, height: 720 };
      visibilityState = 'visible';
      mockResizeObserverInstances[0]?.callback();
      await flushTerminalEffects();

      expect(mockTerminalInstances[0].open).toHaveBeenCalledTimes(1);
    } finally {
      if (originalVisibilityDescriptor) {
        Object.defineProperty(document, 'visibilityState', originalVisibilityDescriptor);
      } else {
        delete document.visibilityState;
      }
    }
  });

  test('hides the native lease only when the panel leaves the visible layout and restores it on return', async () => {
    mockNativeVteBridge.isNativeVteRuntimeAvailable.mockReturnValue(true);
    mockNativeVteBridge.probeNativeVte.mockResolvedValue({ ready: true, reason: null });
    mockNativeVteBridge.openNativeVtePanel.mockResolvedValue({ opened: true, reason: null });

    const view = await renderIntoDom(
      React.createElement(TerminalTTY, {
        id: 'term-native-close',
        requestedRendererMode: 'vte-experimental',
        autoFocus: true,
        isActivePanel: true,
        isVisibleInLayout: true,
        runtimePlatform: 'linux',
        showQuickCopyButton: false,
      })
    );

    await flushTerminalEffects();
    expect(mockNativeVteBridge.openNativeVtePanel).toHaveBeenCalledTimes(1);
    mockNativeVteBridge.focusNativeVtePanel.mockClear();
    mockNativeVteBridge.resizeNativeVtePanel.mockClear();
    mockNativeVteBridge.setNativeVtePanelVisibility.mockClear();

    await rerenderIntoRoot(
      view.root,
      React.createElement(TerminalTTY, {
        id: 'term-native-close',
        requestedRendererMode: 'vte-experimental',
        autoFocus: false,
        isActivePanel: false,
        isVisibleInLayout: false,
        runtimePlatform: 'linux',
        showQuickCopyButton: false,
      })
    );
    await flushTerminalEffects();

    expect(mockNativeVteBridge.closeNativeVtePanel).not.toHaveBeenCalledWith(
      expect.objectContaining({
        panelId: 'term-native-close',
        reason: 'inactive-panel',
      })
    );
    expect(mockNativeVteBridge.openNativeVtePanel).toHaveBeenCalledTimes(1);
    expect(mockNativeVteBridge.setNativeVtePanelVisibility).toHaveBeenCalledWith(
      expect.objectContaining({
        panelId: 'term-native-close',
        visible: false,
      })
    );
    expect(mockNativeVteBridge.focusNativeVtePanel).not.toHaveBeenCalled();
    expect(mockNativeVteBridge.resizeNativeVtePanel).not.toHaveBeenCalled();

    await rerenderIntoRoot(
      view.root,
      React.createElement(TerminalTTY, {
        id: 'term-native-close',
        requestedRendererMode: 'vte-experimental',
        autoFocus: true,
        isActivePanel: true,
        isVisibleInLayout: true,
        runtimePlatform: 'linux',
        showQuickCopyButton: false,
      })
    );
    await flushTerminalEffects();

    expect(mockNativeVteBridge.openNativeVtePanel).toHaveBeenCalledTimes(1);
    expect(mockNativeVteBridge.setNativeVtePanelVisibility).toHaveBeenCalledWith({
      panelId: 'term-native-close',
      visible: true,
      bounds: expect.objectContaining({ width: 1278, height: 718 }),
    });
    expect(mockNativeVteBridge.focusNativeVtePanel).toHaveBeenCalledWith({
      panelId: 'term-native-close',
    });
    expect(mockNativeVteBridge.resizeNativeVtePanel).toHaveBeenCalledWith(
      expect.objectContaining({
        panelId: 'term-native-close',
        bounds: expect.objectContaining({ width: 1278, height: 718 }),
      })
    );
  });

  test('keeps an inactive-but-visible native split panel rendered without reopening churn', async () => {
    mockNativeVteBridge.isNativeVteRuntimeAvailable.mockReturnValue(true);
    mockNativeVteBridge.probeNativeVte.mockResolvedValue({ ready: true, reason: null });
    mockNativeVteBridge.openNativeVtePanel.mockResolvedValue({ opened: true, reason: null });

    const view = await renderIntoDom(
      React.createElement(TerminalTTY, {
        id: 'term-native-idle-overlay',
        requestedRendererMode: 'vte-experimental',
        autoFocus: true,
        isActivePanel: true,
        isVisibleInLayout: true,
        runtimePlatform: 'linux',
        showQuickCopyButton: false,
      })
    );

    await flushTerminalEffects();

    await rerenderIntoRoot(
      view.root,
      React.createElement(TerminalTTY, {
        id: 'term-native-idle-overlay',
        requestedRendererMode: 'vte-experimental',
        autoFocus: false,
        isActivePanel: false,
        isVisibleInLayout: true,
        runtimePlatform: 'linux',
        showQuickCopyButton: false,
      })
    );
    await flushTerminalEffects();

    expect(
      view.container.querySelector('[data-testid="terminal-native-placeholder"]')
    ).not.toBeNull();
    expect(view.container.textContent).not.toContain('Iniciando terminal...');
    expect(mockNativeVteBridge.openNativeVtePanel).toHaveBeenCalledTimes(1);
  });

  test('retries native open after startup bounds settle without requiring a workspace switch', async () => {
    mockNativeVteBridge.isNativeVteRuntimeAvailable.mockReturnValue(true);
    mockNativeVteBridge.probeNativeVte.mockResolvedValue({ ready: true, reason: null });
    mockNativeVteBridge.openNativeVtePanel.mockResolvedValue({ opened: true, reason: null });

    const originalGetBoundingClientRect = global.HTMLElement.prototype.getBoundingClientRect;
    let rect = { width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 };

    Object.defineProperty(global.HTMLElement.prototype, 'getBoundingClientRect', {
      configurable: true,
      value() {
        return { ...rect };
      },
    });

    try {
      const view = await renderIntoDom(
        React.createElement(TerminalTTY, {
          id: 'term-native-open-after-bounds-settle',
          requestedRendererMode: 'vte-experimental',
          autoFocus: true,
          isActivePanel: true,
          isVisibleInLayout: true,
          runtimePlatform: 'linux',
          showQuickCopyButton: false,
        })
      );

      await flushTerminalEffects();

      expect(mockNativeVteBridge.probeNativeVte).toHaveBeenCalledTimes(1);
      expect(mockNativeVteBridge.openNativeVtePanel).not.toHaveBeenCalled();
      expect(view.container.textContent).toContain('Iniciando terminal...');

      rect = { width: 1280, height: 720, top: 0, left: 0, right: 1280, bottom: 720 };

      await new Promise((resolve) => setTimeout(resolve, 320));
      await flushTerminalEffects();

      expect(mockNativeVteBridge.openNativeVtePanel).toHaveBeenCalledWith(
        expect.objectContaining({
          panelId: 'term-native-open-after-bounds-settle',
          bounds: expect.objectContaining({ width: 1278, height: 718 }),
        })
      );
      expect(view.container.textContent).not.toContain('Iniciando terminal...');
    } finally {
      Object.defineProperty(global.HTMLElement.prototype, 'getBoundingClientRect', {
        configurable: true,
        value: originalGetBoundingClientRect,
      });
    }
  });

  test('reopens a preserved native lease if another active panel stole the registry while inactive', async () => {
    mockNativeVteBridge.isNativeVteRuntimeAvailable.mockReturnValue(true);
    mockNativeVteBridge.probeNativeVte.mockResolvedValue({ ready: true, reason: null });
    mockNativeVteBridge.openNativeVtePanel.mockResolvedValue({ opened: true, reason: null });

    const view = await renderIntoDom(
      React.createElement(TerminalTTY, {
        id: 'term-native-stolen-lease',
        requestedRendererMode: 'vte-experimental',
        autoFocus: true,
        isActivePanel: true,
        isVisibleInLayout: true,
        runtimePlatform: 'linux',
        showQuickCopyButton: false,
      })
    );

    await flushTerminalEffects();
    expect(mockNativeVteBridge.openNativeVtePanel).toHaveBeenCalledTimes(1);

    await rerenderIntoRoot(
      view.root,
      React.createElement(TerminalTTY, {
        id: 'term-native-stolen-lease',
        requestedRendererMode: 'vte-experimental',
        autoFocus: false,
        isActivePanel: false,
        isVisibleInLayout: false,
        runtimePlatform: 'linux',
        showQuickCopyButton: false,
      })
    );
    await flushTerminalEffects();

    expect(mockNativeVteBridge.setNativeVtePanelVisibility).toHaveBeenCalledWith(
      expect.objectContaining({
        panelId: 'term-native-stolen-lease',
        visible: false,
      })
    );
    mockNativeVteBridge.setNativeVtePanelVisibility.mockClear();

    let rejectedVisibleLeaseOnce = false;
    mockNativeVteBridge.setNativeVtePanelVisibility.mockImplementation(({ visible }) => {
      if (visible && !rejectedVisibleLeaseOnce) {
        rejectedVisibleLeaseOnce = true;
        return Promise.reject(new Error('panel-not-active'));
      }

      return Promise.resolve();
    });

    await rerenderIntoRoot(
      view.root,
      React.createElement(TerminalTTY, {
        id: 'term-native-stolen-lease',
        requestedRendererMode: 'vte-experimental',
        autoFocus: true,
        isActivePanel: true,
        isVisibleInLayout: true,
        runtimePlatform: 'linux',
        showQuickCopyButton: false,
      })
    );
    await flushTerminalEffects();
    await flushTerminalEffects();

    expect(mockNativeVteBridge.setNativeVtePanelVisibility).toHaveBeenCalledWith({
      panelId: 'term-native-stolen-lease',
      visible: true,
      bounds: expect.objectContaining({ width: 1278, height: 718 }),
    });
    expect(mockNativeVteBridge.openNativeVtePanel).toHaveBeenCalledTimes(2);
  });

  test('re-shows a hidden native panel without forcing close when the workspace becomes visible again', async () => {
    mockNativeVteBridge.isNativeVteRuntimeAvailable.mockReturnValue(true);
    mockNativeVteBridge.probeNativeVte.mockResolvedValue({ ready: true, reason: null });
    mockNativeVteBridge.openNativeVtePanel.mockResolvedValue({ opened: true, reason: null });

    const view = await renderIntoDom(
      React.createElement(TerminalTTY, {
        id: 'term-native-reshow-visible',
        requestedRendererMode: 'vte-experimental',
        autoFocus: true,
        isActivePanel: true,
        isVisibleInLayout: true,
        runtimePlatform: 'linux',
        showQuickCopyButton: false,
      })
    );

    await flushTerminalEffects();
    mockNativeVteBridge.setNativeVtePanelVisibility.mockClear();
    mockNativeVteBridge.closeNativeVtePanel.mockClear();

    await rerenderIntoRoot(
      view.root,
      React.createElement(TerminalTTY, {
        id: 'term-native-reshow-visible',
        requestedRendererMode: 'vte-experimental',
        autoFocus: false,
        isActivePanel: false,
        isVisibleInLayout: false,
        runtimePlatform: 'linux',
        showQuickCopyButton: false,
      })
    );
    await flushTerminalEffects();

    expect(mockNativeVteBridge.setNativeVtePanelVisibility).toHaveBeenCalledWith({
      panelId: 'term-native-reshow-visible',
      visible: false,
    });
    expect(mockNativeVteBridge.closeNativeVtePanel).not.toHaveBeenCalled();

    mockNativeVteBridge.setNativeVtePanelVisibility.mockClear();

    await rerenderIntoRoot(
      view.root,
      React.createElement(TerminalTTY, {
        id: 'term-native-reshow-visible',
        requestedRendererMode: 'vte-experimental',
        autoFocus: false,
        isActivePanel: false,
        isVisibleInLayout: true,
        runtimePlatform: 'linux',
        showQuickCopyButton: false,
      })
    );
    await flushTerminalEffects();

    expect(mockNativeVteBridge.setNativeVtePanelVisibility).toHaveBeenCalledWith({
      panelId: 'term-native-reshow-visible',
      visible: true,
      bounds: expect.objectContaining({ width: 1278, height: 718 }),
    });
    expect(mockNativeVteBridge.closeNativeVtePanel).not.toHaveBeenCalled();
  });

  test('workspace sync event hides inactive native panels and resizes active panels after switch', async () => {
    mockNativeVteBridge.isNativeVteRuntimeAvailable.mockReturnValue(true);
    mockNativeVteBridge.probeNativeVte.mockResolvedValue({ ready: true, reason: null });
    mockNativeVteBridge.openNativeVtePanel.mockResolvedValue({ opened: true, reason: null });

    await renderIntoDom(
      React.createElement(TerminalTTY, {
        id: 'term-native-workspace-sync',
        requestedRendererMode: 'vte-experimental',
        autoFocus: true,
        isActivePanel: true,
        isVisibleInLayout: true,
        runtimePlatform: 'linux',
        showQuickCopyButton: false,
      })
    );

    await flushTerminalEffects();
    mockNativeVteBridge.setNativeVtePanelVisibility.mockClear();
    mockNativeVteBridge.resizeNativeVtePanel.mockClear();

    window.dispatchEvent(
      new window.CustomEvent('devhub:native-vte-workspace-sync', {
        detail: {
          activeWorkspaceId: 'ws2',
          activePanelIds: ['other-panel'],
          hiddenPanelIds: ['term-native-workspace-sync'],
          reason: 'workspace-switch',
        },
      })
    );
    await flushTerminalEffects();

    expect(mockNativeVteBridge.setNativeVtePanelVisibility).toHaveBeenCalledWith({
      panelId: 'term-native-workspace-sync',
      visible: false,
      reason: 'workspace-switch',
    });

    mockNativeVteBridge.setNativeVtePanelVisibility.mockClear();
    mockNativeVteBridge.resizeNativeVtePanel.mockClear();

    window.dispatchEvent(
      new window.CustomEvent('devhub:native-vte-workspace-sync', {
        detail: {
          activeWorkspaceId: 'ws1',
          activePanelIds: ['term-native-workspace-sync'],
          hiddenPanelIds: ['other-panel'],
          reason: 'workspace-switch',
        },
      })
    );
    await flushTerminalEffects();

    expect(mockNativeVteBridge.setNativeVtePanelVisibility).toHaveBeenCalledWith({
      panelId: 'term-native-workspace-sync',
      visible: true,
      bounds: expect.objectContaining({ width: 1278, height: 718 }),
    });
    expect(mockNativeVteBridge.resizeNativeVtePanel).toHaveBeenCalledWith(
      expect.objectContaining({
        panelId: 'term-native-workspace-sync',
        bounds: expect.objectContaining({ width: 1278, height: 718 }),
      })
    );
  });

  test('temporarily hides native surfaces during explicit suspension and restores visibility resize and focus after resume', async () => {
    mockNativeVteBridge.isNativeVteRuntimeAvailable.mockReturnValue(true);
    mockNativeVteBridge.probeNativeVte.mockResolvedValue({ ready: true, reason: null });
    mockNativeVteBridge.openNativeVtePanel.mockResolvedValue({ opened: true, reason: null });

    const view = await renderIntoDom(
      React.createElement(TerminalTTY, {
        id: 'term-native-suspend-resume',
        requestedRendererMode: 'vte-experimental',
        autoFocus: true,
        isActivePanel: true,
        isVisibleInLayout: true,
        runtimePlatform: 'linux',
        showQuickCopyButton: false,
        suspendNativeSurface: false,
      })
    );

    await flushTerminalEffects();
    mockNativeVteBridge.setNativeVtePanelVisibility.mockClear();
    mockNativeVteBridge.resizeNativeVtePanel.mockClear();
    mockNativeVteBridge.focusNativeVtePanel.mockClear();

    await rerenderIntoRoot(
      view.root,
      React.createElement(TerminalTTY, {
        id: 'term-native-suspend-resume',
        requestedRendererMode: 'vte-experimental',
        autoFocus: true,
        isActivePanel: true,
        isVisibleInLayout: true,
        runtimePlatform: 'linux',
        showQuickCopyButton: false,
        suspendNativeSurface: true,
      })
    );
    await flushTerminalEffects();

    expect(mockNativeVteBridge.setNativeVtePanelVisibility).toHaveBeenCalledWith({
      panelId: 'term-native-suspend-resume',
      visible: false,
      reason: 'suspended',
    });
    expect(mockNativeVteBridge.resizeNativeVtePanel).not.toHaveBeenCalled();
    expect(mockNativeVteBridge.focusNativeVtePanel).not.toHaveBeenCalled();

    mockNativeVteBridge.setNativeVtePanelVisibility.mockClear();
    mockNativeVteBridge.resizeNativeVtePanel.mockClear();
    mockNativeVteBridge.focusNativeVtePanel.mockClear();

    await rerenderIntoRoot(
      view.root,
      React.createElement(TerminalTTY, {
        id: 'term-native-suspend-resume',
        requestedRendererMode: 'vte-experimental',
        autoFocus: true,
        isActivePanel: true,
        isVisibleInLayout: true,
        runtimePlatform: 'linux',
        showQuickCopyButton: false,
        suspendNativeSurface: false,
      })
    );
    await flushTerminalEffects();

    expect(mockNativeVteBridge.setNativeVtePanelVisibility).toHaveBeenCalledWith({
      panelId: 'term-native-suspend-resume',
      visible: true,
      bounds: expect.objectContaining({ width: 1278, height: 718 }),
    });
    expect(mockNativeVteBridge.resizeNativeVtePanel).toHaveBeenCalledWith(
      expect.objectContaining({
        panelId: 'term-native-suspend-resume',
        bounds: expect.objectContaining({ width: 1278, height: 718 }),
      })
    );
    expect(mockNativeVteBridge.focusNativeVtePanel).toHaveBeenCalledWith({
      panelId: 'term-native-suspend-resume',
    });
  });

  test('dock side-by-side policy hides native lease without booting xterm fallback and restores native when policy clears', async () => {
    mockNativeVteBridge.isNativeVteRuntimeAvailable.mockReturnValue(true);
    mockNativeVteBridge.probeNativeVte.mockResolvedValue({ ready: true, reason: null });
    mockNativeVteBridge.openNativeVtePanel.mockResolvedValue({ opened: true, reason: null });

    const view = await renderIntoDom(
      React.createElement(TerminalTTY, {
        id: 'term-native-dock-fallback',
        requestedRendererMode: 'vte-experimental',
        autoFocus: true,
        isActivePanel: true,
        isVisibleInLayout: true,
        runtimePlatform: 'linux',
        showQuickCopyButton: false,
        suspendNativeSurface: false,
        nativeSurfacePolicy: 'live',
      })
    );

    await flushTerminalEffects();
    expect(
      view.container.querySelector('[data-testid="terminal-native-placeholder"]')
    ).not.toBeNull();
    expect(mockTerminalInstances).toHaveLength(0);

    mockNativeVteBridge.setNativeVtePanelVisibility.mockClear();

    await rerenderIntoRoot(
      view.root,
      React.createElement(TerminalTTY, {
        id: 'term-native-dock-fallback',
        requestedRendererMode: 'vte-experimental',
        autoFocus: true,
        isActivePanel: true,
        isVisibleInLayout: true,
        runtimePlatform: 'linux',
        showQuickCopyButton: false,
        suspendNativeSurface: true,
        nativeSurfacePolicy: 'dock-side-by-side',
      })
    );
    await flushTerminalEffects();

    expect(mockNativeVteBridge.setNativeVtePanelVisibility).toHaveBeenCalledWith({
      panelId: 'term-native-dock-fallback',
      visible: false,
      reason: 'dock-side-by-side',
    });
    expect(
      view.container.querySelector('[data-testid="terminal-native-placeholder"]')
    ).not.toBeNull();
    expect(view.container.querySelector('.devhub-xterm-container')).not.toBeNull();
    expect(mockTerminalInstances).toHaveLength(0);

    mockNativeVteBridge.setNativeVtePanelVisibility.mockClear();
    mockNativeVteBridge.resizeNativeVtePanel.mockClear();
    mockNativeVteBridge.focusNativeVtePanel.mockClear();

    await rerenderIntoRoot(
      view.root,
      React.createElement(TerminalTTY, {
        id: 'term-native-dock-fallback',
        requestedRendererMode: 'vte-experimental',
        autoFocus: true,
        isActivePanel: true,
        isVisibleInLayout: true,
        runtimePlatform: 'linux',
        showQuickCopyButton: false,
        suspendNativeSurface: false,
        nativeSurfacePolicy: 'live',
      })
    );
    await flushTerminalEffects();

    expect(mockNativeVteBridge.setNativeVtePanelVisibility).toHaveBeenCalledWith({
      panelId: 'term-native-dock-fallback',
      visible: true,
      bounds: expect.objectContaining({ width: 1278, height: 718 }),
    });
    expect(mockNativeVteBridge.resizeNativeVtePanel).toHaveBeenCalledWith(
      expect.objectContaining({ panelId: 'term-native-dock-fallback' })
    );
    expect(mockNativeVteBridge.focusNativeVtePanel).toHaveBeenCalledWith({
      panelId: 'term-native-dock-fallback',
    });
    expect(
      view.container.querySelector('[data-testid="terminal-native-placeholder"]')
    ).not.toBeNull();
  });

  test('restores every visible native split sibling with fresh bounds after shared resize suspension ends', async () => {
    mockNativeVteBridge.isNativeVteRuntimeAvailable.mockReturnValue(true);
    mockNativeVteBridge.probeNativeVte.mockResolvedValue({ ready: true, reason: null });
    mockNativeVteBridge.openNativeVtePanel.mockResolvedValue({ opened: true, reason: null });

    const view = await renderIntoDom(
      React.createElement(
        React.Fragment,
        null,
        React.createElement(TerminalTTY, {
          id: 'term-native-suspend-left',
          requestedRendererMode: 'vte-experimental',
          autoFocus: true,
          isActivePanel: true,
          isVisibleInLayout: true,
          runtimePlatform: 'linux',
          showQuickCopyButton: false,
          suspendNativeSurface: false,
        }),
        React.createElement(TerminalTTY, {
          id: 'term-native-suspend-right',
          requestedRendererMode: 'vte-experimental',
          autoFocus: false,
          isActivePanel: false,
          isVisibleInLayout: true,
          runtimePlatform: 'linux',
          showQuickCopyButton: false,
          suspendNativeSurface: false,
        })
      )
    );

    await flushTerminalEffects();
    mockNativeVteBridge.setNativeVtePanelVisibility.mockClear();

    await rerenderIntoRoot(
      view.root,
      React.createElement(
        React.Fragment,
        null,
        React.createElement(TerminalTTY, {
          id: 'term-native-suspend-left',
          requestedRendererMode: 'vte-experimental',
          autoFocus: true,
          isActivePanel: true,
          isVisibleInLayout: true,
          runtimePlatform: 'linux',
          showQuickCopyButton: false,
          suspendNativeSurface: true,
        }),
        React.createElement(TerminalTTY, {
          id: 'term-native-suspend-right',
          requestedRendererMode: 'vte-experimental',
          autoFocus: false,
          isActivePanel: false,
          isVisibleInLayout: true,
          runtimePlatform: 'linux',
          showQuickCopyButton: false,
          suspendNativeSurface: true,
        })
      )
    );
    await flushTerminalEffects();

    mockNativeVteBridge.setNativeVtePanelVisibility.mockClear();
    mockNativeVteBridge.resizeNativeVtePanel.mockClear();
    mockNativeVteBridge.focusNativeVtePanel.mockClear();

    await rerenderIntoRoot(
      view.root,
      React.createElement(
        React.Fragment,
        null,
        React.createElement(TerminalTTY, {
          id: 'term-native-suspend-left',
          requestedRendererMode: 'vte-experimental',
          autoFocus: true,
          isActivePanel: true,
          isVisibleInLayout: true,
          runtimePlatform: 'linux',
          showQuickCopyButton: false,
          suspendNativeSurface: false,
        }),
        React.createElement(TerminalTTY, {
          id: 'term-native-suspend-right',
          requestedRendererMode: 'vte-experimental',
          autoFocus: false,
          isActivePanel: false,
          isVisibleInLayout: true,
          runtimePlatform: 'linux',
          showQuickCopyButton: false,
          suspendNativeSurface: false,
        })
      )
    );
    await flushTerminalEffects();

    expect(mockNativeVteBridge.setNativeVtePanelVisibility).toHaveBeenCalledWith({
      panelId: 'term-native-suspend-left',
      visible: true,
      bounds: expect.objectContaining({ width: 1278, height: 718 }),
    });
    expect(mockNativeVteBridge.setNativeVtePanelVisibility).toHaveBeenCalledWith({
      panelId: 'term-native-suspend-right',
      visible: true,
      bounds: expect.objectContaining({ width: 1278, height: 718 }),
    });
    expect(mockNativeVteBridge.resizeNativeVtePanel).toHaveBeenCalledWith(
      expect.objectContaining({ panelId: 'term-native-suspend-left' })
    );
    expect(mockNativeVteBridge.resizeNativeVtePanel).toHaveBeenCalledWith(
      expect.objectContaining({ panelId: 'term-native-suspend-right' })
    );
    expect(mockNativeVteBridge.focusNativeVtePanel).toHaveBeenCalledWith({
      panelId: 'term-native-suspend-left',
    });
  });

  test('runtime fallback remains local when one visible native sibling fails', async () => {
    mockNativeVteBridge.isNativeVteRuntimeAvailable.mockReturnValue(true);
    mockNativeVteBridge.probeNativeVte.mockResolvedValue({ ready: true, reason: null });
    mockNativeVteBridge.openNativeVtePanel.mockResolvedValue({ opened: true, reason: null });

    const view = await renderIntoDom(
      React.createElement(
        React.Fragment,
        null,
        React.createElement(TerminalTTY, {
          id: 'term-native-runtime-a',
          requestedRendererMode: 'vte-experimental',
          autoFocus: true,
          isActivePanel: true,
          isVisibleInLayout: true,
          runtimePlatform: 'linux',
          showQuickCopyButton: false,
        }),
        React.createElement(TerminalTTY, {
          id: 'term-native-runtime-b',
          requestedRendererMode: 'vte-experimental',
          autoFocus: false,
          isActivePanel: false,
          isVisibleInLayout: true,
          runtimePlatform: 'linux',
          showQuickCopyButton: false,
        })
      )
    );

    await flushTerminalEffects();

    window.dispatchEvent(
      new window.CustomEvent('devhub:terminal-native-vte-event', {
        detail: {
          panelId: 'term-native-runtime-a',
          type: 'runtime-error',
          reason: 'open-failed',
        },
      })
    );
    await flushTerminalEffects();

    const placeholders = view.container.querySelectorAll(
      '[data-testid="terminal-native-placeholder"]'
    );
    expect(placeholders).toHaveLength(1);
    expect(view.container.textContent).not.toContain('GTK VTE · misma ventana');
  });

  test('closes the native lease on React unmount when the panel owns the live native session', async () => {
    mockNativeVteBridge.isNativeVteRuntimeAvailable.mockReturnValue(true);
    mockNativeVteBridge.probeNativeVte.mockResolvedValue({ ready: true, reason: null });
    mockNativeVteBridge.openNativeVtePanel.mockResolvedValue({ opened: true, reason: null });

    const view = await renderIntoDom(
      React.createElement(TerminalTTY, {
        id: 'term-native-unmount-hide',
        requestedRendererMode: 'vte-experimental',
        autoFocus: true,
        isActivePanel: true,
        runtimePlatform: 'linux',
        showQuickCopyButton: false,
      })
    );

    await flushTerminalEffects();
    mockNativeVteBridge.closeNativeVtePanel.mockClear();
    mockNativeVteBridge.setNativeVtePanelVisibility.mockClear();

    await rerenderIntoRoot(view.root, null);
    await flushTerminalEffects();

    expect(mockNativeVteBridge.setNativeVtePanelVisibility).not.toHaveBeenCalled();
    expect(mockNativeVteBridge.closeNativeVtePanel).toHaveBeenCalledWith({
      panelId: 'term-native-unmount-hide',
      reason: 'unmount',
    });
  });

  test('hides a native panel that finishes opening after the terminal route is hidden', async () => {
    mockNativeVteBridge.isNativeVteRuntimeAvailable.mockReturnValue(true);
    mockNativeVteBridge.probeNativeVte.mockResolvedValue({ ready: true, reason: null });

    let resolveOpen;
    mockNativeVteBridge.openNativeVtePanel.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveOpen = resolve;
        })
    );

    const view = await renderIntoDom(
      React.createElement(TerminalTTY, {
        id: 'term-native-open-hidden-race',
        requestedRendererMode: 'vte-experimental',
        autoFocus: true,
        isActivePanel: true,
        isVisibleInLayout: true,
        runtimePlatform: 'linux',
        showQuickCopyButton: false,
      })
    );

    await flushTerminalEffects();
    expect(mockNativeVteBridge.openNativeVtePanel).toHaveBeenCalledWith(
      expect.objectContaining({ panelId: 'term-native-open-hidden-race' })
    );

    await rerenderIntoRoot(
      view.root,
      React.createElement(TerminalTTY, {
        id: 'term-native-open-hidden-race',
        requestedRendererMode: 'vte-experimental',
        autoFocus: false,
        isActivePanel: false,
        isVisibleInLayout: false,
        runtimePlatform: 'linux',
        showQuickCopyButton: false,
      })
    );
    await flushTerminalEffects();

    mockNativeVteBridge.setNativeVtePanelVisibility.mockClear();
    resolveOpen({ opened: true, reason: null });
    await flushTerminalEffects();

    expect(mockNativeVteBridge.setNativeVtePanelVisibility).toHaveBeenCalledWith({
      panelId: 'term-native-open-hidden-race',
      visible: false,
      reason: 'layout-hidden',
    });
    expect(mockNativeVteBridge.closeNativeVtePanel).not.toHaveBeenCalledWith(
      expect.objectContaining({ panelId: 'term-native-open-hidden-race' })
    );
  });

  test('closes the native lease when the owning terminal session is explicitly removed', async () => {
    mockNativeVteBridge.isNativeVteRuntimeAvailable.mockReturnValue(true);
    mockNativeVteBridge.probeNativeVte.mockResolvedValue({ ready: true, reason: null });
    mockNativeVteBridge.openNativeVtePanel.mockResolvedValue({ opened: true, reason: null });

    await renderIntoDom(
      React.createElement(TerminalTTY, {
        id: 'term-native-explicit-close',
        requestedRendererMode: 'vte-experimental',
        autoFocus: true,
        isActivePanel: true,
        runtimePlatform: 'linux',
        showQuickCopyButton: false,
      })
    );

    await flushTerminalEffects();
    mockNativeVteBridge.closeNativeVtePanel.mockClear();

    window.dispatchEvent(
      new window.CustomEvent('devhub:terminal-session-closing', {
        detail: { panelId: 'term-native-explicit-close' },
      })
    );
    await flushTerminalEffects();

    expect(mockNativeVteBridge.closeNativeVtePanel).toHaveBeenCalledWith({
      panelId: 'term-native-explicit-close',
      reason: 'session-close',
    });
  });

  test('runtime native errors recover the same panel back to xterm in place', async () => {
    mockNativeVteBridge.isNativeVteRuntimeAvailable.mockReturnValue(true);
    mockNativeVteBridge.probeNativeVte.mockResolvedValue({ ready: true, reason: null });
    mockNativeVteBridge.openNativeVtePanel.mockResolvedValue({ opened: true, reason: null });

    const view = await renderIntoDom(
      React.createElement(TerminalTTY, {
        id: 'term-native-runtime-error',
        requestedRendererMode: 'vte-experimental',
        autoFocus: true,
        isActivePanel: true,
        runtimePlatform: 'linux',
        showQuickCopyButton: false,
      })
    );

    await flushTerminalEffects();
    expect(
      view.container.querySelector('[data-testid="terminal-native-placeholder"]')
    ).not.toBeNull();

    window.dispatchEvent(
      new window.CustomEvent('devhub:terminal-native-vte-event', {
        detail: {
          panelId: 'term-native-runtime-error',
          type: 'runtime-error',
          reason: 'open-failed',
        },
      })
    );
    await flushTerminalEffects();

    expect(view.container.querySelector('[data-testid="terminal-native-placeholder"]')).toBeNull();
    expect(
      view.container.querySelector('[data-testid="terminal-renderer-fallback-banner"]')
    ).toBeNull();
    expect(mockTerminalInstances.length).toBeGreaterThan(0);
  });

  test('non-active registry routing errors keep the same xterm instance alive without remount churn', async () => {
    mockNativeVteBridge.isNativeVteRuntimeAvailable.mockReturnValue(true);
    mockNativeVteBridge.probeNativeVte.mockResolvedValue({ ready: true, reason: null });
    mockNativeVteBridge.openNativeVtePanel.mockResolvedValue({
      opened: false,
      reason: 'panel-not-active',
    });

    const view = await renderIntoDom(
      React.createElement(TerminalTTY, {
        id: 'term-native-panel-routing-fallback',
        requestedRendererMode: 'vte-experimental',
        autoFocus: true,
        isActivePanel: true,
        runtimePlatform: 'linux',
        showQuickCopyButton: false,
      })
    );

    await flushTerminalEffects();

    expect(mockTerminalInstances).toHaveLength(1);
    const originalTerminal = mockTerminalInstances[0];
    expect(view.container.querySelector('[data-testid="terminal-native-placeholder"]')).toBeNull();
    expect(
      view.container.querySelector('[data-testid="terminal-renderer-fallback-banner"]')
    ).toBeNull();
    expect(mockTerminalInstances[0]).toBe(originalTerminal);
  });

  test('Ctrl+Shift+V pastes into xterm without falling through to workspace shortcuts', async () => {
    const clipboard = {
      writeText: jest.fn().mockResolvedValue(undefined),
      readText: jest.fn().mockResolvedValue('npm test\n'),
    };
    Object.defineProperty(global.navigator, 'clipboard', {
      configurable: true,
      value: clipboard,
    });

    const view = await renderIntoDom(
      React.createElement(TerminalTTY, {
        id: 'term-paste-shortcut',
        requestedRendererMode: 'xterm',
        autoFocus: true,
        isActivePanel: true,
        runtimePlatform: 'linux',
        showQuickCopyButton: false,
      })
    );

    await flushTerminalEffects();

    const shell = view.container.querySelector('[data-testid="terminal-viewport-shell"]');
    const event = new window.KeyboardEvent('keydown', {
      key: 'V',
      ctrlKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    shell.dispatchEvent(event);
    await flushTerminalEffects();

    expect(clipboard.readText).toHaveBeenCalledTimes(1);
    expect(mockWebSocketInstances[0].send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'input', data: 'npm test\n' })
    );
    expect(mockTerminalInstances[0].paste).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
  });

  test('Ctrl+V is not intercepted as terminal paste in xterm', async () => {
    const clipboard = {
      writeText: jest.fn().mockResolvedValue(undefined),
      readText: jest.fn().mockResolvedValue('echo hello'),
    };
    Object.defineProperty(global.navigator, 'clipboard', {
      configurable: true,
      value: clipboard,
    });

    const view = await renderIntoDom(
      React.createElement(TerminalTTY, {
        id: 'term-paste-ctrlv',
        requestedRendererMode: 'xterm',
        autoFocus: true,
        isActivePanel: true,
        runtimePlatform: 'linux',
        showQuickCopyButton: false,
      })
    );

    await flushTerminalEffects();

    const shell = view.container.querySelector('[data-testid="terminal-viewport-shell"]');
    const event = new window.KeyboardEvent('keydown', {
      key: 'V',
      ctrlKey: true,
      shiftKey: false,
      bubbles: true,
      cancelable: true,
    });
    shell.dispatchEvent(event);
    await flushTerminalEffects();

    expect(clipboard.readText).not.toHaveBeenCalled();
    expect(mockTerminalInstances[0].paste).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  test('Shift+Insert also pastes into xterm', async () => {
    const clipboard = {
      writeText: jest.fn().mockResolvedValue(undefined),
      readText: jest.fn().mockResolvedValue('echo ok'),
    };
    Object.defineProperty(global.navigator, 'clipboard', {
      configurable: true,
      value: clipboard,
    });

    const view = await renderIntoDom(
      React.createElement(TerminalTTY, {
        id: 'term-paste-insert',
        requestedRendererMode: 'xterm',
        autoFocus: true,
        isActivePanel: true,
        runtimePlatform: 'linux',
        showQuickCopyButton: false,
      })
    );

    await flushTerminalEffects();

    const shell = view.container.querySelector('[data-testid="terminal-viewport-shell"]');
    const event = new window.KeyboardEvent('keydown', {
      key: 'Insert',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    shell.dispatchEvent(event);
    await flushTerminalEffects();

    expect(clipboard.readText).toHaveBeenCalledTimes(1);
    expect(mockWebSocketInstances[0].send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'input', data: 'echo ok' })
    );
    expect(mockTerminalInstances[0].paste).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
  });

  test('terminal context menu exposes paste even with no selection', async () => {
    const clipboard = {
      writeText: jest.fn().mockResolvedValue(undefined),
      readText: jest.fn().mockResolvedValue('pnpm dev'),
    };
    Object.defineProperty(global.navigator, 'clipboard', {
      configurable: true,
      value: clipboard,
    });

    const view = await renderIntoDom(
      React.createElement(TerminalTTY, {
        id: 'term-context-paste',
        requestedRendererMode: 'xterm',
        autoFocus: true,
        isActivePanel: true,
        runtimePlatform: 'linux',
        showQuickCopyButton: false,
      })
    );

    await flushTerminalEffects();

    mockTerminalInstances[0].getSelection.mockReturnValue('');
    const shell = view.container.querySelector('[data-testid="terminal-viewport-shell"]');
    shell.dispatchEvent(
      new window.MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: 32,
        clientY: 48,
      })
    );
    await flushTerminalEffects();

    const pasteButton = view.container.querySelector('[data-testid="terminal-context-menu-paste"]');
    const copyButton = view.container.querySelector('[data-testid="terminal-context-menu-copy"]');
    expect(pasteButton).not.toBeNull();
    expect(copyButton.disabled).toBe(true);

    pasteButton.click();
    await flushTerminalEffects();

    expect(clipboard.readText).toHaveBeenCalledTimes(1);
    expect(mockWebSocketInstances[0].send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'input', data: 'pnpm dev' })
    );
    expect(mockTerminalInstances[0].paste).not.toHaveBeenCalled();
  });

  test('native VTE intercepts DOM paste events and routes them through focus + Tauri bridge', async () => {
    mockNativeVteBridge.isNativeVteRuntimeAvailable.mockReturnValue(true);
    mockNativeVteBridge.probeNativeVte.mockResolvedValue({ ready: true, reason: null });
    mockNativeVteBridge.openNativeVtePanel.mockResolvedValue({ opened: true, reason: null });
    mockNativeVteBridge.pasteNativeVtePanel = jest.fn().mockResolvedValue({ supported: true });
    const clipboard = {
      writeText: jest.fn().mockResolvedValue(undefined),
      readText: jest.fn().mockResolvedValue('native paste'),
    };
    Object.defineProperty(global.navigator, 'clipboard', {
      configurable: true,
      value: clipboard,
    });

    const view = await renderIntoDom(
      React.createElement(TerminalTTY, {
        id: 'term-native-dom-paste',
        requestedRendererMode: 'vte-experimental',
        autoFocus: true,
        isActivePanel: true,
        runtimePlatform: 'linux',
        showQuickCopyButton: false,
      })
    );

    await flushTerminalEffects();

    const shell = view.container.querySelector('[data-testid="terminal-viewport-shell"]');
    const pasteEvent = new window.Event('paste', {
      bubbles: true,
      cancelable: true,
    });
    shell.dispatchEvent(pasteEvent);
    await flushTerminalEffects();

    expect(mockNativeVteBridge.focusNativeVtePanel).toHaveBeenCalledWith({
      panelId: 'term-native-dom-paste',
    });
    expect(mockNativeVteBridge.pasteNativeVtePanel).toHaveBeenCalledWith({
      panelId: 'term-native-dom-paste',
      text: 'native paste',
    });
    expect(pasteEvent.defaultPrevented).toBe(true);
  });

  test('native VTE intercepts document-level paste events and routes them through focus + Tauri bridge', async () => {
    mockNativeVteBridge.isNativeVteRuntimeAvailable.mockReturnValue(true);
    mockNativeVteBridge.probeNativeVte.mockResolvedValue({ ready: true, reason: null });
    mockNativeVteBridge.openNativeVtePanel.mockResolvedValue({ opened: true, reason: null });
    mockNativeVteBridge.pasteNativeVtePanel = jest.fn().mockResolvedValue({ supported: true });
    const clipboard = {
      writeText: jest.fn().mockResolvedValue(undefined),
      readText: jest.fn().mockResolvedValue('document paste'),
    };
    Object.defineProperty(global.navigator, 'clipboard', {
      configurable: true,
      value: clipboard,
    });

    const view = await renderIntoDom(
      React.createElement(TerminalTTY, {
        id: 'term-native-document-paste',
        requestedRendererMode: 'vte-experimental',
        autoFocus: true,
        isActivePanel: true,
        runtimePlatform: 'linux',
        showQuickCopyButton: false,
      })
    );

    await flushTerminalEffects();

    const shell = view.container.querySelector('[data-testid="terminal-viewport-shell"]');
    shell.focus?.();
    const pasteEvent = new window.Event('paste', {
      bubbles: true,
      cancelable: true,
    });
    // T-018: dispatch the paste on the shell (a child of the terminal root)
    // rather than on `document` directly. The document-level capture
    // listener still fires (capture phase runs first), and the event
    // target is now inside the terminal root, so the tightened
    // `belongsToTerminal` check matches. The previous test relied on
    // `isActivePanel` being true, which was too aggressive — it hijacked
    // paste events from other panels (e.g. the right-dock ChatPanel
    // textarea) whenever some terminal was the active workspace panel.
    shell.dispatchEvent(pasteEvent);
    await flushTerminalEffects();

    expect(mockNativeVteBridge.focusNativeVtePanel).toHaveBeenCalledWith({
      panelId: 'term-native-document-paste',
    });
    expect(mockNativeVteBridge.pasteNativeVtePanel).toHaveBeenCalledWith({
      panelId: 'term-native-document-paste',
      text: 'document paste',
    });
    expect(pasteEvent.defaultPrevented).toBe(true);
  });

  test('xterm intercepts DOM paste events and routes clipboard text through the websocket', async () => {
    const clipboard = {
      writeText: jest.fn().mockResolvedValue(undefined),
      readText: jest.fn().mockResolvedValue('dom paste'),
    };
    Object.defineProperty(global.navigator, 'clipboard', {
      configurable: true,
      value: clipboard,
    });

    const view = await renderIntoDom(
      React.createElement(TerminalTTY, {
        id: 'term-xterm-dom-paste',
        requestedRendererMode: 'xterm',
        autoFocus: true,
        isActivePanel: true,
        runtimePlatform: 'linux',
        showQuickCopyButton: false,
      })
    );

    await flushTerminalEffects();

    const shell = view.container.querySelector('[data-testid="terminal-viewport-shell"]');
    const pasteEvent = new window.Event('paste', {
      bubbles: true,
      cancelable: true,
    });
    shell.dispatchEvent(pasteEvent);
    await flushTerminalEffects();

    expect(clipboard.readText).toHaveBeenCalledTimes(1);
    expect(mockWebSocketInstances[0].send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'input', data: 'dom paste' })
    );
    expect(mockTerminalInstances[0].paste).not.toHaveBeenCalled();
    expect(pasteEvent.defaultPrevented).toBe(true);
  });

  describe('TerminalTTY suspended state', () => {
    beforeEach(() => {
      installTerminalDom();
      installTerminalRuntimeMocks();
      mockTerminalInstances.length = 0;
      mockWebSocketInstances.length = 0;
      mockResizeObserverInstances.length = 0;
    });

    afterEach(async () => {
      cleanupMountedRoots();
      await flushTerminalEffects();
      if (global.document?.body) {
        global.document.body.innerHTML = '';
      }
      mockTerminalInstances.length = 0;
      mockWebSocketInstances.length = 0;
      Object.values(mockNativeVteBridge).forEach((value) => {
        if (value && typeof value.mockReset === 'function') {
          value.mockReset();
        }
      });
      mockNativeVteBridge.isNativeVteRuntimeAvailable.mockReturnValue(false);
      mockNativeVteBridge.probeNativeVte.mockResolvedValue({
        ready: false,
        reason: 'tauri-unavailable',
      });
      mockNativeVteBridge.openNativeVtePanel.mockResolvedValue({
        opened: false,
        reason: 'tauri-unavailable',
      });
      jest.clearAllMocks();
    });

    test('suspended terminal does not boot xterm runtime', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const view = await renderIntoDom(
        React.createElement(TerminalTTY, {
          id: 'term-suspend-no-xterm',
          connectionState: 'suspended',
          autoFocus: false,
          isActivePanel: true,
          isVisibleInLayout: true,
          showQuickCopyButton: false,
        })
      );
      await flushTerminalEffects();
      expect(mockTerminalInstances).toHaveLength(0);
      expect(mockWebSocketInstances).toHaveLength(0);
      expect(view.container.querySelector('.devhub-xterm-container')).not.toBeNull();
      consoleSpy.mockRestore();
    });

    test('suspended terminal renders placeholder overlay with session title and continuar button', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const view = await renderIntoDom(
        React.createElement(TerminalTTY, {
          id: 'term-suspend-overlay',
          connectionState: 'suspended',
          cwd: '/workspace/test',
          autoFocus: false,
          isActivePanel: false,
          isVisibleInLayout: true,
          showQuickCopyButton: false,
        })
      );
      await flushTerminalEffects();
      const overlay = view.container.querySelector('[data-testid="terminal-suspended-overlay"]');
      expect(overlay).not.toBeNull();
      const continuarBtn = view.container.querySelector(
        '[data-testid="terminal-suspended-continue-btn"]'
      );
      expect(continuarBtn).not.toBeNull();
      consoleSpy.mockRestore();
    });

    test('continuar button dispatches devhub:manual-revive-requested', async () => {
      const reviveEvents = [];
      const handler = (event) => reviveEvents.push(event.detail);
      window.addEventListener('devhub:manual-revive-requested', handler);

      const view = await renderIntoDom(
        React.createElement(TerminalTTY, {
          id: 'term-suspend-continue-stub',
          connectionState: 'suspended',
          autoFocus: false,
          isActivePanel: false,
          isVisibleInLayout: true,
          showQuickCopyButton: false,
        })
      );
      await flushTerminalEffects();
      const continuarBtn = view.container.querySelector(
        '[data-testid="terminal-suspended-continue-btn"]'
      );
      expect(continuarBtn).not.toBeNull();
      continuarBtn.click();
      await flushTerminalEffects();
      expect(reviveEvents).toHaveLength(1);
      expect(reviveEvents[0]).toMatchObject({
        panelId: 'term-suspend-continue-stub',
        sessionId: 'term-suspend-continue-stub',
      });

      window.removeEventListener('devhub:manual-revive-requested', handler);
    });

    test('suspended state shows in title bar status indicator', async () => {
      const view = await renderIntoDom(
        React.createElement(TerminalTTY, {
          id: 'term-suspend-status',
          connectionState: 'suspended',
          autoFocus: false,
          isActivePanel: false,
          isVisibleInLayout: true,
          showQuickCopyButton: false,
        })
      );
      await flushTerminalEffects();
      expect(view.container.textContent).toContain('Suspendida');
    });

    test('gear icon appears in title bar when suspended', async () => {
      const modalEvents = [];
      const handler = (event) => modalEvents.push(event.detail);
      window.addEventListener('devhub:terminal-settings-modal-requested', handler);

      const view = await renderIntoDom(
        React.createElement(TerminalTTY, {
          id: 'term-suspend-gear',
          connectionState: 'suspended',
          autoFocus: false,
          isActivePanel: false,
          isVisibleInLayout: true,
          showQuickCopyButton: false,
        })
      );
      await flushTerminalEffects();
      const gearBtn = view.container.querySelector('[data-testid="terminal-settings-gear-btn"]');
      expect(gearBtn).not.toBeNull();
      gearBtn.click();
      await flushTerminalEffects();
      expect(modalEvents).toHaveLength(1);
      expect(modalEvents[0]).toMatchObject({ panelId: 'term-suspend-gear' });

      window.removeEventListener('devhub:terminal-settings-modal-requested', handler);
    });
  });

  test('native VTE intercepts paste shortcuts and routes them through focus + Tauri bridge', async () => {
    mockNativeVteBridge.isNativeVteRuntimeAvailable.mockReturnValue(true);
    mockNativeVteBridge.probeNativeVte.mockResolvedValue({ ready: true, reason: null });
    mockNativeVteBridge.openNativeVtePanel.mockResolvedValue({ opened: true, reason: null });
    mockNativeVteBridge.pasteNativeVtePanel = jest.fn().mockResolvedValue({ supported: true });
    const clipboard = {
      writeText: jest.fn().mockResolvedValue(undefined),
      readText: jest.fn().mockResolvedValue('shortcut paste'),
    };
    Object.defineProperty(global.navigator, 'clipboard', {
      configurable: true,
      value: clipboard,
    });

    const view = await renderIntoDom(
      React.createElement(TerminalTTY, {
        id: 'term-native-paste',
        requestedRendererMode: 'vte-experimental',
        autoFocus: true,
        isActivePanel: true,
        runtimePlatform: 'linux',
        showQuickCopyButton: false,
      })
    );

    await flushTerminalEffects();

    const shell = view.container.querySelector('[data-testid="terminal-viewport-shell"]');

    const pasteEvent = new window.KeyboardEvent('keydown', {
      key: 'V',
      ctrlKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    shell.dispatchEvent(pasteEvent);
    await flushTerminalEffects();

    expect(mockNativeVteBridge.focusNativeVtePanel).toHaveBeenCalledWith({
      panelId: 'term-native-paste',
    });
    expect(mockNativeVteBridge.pasteNativeVtePanel).toHaveBeenCalledWith({
      panelId: 'term-native-paste',
      text: 'shortcut paste',
    });
    expect(pasteEvent.defaultPrevented).toBe(true);

    mockNativeVteBridge.focusNativeVtePanel.mockClear();
    mockNativeVteBridge.pasteNativeVtePanel.mockClear();

    const ctrlVPasteEvent = new window.KeyboardEvent('keydown', {
      key: 'V',
      ctrlKey: true,
      shiftKey: false,
      bubbles: true,
      cancelable: true,
    });
    shell.dispatchEvent(ctrlVPasteEvent);
    await flushTerminalEffects();

    expect(mockNativeVteBridge.focusNativeVtePanel).toHaveBeenCalledWith({
      panelId: 'term-native-paste',
    });
    expect(mockNativeVteBridge.pasteNativeVtePanel).toHaveBeenCalledWith({
      panelId: 'term-native-paste',
      text: 'shortcut paste',
    });
    expect(ctrlVPasteEvent.defaultPrevented).toBe(true);

    // Copy remains native-only because we do not have a JS/Tauri copy bridge.
    mockNativeVteBridge.focusNativeVtePanel.mockClear();
    mockNativeVteBridge.pasteNativeVtePanel.mockClear();
    const copyEvent = new window.KeyboardEvent('keydown', {
      key: 'C',
      ctrlKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    shell.dispatchEvent(copyEvent);
    await flushTerminalEffects();

    expect(mockNativeVteBridge.focusNativeVtePanel).not.toHaveBeenCalled();
    expect(mockNativeVteBridge.pasteNativeVtePanel).not.toHaveBeenCalled();
    expect(copyEvent.defaultPrevented).toBe(true);
  });
});
