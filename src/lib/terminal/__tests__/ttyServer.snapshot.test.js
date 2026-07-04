/**
 * ttyServer.snapshot.test.js — TDD integration tests for the v2 snapshot store.
 *
 * Verifies: the sidecar stores/returns cache:term:full snapshots; get-snapshot
 * returns null when none exists; subscribe accepts fromOffset and replays the
 * ring-buffer delta before going live.
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

describe('ttyServer — snapshot storage', () => {
  it('stores a snapshot from a save-snapshot message and returns it via get-snapshot', async () => {
    const { socket } = await startServerAndConnect('/terminal?id=v2-snapshot&cwd=%2Fhome%2Fuser');

    socket.__message(
      JSON.stringify({
        type: 'save-snapshot',
        serialized: '<snapshot>one</snapshot>',
        ptyOffset: 1234,
        termsize: { cols: 100, rows: 40 },
      })
    );

    socket.__message(JSON.stringify({ type: 'get-snapshot' }));

    const snapshotMessages = getMessagesOfType(socket, 'snapshot');
    expect(snapshotMessages).toHaveLength(1);
    expect(snapshotMessages[0]).toMatchObject({
      serialized: '<snapshot>one</snapshot>',
      ptyOffset: 1234,
      termsize: { cols: 100, rows: 40 },
    });
  });

  it('also accepts cache:term:full as an alias for save-snapshot', async () => {
    const { socket } = await startServerAndConnect(
      '/terminal?id=v2-snapshot-alias&cwd=%2Fhome%2Fuser'
    );

    socket.__message(
      JSON.stringify({
        type: 'cache:term:full',
        serialized: '<snapshot>alias</snapshot>',
        ptyOffset: 5678,
        termsize: { cols: 80, rows: 24 },
      })
    );

    socket.__message(JSON.stringify({ type: 'get-snapshot' }));

    const snapshotMessages = getMessagesOfType(socket, 'snapshot');
    expect(snapshotMessages).toHaveLength(1);
    expect(snapshotMessages[0]).toMatchObject({
      serialized: '<snapshot>alias</snapshot>',
      ptyOffset: 5678,
      termsize: { cols: 80, rows: 24 },
    });
  });

  it('returns a null snapshot when none has been saved', async () => {
    const { socket } = await startServerAndConnect(
      '/terminal?id=v2-no-snapshot&cwd=%2Fhome%2Fuser'
    );

    socket.__message(JSON.stringify({ type: 'get-snapshot' }));

    const snapshotMessages = getMessagesOfType(socket, 'snapshot');
    expect(snapshotMessages).toHaveLength(1);
    expect(snapshotMessages[0]).toMatchObject({
      serialized: null,
      ptyOffset: null,
      termsize: null,
    });
  });

  it('overwrites the previous snapshot with a newer one', async () => {
    const { socket } = await startServerAndConnect(
      '/terminal?id=v2-snapshot-update&cwd=%2Fhome%2Fuser'
    );

    socket.__message(
      JSON.stringify({
        type: 'save-snapshot',
        serialized: '<snapshot>old</snapshot>',
        ptyOffset: 100,
        termsize: { cols: 80, rows: 24 },
      })
    );

    socket.__message(
      JSON.stringify({
        type: 'save-snapshot',
        serialized: '<snapshot>new</snapshot>',
        ptyOffset: 200,
        termsize: { cols: 100, rows: 40 },
      })
    );

    socket.__message(JSON.stringify({ type: 'get-snapshot' }));

    const snapshotMessages = getMessagesOfType(socket, 'snapshot');
    expect(snapshotMessages).toHaveLength(1);
    expect(snapshotMessages[0]).toMatchObject({
      serialized: '<snapshot>new</snapshot>',
      ptyOffset: 200,
      termsize: { cols: 100, rows: 40 },
    });
  });
});

describe('ttyServer — subscribe with fromOffset', () => {
  it('replays the ring-buffer delta from fromOffset before going live', async () => {
    const { socket, session } = await startServerAndConnect(
      '/terminal?id=v2-replay&cwd=%2Fhome%2Fuser'
    );

    const onDataHandler = mockPtyProcess.onData.mock.calls.at(-1)?.[0];
    onDataHandler('before snapshot');

    const snapshotOffset = session.scrollbackStore.getOffset();

    socket.__message(
      JSON.stringify({
        type: 'save-snapshot',
        serialized: '<snapshot/>',
        ptyOffset: 0,
        termsize: { cols: 80, rows: 24 },
      })
    );

    onDataHandler('after snapshot');

    socket.send.mockClear();
    socket.__message(JSON.stringify({ type: 'subscribe', v2: true, fromOffset: snapshotOffset }));

    const appendMessages = getMessagesOfType(socket, 'append');
    expect(appendMessages.length).toBeGreaterThanOrEqual(1);

    const replayPayload = appendMessages.find((m) => {
      const decoded = Buffer.from(m.data, 'base64').toString();
      return decoded === 'after snapshot';
    });
    expect(replayPayload).toBeDefined();

    const metadataMessages = getMessagesOfType(socket, 'metadata');
    expect(metadataMessages).toHaveLength(1);
    expect(metadataMessages[0]).toMatchObject({ replayComplete: true });
  });

  it('does not replay when fromOffset is omitted', async () => {
    const { socket, session } = await startServerAndConnect(
      '/terminal?id=v2-no-replay&cwd=%2Fhome%2Fuser'
    );

    const onDataHandler = mockPtyProcess.onData.mock.calls.at(-1)?.[0];
    onDataHandler('old output');

    const beforeOffset = session.scrollbackStore.getOffset();
    socket.send.mockClear();

    socket.__message(JSON.stringify({ type: 'subscribe', v2: true }));

    const appendMessages = getMessagesOfType(socket, 'append');
    expect(appendMessages).toHaveLength(0);

    const metadataMessages = getMessagesOfType(socket, 'metadata');
    expect(metadataMessages).toHaveLength(1);
    expect(metadataMessages[0]).toMatchObject({
      replayComplete: true,
      ptyOffset: beforeOffset,
    });
  });
});
