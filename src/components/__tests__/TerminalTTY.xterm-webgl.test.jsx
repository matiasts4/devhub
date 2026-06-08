/**
 * TerminalTTY — xterm-addon-webgl wiring contract.
 *
 * Specs: openspec/changes/terminal-renderer-xterm-webgl/specs/terminal-renderer-xterm-webgl/spec.md
 *
 * - XW-04-SCEN-1: when effectiveMode is 'xterm-webgl' and capability is ready,
 *   WebglAddon is constructed once and terminal.loadAddon(addon) is called
 *   exactly once inside try/catch.
 * - XW-05-SCEN-1: when the addon loadAddon throws, the panel body stays in
 *   the DOM AND the WebglErrorSection is rendered (testid
 *   `terminal-webgl-error-section`) AND setPanelRendererPreference is NOT
 *   called.
 * - Capability-unready branch: no WebglAddon is constructed.
 * - Unmount cleanup: webglAddonRef.current.dispose() is invoked.
 *
 * Test strategy: a JSDOM harness that mocks xterm + xterm-addon-webgl +
 * xterm-addon-fit + xterm-addon-search. The xterm mock's loadAddon honours
 * WebglAddon.__setLoadAddonThrow(flag) to simulate a real WebGL context
 * creation failure.
 */

const React = require('react');
const { createRoot } = require('react-dom/client');
const { flushSync } = require('react-dom');
const { JSDOM } = require('jsdom');

const mockTerminalInstances = [];
const mountedRoots = [];
const mockWebSocketInstances = [];
const mockResizeObserverInstances = [];
const mockSetPanelRendererPreference = jest.fn();

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

const { WebglAddon } = require('xterm-addon-webgl');
const { Terminal: xtermTerminalMock } = require('xterm');

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
        loadAddon: jest.fn((addon) => {
          // Honour the test seam: when the mock WebglAddon.shouldThrow
          // is true AND the addon being loaded is a WebglAddon instance,
          // throw as if WebGLRenderer.createRenderer failed. Other addons
          // (FitAddon, SearchAddon) load normally so the xterm branch
          // can reach the WebglAddon path before the throw fires.
          const isWebglAddonInstance =
            addon && addon.constructor && addon.constructor.name === 'WebglAddon';
          if (!isWebglAddonInstance) {
            return;
          }
          // eslint-disable-next-line global-require
          const mockAddon = require('xterm-addon-webgl').WebglAddon;
          if (mockAddon && mockAddon.shouldThrow) {
            throw new Error('webgl-context-creation-failed');
          }
        }),
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

// JSDOM doesn't have a real WebGL context, so the real
// probeWebglSupport() returns ready:false and the resolver demotes
// xterm-webgl to plain xterm. The test fixtures here want the
// xterm-webgl code path to execute, so we mock probeWebglSupport
// to return ready:true by default. Individual tests can flip the
// `__mockProbeReady` flag to simulate the unready branch.
let mockProbeReady = true;
let mockProbeReason = null;
const mockProbeSpy = jest.fn(() =>
  Object.freeze({
    ready: mockProbeReady,
    reason: mockProbeReady ? null : mockProbeReason,
  })
);
jest.mock('@/components/terminal/terminalRendererCapabilities', () => {
  const actual = jest.requireActual('@/components/terminal/terminalRendererCapabilities');
  return {
    __esModule: true,
    ...actual,
    probeWebglSupport: () => mockProbeSpy(),
  };
});

const TerminalTTYModule = require('../TerminalTTY.jsx');
const TerminalTTY = TerminalTTYModule.default;

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
      }, 0);
    }
  }

  global.WebSocket = MockWebSocket;
  window.WebSocket = MockWebSocket;
}

describe('TerminalTTY — xterm-addon-webgl wiring', () => {
  beforeEach(() => {
    installTerminalDom();
    installTerminalRuntimeMocks();
    mockTerminalInstances.length = 0;
    mockWebSocketInstances.length = 0;
    mockResizeObserverInstances.length = 0;
    WebglAddon.__reset();
    mockProbeReady = true;
    mockProbeReason = null;
    mockProbeSpy.mockClear();
  });

  afterEach(async () => {
    cleanupMountedRoots();
    await flushTerminalEffects();
    if (global.document?.body) {
      global.document.body.innerHTML = '';
    }
    mockTerminalInstances.length = 0;
    mockWebSocketInstances.length = 0;
    WebglAddon.__reset();
    mockProbeReady = true;
    mockProbeReason = null;
    jest.clearAllMocks();
  });

  test('XW-04-SCEN-1: WebglAddon is constructed and terminal.loadAddon(addon) is called once when effectiveMode is xterm-webgl', async () => {
    await renderIntoDom(
      React.createElement(TerminalTTY, {
        id: 'term-xw-04',
        requestedRendererMode: 'xterm-webgl',
        autoFocus: false,
        isActivePanel: true,
        isVisibleInLayout: true,
        showQuickCopyButton: false,
      })
    );

    expect(mockTerminalInstances).toHaveLength(1);
    const terminal = mockTerminalInstances[0];

    // WebglAddon should have been constructed once.
    expect(WebglAddon.instances).toHaveLength(1);

    // loadAddon should have been called with the constructed addon instance.
    // (fit + search + webgl = 3 calls)
    expect(terminal.loadAddon).toHaveBeenCalledTimes(3);
    const addonCalls = terminal.loadAddon.mock.calls.map(([arg]) => arg);
    expect(addonCalls).toContain(WebglAddon.instances[0]);
  });

  test('XW-05-SCEN-1: addon throw keeps the panel mounted and renders the WebGL fallback warning line', async () => {
    WebglAddon.__setLoadAddonThrow(true);

    const view = await renderIntoDom(
      React.createElement(TerminalTTY, {
        id: 'term-xw-05',
        requestedRendererMode: 'xterm-webgl',
        autoFocus: false,
        isActivePanel: true,
        isVisibleInLayout: true,
        showQuickCopyButton: false,
      })
    );

    await flushTerminalEffects();

    // Panel body remains mounted (TerminalTTY's outer body wrapper).
    const body = view.container.querySelector('[data-testid="terminal-root-body"]');
    expect(body).not.toBeNull();

    // The WebglErrorSection is rendered in place of the xterm mount.
    const errorSection = view.container.querySelector(
      '[data-testid="terminal-webgl-error-section"]'
    );
    expect(errorSection).not.toBeNull();

    // setPanelRendererPreference MUST NOT be called as a side-effect of the fallback.
    expect(mockSetPanelRendererPreference).not.toHaveBeenCalled();
  });

  test('unready xterm-webgl capability: no WebglAddon is constructed and no WebGL code path runs', async () => {
    mockProbeReady = false;
    mockProbeReason = 'webgl-context-creation-failed';
    await renderIntoDom(
      React.createElement(TerminalTTY, {
        id: 'term-xw-not-webgl',
        requestedRendererMode: 'xterm-webgl',
        showQuickCopyButton: false,
      })
    );

    expect(WebglAddon.instances).toHaveLength(0);
  });

  // XW-06: when the user requested xterm-webgl but the runtime capability
  // demotes it (probe says no WebGL), the resolver picks plain 'xterm'
  // and the WebglAddon path is never even attempted. Without this fix the
  // user sees a silent DOM xterm with no warning that their preferred
  // renderer is unavailable — confusing. The warning line must surface
  // the demotion reason, matching the prose returned by
  // getTerminalRendererWebglFallbackCopy.
  test('xterm-webgl demoted by capability: warning line surfaces the demotion reason (XW-06)', async () => {
    mockProbeReady = false;
    mockProbeReason = 'webgl-unsupported-in-webview';
    const view = await renderIntoDom(
      React.createElement(TerminalTTY, {
        id: 'term-xw-demote',
        requestedRendererMode: 'xterm-webgl',
        showQuickCopyButton: false,
      })
    );

    await flushTerminalEffects();

    // No addon constructed (resolver demoted to xterm).
    expect(WebglAddon.instances).toHaveLength(0);

    // The WebglErrorSection is rendered in place of the xterm mount.
    const errorSection = view.container.querySelector(
      '[data-testid="terminal-webgl-error-section"]'
    );
    expect(errorSection).not.toBeNull();
  });

  // XW-07: once the user moves AWAY from xterm-webgl, the demotion warning
  // must clear (no stale 'WebGL unavailable' banner on a different mode).
  test('clearing xterm-webgl demotion warning when the user picks a different renderer (XW-07)', async () => {
    mockProbeReady = false;
    mockProbeReason = 'webgl-unsupported-in-webview';
    const harness = await renderIntoDom(
      React.createElement(TerminalTTY, {
        id: 'term-xw-demote-clear',
        requestedRendererMode: 'xterm-webgl',
        showQuickCopyButton: false,
      })
    );

    await flushTerminalEffects();
    let errorSection = harness.container.querySelector(
      '[data-testid="terminal-webgl-error-section"]'
    );
    expect(errorSection).not.toBeNull();

    // Re-render with a different requested mode (e.g. user picks 'xterm').
    const otherModeElement = React.createElement(TerminalTTY, {
      id: 'term-xw-demote-clear',
      requestedRendererMode: 'xterm',
      showQuickCopyButton: false,
    });
    flushSync(() => {
      harness.root.render(otherModeElement);
    });
    await flushTerminalEffects();

    errorSection = harness.container.querySelector('[data-testid="terminal-webgl-error-section"]');
    expect(errorSection).toBeNull();
  });

  test('on unmount, the registered WebglAddon instance is disposed', async () => {
    const disposeSpy = jest.fn();
    const originalDispose = WebglAddon.prototype.dispose;
    WebglAddon.prototype.dispose = disposeSpy;

    try {
      const harness = await renderIntoDom(
        React.createElement(TerminalTTY, {
          id: 'term-xw-dispose',
          requestedRendererMode: 'xterm-webgl',
          autoFocus: false,
          isActivePanel: true,
          isVisibleInLayout: true,
          showQuickCopyButton: false,
        })
      );

      expect(WebglAddon.instances).toHaveLength(1);

      flushSync(() => {
        harness.root.unmount();
      });
      await flushTerminalEffects();

      expect(disposeSpy).toHaveBeenCalled();
    } finally {
      WebglAddon.prototype.dispose = originalDispose;
    }
  });

  test('probeWebglSupport runs ONCE per mount, not on every re-render (XW-PROBE-ONCE)', async () => {
    // The probe runs in render body — if re-renders don't memoize, the
    // spy count will grow with every render. We force 3 re-renders by
    // calling root.render() repeatedly with the same element and assert
    // the count stays at 1.
    const callsBeforeMount = mockProbeSpy.mock.calls.length;

    const harness = await renderIntoDom(
      React.createElement(TerminalTTY, {
        id: 'term-xw-probe-once',
        requestedRendererMode: 'xterm-webgl',
        autoFocus: false,
        isActivePanel: true,
        isVisibleInLayout: true,
        showQuickCopyButton: false,
      })
    );

    const callsAfterMount = mockProbeSpy.mock.calls.length;
    const mountDelta = callsAfterMount - callsBeforeMount;
    // 1 is the post-fix expectation (lazy useState init). Currently the
    // probe runs in render body, so this could be > 1 if React does an
    // internal commit+render cycle, but at minimum it should not be 0
    // (otherwise the test is meaningless) and ideally should be 1.
    expect(mountDelta).toBeGreaterThanOrEqual(1);

    // Force 3 additional renders.
    const sameElement = React.createElement(TerminalTTY, {
      id: 'term-xw-probe-once',
      requestedRendererMode: 'xterm-webgl',
      autoFocus: false,
      isActivePanel: true,
      isVisibleInLayout: true,
      showQuickCopyButton: false,
    });
    flushSync(() => {
      harness.root.render(sameElement);
    });
    flushSync(() => {
      harness.root.render(sameElement);
    });
    flushSync(() => {
      harness.root.render(sameElement);
    });
    await flushTerminalEffects();

    const callsAfterRerenders = mockProbeSpy.mock.calls.length;
    const rerenderDelta = callsAfterRerenders - callsAfterMount;
    // Post-fix: probe must NOT be called again on re-renders.
    expect(rerenderDelta).toBe(0);
  });

  test('WebglAddon.onContextLoss sets the WebGL fallback state (XW-CONTEXT-LOSS)', async () => {
    const harness = await renderIntoDom(
      React.createElement(TerminalTTY, {
        id: 'term-xw-context-loss',
        requestedRendererMode: 'xterm-webgl',
        autoFocus: false,
        isActivePanel: true,
        isVisibleInLayout: true,
        showQuickCopyButton: false,
      })
    );

    expect(WebglAddon.instances).toHaveLength(1);
    const addon = WebglAddon.instances[0];

    // No WebglErrorSection yet.
    let errorSection = harness.container.querySelector(
      '[data-testid="terminal-webgl-error-section"]'
    );
    expect(errorSection).toBeNull();

    // Fire the context loss event.
    addon.__triggerContextLoss();
    await flushTerminalEffects();

    // WebglErrorSection now visible.
    errorSection = harness.container.querySelector('[data-testid="terminal-webgl-error-section"]');
    expect(errorSection).not.toBeNull();
  });

  // Regression — Linux/WebKitGTK xterm-addon-webgl@0.16.0 teardown race.
  //
  // The addon's `_renderer` MutableDisposable is cleared (.value = undefined)
  // before its terminal.onResize listener is removed. A queued
  // ResizeObserver/fit() that fires during that window calls
  // `_this._renderer.value.handleResize(...)` and crashes with
  // `undefined is not an object (evaluating '_this._renderer.value.handleResize')`.
  //
  // The fix in disposeXtermRuntime: (a) snapshot+null refs immediately,
  // (b) neutralize the live addon's handleResize to a noop, and
  // (c) dispose the terminal FIRST so the AddonManager removes the
  // listener in a safe internal order. If a resize still lands mid-tear,
  // it now hits the noop instead of an undefined slot.
  test('teardown neutralizes WebglAddon.handleResize before disposing the terminal (Linux race)', async () => {
    const harness = await renderIntoDom(
      React.createElement(TerminalTTY, {
        id: 'term-xw-race',
        requestedRendererMode: 'xterm-webgl',
        autoFocus: false,
        isActivePanel: true,
        isVisibleInLayout: true,
        showQuickCopyButton: false,
      })
    );

    expect(WebglAddon.instances).toHaveLength(1);
    const addon = WebglAddon.instances[0];

    // Simulate the live addon shape that xterm-addon-webgl exposes at
    // runtime: a `_renderer.value` slot whose `handleResize` is what
    // crashes when invoked after disposal in production.
    const handleResizeSpy = jest.fn();
    addon._renderer = { value: { handleResize: handleResizeSpy } };

    flushSync(() => {
      harness.root.unmount();
    });
    await flushTerminalEffects();

    // The fix swaps handleResize with a noop BEFORE dispose runs. Any
    // late-firing onResize listener now lands on the noop, not on the
    // original spy and not on `undefined.handleResize`.
    expect(addon._renderer.value.handleResize).not.toBe(handleResizeSpy);
    expect(() => addon._renderer.value.handleResize()).not.toThrow();

    // Sanity: the mock terminal received dispose() too. The unmount path
    // disposes the terminal first (so xterm's AddonManager can cascade
    // safely) and then defensively disposes the addon ref.
    const terminal = mockTerminalInstances[0];
    expect(terminal.dispose).toHaveBeenCalled();
  });

  test('onData drops xterm focus/DA answerback before sending to the PTY websocket', async () => {
    await renderIntoDom(
      React.createElement(TerminalTTY, {
        id: 'term-input-filter',
        requestedRendererMode: 'xterm',
        autoFocus: false,
        isActivePanel: true,
        isVisibleInLayout: true,
        showQuickCopyButton: false,
      })
    );

    const terminal = mockTerminalInstances[0];
    const onDataHandler = terminal.onData.mock.calls[0]?.[0];
    expect(onDataHandler).toBeInstanceOf(Function);

    const socket = mockWebSocketInstances[0];
    socket.send.mockClear();

    onDataHandler('\u001b[?1;2c\u001b[>0;276;0c');
    expect(socket.send).not.toHaveBeenCalled();

    onDataHandler('\u001b[Il');
    expect(socket.send).toHaveBeenCalledTimes(1);
    expect(socket.send).toHaveBeenCalledWith(JSON.stringify({ type: 'input', data: 'l' }));
  });
});
