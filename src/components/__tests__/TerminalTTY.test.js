const React = require('react');
const { createRoot } = require('react-dom/client');
const { flushSync } = require('react-dom');
const { JSDOM } = require('jsdom');

const mockTerminalInstances = [];
const mountedRoots = [];
const mockWebSocketInstances = [];
const mockResizeObserverInstances = [];

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
  '@xterm/xterm',
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
  '@xterm/addon-fit',
  () => ({
    FitAddon: jest.fn().mockImplementation(() => ({ fit: jest.fn() })),
  }),
  { virtual: true }
);

jest.mock(
  '@xterm/addon-search',
  () => ({
    SearchAddon: jest.fn().mockImplementation(() => ({
      findNext: jest.fn(),
      findPrevious: jest.fn(),
    })),
  }),
  { virtual: true }
);

/**
 * TerminalTTY unit tests â€” terminal-ux-redesign
 *
 * Per Extract-Before-Mock rule, we test pure functions extracted from TerminalTTY.
 *
 * Spec requirements:
 * - xterm container wraps with fade-in animation (opacity 0â†’1, 150ms)
 * - No inline hex colors override CSS varâ€“derived theme
 *
 * We test the exported pure helper `getXtermContainerAnimProps(connected)`.
 */

const TerminalTTYModule = require('../TerminalTTY.jsx');
const TerminalTTY = TerminalTTYModule.default;

const {
  buildTerminalViewportDiagnosticPayload,
  createTerminalViewportDiagnosticLogger,
  fitTerminalViewport,
  proposeTerminalViewportDimensions,
  isTerminalViewportUndersized,
  shouldDeferTerminalConnectUntilViewportFitted,
  clampTerminalViewportDimensions,
  isPlausibleTerminalCellSize,
  shouldReleaseWebglRendererOnLayoutHide,
  getTerminalRendererStatusCopy,
  getXtermContainerAnimProps,
  refreshTerminalViewport,
  forceTerminalViewportRepaint,
  isWebglAddonContextLost,
  resolveTerminalRendererViewModel,
  shouldShowTerminalStatusOverlay,
  shouldLogTerminalViewportDiagnostic,
  shouldRunTerminalViewportReactivation,
  shouldRunPanelClickViewportRecovery,
  shouldRecoverPanelOnActivation,
  shouldClearWebglAtlasOnPanelActivation,
  shouldSkipReactivateViewportOnPanelActivation,
  shouldAttachWebglRenderer,
  shouldFreezeSingleWebglViewportOnWorkspaceShow,
  shouldSkipGpuVisibilityReveal,
  shouldSoftGpuWorkspaceReveal,
  shouldNudgeAfterSoftRevealProbe,
  resolveWorkspaceLayoutShowRevealMode,
  flushHiddenTerminalCatchupToTerm,
  shouldFreezeDomViewportOnWorkspaceShow,
  shouldAttachCanvasRenderer,
  shouldMountCanvasAddon,
  needsGpuRendererReattach,
  shouldRefitVisibleInactiveSplitPanel,
  sendTerminalPasteInput,
  scheduleTerminalViewportSyncBurst,
  resolveColdMountStaggerMs,
  shouldSyncTerminalViewportOnLayoutShow,
  isWorkspaceCloseRecoverReason,
  isWorkspaceSurvivorRecoverLayoutReason,
  WORKSPACE_SURVIVOR_RECOVER_LAYOUT_REASON,
  resolveConnectInitialCommandState,
  shouldSkipRedundantLayoutSettleViewportSync,
  shouldSkipTerminalOutputWhileLayoutHidden,
  appendHiddenTerminalOutputBuffer,
  takeHiddenTerminalOutputBuffer,
  shouldDiscardHiddenOutputCatchup,
  terminalBufferHasRenderableContent,
  chunkTerminalOutputForCatchup,
  nudgeTerminalPtyResize,
  shouldForcePtyNudgeOnSurvivorSoftReveal,
  shouldClearGpuAtlasOnWorkspaceShow,
  shouldClearAtlasForSplitCanvas,
  shouldReleaseCanvasRendererOnLayoutHide,
  shouldShowTerminalLoadingOverlay,
  shouldShowTerminalViewport,
  shouldAutoReconnectTerminal,
  shouldReconnectTerminalOnOsResume,
  resolveTerminalFontFamily,
  isTerminalViewportNearBottom,
  resolveTerminalClipboardShortcut,
  stabilizeTerminalRenderer,
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
        this.onmessage?.({
          data: JSON.stringify({ type: 'ready', reattached: false, mode: 'shell' }),
        });
      }, 0);
    }
  }

  global.WebSocket = MockWebSocket;
  window.WebSocket = MockWebSocket;
}

describe('resolveTerminalClipboardShortcut()', () => {
  test('maps Ctrl+V and Ctrl+Shift+V to paste', () => {
    expect(
      resolveTerminalClipboardShortcut({ ctrlKey: true, shiftKey: false, altKey: false, key: 'v' })
    ).toBe('paste');
    expect(
      resolveTerminalClipboardShortcut({ ctrlKey: true, shiftKey: true, altKey: false, key: 'V' })
    ).toBe('paste');
  });

  test('maps Ctrl+Shift+C to copy', () => {
    expect(
      resolveTerminalClipboardShortcut({ ctrlKey: true, shiftKey: true, altKey: false, key: 'C' })
    ).toBe('copy');
  });

  test('maps Shift+Insert to paste', () => {
    expect(
      resolveTerminalClipboardShortcut({
        ctrlKey: false,
        shiftKey: true,
        altKey: false,
        key: 'Insert',
      })
    ).toBe('paste');
  });

  test('ignores plain keys and other shortcuts', () => {
    expect(
      resolveTerminalClipboardShortcut({ ctrlKey: true, shiftKey: false, altKey: false, key: 'c' })
    ).toBeNull();
    expect(
      resolveTerminalClipboardShortcut({ ctrlKey: false, shiftKey: false, altKey: false, key: 'v' })
    ).toBeNull();
    expect(
      resolveTerminalClipboardShortcut({ ctrlKey: true, shiftKey: false, altKey: true, key: 'v' })
    ).toBeNull();
  });
});

describe('getXtermContainerAnimProps()', () => {
  test('does not re-fade from opacity 0 on every visibility toggle', () => {
    expect(getXtermContainerAnimProps(true).initial).toBe(false);
    expect(getXtermContainerAnimProps(false).initial).toBe(false);
  });

  test('returns opacity 1 as animate when visible=true', () => {
    const props = getXtermContainerAnimProps(true);
    expect(props.animate.opacity).toBe(1);
  });

  test('transition is instant to avoid blink during workspace switches', () => {
    const props = getXtermContainerAnimProps(true);
    expect(props.transition.duration).toBe(0);
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

  test('stays hidden on remount of an already-connected panel, even while initializing', () => {
    // Remounts (tab switch, pizarra enter/exit, graveyard restore) seed
    // hasConnectedOnce from terminalConnectedOnceRegistry — no overlay flash.
    expect(shouldShowTerminalLoadingOverlay(true, 'connecting', true)).toBe(false);
    expect(shouldShowTerminalLoadingOverlay(true, 'idle', true)).toBe(false);
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
    expect(shouldShowTerminalStatusOverlay(false, 'fallÃ³ init', 'idle')).toBe(true);
    expect(shouldShowTerminalStatusOverlay(false, null, 'error')).toBe(true);
    expect(shouldShowTerminalStatusOverlay(false, null, 'disconnected')).toBe(true);
  });

  test('does not show overlay while initializing or when connected', () => {
    expect(shouldShowTerminalStatusOverlay(true, null, 'connecting')).toBe(false);
    expect(shouldShowTerminalStatusOverlay(false, null, 'connected')).toBe(false);
  });

  test('shows suspended overlay even while initializing (native VTE probe)', () => {
    expect(shouldShowTerminalStatusOverlay(true, null, 'suspended')).toBe(true);
    expect(shouldShowTerminalStatusOverlay(false, null, 'agent-exited')).toBe(true);
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

  test('skips repaint when the renderer slot is not ready', () => {
    const term = {
      rows: 24,
      refresh: jest.fn(),
      _core: {
        _renderService: {
          _renderer: { value: undefined },
          dimensions: { css: { cell: { width: 10, height: 20 } } },
        },
      },
    };

    expect(refreshTerminalViewport(term)).toBe(false);
    expect(term.refresh).not.toHaveBeenCalled();
  });

  test('swallows stale renderer refresh errors', () => {
    const term = {
      rows: 24,
      refresh: jest.fn(() => {
        throw new TypeError(
          "undefined is not an object (evaluating 'this._renderer.value.dimensions')"
        );
      }),
      _core: {
        _renderService: {
          _renderer: { value: {} },
          dimensions: { css: { cell: { width: 10, height: 20 } } },
        },
      },
    };

    expect(refreshTerminalViewport(term)).toBe(false);
  });
});

describe('forceTerminalViewportRepaint()', () => {
  function makeTerm({ cols = 80, rows = 24 } = {}) {
    return {
      cols,
      rows,
      resize: jest.fn(),
      refresh: jest.fn(),
      _core: {
        _renderService: {
          _renderer: { value: {} },
          dimensions: { css: { cell: { width: 10, height: 20 } } },
          clear: jest.fn(),
        },
      },
    };
  }

  test('nudges 1 row down then back up to force a real canvas resize+repaint', () => {
    const term = makeTerm({ cols: 80, rows: 24 });
    expect(forceTerminalViewportRepaint(term)).toBe(true);
    expect(term.resize).toHaveBeenNthCalledWith(1, 80, 23);
    expect(term.resize).toHaveBeenNthCalledWith(2, 80, 24);
    expect(term.refresh).toHaveBeenCalledWith(0, 23);
  });

  test('nudges cols when only one row is available', () => {
    const term = makeTerm({ cols: 80, rows: 1 });
    expect(forceTerminalViewportRepaint(term)).toBe(true);
    expect(term.resize).toHaveBeenNthCalledWith(1, 79, 1);
    expect(term.resize).toHaveBeenNthCalledWith(2, 80, 1);
  });

  test('skips when the renderer is not ready', () => {
    const term = makeTerm();
    term._core._renderService._renderer.value = undefined;
    expect(forceTerminalViewportRepaint(term)).toBe(false);
    expect(term.resize).not.toHaveBeenCalled();
  });

  test('skips when cols/rows are zero', () => {
    const term = makeTerm({ cols: 0, rows: 0 });
    expect(forceTerminalViewportRepaint(term)).toBe(false);
    expect(term.resize).not.toHaveBeenCalled();
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

  test('keeps floored rows when clipping one extra row would waste more space than the slack band', () => {
    const container = {
      getBoundingClientRect: () => ({ width: 800, height: 509 }),
    };

    expect(
      proposeTerminalViewportDimensions({
        container,
        fitAddon: { proposeDimensions: jest.fn() },
        term: makeTerm(),
      })
    ).toEqual({ cols: 80, rows: 25 });
  });

  test('keeps floored rows when slack is smaller than half a cell', () => {
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

  test('adds one extra row when slack is larger than the clip cost of an extra cell', () => {
    const container = {
      getBoundingClientRect: () => ({ width: 800, height: 511 }),
    };

    expect(
      proposeTerminalViewportDimensions({
        container,
        fitAddon: { proposeDimensions: jest.fn() },
        term: makeTerm(),
      })
    ).toEqual({ cols: 80, rows: 26 });
  });

  test('adds one extra column when horizontal slack is larger than the clip cost', () => {
    const container = {
      getBoundingClientRect: () => ({ width: 809, height: 400 }),
    };

    expect(
      proposeTerminalViewportDimensions({
        container,
        fitAddon: { proposeDimensions: jest.fn() },
        term: makeTerm(),
      })
    ).toEqual({ cols: 81, rows: 20 });
  });

  test('falls back to fitAddon when cell metrics are implausibly small', () => {
    const container = {
      getBoundingClientRect: () => ({ width: 1280, height: 720 }),
    };
    const fitAddon = {
      proposeDimensions: jest.fn(() => ({ cols: 120, rows: 36 })),
    };

    expect(
      proposeTerminalViewportDimensions({
        container,
        fitAddon,
        term: makeTerm({ width: 2, height: 1 }),
      })
    ).toEqual({ cols: 120, rows: 36 });
    expect(fitAddon.proposeDimensions).toHaveBeenCalledTimes(1);
  });

  test('clamps runaway row counts from corrupted renderer metrics', () => {
    expect(clampTerminalViewportDimensions({ cols: 900, rows: 800 })).toEqual({
      cols: 400,
      rows: 120,
    });
    expect(isPlausibleTerminalCellSize(20, 10)).toBe(true);
    expect(isPlausibleTerminalCellSize(1, 10)).toBe(false);
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

describe('resolveColdMountStaggerMs()', () => {
  test('returns zero for hidden panels and when stagger is disabled', () => {
    expect(
      resolveColdMountStaggerMs({
        coldMountOrdinal: 3,
        isVisibleInLayout: false,
        staggerMsPerPanel: 120,
      })
    ).toBe(0);
    expect(
      resolveColdMountStaggerMs({
        coldMountOrdinal: 3,
        isVisibleInLayout: true,
        staggerMsPerPanel: 0,
      })
    ).toBe(0);
  });

  test('applies ordinal stagger only for visible panels when enabled', () => {
    expect(
      resolveColdMountStaggerMs({
        coldMountOrdinal: 2,
        isVisibleInLayout: true,
        staggerMsPerPanel: 120,
      })
    ).toBe(240);
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

describe('isWorkspaceCloseRecoverReason()', () => {
  test('matches workspace switch and workspace removed lifecycle reasons', () => {
    expect(isWorkspaceCloseRecoverReason('workspace-switch')).toBe(true);
    expect(isWorkspaceCloseRecoverReason('layout-settled-workspace-switch-immediate')).toBe(true);
    expect(isWorkspaceCloseRecoverReason('workspace-window-switch')).toBe(true);
    expect(isWorkspaceCloseRecoverReason('layout-settled-workspace-window-switch-raf')).toBe(true);
    expect(isWorkspaceCloseRecoverReason('workspace-removed')).toBe(true);
    expect(isWorkspaceCloseRecoverReason('layout-settled-workspace-removed-delay-80')).toBe(true);
    expect(isWorkspaceCloseRecoverReason('panel-closed')).toBe(false);
  });
});

describe('isWorkspaceSurvivorRecoverLayoutReason()', () => {
  test('matches survivor recover layout reason and raf follow-up', () => {
    expect(isWorkspaceSurvivorRecoverLayoutReason(WORKSPACE_SURVIVOR_RECOVER_LAYOUT_REASON)).toBe(
      true
    );
    expect(
      isWorkspaceSurvivorRecoverLayoutReason(`${WORKSPACE_SURVIVOR_RECOVER_LAYOUT_REASON}-raf`)
    ).toBe(true);
    expect(isWorkspaceSurvivorRecoverLayoutReason('workspace-show-layout')).toBe(false);
  });
});

describe('resolveConnectInitialCommandState()', () => {
  const {
    clearPanelInitialCommandLifecycle,
    markPanelInitialCommandDispatched,
  } = require('@/lib/terminal/panelInitialCommandLifecycle');

  beforeEach(() => {
    clearPanelInitialCommandLifecycle('panel-a');
  });

  test('clears lifecycle only on first connect for a fresh panel', () => {
    // No prior dispatch record: this is a genuinely new panel.
    expect(
      resolveConnectInitialCommandState({
        hasConnectedOnce: false,
        panelId: 'panel-a',
        initialCommand: 'grok',
      })
    ).toEqual({
      clearLifecycle: true,
      sessionReattached: false,
      hasSentInitialCommand: false,
      markDispatched: false,
    });
  });

  test('preserves dispatch guard on remount (no connected-once but lifecycle exists)', () => {
    markPanelInitialCommandDispatched('panel-a', 'grok');
    expect(
      resolveConnectInitialCommandState({
        hasConnectedOnce: false,
        panelId: 'panel-a',
        initialCommand: 'grok',
      })
    ).toEqual({
      clearLifecycle: false,
      sessionReattached: false,
      hasSentInitialCommand: true,
      markDispatched: false,
    });
  });

  test('preserves dispatch guard when reconnecting a live session', () => {
    markPanelInitialCommandDispatched('panel-a', 'grok');
    expect(
      resolveConnectInitialCommandState({
        hasConnectedOnce: true,
        panelId: 'panel-a',
        initialCommand: 'grok',
      })
    ).toEqual({
      clearLifecycle: false,
      sessionReattached: true,
      hasSentInitialCommand: true,
      markDispatched: false,
    });
  });
});

describe('shouldRunPanelClickViewportRecovery()', () => {
  test('skips heavy recovery when the clicked panel is already active', () => {
    expect(shouldRunPanelClickViewportRecovery(true)).toBe(false);
    expect(shouldRunPanelClickViewportRecovery(false)).toBe(true);
  });
});

describe('shouldRecoverPanelOnActivation()', () => {
  test('only recovers on falseâ†’true activation edges', () => {
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

describe('shouldSkipReactivateViewportOnPanelActivation()', () => {
  test('skips fit churn when GPU renderer is attached and grid already matches container', () => {
    const term = {
      cols: 80,
      rows: 24,
      _core: {
        _renderService: {
          _renderer: { value: {} },
          dimensions: { css: { cell: { width: 10, height: 20 } } },
        },
      },
    };
    const container = {
      getBoundingClientRect: () => ({ width: 800, height: 480 }),
    };
    const fitAddon = { proposeDimensions: () => ({ cols: 80, rows: 24 }) };

    expect(
      shouldSkipReactivateViewportOnPanelActivation({
        hadGpuRenderer: true,
        clearAtlas: false,
        term,
        container,
        fitAddon,
      })
    ).toBe(true);
    expect(
      shouldSkipReactivateViewportOnPanelActivation({
        hadGpuRenderer: false,
        clearAtlas: false,
        term,
        container,
        fitAddon,
      })
    ).toBe(false);
    expect(
      shouldSkipReactivateViewportOnPanelActivation({
        hadGpuRenderer: true,
        clearAtlas: true,
        term,
        container,
        fitAddon,
      })
    ).toBe(false);
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

describe('shouldMountCanvasAddon()', () => {
  test('mounts canvas on every visible split panel (active and inactive)', () => {
    expect(
      shouldMountCanvasAddon({
        operationalRendererMode: 'xterm-canvas',
        isActivePanel: true,
        visibleTerminalPanelCount: 4,
      })
    ).toBe(true);
    expect(
      shouldMountCanvasAddon({
        operationalRendererMode: 'xterm-canvas',
        isActivePanel: false,
        visibleTerminalPanelCount: 4,
      })
    ).toBe(true);
    expect(
      shouldMountCanvasAddon({
        operationalRendererMode: 'xterm-canvas',
        isActivePanel: false,
        isVisibleInLayout: false,
        visibleTerminalPanelCount: 4,
      })
    ).toBe(true);
    expect(
      shouldMountCanvasAddon({
        operationalRendererMode: 'xterm-canvas',
        isActivePanel: true,
        isVisibleInLayout: false,
        visibleTerminalPanelCount: 1,
      })
    ).toBe(false);
    expect(
      shouldMountCanvasAddon({
        operationalRendererMode: 'xterm',
        isActivePanel: true,
        visibleTerminalPanelCount: 1,
      })
    ).toBe(false);
  });
});

describe('isWebglAddonContextLost()', () => {
  test('returns false for missing addon or unsupported shape', () => {
    expect(isWebglAddonContextLost(null)).toBe(false);
    expect(isWebglAddonContextLost({})).toBe(false);
    expect(isWebglAddonContextLost({ _gl: null })).toBe(false);
    expect(isWebglAddonContextLost({ _gl: {} })).toBe(false);
  });

  test('returns true only when the underlying WebGL context reports lost', () => {
    const healthyAddon = { _gl: { isContextLost: () => false } };
    const lostAddon = { _gl: { isContextLost: () => true } };
    expect(isWebglAddonContextLost(healthyAddon)).toBe(false);
    expect(isWebglAddonContextLost(lostAddon)).toBe(true);
  });

  test('swallows private-API access errors and returns false', () => {
    const brokenAddon = {
      get _gl() {
        throw new Error('addon internals changed');
      },
    };
    expect(isWebglAddonContextLost(brokenAddon)).toBe(false);
  });
});

describe('needsGpuRendererReattach()', () => {
  test('webgl mode needs reattach when the addon ref is null (disposed renderer still in slot)', () => {
    // After a workspace hide the webgl addon is disposed and webglAddonRef is null,
    // but RenderService._renderer.value still holds the disposed renderer object, so
    // isTerminalRendererReady() would return true. The addon REF is the truthful
    // signal that a reattach is needed to clear the black panel.
    expect(
      needsGpuRendererReattach({ operationalRendererMode: 'xterm-webgl', webglAddon: null })
    ).toBe(true);
    expect(
      needsGpuRendererReattach({
        operationalRendererMode: 'xterm-webgl',
        webglAddon: { _renderer: { value: {} } },
      })
    ).toBe(false);
  });

  test('canvas mode needs reattach when the addon ref is null', () => {
    expect(
      needsGpuRendererReattach({ operationalRendererMode: 'xterm-canvas', canvasAddon: null })
    ).toBe(true);
    expect(
      needsGpuRendererReattach({ operationalRendererMode: 'xterm-canvas', canvasAddon: {} })
    ).toBe(false);
  });

  test('DOM renderer and native modes never need a GPU reattach', () => {
    expect(
      needsGpuRendererReattach({
        operationalRendererMode: 'xterm',
        webglAddon: null,
        canvasAddon: null,
      })
    ).toBe(false);
    expect(
      needsGpuRendererReattach({
        operationalRendererMode: 'vte-experimental',
        webglAddon: null,
        canvasAddon: null,
      })
    ).toBe(false);
  });
});

describe('shouldFreezeDomViewportOnWorkspaceShow()', () => {
  test('freezes DOM TUI on workspace show when cols already match container', () => {
    expect(
      shouldFreezeDomViewportOnWorkspaceShow({
        reason: 'workspace-show-layout',
        sizeUnchanged: true,
        operationalRendererMode: 'xterm',
        tuiSessionActive: true,
        proposedDimsMatch: true,
      })
    ).toBe(true);
    expect(
      shouldFreezeDomViewportOnWorkspaceShow({
        reason: 'workspace-show-visible',
        sizeUnchanged: true,
        operationalRendererMode: 'xterm',
        tuiSessionActive: true,
        proposedDimsMatch: true,
      })
    ).toBe(true);
  });

  test('does not freeze when container wants different cols than the term grid', () => {
    expect(
      shouldFreezeDomViewportOnWorkspaceShow({
        reason: 'workspace-show-layout',
        sizeUnchanged: true,
        operationalRendererMode: 'xterm',
        tuiSessionActive: true,
        proposedDimsMatch: false,
      })
    ).toBe(false);
  });

  test('does not freeze on survivor recover after workspace close', () => {
    expect(
      shouldFreezeDomViewportOnWorkspaceShow({
        reason: WORKSPACE_SURVIVOR_RECOVER_LAYOUT_REASON,
        sizeUnchanged: true,
        operationalRendererMode: 'xterm',
        tuiSessionActive: true,
        proposedDimsMatch: true,
      })
    ).toBe(false);
  });
});

describe('shouldSkipRedundantLayoutSettleViewportSync()', () => {
  test('does not skip split layout churn even when cols/rows are unchanged', () => {
    expect(
      shouldSkipRedundantLayoutSettleViewportSync({
        reason: 'layout-settled-panel-group-layout-immediate',
        sizeUnchanged: true,
        hasGpuRenderer: true,
      })
    ).toBe(false);
    expect(
      shouldSkipRedundantLayoutSettleViewportSync({
        reason: 'layout-settled-internal-split-drag-end-immediate',
        sizeUnchanged: true,
        hasGpuRenderer: true,
      })
    ).toBe(false);
  });

  test('still skips generic layout-settled when dimensions are unchanged', () => {
    expect(
      shouldSkipRedundantLayoutSettleViewportSync({
        reason: 'layout-settled-workspace-switch-immediate',
        sizeUnchanged: true,
        hasGpuRenderer: true,
      })
    ).toBe(true);
  });

  test('does not skip when dimensions changed or renderer is recovering', () => {
    expect(
      shouldSkipRedundantLayoutSettleViewportSync({
        reason: 'layout-settled-panel-group-layout-immediate',
        sizeUnchanged: false,
        hasGpuRenderer: true,
      })
    ).toBe(false);
    expect(
      shouldSkipRedundantLayoutSettleViewportSync({
        reason: 'layout-settled-panel-group-layout-immediate',
        sizeUnchanged: true,
        pendingWebglRecovery: true,
        hasGpuRenderer: true,
      })
    ).toBe(false);
  });
});

describe('shouldClearAtlasForSplitCanvas()', () => {
  test('requires canvas renderer and more than one visible panel', () => {
    expect(
      shouldClearAtlasForSplitCanvas({
        operationalRendererMode: 'xterm-canvas',
        visibleTerminalPanelCount: 5,
      })
    ).toBe(true);
    expect(
      shouldClearAtlasForSplitCanvas({
        operationalRendererMode: 'xterm-canvas',
        visibleTerminalPanelCount: 1,
      })
    ).toBe(false);
    expect(
      shouldClearAtlasForSplitCanvas({
        operationalRendererMode: 'xterm-webgl',
        visibleTerminalPanelCount: 5,
      })
    ).toBe(false);
  });
});

describe('terminal viewport undersize detection', () => {
  test('isTerminalViewportUndersized flags a short fitted grid', () => {
    const term = {
      rows: 12,
      _core: { _renderService: { dimensions: { css: { cell: { height: 20, width: 10 } } } } },
    };
    expect(isTerminalViewportUndersized({ containerRect: { height: 900 }, term })).toBe(true);
    expect(
      shouldDeferTerminalConnectUntilViewportFitted({
        ready: true,
        fitWorked: true,
        containerRect: { height: 900 },
        term,
      })
    ).toBe(true);
  });

  test('shouldDeferTerminalConnectUntilViewportFitted allows a filled grid', () => {
    const term = {
      rows: 40,
      _core: { _renderService: { dimensions: { css: { cell: { height: 20, width: 10 } } } } },
    };
    expect(
      shouldDeferTerminalConnectUntilViewportFitted({
        ready: true,
        fitWorked: true,
        containerRect: { height: 900 },
        term,
      })
    ).toBe(false);
  });

  test('visible panels connect with non-degenerate dimensions despite low fill ratio', () => {
    const term = {
      rows: 12,
      _core: { _renderService: { dimensions: { css: { cell: { height: 20, width: 10 } } } } },
    };
    // Same undersized grid as above, but the panel is visible with a real
    // container: connect now, fine fit arrives via resize.
    expect(
      shouldDeferTerminalConnectUntilViewportFitted({
        ready: true,
        fitWorked: true,
        containerRect: { width: 800, height: 900 },
        term,
        isVisibleInLayout: true,
      })
    ).toBe(false);
    // Degenerate container keeps the defer even for visible panels.
    expect(
      shouldDeferTerminalConnectUntilViewportFitted({
        ready: true,
        fitWorked: true,
        containerRect: { width: 0, height: 900 },
        term,
        isVisibleInLayout: true,
      })
    ).toBe(true);
  });
});

describe('hidden output catchup policy', () => {
  test('shouldDiscardHiddenOutputCatchup rejects reattach and mega-buffers', () => {
    expect(shouldDiscardHiddenOutputCatchup({ bufferedBytes: 1000, sessionReattached: true })).toBe(
      true
    );
    expect(shouldDiscardHiddenOutputCatchup({ bufferedBytes: 40000 })).toBe(true);
    expect(shouldDiscardHiddenOutputCatchup({ bufferedBytes: 4000 })).toBe(false);
    expect(shouldDiscardHiddenOutputCatchup({ bufferedBytes: 4000, termHasContent: true })).toBe(
      true
    );
  });

  test('terminalBufferHasRenderableContent detects existing prompt lines', () => {
    const term = {
      buffer: {
        active: {
          length: 2,
          getLine: (index) => ({
            translateToString: () => (index === 1 ? 'â””â”€$ ' : ''),
          }),
        },
      },
    };

    expect(terminalBufferHasRenderableContent(term)).toBe(true);
    expect(terminalBufferHasRenderableContent({ buffer: { active: { length: 0 } } })).toBe(false);
  });

  test('shouldDiscardHiddenOutputCatchup rejects active TUI and OpenCode footer replay', () => {
    expect(shouldDiscardHiddenOutputCatchup({ bufferedBytes: 400, tuiSessionActive: true })).toBe(
      true
    );
    expect(
      shouldDiscardHiddenOutputCatchup({
        bufferedBytes: 200,
        bufferText: '~/devhub Â§ 6 MCP /status 1.16.2',
      })
    ).toBe(true);
  });

  test('shouldSkipRedundantLayoutSettleViewportSync skips pizarra mode transitions when size unchanged', () => {
    expect(
      shouldSkipRedundantLayoutSettleViewportSync({
        reason: 'layout-settled-pizarra-mode-exit-immediate',
        sizeUnchanged: true,
        pendingWebglRecovery: false,
        hasGpuRenderer: true,
      })
    ).toBe(true);
  });

  test('chunkTerminalOutputForCatchup splits large replay safely', () => {
    const buffer = 'x'.repeat(20000);
    const chunks = chunkTerminalOutputForCatchup(buffer, 8192);
    expect(chunks).toHaveLength(3);
    expect(chunks.join('')).toBe(buffer);
  });
});

describe('hidden terminal output buffer helpers', () => {
  test('appendHiddenTerminalOutputBuffer caps retained bytes', () => {
    const bufferRef = { value: '' };
    appendHiddenTerminalOutputBuffer(bufferRef, 'abc', 5);
    appendHiddenTerminalOutputBuffer(bufferRef, 'def', 5);
    expect(bufferRef.value).toBe('bcdef');
    expect(takeHiddenTerminalOutputBuffer(bufferRef)).toBe('bcdef');
    expect(bufferRef.value).toBe('');
  });

  test('nudgeTerminalPtyResize sends restore resize to the PTY', () => {
    const sends = [];
    const term = { cols: 80, rows: 24, resize: jest.fn() };
    const socket = {
      readyState: 1,
      send: (payload) => sends.push(JSON.parse(payload)),
    };
    expect(nudgeTerminalPtyResize({ term, socket, websocketOpenState: 1 })).toBe(true);
    expect(term.resize).toHaveBeenCalledWith(80, 23);
    expect(term.resize).toHaveBeenCalledWith(80, 24);
    expect(sends.at(-1)).toEqual({ type: 'resize', cols: 80, rows: 24 });
  });

  test('nudgeTerminalPtyResize skips unchanged dimensions to avoid SIGWINCH to live TUIs', () => {
    const sends = [];
    const term = { cols: 80, rows: 24, resize: jest.fn() };
    const socket = {
      readyState: 1,
      send: (payload) => sends.push(JSON.parse(payload)),
    };
    const lastPtySizeRef = { cols: 80, rows: 24 };
    expect(nudgeTerminalPtyResize({ term, socket, websocketOpenState: 1, lastPtySizeRef })).toBe(
      false
    );
    expect(term.resize).not.toHaveBeenCalled();
    expect(sends).toHaveLength(0);
  });

  test('shouldForcePtyNudgeOnSurvivorSoftReveal only for live non-kimi TUIs with a socket', () => {
    expect(
      shouldForcePtyNudgeOnSurvivorSoftReveal({
        tuiSessionActive: true,
        hasSocket: true,
        kimiLive: false,
      })
    ).toBe(true);
    expect(
      shouldForcePtyNudgeOnSurvivorSoftReveal({
        tuiSessionActive: false,
        hasSocket: true,
        kimiLive: false,
      })
    ).toBe(false);
    expect(
      shouldForcePtyNudgeOnSurvivorSoftReveal({
        tuiSessionActive: true,
        hasSocket: true,
        kimiLive: true,
      })
    ).toBe(false);
  });

  test('nudgeTerminalPtyResize can force an unchanged-dimension nudge', () => {
    const sends = [];
    const term = { cols: 80, rows: 24, resize: jest.fn() };
    const socket = {
      readyState: 1,
      send: (payload) => sends.push(JSON.parse(payload)),
    };
    const lastPtySizeRef = { cols: 80, rows: 24 };
    expect(
      nudgeTerminalPtyResize({ term, socket, websocketOpenState: 1, lastPtySizeRef, force: true })
    ).toBe(true);
    expect(term.resize).toHaveBeenCalledWith(80, 23);
    expect(term.resize).toHaveBeenCalledWith(80, 24);
    expect(sends.at(-1)).toEqual({ type: 'resize', cols: 80, rows: 24 });
  });
});

describe('shouldSkipTerminalOutputWhileLayoutHidden()', () => {
  test('buffers output for hidden GPU panels even when addon is still attached', () => {
    expect(
      shouldSkipTerminalOutputWhileLayoutHidden({
        isVisibleInLayout: false,
        operationalRendererMode: 'xterm-canvas',
      })
    ).toBe(true);
    expect(
      shouldSkipTerminalOutputWhileLayoutHidden({
        isVisibleInLayout: false,
        operationalRendererMode: 'xterm-webgl',
      })
    ).toBe(true);
  });

  test('buffers layout-hidden GPU panels and never buffers visible panels', () => {
    expect(
      shouldSkipTerminalOutputWhileLayoutHidden({
        isVisibleInLayout: false,
        operationalRendererMode: 'xterm-canvas',
      })
    ).toBe(true);
    expect(
      shouldSkipTerminalOutputWhileLayoutHidden({
        isVisibleInLayout: true,
        isActivePanel: false,
        operationalRendererMode: 'xterm-canvas',
        canvasAttached: true,
      })
    ).toBe(false);
    expect(
      shouldSkipTerminalOutputWhileLayoutHidden({
        isVisibleInLayout: true,
        isActivePanel: false,
        operationalRendererMode: 'xterm-canvas',
        canvasAttached: false,
      })
    ).toBe(false);
    expect(
      shouldSkipTerminalOutputWhileLayoutHidden({
        isVisibleInLayout: true,
        isActivePanel: true,
        operationalRendererMode: 'xterm-canvas',
      })
    ).toBe(false);
    expect(
      shouldSkipTerminalOutputWhileLayoutHidden({
        isVisibleInLayout: false,
        operationalRendererMode: 'xterm',
      })
    ).toBe(false);
  });
});

describe('resolveWorkspaceLayoutShowRevealMode()', () => {
  test('uses soft reveal whenever GPU is eligible (never pure â€” TUIs go black)', () => {
    expect(
      resolveWorkspaceLayoutShowRevealMode({
        isWorkspaceTabReveal: true,
        softGpuEligible: true,
      })
    ).toBe('soft');
    expect(
      resolveWorkspaceLayoutShowRevealMode({
        isWorkspaceTabReveal: false,
        softGpuEligible: true,
      })
    ).toBe('soft');
    expect(
      resolveWorkspaceLayoutShowRevealMode({
        isWorkspaceTabReveal: true,
        softGpuEligible: true,
        tuiSessionActive: true,
      })
    ).toBe('soft');
    expect(
      resolveWorkspaceLayoutShowRevealMode({
        isWorkspaceTabReveal: true,
        softGpuEligible: false,
      })
    ).toBe('full');
  });
});

describe('shouldNudgeAfterSoftRevealProbe()', () => {
  test('clean reveal (GPU attached, renderer ready) never nudges — the blink is skipped', () => {
    expect(
      shouldNudgeAfterSoftRevealProbe({
        rendererReady: true,
        reattachPending: false,
        elapsedMs: 500,
      })
    ).toBe(false);
  });

  test('nudges only when the GPU addon was lost mid-reveal and the coalesce window passed', () => {
    expect(
      shouldNudgeAfterSoftRevealProbe({
        rendererReady: true,
        reattachPending: true,
        elapsedMs: 250,
      })
    ).toBe(true);
    expect(
      shouldNudgeAfterSoftRevealProbe({
        rendererReady: true,
        reattachPending: true,
        elapsedMs: 50,
      })
    ).toBe(false);
  });

  test('never nudges when the renderer is not ready (the nudge would no-op)', () => {
    expect(
      shouldNudgeAfterSoftRevealProbe({
        rendererReady: false,
        reattachPending: true,
        elapsedMs: 500,
      })
    ).toBe(false);
  });
});

describe('shouldSoftGpuWorkspaceReveal()', () => {
  test('allows soft reveal for GPU workspaces with attached addon (single or split)', () => {
    expect(
      shouldSoftGpuWorkspaceReveal({
        operationalRendererMode: 'xterm-webgl',
        webglAddon: {},
        visibleTerminalPanelCount: 1,
      })
    ).toBe(true);
    expect(
      shouldSoftGpuWorkspaceReveal({
        operationalRendererMode: 'xterm-canvas',
        canvasAddon: {},
        visibleTerminalPanelCount: 3,
      })
    ).toBe(true);
  });

  test('requires recovery for DOM renderer, missing GPU addon, or release flags', () => {
    expect(
      shouldSoftGpuWorkspaceReveal({
        operationalRendererMode: 'xterm-canvas',
        canvasAddon: null,
        visibleTerminalPanelCount: 3,
      })
    ).toBe(false);
    expect(
      shouldSoftGpuWorkspaceReveal({
        operationalRendererMode: 'xterm-webgl',
        webglAddon: null,
        visibleTerminalPanelCount: 1,
      })
    ).toBe(false);
    expect(
      shouldSoftGpuWorkspaceReveal({
        operationalRendererMode: 'xterm',
        visibleTerminalPanelCount: 1,
      })
    ).toBe(false);
  });
});

describe('flushHiddenTerminalCatchupToTerm()', () => {
  test('writes buffered output and clears the catchup flag without repainting', () => {
    const term = { write: jest.fn() };
    const bufferRef = { value: 'hello' };
    const catchupRef = { current: true };

    expect(flushHiddenTerminalCatchupToTerm(term, bufferRef, catchupRef)).toBe(true);
    expect(term.write).toHaveBeenCalled();
    expect(bufferRef.value).toBe('');
    expect(catchupRef.current).toBe(false);
  });
});

describe('shouldSkipGpuVisibilityReveal()', () => {
  test('skips JS repaint on pure GPU visibility reveal when dims are stable', () => {
    expect(
      shouldSkipGpuVisibilityReveal({
        reason: 'workspace-show-visible',
        noGpuRecoveryPending: true,
        sizeUnchanged: true,
        proposedDimsMatch: true,
        hiddenOutputCatchupPending: false,
        operationalRendererMode: 'xterm-webgl',
      })
    ).toBe(true);
  });

  test('does not skip when output was buffered while hidden or GPU recovery is pending', () => {
    expect(
      shouldSkipGpuVisibilityReveal({
        reason: 'workspace-show-visible',
        noGpuRecoveryPending: true,
        sizeUnchanged: true,
        proposedDimsMatch: true,
        hiddenOutputCatchupPending: true,
        operationalRendererMode: 'xterm-webgl',
      })
    ).toBe(false);
    expect(
      shouldSkipGpuVisibilityReveal({
        reason: 'workspace-show-visible',
        noGpuRecoveryPending: false,
        sizeUnchanged: true,
        proposedDimsMatch: true,
        operationalRendererMode: 'xterm-webgl',
      })
    ).toBe(false);
  });
});

describe('shouldFreezeSingleWebglViewportOnWorkspaceShow()', () => {
  test('freezes unchanged single-panel webgl workspace tab switches', () => {
    expect(
      shouldFreezeSingleWebglViewportOnWorkspaceShow({
        reason: 'workspace-show-layout',
        sizeUnchanged: true,
        operationalRendererMode: 'xterm-webgl',
        visibleTerminalPanelCount: 1,
      })
    ).toBe(true);
    expect(
      shouldFreezeSingleWebglViewportOnWorkspaceShow({
        reason: 'workspace-show-visible',
        sizeUnchanged: true,
        operationalRendererMode: 'xterm-webgl',
        visibleTerminalPanelCount: 1,
      })
    ).toBe(true);
    expect(
      shouldFreezeSingleWebglViewportOnWorkspaceShow({
        reason: 'layout-settled-workspace-switch-immediate',
        sizeUnchanged: true,
        operationalRendererMode: 'xterm-webgl',
        visibleTerminalPanelCount: 1,
      })
    ).toBe(true);
  });

  test('does not freeze split canvas workspaces or real resizes', () => {
    expect(
      shouldFreezeSingleWebglViewportOnWorkspaceShow({
        reason: 'workspace-show-layout',
        sizeUnchanged: true,
        operationalRendererMode: 'xterm-canvas',
        visibleTerminalPanelCount: 2,
      })
    ).toBe(false);
    expect(
      shouldFreezeSingleWebglViewportOnWorkspaceShow({
        reason: 'workspace-show-layout',
        sizeUnchanged: false,
        operationalRendererMode: 'xterm-webgl',
        visibleTerminalPanelCount: 1,
      })
    ).toBe(false);
    expect(
      shouldFreezeSingleWebglViewportOnWorkspaceShow({
        reason: 'workspace-show-layout',
        sizeUnchanged: true,
        operationalRendererMode: 'xterm-webgl',
        visibleTerminalPanelCount: 1,
        proposedDimsMatch: false,
      })
    ).toBe(false);
  });
});

describe('shouldClearGpuAtlasOnWorkspaceShow()', () => {
  test('limits canvas atlas clears to pending catch-up and split-layout churn', () => {
    expect(
      shouldClearGpuAtlasOnWorkspaceShow({
        operationalRendererMode: 'xterm-canvas',
        reason: 'workspace-show-settled',
      })
    ).toBe(true);
    expect(
      shouldClearGpuAtlasOnWorkspaceShow({
        operationalRendererMode: 'xterm-canvas',
        reason: 'workspace-show-layout',
        canvasReleasedOnLayoutHide: true,
      })
    ).toBe(true);
    expect(
      shouldClearGpuAtlasOnWorkspaceShow({
        operationalRendererMode: 'xterm-canvas',
        reason: 'workspace-show-pending',
      })
    ).toBe(true);
    expect(
      shouldClearGpuAtlasOnWorkspaceShow({
        operationalRendererMode: 'xterm-canvas',
        reason: 'layout-recover-immediate',
      })
    ).toBe(true);
    expect(
      shouldClearGpuAtlasOnWorkspaceShow({
        operationalRendererMode: 'xterm-canvas',
        reason: 'layout-settled-panel-group-layout-immediate',
      })
    ).toBe(true);
    expect(
      shouldClearGpuAtlasOnWorkspaceShow({
        operationalRendererMode: 'xterm-canvas',
        reason: 'layout-settled-panel-focus-toggle-delay-340',
      })
    ).toBe(true);
    expect(
      shouldClearGpuAtlasOnWorkspaceShow({
        operationalRendererMode: 'xterm-canvas',
        reason: 'layout-settled-workspace-switch-immediate',
      })
    ).toBe(true);
    expect(
      shouldClearGpuAtlasOnWorkspaceShow({
        operationalRendererMode: 'xterm-canvas',
        reason: 'layout-settled-workspace-window-immediate',
      })
    ).toBe(true);
  });

  test('keeps webgl atlas clears on recover only, not layout or settled show passes', () => {
    expect(
      shouldClearGpuAtlasOnWorkspaceShow({
        operationalRendererMode: 'xterm-webgl',
        reason: 'workspace-show-layout',
      })
    ).toBe(false);
    expect(
      shouldClearGpuAtlasOnWorkspaceShow({
        operationalRendererMode: 'xterm-webgl',
        reason: 'workspace-show-settled',
      })
    ).toBe(false);
    expect(
      shouldClearGpuAtlasOnWorkspaceShow({
        operationalRendererMode: 'xterm-webgl',
        reason: 'workspace-show-recover',
      })
    ).toBe(true);
    expect(
      shouldClearGpuAtlasOnWorkspaceShow({
        operationalRendererMode: 'xterm-webgl',
        reason: 'layout-settled-workspace-switch-immediate',
      })
    ).toBe(false);
    expect(
      shouldClearGpuAtlasOnWorkspaceShow({
        operationalRendererMode: 'xterm-webgl',
        reason: 'layout-settled-swarm-launch-delay-1000',
      })
    ).toBe(true);
    expect(
      shouldClearGpuAtlasOnWorkspaceShow({
        operationalRendererMode: 'xterm-webgl',
        reason: 'layout-settled-workspace-removed-delay-340',
      })
    ).toBe(false);
  });
});

describe('shouldReleaseWebglRendererOnLayoutHide()', () => {
  test('releases webgl when the whole workspace shell hides', () => {
    expect(
      shouldReleaseWebglRendererOnLayoutHide({
        operationalRendererMode: 'xterm-webgl',
        isVisibleInLayout: false,
        prevVisibleInLayout: true,
        isWorkspaceShellVisible: false,
      })
    ).toBe(true);
  });

  test('keeps webgl attached when only a window is parked within the active workspace', () => {
    expect(
      shouldReleaseWebglRendererOnLayoutHide({
        operationalRendererMode: 'xterm-webgl',
        isVisibleInLayout: false,
        prevVisibleInLayout: true,
        isWorkspaceShellVisible: true,
      })
    ).toBe(false);
  });

  test('ignores non-webgl renderers and show edges', () => {
    expect(
      shouldReleaseWebglRendererOnLayoutHide({
        operationalRendererMode: 'xterm-canvas',
        isVisibleInLayout: false,
        prevVisibleInLayout: true,
        isWorkspaceShellVisible: false,
      })
    ).toBe(false);
    expect(
      shouldReleaseWebglRendererOnLayoutHide({
        operationalRendererMode: 'xterm-webgl',
        isVisibleInLayout: true,
        prevVisibleInLayout: false,
        isWorkspaceShellVisible: false,
      })
    ).toBe(false);
  });
});

describe('shouldReleaseCanvasRendererOnLayoutHide()', () => {
  test('releases canvas when the whole workspace shell hides', () => {
    expect(
      shouldReleaseCanvasRendererOnLayoutHide({
        operationalRendererMode: 'xterm-canvas',
        isVisibleInLayout: false,
        prevVisibleInLayout: true,
        isWorkspaceShellVisible: false,
      })
    ).toBe(true);
  });

  test('keeps canvas attached when only a window is parked within the active workspace', () => {
    expect(
      shouldReleaseCanvasRendererOnLayoutHide({
        operationalRendererMode: 'xterm-canvas',
        isVisibleInLayout: false,
        prevVisibleInLayout: true,
        isWorkspaceShellVisible: true,
      })
    ).toBe(false);
  });

  test('ignores non-canvas renderers and show edges', () => {
    expect(
      shouldReleaseCanvasRendererOnLayoutHide({
        operationalRendererMode: 'xterm-webgl',
        isVisibleInLayout: false,
        prevVisibleInLayout: true,
        isWorkspaceShellVisible: false,
      })
    ).toBe(false);
    expect(
      shouldReleaseCanvasRendererOnLayoutHide({
        operationalRendererMode: 'xterm-canvas',
        isVisibleInLayout: true,
        prevVisibleInLayout: false,
        isWorkspaceShellVisible: false,
      })
    ).toBe(false);
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

describe('shouldAutoReconnectTerminal()', () => {
  test('legacy: only autoFocus panel reconnects when layout visibility omitted', () => {
    expect(shouldAutoReconnectTerminal('disconnected', true, null)).toBe(true);
    expect(shouldAutoReconnectTerminal('error', true, null)).toBe(true);
    expect(shouldAutoReconnectTerminal('disconnected', false, null)).toBe(false);
    expect(shouldAutoReconnectTerminal('connected', true, null)).toBe(false);
    expect(shouldAutoReconnectTerminal('disconnected', true, 'no viewport')).toBe(false);
  });

  test('visible split sibling (no autoFocus) may reconnect', () => {
    expect(
      shouldAutoReconnectTerminal('disconnected', false, null, { isVisibleInLayout: true })
    ).toBe(true);
    expect(shouldAutoReconnectTerminal('error', false, null, true)).toBe(true);
    expect(
      shouldAutoReconnectTerminal('disconnected', false, null, { isVisibleInLayout: false })
    ).toBe(false);
    expect(
      shouldAutoReconnectTerminal('terminated', false, null, { isVisibleInLayout: true })
    ).toBe(false);
  });
});

describe('shouldReconnectTerminalOnOsResume()', () => {
  const base = {
    isVisibleInLayout: true,
    hasConnectedOnce: true,
    sessionClosing: false,
    initError: null,
    websocketOpenState: 1,
  };

  test('reconnects disconnected/error visible panels after OS resume', () => {
    expect(shouldReconnectTerminalOnOsResume({ ...base, connectionState: 'disconnected' })).toBe(
      true
    );
    expect(shouldReconnectTerminalOnOsResume({ ...base, connectionState: 'error' })).toBe(true);
  });

  test('reconnects half-open sockets still marked connected', () => {
    expect(
      shouldReconnectTerminalOnOsResume({
        ...base,
        connectionState: 'connected',
        socketReadyState: 3, // CLOSED
      })
    ).toBe(true);
    expect(
      shouldReconnectTerminalOnOsResume({
        ...base,
        connectionState: 'connected',
        socketReadyState: null, // socket cleared
      })
    ).toBe(true);
    expect(
      shouldReconnectTerminalOnOsResume({
        ...base,
        connectionState: 'connected',
        socketReadyState: 1, // OPEN
      })
    ).toBe(false);
  });

  test('does not touch terminated, suspended, connecting, hidden, or first-boot panels', () => {
    expect(shouldReconnectTerminalOnOsResume({ ...base, connectionState: 'terminated' })).toBe(
      false
    );
    expect(shouldReconnectTerminalOnOsResume({ ...base, connectionState: 'agent-exited' })).toBe(
      false
    );
    expect(shouldReconnectTerminalOnOsResume({ ...base, connectionState: 'suspended' })).toBe(
      false
    );
    expect(shouldReconnectTerminalOnOsResume({ ...base, connectionState: 'connecting' })).toBe(
      false
    );
    expect(
      shouldReconnectTerminalOnOsResume({
        ...base,
        connectionState: 'disconnected',
        isVisibleInLayout: false,
      })
    ).toBe(false);
    expect(
      shouldReconnectTerminalOnOsResume({
        ...base,
        connectionState: 'disconnected',
        hasConnectedOnce: false,
      })
    ).toBe(false);
    expect(
      shouldReconnectTerminalOnOsResume({
        ...base,
        connectionState: 'disconnected',
        sessionClosing: true,
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

  test('fixes black gutters: resizes stale smaller cols to the container width and emits SIGWINCH with the new cols', () => {
    // Reproduces the workspace-switch gutter symptom: while hidden the term kept
    // stale smaller cols, and on show the container is wider. fitTerminalViewport
    // must recompute cols from the container, resize the term, and notify the PTY
    // so the TUI redraws at full width â€” the automatic equivalent of a manual resize
    // (the only thing the user confirms clears the black right-edge gutter).
    const container = {
      getBoundingClientRect: () => ({ width: 800, height: 480 }),
    };
    const fitAddon = { fit: jest.fn() };
    const term = {
      cols: 40,
      rows: 24,
      resize: jest.fn(function (c, r) {
        this.cols = c;
        this.rows = r;
      }),
      refresh: jest.fn(),
      _core: {
        _renderService: {
          _renderer: { value: {} },
          dimensions: { css: { cell: { width: 10, height: 20 } } },
          clear: jest.fn(),
        },
      },
    };
    const socket = {
      readyState: 1,
      send: jest.fn(),
    };
    const lastPtySizeRef = { cols: 40, rows: 24 };

    expect(
      fitTerminalViewport({
        container,
        fitAddon,
        term,
        socket,
        websocketOpenState: 1,
        lastPtySizeRef,
        clearAtlas: false,
      })
    ).toBe(true);

    // Resized from stale 40 cols to the container's real 80 cols (800px / 10px cell).
    expect(term.resize).toHaveBeenCalledWith(80, 24);
    // PTY got the NEW cols so the TUI redraws at full width â€” no black gutter.
    expect(socket.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'resize', cols: 80, rows: 24 })
    );
    expect(lastPtySizeRef.cols).toBe(80);
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

  test('normalizes legacy vte-experimental requests to xterm-webgl default', () => {
    expect(resolveTerminalRendererViewModel({ requestedRendererMode: 'vte-experimental' })).toEqual(
      expect.objectContaining({
        requestedMode: 'xterm-webgl',
        effectiveMode: 'xterm-webgl',
        didFallback: false,
        showRecoveryBanner: false,
      })
    );
  });
});

describe('getTerminalRendererStatusCopy()', () => {
  test('returns empty copy for legacy vte-experimental now mapped to xterm-webgl', () => {
    expect(
      getTerminalRendererStatusCopy(
        resolveTerminalRendererViewModel({ requestedRendererMode: 'vte-experimental' })
      )
    ).toBe('');
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
});

describe('Workspace-created fresh panel initial command injection', () => {
  const {
    clearPanelInitialCommandLifecycle,
  } = require('@/lib/terminal/panelInitialCommandLifecycle');

  beforeEach(() => {
    installTerminalDom();
    installTerminalRuntimeMocks();
    clearPanelInitialCommandLifecycle('term-ws-fresh');
    mockTerminalInstances.length = 0;
    mockWebSocketInstances.length = 0;
    mockResizeObserverInstances.length = 0;
  });

  afterEach(async () => {
    jest.useRealTimers();
    cleanupMountedRoots();
    await flushTerminalEffects();
    if (global.document?.body) {
      global.document.body.innerHTML = '';
    }
    mockTerminalInstances.length = 0;
    mockWebSocketInstances.length = 0;
    jest.clearAllMocks();
  });

  test('sends initial TUI command after workspace-created layout-settled', async () => {
    await renderIntoDom(
      React.createElement(TerminalTTY, {
        id: 'term-ws-fresh',
        initialCommand: 'opencode',
        requestedRendererMode: 'xterm',
        isVisibleInLayout: true,
        isActivePanel: true,
        showQuickCopyButton: false,
      })
    );

    await flushTerminalEffects();
    await flushTerminalEffects();

    // Wait for the websocket to open after xterm boot + viewport fit.
    await new Promise((resolve, reject) => {
      const deadline = Date.now() + 2000;
      const check = () => {
        if (mockWebSocketInstances.length > 0) return resolve();
        if (Date.now() > deadline) return reject(new Error('WebSocket was never created'));
        setTimeout(check, 20);
      };
      check();
    });

    const socket = mockWebSocketInstances[mockWebSocketInstances.length - 1];

    // Simulate the host layout settling (this is what the workspace modal triggers).
    window.dispatchEvent(
      new CustomEvent('devhub:terminal-layout-settled', {
        detail: {
          reason: 'workspace-created',
          panelIds: ['term-ws-fresh'],
          phase: 'immediate',
        },
      })
    );

    await flushTerminalEffects();
    await flushTerminalEffects();
    await new Promise((resolve) => setTimeout(resolve, 100));

    const inputSends = socket.send.mock.calls.filter((call) => {
      try {
        const payload = JSON.parse(call[0]);
        return payload.type === 'input';
      } catch {
        return false;
      }
    });

    expect(inputSends.length).toBeGreaterThan(0);
    const lastInput = JSON.parse(inputSends[inputSends.length - 1][0]);
    expect(lastInput.data).toBe('opencode\r');
  });
});
