/**
 * ttyServer.metadata.test.js — TDD integration tests for terminal-engine-v2
 * backend source of truth: canonical termsize, session metadata, OSC 7 cwd.
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
  hostname: () => 'testhost',
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

  // Simulate the client ack so the socket is tracked like a real connection.
  session.sockets.add(socket);

  return { socket, session, sessions };
}

function getMessagesOfType(socket, type) {
  return socket.send.mock.calls
    .map(([msg]) => {
      try {
        return JSON.parse(msg);
      } catch {
        return null;
      }
    })
    .filter((payload) => payload?.type === type);
}

describe('ttyServer — canonical termsize', () => {
  it('stores termsize on resize and returns it on metadata query', async () => {
    const { socket, session } = await startServerAndConnect(
      '/terminal?id=v2-resize-meta&cwd=%2Fhome%2Fuser'
    );

    socket.__message(JSON.stringify({ type: 'resize', cols: 100, rows: 40 }));

    expect(session.termsize).toEqual({ cols: 100, rows: 40 });
    expect(mockPtyProcess.resize).toHaveBeenCalledWith(100, 40);

    const { getSessionMetadata } = await import('../ttyServer.js');
    const metadata = getSessionMetadata(session.id);
    expect(metadata.termsize).toEqual({ cols: 100, rows: 40 });
  });

  it('broadcasts termsize to v2 subscribers when one client resizes', async () => {
    const { ensureTTYServer } = await import('../ttyServer.js');
    await ensureTTYServer();

    const connectionHandler = mockWssOn.mock.calls.find(
      ([eventName]) => eventName === 'connection'
    )?.[1];

    const v2SocketA = createMockSocket();
    connectionHandler(v2SocketA, { url: '/terminal?id=v2-concurrent&cwd=%2Fhome%2Fuser' });
    v2SocketA.__message(JSON.stringify({ type: 'subscribe', v2: true }));

    const v2SocketB = createMockSocket();
    connectionHandler(v2SocketB, { url: '/terminal?id=v2-concurrent&cwd=%2Fhome%2Fuser' });
    v2SocketB.__message(JSON.stringify({ type: 'subscribe', v2: true }));

    const sessions = globalThis.__DEVHUB_TTY_SESSIONS__;
    const session = sessions.get('v2-concurrent');
    // Both sockets should be in the v2 subscriber set.
    expect(session.v2Subscribers.size).toBe(2);

    v2SocketA.send.mockClear();
    v2SocketB.send.mockClear();

    v2SocketA.__message(JSON.stringify({ type: 'resize', cols: 90, rows: 30 }));

    const aTermsize = getMessagesOfType(v2SocketA, 'termsize');
    const bTermsize = getMessagesOfType(v2SocketB, 'termsize');

    expect(aTermsize).toHaveLength(1);
    expect(bTermsize).toHaveLength(1);
    expect(aTermsize[0]).toMatchObject({ cols: 90, rows: 30 });
    expect(bTermsize[0]).toMatchObject({ cols: 90, rows: 30 });
  });

  it('sends cached termsize in the ready frame on v2 reconnect', async () => {
    const { socket } = await startServerAndConnect(
      '/terminal?id=v2-ready-termsize&cwd=%2Fhome%2Fuser'
    );

    socket.__message(JSON.stringify({ type: 'resize', cols: 88, rows: 24 }));
    socket.send.mockClear();

    // Reconnect: a new socket requests v2 via query param so the initial ready
    // frame carries canonical termsize + cwd.
    const reconnectSocket = createMockSocket();
    const connectionHandler = mockWssOn.mock.calls.find(
      ([eventName]) => eventName === 'connection'
    )?.[1];
    connectionHandler(reconnectSocket, {
      url: '/terminal?id=v2-ready-termsize&cwd=%2Fhome%2Fuser&v2=true',
    });

    const readyMessages = getMessagesOfType(reconnectSocket, 'ready');
    expect(readyMessages.length).toBeGreaterThanOrEqual(1);
    const lastReady = readyMessages[readyMessages.length - 1];
    expect(lastReady).toMatchObject({
      v2: true,
      cols: 88,
      rows: 24,
    });
  });
});

describe('ttyServer — session metadata', () => {
  it('metadata query returns the full object', async () => {
    const { socket, session } = await startServerAndConnect(
      '/terminal?id=v2-metadata&cwd=%2Fhome%2Fuser'
    );

    socket.__message(JSON.stringify({ type: 'subscribe', v2: true }));
    socket.__message(JSON.stringify({ type: 'resize', cols: 80, rows: 25 }));

    const { getSessionMetadata } = await import('../ttyServer.js');
    const metadata = getSessionMetadata(session.id);

    expect(metadata).toMatchObject({
      shell: session.shell,
      cwd: session.cwd,
      termsize: { cols: 80, rows: 25 },
    });
    expect(metadata).toHaveProperty('title');
    expect(metadata).toHaveProperty('initialCommand');
    expect(metadata).toHaveProperty('agentTuiState');
  });

  it('responds to get-metadata message over WebSocket', async () => {
    const { socket, session } = await startServerAndConnect(
      '/terminal?id=v2-metadata-ws&cwd=%2Fhome%2Fuser'
    );

    socket.__message(JSON.stringify({ type: 'subscribe', v2: true }));
    socket.send.mockClear();

    socket.__message(JSON.stringify({ type: 'get-metadata' }));

    const metadataMessages = getMessagesOfType(socket, 'metadata');
    expect(metadataMessages).toHaveLength(1);
    expect(metadataMessages[0]).toMatchObject({
      cwd: session.cwd,
      termsize: { cols: 120, rows: 32 },
    });
  });
});

describe('ttyServer — OSC 7 cwd capture', () => {
  it('updates session.cwd from OSC 7 sequences in PTY output', async () => {
    const { session } = await startServerAndConnect('/terminal?id=v2-osc7&cwd=%2Fhome%2Fuser');

    const onDataHandler = mockPtyProcess.onData.mock.calls.at(-1)?.[0];
    onDataHandler('\x1b]7;file://testhost/home/user/projects\x1b\\');

    expect(session.cwd).toBe('/home/user/projects');
  });

  it('captures cwd from OSC 7 split across chunks', async () => {
    const { session } = await startServerAndConnect(
      '/terminal?id=v2-osc7-split&cwd=%2Fhome%2Fuser'
    );

    const onDataHandler = mockPtyProcess.onData.mock.calls.at(-1)?.[0];
    onDataHandler('\x1b]7;file://testhost/home/user/');
    onDataHandler('projects\x07');

    expect(session.cwd).toBe('/home/user/projects');
  });
});
