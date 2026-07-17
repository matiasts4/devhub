/**
 * TerminalTTY.v2.test.jsx â€” TDD tests for the terminal-engine-v2 frontend path.
 *
 * Verifies: v2 panels send subscribe on connect; decode terminal:append frames
 * and write them to xterm.js; send unsubscribe before disposal.
 */

const React = require('react');
const { createRoot } = require('react-dom/client');
const { flushSync } = require('react-dom');
const { JSDOM } = require('jsdom');
const { disposeAllSurfaces: resetV2Graveyard } = require('@/lib/terminal/v2Graveyard');

const mockTerminalInstances = [];
const mountedRoots = [];
const mockWebSocketInstances = [];

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
        loadAddon: jest.fn((addon) => {
          const isWebglAddonInstance =
            addon && addon.constructor && addon.constructor.name === 'WebglAddon';
          if (!isWebglAddonInstance) return;
          const mockAddon = require('@xterm/addon-webgl').WebglAddon;
          if (mockAddon?.shouldThrow) {
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
        resize: jest.fn(),
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

jest.mock(
  '@xterm/addon-serialize',
  () => ({
    SerializeAddon: jest.fn().mockImplementation(() => ({
      serialize: jest.fn(() => '<serialized/>'),
      dispose: jest.fn(),
    })),
  }),
  { virtual: true }
);

let mockProbeReady = true;
jest.mock('@/components/terminal/terminalRendererCapabilities', () => {
  const actual = jest.requireActual('@/components/terminal/terminalRendererCapabilities');
  return {
    __esModule: true,
    ...actual,
    probeWebglSupport: () =>
      Object.freeze({
        ready: mockProbeReady,
        reason: mockProbeReady ? null : 'webgl-unavailable',
      }),
  };
});

jest.mock('@/lib/terminal/terminalPanelBridge', () => ({
  stashTerminalPanelBridge: jest.fn(),
  takeTerminalPanelBridge: jest.fn(() => null),
}));

const terminalPanelBridge = require('@/lib/terminal/terminalPanelBridge');
const { WebglAddon } = require('@xterm/addon-webgl');
const TerminalTTY = require('../TerminalTTY.jsx').default;

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

      const isV2 = url.includes('v2=true');

      setTimeout(() => {
        this.readyState = MockWebSocket.OPEN;
        this.onopen?.();
        this.onmessage?.({
          data: JSON.stringify({
            type: 'ready',
            reattached: false,
            mode: 'shell',
            v2: isV2,
            cols: 80,
            rows: 24,
            ptyOffset: 0,
          }),
        });
      }, 0);
    }
  }

  global.WebSocket = MockWebSocket;
  window.WebSocket = MockWebSocket;
}

function getLastSocket() {
  return mockWebSocketInstances[mockWebSocketInstances.length - 1];
}

function getLastTerminal() {
  return mockTerminalInstances[mockTerminalInstances.length - 1];
}

async function waitForWebSocket(timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const check = () => {
      const socket = mockWebSocketInstances[mockWebSocketInstances.length - 1];
      if (socket?.readyState === 1) return resolve();
      if (Date.now() > deadline) return reject(new Error('WebSocket was never created'));
      setTimeout(check, 20);
    };
    check();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockWebSocketInstances.length = 0;
  mockTerminalInstances.length = 0;
  mockProbeReady = true;
  WebglAddon.__reset?.();
  try {
    resetV2Graveyard();
  } catch {
    // ignore â€” module may not be initialized in some jest transforms
  }
  installTerminalDom();
  installTerminalRuntimeMocks();
});

afterEach(() => {
  cleanupMountedRoots();
  WebglAddon.__reset?.();
});

describe('TerminalTTY â€” v2 engine path', () => {
  it('requests snapshot on ready and subscribes after the snapshot response', async () => {
    await renderIntoDom(
      React.createElement(TerminalTTY, {
        id: 'panel-v2-sub',
        isEngineV2: true,
        isVisibleInLayout: true,
        isActivePanel: true,
        showQuickCopyButton: false,
        requestedRendererMode: 'xterm',
      })
    );

    await flushTerminalEffects();
    await flushTerminalEffects();
    await waitForWebSocket();

    const socket = getLastSocket();
    expect(socket).toBeDefined();

    // The v2 path does NOT subscribe on open; it asks for the stored snapshot first.
    const subscribeOnOpen = socket.send.mock.calls.some(([msg]) => {
      try {
        return JSON.parse(msg).type === 'subscribe';
      } catch {
        return false;
      }
    });
    expect(subscribeOnOpen).toBe(false);

    const getSnapshotCalls = socket.send.mock.calls.filter(([msg]) => {
      try {
        return JSON.parse(msg).type === 'get-snapshot';
      } catch {
        return false;
      }
    });
    expect(getSnapshotCalls.length).toBe(1);

    // Simulate a snapshot response; this should trigger subscribe with fromOffset.
    socket.onmessage?.({
      data: JSON.stringify({
        type: 'snapshot',
        serialized: '<snapshot/>',
        ptyOffset: 42,
        termsize: { cols: 80, rows: 24 },
      }),
    });
    await flushTerminalEffects();

    const subscribeCalls = socket.send.mock.calls.filter(([msg]) => {
      try {
        return JSON.parse(msg).type === 'subscribe';
      } catch {
        return false;
      }
    });
    expect(subscribeCalls.length).toBe(1);
    expect(JSON.parse(subscribeCalls[0][0])).toMatchObject({
      type: 'subscribe',
      v2: true,
      fromOffset: 42,
    });
  });

  it('does not send subscribe for legacy v1 panels', async () => {
    await renderIntoDom(
      React.createElement(TerminalTTY, {
        id: 'panel-v1-no-sub',
        isEngineV2: false,
        isVisibleInLayout: true,
        isActivePanel: true,
        showQuickCopyButton: false,
        requestedRendererMode: 'xterm',
      })
    );

    await flushTerminalEffects();
    await flushTerminalEffects();
    await waitForWebSocket();

    const socket = getLastSocket();
    const subscribeCalls = socket.send.mock.calls.filter(([msg]) => {
      try {
        return JSON.parse(msg).type === 'subscribe';
      } catch {
        return false;
      }
    });
    expect(subscribeCalls.length).toBe(0);
  });

  it('decodes terminal:append frames and writes them to xterm.js', async () => {
    await renderIntoDom(
      React.createElement(TerminalTTY, {
        id: 'panel-v2-append',
        isEngineV2: true,
        isVisibleInLayout: true,
        isActivePanel: true,
        showQuickCopyButton: false,
        requestedRendererMode: 'xterm',
      })
    );

    await flushTerminalEffects();
    await flushTerminalEffects();
    await waitForWebSocket();

    const socket = getLastSocket();
    const term = getLastTerminal();

    // Move past the rehydration handshake so append data is written live.
    socket.onmessage?.({
      data: JSON.stringify({
        type: 'snapshot',
        serialized: null,
        ptyOffset: null,
        termsize: null,
      }),
    });
    socket.onmessage?.({
      data: JSON.stringify({
        type: 'metadata',
        termsize: { cols: 80, rows: 24 },
        cwd: '/home/user',
        replayComplete: true,
      }),
    });
    await flushTerminalEffects();

    const payload = JSON.stringify({
      type: 'append',
      sessionId: 'panel-v2-append',
      offset: 42,
      data: Buffer.from('hello v2').toString('base64'),
    });

    socket.onmessage?.({ data: payload });
    await flushTerminalEffects();

    expect(term.write).toHaveBeenCalledWith('hello v2');
  });

  it('sends unsubscribe before closing the socket on unmount', async () => {
    const { root } = await renderIntoDom(
      React.createElement(TerminalTTY, {
        id: 'panel-v2-unsub',
        isEngineV2: true,
        isVisibleInLayout: true,
        isActivePanel: true,
        showQuickCopyButton: false,
        requestedRendererMode: 'xterm',
      })
    );

    await flushTerminalEffects();
    await flushTerminalEffects();
    await waitForWebSocket();

    const socket = getLastSocket();
    socket.send.mockClear();

    flushSync(() => {
      root.unmount();
    });
    await flushTerminalEffects();

    expect(socket.send).toHaveBeenCalledWith(JSON.stringify({ type: 'unsubscribe' }));
    expect(socket.close).toHaveBeenCalled();
  });

  it('includes v2=true in the WebSocket URL for v2 panels', async () => {
    await renderIntoDom(
      React.createElement(TerminalTTY, {
        id: 'panel-v2-url',
        isEngineV2: true,
        cwd: '/home/user',
        isVisibleInLayout: true,
        isActivePanel: true,
        showQuickCopyButton: false,
        requestedRendererMode: 'xterm',
      })
    );

    await flushTerminalEffects();
    await flushTerminalEffects();
    await waitForWebSocket();

    const socket = getLastSocket();
    expect(socket.url).toContain('v2=true');
  });

  it('resizes back to container and notifies the PTY after rehydration completes', async () => {
    await renderIntoDom(
      React.createElement(TerminalTTY, {
        id: 'panel-v2-termsize',
        isEngineV2: true,
        isVisibleInLayout: true,
        isActivePanel: true,
        showQuickCopyButton: false,
        requestedRendererMode: 'xterm',
      })
    );

    await flushTerminalEffects();
    await flushTerminalEffects();
    await waitForWebSocket();

    const socket = getLastSocket();

    // Simulate no-snapshot rehydration completion.
    socket.onmessage?.({
      data: JSON.stringify({
        type: 'snapshot',
        serialized: null,
        ptyOffset: null,
        termsize: null,
      }),
    });
    socket.onmessage?.({
      data: JSON.stringify({
        type: 'metadata',
        termsize: { cols: 90, rows: 30 },
        cwd: '/home/user',
        replayComplete: true,
      }),
    });
    await flushTerminalEffects();

    const resizeCalls = socket.send.mock.calls.filter(([msg]) => {
      try {
        return JSON.parse(msg).type === 'resize';
      } catch {
        return false;
      }
    });
    expect(resizeCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('applies server termsize from a metadata message', async () => {
    await renderIntoDom(
      React.createElement(TerminalTTY, {
        id: 'panel-v2-metadata-msg',
        isEngineV2: true,
        isVisibleInLayout: true,
        isActivePanel: true,
        showQuickCopyButton: false,
        requestedRendererMode: 'xterm',
      })
    );

    await flushTerminalEffects();
    await flushTerminalEffects();
    await waitForWebSocket();

    const socket = getLastSocket();
    const term = getLastTerminal();

    socket.onmessage?.({
      data: JSON.stringify({
        type: 'metadata',
        termsize: { cols: 100, rows: 35 },
        cwd: '/home/user',
        shell: '/bin/zsh',
      }),
    });
    await flushTerminalEffects();

    expect(term.resize).toHaveBeenCalledWith(100, 35);
  });

  it('stashes the live xterm surface in the v2 graveyard on unmount', async () => {
    const { root } = await renderIntoDom(
      React.createElement(TerminalTTY, {
        id: 'panel-v2-graveyard-stash',
        isEngineV2: true,
        isVisibleInLayout: true,
        isActivePanel: true,
        showQuickCopyButton: false,
        requestedRendererMode: 'xterm',
      })
    );

    await flushTerminalEffects();
    await flushTerminalEffects();
    await waitForWebSocket();

    const term = getLastTerminal();

    flushSync(() => {
      root.unmount();
    });
    await flushTerminalEffects();

    // The legacy terminal instance should NOT have been disposed.
    expect(term.dispose).not.toHaveBeenCalled();
  });

  it('restores a previously stashed xterm surface on remount', async () => {
    // First mount and stash.
    const { root } = await renderIntoDom(
      React.createElement(TerminalTTY, {
        id: 'panel-v2-graveyard-restore',
        isEngineV2: true,
        isVisibleInLayout: true,
        isActivePanel: true,
        showQuickCopyButton: false,
        requestedRendererMode: 'xterm',
      })
    );

    await flushTerminalEffects();
    await flushTerminalEffects();
    await waitForWebSocket();

    const firstTerm = getLastTerminal();

    flushSync(() => {
      root.unmount();
    });
    await flushTerminalEffects();

    // Remount: should reuse the existing xterm instance.
    await renderIntoDom(
      React.createElement(TerminalTTY, {
        id: 'panel-v2-graveyard-restore',
        isEngineV2: true,
        isVisibleInLayout: true,
        isActivePanel: true,
        showQuickCopyButton: false,
        requestedRendererMode: 'xterm',
      })
    );

    await flushTerminalEffects();
    await flushTerminalEffects();
    await waitForWebSocket();

    const secondTerm = getLastTerminal();
    expect(secondTerm).toBe(firstTerm);
  });

  it('v2 WebGL context loss degrades to DOM without scheduling GPU recovery', async () => {
    const harness = await renderIntoDom(
      React.createElement(TerminalTTY, {
        id: 'panel-v2-context-loss',
        isEngineV2: true,
        requestedRendererMode: 'xterm-webgl',
        isVisibleInLayout: true,
        isActivePanel: true,
        showQuickCopyButton: false,
      })
    );

    await flushTerminalEffects();
    await flushTerminalEffects();
    await waitForWebSocket();

    expect(WebglAddon.instances).toHaveLength(1);
    const addon = WebglAddon.instances[0];
    const disposeSpy = jest.spyOn(addon, 'dispose');
    const instancesBeforeLoss = WebglAddon.instances.length;

    addon.__triggerContextLoss();
    await flushTerminalEffects();
    await new Promise((resolve) => setTimeout(resolve, 500));
    await flushTerminalEffects();

    expect(disposeSpy).toHaveBeenCalled();
    // v2 must not schedule GPU recovery after context loss â€” no new WebGL addons.
    expect(WebglAddon.instances.length).toBe(instancesBeforeLoss);
    // WEBGL_CONTEXT_LOST keeps the live xterm viewport (no blocking error overlay).
    expect(
      harness.container.querySelector('[data-testid="terminal-webgl-error-section"]')
    ).toBeNull();
    expect(harness.container.querySelector('.devhub-xterm-container')).not.toBeNull();
  });

  it('does not stash output in terminalPanelBridge on v2 unmount', async () => {
    const { root } = await renderIntoDom(
      React.createElement(TerminalTTY, {
        id: 'panel-v2-no-bridge',
        isEngineV2: true,
        isVisibleInLayout: true,
        isActivePanel: true,
        showQuickCopyButton: false,
        requestedRendererMode: 'xterm',
      })
    );

    await flushTerminalEffects();
    await flushTerminalEffects();
    await waitForWebSocket();

    terminalPanelBridge.stashTerminalPanelBridge.mockClear();

    flushSync(() => {
      root.unmount();
    });
    await flushTerminalEffects();

    expect(terminalPanelBridge.stashTerminalPanelBridge).not.toHaveBeenCalled();
  });

  it('does not register a devhub:terminal-survivor-recover listener when isEngineV2 is true', async () => {
    const addSpy = jest.spyOn(window, 'addEventListener');

    await renderIntoDom(
      React.createElement(TerminalTTY, {
        id: 'panel-v2-no-survivor-listener',
        isEngineV2: true,
        isVisibleInLayout: true,
        isActivePanel: true,
        showQuickCopyButton: false,
        requestedRendererMode: 'xterm',
      })
    );

    await flushTerminalEffects();
    await flushTerminalEffects();
    await waitForWebSocket();

    const survivorRegistrations = addSpy.mock.calls.filter(
      ([eventName]) => eventName === 'devhub:terminal-survivor-recover'
    );
    expect(survivorRegistrations).toHaveLength(0);

    addSpy.mockRestore();
  });

  it('ignores devhub:terminal-layout-settled survivor bursts when isEngineV2 is true', async () => {
    await renderIntoDom(
      React.createElement(TerminalTTY, {
        id: 'panel-v2-no-layout-burst',
        isEngineV2: true,
        isVisibleInLayout: true,
        isActivePanel: true,
        showQuickCopyButton: false,
        requestedRendererMode: 'xterm',
      })
    );

    await flushTerminalEffects();
    await flushTerminalEffects();
    await waitForWebSocket();

    const term = getLastTerminal();
    term.refresh.mockClear();

    window.dispatchEvent(
      new window.CustomEvent('devhub:terminal-layout-settled', {
        detail: {
          panelIds: ['panel-v2-no-layout-burst'],
          reason: 'workspace-removed',
        },
      })
    );
    await flushTerminalEffects();

    expect(term.refresh).not.toHaveBeenCalled();
  });

  it('ignores devhub:terminal-survivor-recover events when isEngineV2 is true', async () => {
    await renderIntoDom(
      React.createElement(TerminalTTY, {
        id: 'panel-v2-no-survivor',
        isEngineV2: true,
        isVisibleInLayout: true,
        isActivePanel: true,
        showQuickCopyButton: false,
        requestedRendererMode: 'xterm',
      })
    );

    await flushTerminalEffects();
    await flushTerminalEffects();
    await waitForWebSocket();

    const term = getLastTerminal();
    term.refresh.mockClear();

    window.dispatchEvent(
      new window.CustomEvent('devhub:terminal-survivor-recover', {
        detail: {
          panelIds: ['panel-v2-no-survivor'],
          reason: 'workspace-removed',
        },
      })
    );
    await flushTerminalEffects();

    expect(term.refresh).not.toHaveBeenCalled();
  });

  it('keeps legacy output handling working when isEngineV2 is false', async () => {
    await renderIntoDom(
      React.createElement(TerminalTTY, {
        id: 'panel-v1-output',
        isEngineV2: false,
        isVisibleInLayout: true,
        isActivePanel: true,
        showQuickCopyButton: false,
        requestedRendererMode: 'xterm',
      })
    );

    await flushTerminalEffects();
    await flushTerminalEffects();
    await waitForWebSocket();

    const socket = getLastSocket();
    const term = getLastTerminal();

    socket.onmessage?.({
      data: JSON.stringify({ type: 'output', data: 'legacy output' }),
    });
    await flushTerminalEffects();

    expect(term.write).toHaveBeenCalledWith('legacy output');
  });
});
