/**
 * TerminalTTY.v2.test.jsx — TDD tests for the terminal-engine-v2 frontend path.
 *
 * Verifies: v2 panels send subscribe on connect; decode terminal:append frames
 * and write them to xterm.js; send unsubscribe before disposal.
 */

const React = require('react');
const { createRoot } = require('react-dom/client');
const { flushSync } = require('react-dom');
const { JSDOM } = require('jsdom');

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
  installTerminalDom();
  installTerminalRuntimeMocks();
});

afterEach(() => {
  cleanupMountedRoots();
});

describe('TerminalTTY — v2 engine path', () => {
  it('sends subscribe(v2=true) when the WebSocket opens', async () => {
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
    expect(socket.send).toHaveBeenCalledWith(JSON.stringify({ type: 'subscribe', v2: true }));
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
