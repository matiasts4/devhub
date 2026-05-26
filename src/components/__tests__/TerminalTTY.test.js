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
  isNativeVteRuntimeAvailable: jest.fn(() => false),
  openNativeVtePanel: jest.fn(async () => ({ opened: false, reason: 'tauri-unavailable' })),
  pasteNativeVtePanel: jest.fn(async () => ({ supported: false, reason: 'tauri-unavailable' })),
  probeNativeVte: jest.fn(async () => ({ ready: false, reason: 'tauri-unavailable' })),
  resizeNativeVtePanel: jest.fn(),
  setNativeVtePanelVisibility: jest.fn(),
  subscribeNativeVteEvents: jest.fn(() => jest.fn()),
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
  shouldShowTerminalViewport,
  shouldAutoReconnectTerminal,
  shouldReinitializeTerminalForRenderer,
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
  test('returns opacity 0 as initial when connected=false', () => {
    const props = getXtermContainerAnimProps(false);
    expect(props.initial.opacity).toBe(0);
  });

  test('returns opacity 1 as animate when connected=true', () => {
    const props = getXtermContainerAnimProps(true);
    expect(props.animate.opacity).toBe(1);
  });

  test('transition duration is 0.15s (150ms ease-out)', () => {
    const props = getXtermContainerAnimProps(true);
    expect(props.transition.duration).toBe(0.15);
    expect(props.transition.ease).toBe('easeOut');
  });

  test('when connected=false, animate keeps opacity 0 (still loading)', () => {
    const props = getXtermContainerAnimProps(false);
    expect(props.animate.opacity).toBe(0);
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
        bounds: expect.objectContaining({ width: 1280, height: 720 }),
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
        bounds: expect.objectContaining({ width: 1280, height: 720 }),
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
        bounds: expect.objectContaining({ x: 24, y: 8, width: 920, height: 680 }),
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
        bounds: expect.objectContaining({ x: 984, y: 104, width: 920, height: 900 }),
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
      x: 40,
      y: 96,
      width: 880,
      height: 540,
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
      bounds: expect.objectContaining({ width: 1280, height: 720 }),
    });
    expect(mockNativeVteBridge.focusNativeVtePanel).toHaveBeenCalledWith({
      panelId: 'term-native-close',
    });
    expect(mockNativeVteBridge.resizeNativeVtePanel).toHaveBeenCalledWith(
      expect.objectContaining({
        panelId: 'term-native-close',
        bounds: expect.objectContaining({ width: 1280, height: 720 }),
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
      bounds: expect.objectContaining({ width: 1280, height: 720 }),
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
      bounds: expect.objectContaining({ width: 1280, height: 720 }),
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
      bounds: expect.objectContaining({ width: 1280, height: 720 }),
    });
    expect(mockNativeVteBridge.resizeNativeVtePanel).toHaveBeenCalledWith(
      expect.objectContaining({
        panelId: 'term-native-workspace-sync',
        bounds: expect.objectContaining({ width: 1280, height: 720 }),
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
      bounds: expect.objectContaining({ width: 1280, height: 720 }),
    });
    expect(mockNativeVteBridge.resizeNativeVtePanel).toHaveBeenCalledWith(
      expect.objectContaining({
        panelId: 'term-native-suspend-resume',
        bounds: expect.objectContaining({ width: 1280, height: 720 }),
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
      bounds: expect.objectContaining({ width: 1280, height: 720 }),
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
      bounds: expect.objectContaining({ width: 1280, height: 720 }),
    });
    expect(mockNativeVteBridge.setNativeVtePanelVisibility).toHaveBeenCalledWith({
      panelId: 'term-native-suspend-right',
      visible: true,
      bounds: expect.objectContaining({ width: 1280, height: 720 }),
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

  test('hides but does not close the native lease on React unmount so view switches can resume it', async () => {
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

    expect(mockNativeVteBridge.setNativeVtePanelVisibility).toHaveBeenCalledWith({
      panelId: 'term-native-unmount-hide',
      visible: false,
      reason: 'unmount',
    });
    expect(mockNativeVteBridge.closeNativeVtePanel).not.toHaveBeenCalled();
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
    expect(mockTerminalInstances[0].paste).toHaveBeenCalledWith('npm test\n');
    expect(event.defaultPrevented).toBe(true);
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
    expect(mockTerminalInstances[0].paste).toHaveBeenCalledWith('echo ok');
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
    expect(mockTerminalInstances[0].paste).toHaveBeenCalledWith('pnpm dev');
  });

  test('native paste shortcut routes through the Tauri bridge for visible VTE panels', async () => {
    mockNativeVteBridge.isNativeVteRuntimeAvailable.mockReturnValue(true);
    mockNativeVteBridge.probeNativeVte.mockResolvedValue({ ready: true, reason: null });
    mockNativeVteBridge.openNativeVtePanel.mockResolvedValue({ opened: true, reason: null });
    mockNativeVteBridge.pasteNativeVtePanel = jest.fn().mockResolvedValue({ supported: true });

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
    const event = new window.KeyboardEvent('keydown', {
      key: 'V',
      ctrlKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    shell.dispatchEvent(event);
    await flushTerminalEffects();

    expect(mockNativeVteBridge.pasteNativeVtePanel).toHaveBeenCalledWith({
      panelId: 'term-native-paste',
    });
    expect(event.defaultPrevented).toBe(true);
  });
});
