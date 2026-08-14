/**
 * TerminalTTY.rehydration.test.jsx â€” TDD tests for the terminal-engine-v2
 * two-tier rehydration protocol.
 *
 * Verifies: snapshot restore + delta replay + heldData buffering, temp-resize
 * before serialized write, no-snapshot fresh subscribe, and the loaded gate.
 */

const React = require('react');
const { createRoot } = require('react-dom/client');
const { flushSync } = require('react-dom');
const { JSDOM } = require('jsdom');

const mockTerminalInstances = [];
const mockSerializeInstances = [];
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
        loadAddon: jest.fn(),
        open: jest.fn(),
        onData: jest.fn(),
        focus: jest.fn(),
        write: jest.fn((data, cb) => {
          if (typeof cb === 'function') cb();
        }),
        writeln: jest.fn(),
        paste: jest.fn(),
        refresh: jest.fn(),
        resize: jest.fn(),
        clearTextureAtlas: jest.fn(),
        dispose: jest.fn(),
        getSelection: jest.fn(() => ''),
        clear: jest.fn(),
        scrollToLine: jest.fn(),
        scrollToBottom: jest.fn(),
        parser: { registerCsiHandler: jest.fn() },
        buffer: { active: { type: 'normal', viewportY: 0, baseY: 0, length: 24 } },
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
    SerializeAddon: jest.fn().mockImplementation(() => {
      const instance = {
        serialize: jest.fn(() => '<serialized/>'),
      };
      mockSerializeInstances.push(instance);
      return instance;
    }),
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

function getLastSerializeAddon() {
  return mockSerializeInstances[mockSerializeInstances.length - 1];
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

function decodeAppendPayload(payload) {
  const binaryString = atob(payload.data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i += 1) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockWebSocketInstances.length = 0;
  mockTerminalInstances.length = 0;
  mockSerializeInstances.length = 0;
  installTerminalDom();
  installTerminalRuntimeMocks();
});

afterEach(() => {
  cleanupMountedRoots();
});

describe('TerminalTTY â€” v2 rehydration protocol', () => {
  it('temp-resizes to the cached snapshot termsize before writing the serialized scrollback', async () => {
    await renderIntoDom(
      React.createElement(TerminalTTY, {
        id: 'panel-rehydrate-resize',
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
        type: 'snapshot',
        serialized: 'SNAPSHOT_CONTENT',
        ptyOffset: 100,
        termsize: { cols: 120, rows: 40 },
      }),
    });
    await flushTerminalEffects();

    expect(term.resize).toHaveBeenCalledWith(120, 40);
    expect(term.write).toHaveBeenCalledWith('SNAPSHOT_CONTENT');
  });

  it('replays the snapshot and then the ring-buffer delta before going live', async () => {
    await renderIntoDom(
      React.createElement(TerminalTTY, {
        id: 'panel-rehydrate-delta',
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
        type: 'snapshot',
        serialized: 'SNAPSHOT_CONTENT',
        ptyOffset: 100,
        termsize: { cols: 80, rows: 24 },
      }),
    });
    await flushTerminalEffects();

    // Delta arrives while still loading â€” it must be queued, not written yet.
    socket.onmessage?.({
      data: JSON.stringify({
        type: 'append',
        sessionId: 'panel-rehydrate-delta',
        offset: 112,
        data: Buffer.from('delta-output').toString('base64'),
      }),
    });
    await flushTerminalEffects();

    expect(term.write).not.toHaveBeenCalledWith('delta-output');

    // The metadata replayComplete message ends rehydration and flushes held data.
    socket.onmessage?.({
      data: JSON.stringify({
        type: 'metadata',
        termsize: { cols: 80, rows: 24 },
        cwd: '/home/user',
        replayComplete: true,
      }),
    });
    await flushTerminalEffects();

    const writes = term.write.mock.calls.map(([arg]) => arg);
    expect(writes).toEqual(expect.arrayContaining(['SNAPSHOT_CONTENT', 'delta-output']));
    expect(writes.indexOf('SNAPSHOT_CONTENT')).toBeLessThan(writes.indexOf('delta-output'));
  });

  it('buffers heldData during rehydration and flushes it in order after replay completes', async () => {
    await renderIntoDom(
      React.createElement(TerminalTTY, {
        id: 'panel-held-data',
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
        type: 'snapshot',
        serialized: 'SNAPSHOT',
        ptyOffset: 0,
        termsize: { cols: 80, rows: 24 },
      }),
    });
    await flushTerminalEffects();

    socket.onmessage?.({
      data: JSON.stringify({
        type: 'append',
        sessionId: 'panel-held-data',
        offset: 6,
        data: Buffer.from('first').toString('base64'),
      }),
    });
    socket.onmessage?.({
      data: JSON.stringify({
        type: 'append',
        sessionId: 'panel-held-data',
        offset: 11,
        data: Buffer.from('second').toString('base64'),
      }),
    });
    await flushTerminalEffects();

    expect(term.write).not.toHaveBeenCalledWith('first');
    expect(term.write).not.toHaveBeenCalledWith('second');

    socket.onmessage?.({
      data: JSON.stringify({
        type: 'metadata',
        termsize: { cols: 80, rows: 24 },
        cwd: '/home/user',
        replayComplete: true,
      }),
    });
    await flushTerminalEffects();

    const writes = term.write.mock.calls.map(([arg]) => arg);
    const joined = writes.join('');
    expect(joined).toContain('SNAPSHOT');
    expect(joined.indexOf('SNAPSHOT')).toBeLessThan(joined.indexOf('first'));
    expect(joined.indexOf('first')).toBeLessThan(joined.indexOf('second'));
  });

  it('subscribes from the current offset when no snapshot exists', async () => {
    await renderIntoDom(
      React.createElement(TerminalTTY, {
        id: 'panel-no-snapshot',
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

    socket.onmessage?.({
      data: JSON.stringify({
        type: 'snapshot',
        serialized: null,
        ptyOffset: null,
        termsize: null,
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
    expect(subscribeCalls).toHaveLength(1);
    const subscribePayload = JSON.parse(subscribeCalls[0][0]);
    expect(subscribePayload.v2).toBe(true);
    expect(subscribePayload.fromOffset).toBeUndefined();
  });

  it('does not write append frames until loaded becomes true', async () => {
    await renderIntoDom(
      React.createElement(TerminalTTY, {
        id: 'panel-loaded-gate',
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

    // No snapshot response yet; append data must stay queued.
    socket.onmessage?.({
      data: JSON.stringify({
        type: 'append',
        sessionId: 'panel-loaded-gate',
        offset: 5,
        data: Buffer.from('early').toString('base64'),
      }),
    });
    await flushTerminalEffects();

    expect(term.write).not.toHaveBeenCalledWith('early');

    // Complete rehydration (no snapshot) and flush.
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

    expect(term.write).toHaveBeenCalledWith('early');
  });

  it('serializes and pushes a snapshot after ~100 KiB of processed output', async () => {
    await renderIntoDom(
      React.createElement(TerminalTTY, {
        id: 'panel-snapshot-threshold',
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
    const serializeAddon = getLastSerializeAddon();
    expect(serializeAddon).toBeDefined();
    expect(mockSerializeInstances.length).toBeGreaterThanOrEqual(1);

    // Move past rehydration.
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

    const bigChunk = 'x'.repeat(110 * 1024);
    socket.onmessage?.({
      data: JSON.stringify({
        type: 'append',
        sessionId: 'panel-snapshot-threshold',
        offset: bigChunk.length,
        data: Buffer.from(bigChunk).toString('base64'),
      }),
    });
    await flushTerminalEffects();

    expect(serializeAddon.serialize).toHaveBeenCalled();
    const saveSnapshotCalls = socket.send.mock.calls.filter(([msg]) => {
      try {
        return JSON.parse(msg).type === 'save-snapshot';
      } catch {
        return false;
      }
    });
    expect(saveSnapshotCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('sends a final snapshot before unsubscribing on unmount', async () => {
    const { root } = await renderIntoDom(
      React.createElement(TerminalTTY, {
        id: 'panel-snapshot-dispose',
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
    const serializeAddon = getLastSerializeAddon();

    // Move past rehydration.
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

    socket.send.mockClear();

    flushSync(() => {
      root.unmount();
    });
    await flushTerminalEffects();

    expect(serializeAddon.serialize).toHaveBeenCalled();
    const saveSnapshotCalls = socket.send.mock.calls.filter(([msg]) => {
      try {
        return JSON.parse(msg).type === 'save-snapshot';
      } catch {
        return false;
      }
    });
    expect(saveSnapshotCalls.length).toBeGreaterThanOrEqual(1);

    // Unsubscribe still happens after the snapshot.
    expect(socket.send).toHaveBeenCalledWith(JSON.stringify({ type: 'unsubscribe' }));
  });

  // Reconnect replay must re-anchor the viewport: reconnect() clear()s the buffer
  // (ydisp=0) and the post-replay scroll rescues are non-forced, so without the
  // restore the user lands at the TOP of the rebuilt scrollback.
  async function driveReconnectReplay({ panelId, bufferAtReconnect, bufferAfterReplay }) {
    await renderIntoDom(
      React.createElement(TerminalTTY, {
        id: panelId,
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
    const socket1 = getLastSocket();

    // Complete the first rehydration so the session is live.
    socket1.onmessage?.({
      data: JSON.stringify({
        type: 'snapshot',
        serialized: 'SNAP1',
        ptyOffset: 100,
        termsize: { cols: 80, rows: 24 },
      }),
    });
    await flushTerminalEffects();
    socket1.onmessage?.({
      data: JSON.stringify({
        type: 'metadata',
        termsize: { cols: 80, rows: 24 },
        cwd: '/home/user',
        replayComplete: true,
      }),
    });
    await flushTerminalEffects();

    // Viewport state right before the socket drops.
    term.buffer.active = bufferAtReconnect;

    // Socket drops (CLOSED, like a real half-open drop after OS sleep) →
    // connectionState flips → auto-reconnect fires after the first 300ms backoff.
    socket1.readyState = 3;
    socket1.onclose?.({ code: 1006, reason: 'dropped', wasClean: false });
    await flushTerminalEffects();
    await new Promise((resolve) => setTimeout(resolve, 450));
    await flushTerminalEffects();

    // reconnect() must have cleared the buffer and opened a fresh socket.
    expect(term.clear).toHaveBeenCalled();
    const deadline = Date.now() + 2000;
    while (mockWebSocketInstances.length < 2 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    await flushTerminalEffects();
    const socket2 = getLastSocket();
    expect(socket2).not.toBe(socket1);

    // Post-replay xterm state: viewport stuck at the top while baseY grew.
    term.buffer.active = bufferAfterReplay;
    term.scrollToBottom.mockClear();
    term.scrollToLine.mockClear();

    socket2.onmessage?.({
      data: JSON.stringify({
        type: 'snapshot',
        serialized: 'SNAP2',
        ptyOffset: 200,
        termsize: { cols: 80, rows: 24 },
      }),
    });
    await flushTerminalEffects();
    socket2.onmessage?.({
      data: JSON.stringify({
        type: 'metadata',
        termsize: { cols: 80, rows: 24 },
        cwd: '/home/user',
        replayComplete: true,
      }),
    });
    await flushTerminalEffects();
    await flushTerminalEffects();
    await flushTerminalEffects();

    return { term };
  }

  it('re-anchors the viewport to the bottom after a reconnect replay (was at bottom)', async () => {
    const { term } = await driveReconnectReplay({
      panelId: 'panel-reconnect-bottom',
      bufferAtReconnect: { type: 'normal', viewportY: 100, baseY: 100, length: 124 },
      bufferAfterReplay: { type: 'normal', viewportY: 0, baseY: 100, length: 124 },
    });

    // Forced restore — the non-forced rescues are blocked (viewportY=0, baseY=100).
    expect(term.scrollToBottom).toHaveBeenCalled();
  });

  it('restores the saved scrollback offset after a reconnect replay (was reading)', async () => {
    const { term } = await driveReconnectReplay({
      panelId: 'panel-reconnect-offset',
      bufferAtReconnect: { type: 'normal', viewportY: 40, baseY: 100, length: 124 },
      bufferAfterReplay: { type: 'normal', viewportY: 0, baseY: 100, length: 124 },
    });

    expect(term.scrollToLine).toHaveBeenCalledWith(40);
    expect(term.scrollToBottom).not.toHaveBeenCalled();
  });

  // Initial restore (first connect, no reconnect) replays the snapshot the same
  // way and leaves the viewport pinned at the TOP of the rebuilt scrollback.
  // There is no pre-clear intent to restore, so the default intent must be
  // 'bottom' — otherwise restored agent TUIs (Kimi) land at the conversation
  // header looking frozen, since every non-forced scroll rescue skips them.
  it('re-anchors the viewport to the bottom after an initial restore replay', async () => {
    await renderIntoDom(
      React.createElement(TerminalTTY, {
        id: 'panel-initial-restore',
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
        type: 'snapshot',
        serialized: 'SNAPSHOT_RESTORED',
        ptyOffset: 100,
        termsize: { cols: 80, rows: 24 },
      }),
    });
    await flushTerminalEffects();

    // Post-replay xterm state: viewport stuck at the top while baseY grew.
    term.buffer.active = { type: 'normal', viewportY: 0, baseY: 100, length: 124 };
    term.scrollToBottom.mockClear();
    term.scrollToLine.mockClear();

    socket.onmessage?.({
      data: JSON.stringify({
        type: 'metadata',
        termsize: { cols: 80, rows: 24 },
        cwd: '/home/user',
        replayComplete: true,
      }),
    });
    await flushTerminalEffects();
    await flushTerminalEffects();
    await flushTerminalEffects();

    // Forced restore — the non-forced rescues are blocked (viewportY=0, baseY=100).
    expect(term.scrollToBottom).toHaveBeenCalled();
  });
});
