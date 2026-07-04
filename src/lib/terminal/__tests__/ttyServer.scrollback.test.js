/**
 * ttyServer.scrollback.test.js — TDD integration tests for the v2 pub/sub path.
 *
 * Verifies: every session gets a scrollback store; v2 subscribers receive
 * terminal:append frames; unsubscribe decouples the client without killing the
 * PTY; v1 panels continue to receive legacy output events.
 */

// --- Mock node-pty ---
const mockPtyProcess = {
  onData: jest.fn(),
  onExit: jest.fn(),
  write: jest.fn(),
  resize: jest.fn(),
  kill: jest.fn(),
  pid: 12345,
};
const mockPtySpawn = jest.fn(() => mockPtyProcess);

jest.mock('node-pty', () => ({ spawn: mockPtySpawn }), { virtual: true });

// --- Mock sessionStore ---
const mockSaveSessions = jest.fn();
const mockLoadSessions = jest.fn(() => []);

jest.mock('../sessionStore.js', () => ({
  saveSessions: mockSaveSessions,
  loadSessions: mockLoadSessions,
  getSessionFilePath: () => '/mock-home/.devhub/terminal-sessions.json',
  STALE_TTL_MS: 7 * 24 * 60 * 60 * 1000,
  classifySession: jest.requireActual('../sessionStore.js').classifySession,
}));

// --- Mock ws ---
const mockWssOn = jest.fn();
const mockWss = { on: mockWssOn };
const mockWebSocketServer = jest.fn(() => mockWss);

jest.mock('ws', () => ({ WebSocketServer: mockWebSocketServer }), { virtual: true });

// --- Mock net ---
jest.mock('net', () => ({
  createServer: jest.fn(() => ({
    once: jest.fn((event, cb) => {
      if (event === 'listening') {
        setTimeout(() => cb(), 0);
      }
    }),
    listen: jest.fn(),
    address: jest.fn(() => ({ port: 4077 })),
    close: jest.fn((cb) => cb && cb()),
  })),
}));

// --- Mock child_process ---
jest.mock('child_process', () => ({
  spawnSync: jest.fn(() => ({ status: 1 })), // tmux not available
}));

// --- Mock os ---
jest.mock('os', () => ({
  homedir: () => '/mock-home',
  platform: () => 'linux',
}));

function createMockSocket() {
  const socket = {
    OPEN: 1,
    readyState: 1,
    send: jest.fn(),
    close: jest.fn(),
    on: jest.fn((event, handler) => {
      socket[`__${event}`] = handler;
    }),
  };
  return socket;
}

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  mockLoadSessions.mockReturnValue([]);
  mockPtyProcess.onData.mockImplementation(() => {});
  mockPtyProcess.onExit.mockImplementation(() => {});
  globalThis.__DEVHUB_TTY_NODE_PTY__ = { spawn: mockPtySpawn };
  globalThis.__DEVHUB_TTY_WS__ = { WebSocketServer: mockWebSocketServer };
  delete globalThis.__DEVHUB_TTY_SERVER__;
  delete globalThis.__DEVHUB_TTY_SESSIONS__;
});

afterEach(() => {
  delete globalThis.__DEVHUB_TTY_NODE_PTY__;
  delete globalThis.__DEVHUB_TTY_WS__;
});

async function startServerAndConnect(url) {
  const { ensureTTYServer } = await import('../ttyServer.js');
  await ensureTTYServer();

  const connectionHandler = mockWssOn.mock.calls.find(
    ([eventName]) => eventName === 'connection'
  )?.[1];

  const socket = createMockSocket();
  connectionHandler(socket, { url });

  const sessions = globalThis.__DEVHUB_TTY_SESSIONS__;
  const sessionId = url.match(/[?&]id=([^&]+)/)?.[1];
  const session = sessions.get(sessionId);

  return { socket, session, sessions };
}

describe('ttyServer — v2 scrollback store', () => {
  it('creates a scrollback store for every new session', async () => {
    const { session } = await startServerAndConnect('/terminal?id=v2-store&cwd=%2Fhome%2Fuser');

    expect(session.scrollbackStore).toBeDefined();
    expect(typeof session.scrollbackStore.append).toBe('function');
    expect(typeof session.scrollbackStore.read).toBe('function');
    expect(session.scrollbackStore.getSize()).toBe(0);
  });

  it('appends PTY output to the scrollback store', async () => {
    const { session } = await startServerAndConnect('/terminal?id=v2-append&cwd=%2Fhome%2Fuser');

    const onDataHandler = mockPtyProcess.onData.mock.calls.at(-1)?.[0];
    onDataHandler('hello scrollback');

    expect(session.scrollbackStore.read(0)).toBe('hello scrollback');
    expect(session.scrollbackStore.getOffset()).toBe(16);
  });

  it('publishes terminal:append frames to v2 subscribers only', async () => {
    const { socket } = await startServerAndConnect('/terminal?id=v2-pub&cwd=%2Fhome%2Fuser');

    socket.__message(JSON.stringify({ type: 'subscribe', v2: true }));

    const onDataHandler = mockPtyProcess.onData.mock.calls.at(-1)?.[0];
    onDataHandler('v2-only output');

    const appendCalls = socket.send.mock.calls.filter(([msg]) => {
      try {
        return JSON.parse(msg).type === 'append';
      } catch {
        return false;
      }
    });
    expect(appendCalls.length).toBe(1);

    const payload = JSON.parse(appendCalls[0][0]);
    expect(payload.sessionId).toBe('v2-pub');
    expect(typeof payload.offset).toBe('number');
    expect(Buffer.from(payload.data, 'base64').toString()).toBe('v2-only output');

    // The same socket should NOT receive the legacy output event.
    const outputCalls = socket.send.mock.calls.filter(([msg]) => {
      try {
        return JSON.parse(msg).type === 'output';
      } catch {
        return false;
      }
    });
    expect(outputCalls.length).toBe(0);
  });

  it('keeps the legacy output path for non-v2 panels', async () => {
    const { socket } = await startServerAndConnect('/terminal?id=v1-legacy&cwd=%2Fhome%2Fuser');

    // No subscribe message: this is a v1 panel.
    const onDataHandler = mockPtyProcess.onData.mock.calls.at(-1)?.[0];
    onDataHandler('legacy output');

    const outputCalls = socket.send.mock.calls.filter(([msg]) => {
      try {
        return JSON.parse(msg).type === 'output';
      } catch {
        return false;
      }
    });
    expect(outputCalls.length).toBe(1);
    expect(JSON.parse(outputCalls[0][0]).data).toBe('legacy output');

    const appendCalls = socket.send.mock.calls.filter(([msg]) => {
      try {
        return JSON.parse(msg).type === 'append';
      } catch {
        return false;
      }
    });
    expect(appendCalls.length).toBe(0);
  });

  it('stops sending append events after unsubscribe without killing the PTY', async () => {
    const { socket, session } = await startServerAndConnect(
      '/terminal?id=v2-unsub&cwd=%2Fhome%2Fuser'
    );

    socket.__message(JSON.stringify({ type: 'subscribe', v2: true }));

    const onDataHandler = mockPtyProcess.onData.mock.calls.at(-1)?.[0];
    onDataHandler('before unsubscribe');

    let appendCalls = socket.send.mock.calls.filter(([msg]) => {
      try {
        return JSON.parse(msg).type === 'append';
      } catch {
        return false;
      }
    });
    expect(appendCalls.length).toBe(1);

    socket.send.mockClear();
    socket.__message(JSON.stringify({ type: 'unsubscribe' }));

    // PTY is still alive and the store keeps filling.
    onDataHandler('after unsubscribe');
    expect(session.scrollbackStore.read(0)).toContain('after unsubscribe');

    appendCalls = socket.send.mock.calls.filter(([msg]) => {
      try {
        return JSON.parse(msg).type === 'append';
      } catch {
        return false;
      }
    });
    expect(appendCalls.length).toBe(0);
    expect(mockPtyProcess.kill).not.toHaveBeenCalled();
  });

  it('does not start the auto-kill timer for v2 sessions after socket close', async () => {
    const { socket, session } = await startServerAndConnect(
      '/terminal?id=v2-nokill&cwd=%2Fhome%2Fuser'
    );

    socket.__message(JSON.stringify({ type: 'subscribe', v2: true }));
    socket.__close(1000, 'hide');

    // The v2 lifecycle keeps the PTY alive; no auto-kill timer should exist.
    expect(session._autoKillTimer).toBeUndefined();
    expect(mockPtyProcess.kill).not.toHaveBeenCalled();
  });

  it('starts the auto-kill timer for legacy v1 sessions after socket close', async () => {
    const { socket, session } = await startServerAndConnect(
      '/terminal?id=v1-kill&cwd=%2Fhome%2Fuser'
    );

    // No v2 subscribe — legacy path.
    socket.__close(1000, 'close');

    expect(session._autoKillTimer).toBeDefined();
    clearTimeout(session._autoKillTimer);
    session._autoKillTimer = null;
  });

  it('routes v1 output to a replaced v2 subscriber correctly', async () => {
    const { ensureTTYServer } = await import('../ttyServer.js');
    await ensureTTYServer();

    const connectionHandler = mockWssOn.mock.calls.find(
      ([eventName]) => eventName === 'connection'
    )?.[1];

    const v1Socket = createMockSocket();
    connectionHandler(v1Socket, { url: '/terminal?id=dual-replace&cwd=%2Fhome%2Fuser' });

    const onDataHandler = mockPtyProcess.onData.mock.calls.at(-1)?.[0];
    onDataHandler('v1 output');

    const v1Messages = v1Socket.send.mock.calls.filter(([msg]) => {
      try {
        return JSON.parse(msg).type === 'output';
      } catch {
        return false;
      }
    });
    expect(v1Messages.length).toBe(1);
    expect(JSON.parse(v1Messages[0][0]).data).toBe('v1 output');

    // A new v2 connection replaces the v1 socket (single-viewer policy).
    const v2Socket = createMockSocket();
    connectionHandler(v2Socket, { url: '/terminal?id=dual-replace&cwd=%2Fhome%2Fuser' });
    v2Socket.__message(JSON.stringify({ type: 'subscribe', v2: true }));

    onDataHandler('v2 output');

    const v2Messages = v2Socket.send.mock.calls.filter(([msg]) => {
      try {
        return JSON.parse(msg).type === 'append';
      } catch {
        return false;
      }
    });
    expect(v2Messages.length).toBe(1);
    expect(Buffer.from(JSON.parse(v2Messages[0][0]).data, 'base64').toString()).toBe('v2 output');
  });
});
