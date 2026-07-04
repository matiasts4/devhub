/**
 * @jest-environment node
 */

/**
 * ttyServer.unsubscribe.test.js — TDD integration tests for the v2 unsubscribe
 * decoupling contract.
 *
 * Verifies: unsubscribe stops terminal:append delivery to that socket; the PTY
 * stays alive (no kill, no auto-kill timer); re-subscribe replays the delta
 * accumulated while unsubscribed.
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
  spawnSync: jest.fn(() => ({ status: 1 })),
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

describe('ttyServer — v2 unsubscribe keeps PTY alive', () => {
  it('stops append events to the unsubscribed socket', async () => {
    const { socket, session } = await startServerAndConnect(
      '/terminal?id=v2-unsub-stop&cwd=%2Fhome%2Fuser'
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

  it('does not start the auto-kill timer after unsubscribe or socket close', async () => {
    const { socket, session } = await startServerAndConnect(
      '/terminal?id=v2-unsub-nokill&cwd=%2Fhome%2Fuser'
    );

    socket.__message(JSON.stringify({ type: 'subscribe', v2: true }));
    socket.__message(JSON.stringify({ type: 'unsubscribe' }));
    socket.__close(1000, 'hide');

    expect(session._autoKillTimer).toBeUndefined();
    expect(session.subscribed).toBe(false);
    expect(session.ptyAlive).toBe(true);
    expect(mockPtyProcess.kill).not.toHaveBeenCalled();
  });

  it('re-subscribe replays the delta accumulated while unsubscribed', async () => {
    const { socket, session } = await startServerAndConnect(
      '/terminal?id=v2-resub-delta&cwd=%2Fhome%2Fuser'
    );

    socket.__message(JSON.stringify({ type: 'subscribe', v2: true }));

    const onDataHandler = mockPtyProcess.onData.mock.calls.at(-1)?.[0];
    onDataHandler('chunk one');

    socket.send.mockClear();
    socket.__message(JSON.stringify({ type: 'unsubscribe' }));

    onDataHandler('chunk two');
    onDataHandler('chunk three');

    const beforeOffset = session.scrollbackStore.getOffset();

    socket.__message(
      JSON.stringify({
        type: 'subscribe',
        v2: true,
        fromOffset: beforeOffset - 100,
      })
    );

    const appendCalls = socket.send.mock.calls.filter(([msg]) => {
      try {
        return JSON.parse(msg).type === 'append';
      } catch {
        return false;
      }
    });
    expect(appendCalls.length).toBeGreaterThanOrEqual(1);

    const replayPayload = JSON.parse(appendCalls[0][0]);
    const replayed = Buffer.from(replayPayload.data, 'base64').toString();
    expect(replayed).toContain('chunk two');
    expect(replayed).toContain('chunk three');
  });

  it('subscribe accepts sessionId and fromOffset', async () => {
    const { socket } = await startServerAndConnect(
      '/terminal?id=v2-subscribe-formats&cwd=%2Fhome%2Fuser'
    );

    socket.__message(
      JSON.stringify({
        type: 'subscribe',
        sessionId: 'v2-subscribe-formats',
        fromOffset: 12,
      })
    );

    const metadataCalls = socket.send.mock.calls.filter(([msg]) => {
      try {
        return JSON.parse(msg).type === 'metadata';
      } catch {
        return false;
      }
    });
    expect(metadataCalls.length).toBe(1);
    const metadata = JSON.parse(metadataCalls[0][0]);
    expect(metadata.replayComplete).toBe(true);
    expect(metadata.ptyOffset).toBeGreaterThanOrEqual(0);
  });
});
