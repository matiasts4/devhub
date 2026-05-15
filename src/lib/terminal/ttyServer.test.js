/**
 * ttyServer.test.js — TDD tests for session persistence in ttyServer
 * Tests: saveSessions called on create/close, loadSessions called on startup, debounce on output.
 */

const path = require('path');

// --- Mock node-pty ---
const mockPtyProcess = {
  onData: jest.fn(),
  onExit: jest.fn(),
  write: jest.fn(),
  resize: jest.fn(),
  kill: jest.fn(),
};
const mockPtySpawn = jest.fn(() => mockPtyProcess);

jest.mock('node-pty', () => ({ spawn: mockPtySpawn }), { virtual: true });

// --- Mock sessionStore ---
const mockSaveSessions = jest.fn();
const mockLoadSessions = jest.fn(() => []);

jest.mock('./sessionStore.js', () => ({
  saveSessions: mockSaveSessions,
  loadSessions: mockLoadSessions,
  getSessionFilePath: () => '/mock-home/.devhub/terminal-sessions.json',
  STALE_TTL_MS: 7 * 24 * 60 * 60 * 1000,
}));

// --- Mock ws ---
const mockWssOn = jest.fn();
const mockWss = { on: mockWssOn };

jest.mock('ws', () => ({ WebSocketServer: jest.fn(() => mockWss) }), { virtual: true });

// --- Mock net ---
jest.mock('net', () => ({
  createServer: jest.fn(() => ({
    once: jest.fn((event, cb) => {
      if (event === 'listening') {
        // Simulate async listen completing
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

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  mockLoadSessions.mockReturnValue([]);
  mockPtyProcess.onData.mockImplementation(() => {});
  mockPtyProcess.onExit.mockImplementation(() => {});
  // Reset global singletons
  delete globalThis.__DEVHUB_TTY_SERVER__;
  delete globalThis.__DEVHUB_TTY_SESSIONS__;
});

describe('ttyServer — restoreSessions', () => {
  it('calls loadSessions on startup and creates PTY sessions for restored entries', async () => {
    const freshTime = new Date().toISOString();
    mockLoadSessions.mockReturnValue([
      { id: 'restored-1', cwd: '/home/user/project', shell: '/bin/zsh', title: null, createdAt: freshTime, lastSeenAt: freshTime, restored: true },
      { id: 'restored-2', cwd: '/tmp', shell: '/bin/zsh', title: null, createdAt: freshTime, lastSeenAt: freshTime, restored: true },
    ]);

    const { restoreSessions } = await import('./ttyServer.js');
    restoreSessions();

    expect(mockLoadSessions).toHaveBeenCalled();
    // Sessions should exist in the global map
    const sessions = globalThis.__DEVHUB_TTY_SESSIONS__;
    expect(sessions).toBeDefined();
    expect(sessions.size).toBe(2);
  });

  it('restored sessions retain PTY output in history and broadcast it to attached sockets', async () => {
    const freshTime = new Date().toISOString();
    mockLoadSessions.mockReturnValue([
      { id: 'restored-live', cwd: '/home/user/project', shell: '/bin/zsh', title: null, createdAt: freshTime, lastSeenAt: freshTime, restored: true },
    ]);

    const { restoreSessions } = await import('./ttyServer.js');
    restoreSessions();

    const sessions = globalThis.__DEVHUB_TTY_SESSIONS__;
    const session = sessions.get('restored-live');
    const socket = {
      OPEN: 1,
      readyState: 1,
      send: jest.fn(),
      close: jest.fn(),
    };
    session.sockets.add(socket);

    const onDataHandler = mockPtyProcess.onData.mock.calls.at(-1)?.[0];
    onDataHandler('restored prompt$ ');

    expect(session.history).toContain('restored prompt$ ');
    expect(socket.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'output', data: 'restored prompt$ ' })
    );
  });

  it('does not crash when session file has no sessions', async () => {
    mockLoadSessions.mockReturnValue([]);

    const { restoreSessions } = await import('./ttyServer.js');
    expect(() => restoreSessions()).not.toThrow();

    const sessions = globalThis.__DEVHUB_TTY_SESSIONS__;
    // Either no map or empty map
    const size = sessions ? sessions.size : 0;
    expect(size).toBe(0);
  });
});

describe('ttyServer — session create', () => {
  it('calls saveSessions after creating a new session via createSession()', async () => {
    const { createSession } = await import('./ttyServer.js');

    createSession({ id: 'term-new', cwd: '/home/user', shell: '/bin/zsh' });

    expect(mockSaveSessions).toHaveBeenCalled();
    // The sessions map should be passed
    const [calledMap] = mockSaveSessions.mock.calls[0];
    expect(calledMap).toBeInstanceOf(Map);
    expect(calledMap.has('term-new')).toBe(true);
  });

  it('falls back to a safe cwd when the requested cwd does not exist', async () => {
    const { createSession } = await import('./ttyServer.js');

    createSession({ id: 'term-safe-fallback', cwd: '/definitely/missing/devhub', shell: '/bin/zsh' });

    const spawnCall = mockPtySpawn.mock.calls[0];
    expect(spawnCall[2]?.cwd).toBe(process.cwd());
    expect(spawnCall[2]?.env?.DEVHUB_PROJECT_DIR).toBe(process.cwd());

    const sessions = globalThis.__DEVHUB_TTY_SESSIONS__;
    expect(sessions.get('term-safe-fallback')?.cwd).toBe(process.cwd());
  });
});

describe('ttyServer — session close', () => {
  it('calls saveSessions after closing a session via closeSession()', async () => {
    const { createSession, closeSession } = await import('./ttyServer.js');

    createSession({ id: 'term-close', cwd: '/home/user', shell: '/bin/zsh' });
    mockSaveSessions.mockClear();

    closeSession('term-close');

    expect(mockSaveSessions).toHaveBeenCalled();
    const [calledMap] = mockSaveSessions.mock.calls[0];
    expect(calledMap.has('term-close')).toBe(false);
  });
});

describe('ttyServer — DEVHUB_MCP_CMD uses dynamic project-root path', () => {
  it('resolves devhub-mcp/server.js relative to this file, not a hardcoded home path', async () => {
    const { createSession } = await import('./ttyServer.js');
    createSession({ id: 'mcp-path-test', cwd: '/some/cwd', shell: '/bin/zsh' });

    const sessions = globalThis.__DEVHUB_TTY_SESSIONS__;
    expect(sessions).toBeDefined();
    const session = sessions.get('mcp-path-test');
    // The env var must exist and point to a node invocation
    expect(session).toBeDefined();
    // We verify that the spawned PTY env was set; since we mock pty.spawn,
    // check the call arg that contains the env
    const spawnCall = mockPtySpawn.mock.calls[0];
    expect(spawnCall).toBeDefined();
    const spawnEnv = spawnCall[2]?.env;
    expect(spawnEnv?.DEVHUB_MCP_CMD).toBeDefined();
    const expectedCommand = `node ${path.resolve(process.cwd(), 'devhub-mcp', 'server.js')}`;
    expect(spawnEnv.DEVHUB_MCP_CMD).toBe(expectedCommand);
    expect(spawnEnv.DEVHUB_MCP_CMD).toContain(path.join('devhub-mcp', 'server.js'));
  });
});

describe('ttyServer — getTTYSessionsSnapshot includes cwd and restored', () => {
  it('includes cwd and restored in snapshot entries', async () => {
    const { createSession, getTTYSessionsSnapshot } = await import('./ttyServer.js');
    const existingCwd = process.cwd();

    createSession({ id: 'snap-1', cwd: existingCwd, shell: '/bin/zsh', restored: true });

    const snapshot = getTTYSessionsSnapshot();
    const entry = snapshot.find((s) => s.terminalId === 'snap-1');

    expect(entry).toBeDefined();
    expect(entry.cwd).toBe(existingCwd);
    expect(entry.restored).toBe(true);
  });
});

describe('ttyServer — shell history hygiene', () => {
  function createMockSocket() {
    return {
      OPEN: 1,
      readyState: 1,
      send: jest.fn(),
      close: jest.fn(),
      on: jest.fn(),
    };
  }

  it('preserves normal shell output in history and broadcast', async () => {
    const { createSession } = await import('./ttyServer.js');

    createSession({ id: 'shell-clean', cwd: '/home/user', shell: '/bin/zsh' });
    const sessions = globalThis.__DEVHUB_TTY_SESSIONS__;
    const session = sessions.get('shell-clean');
    const socket = createMockSocket();
    session.sockets.add(socket);

    const onDataHandler = mockPtyProcess.onData.mock.calls.at(-1)?.[0];
    onDataHandler('prompt$ ls\r\nfile-a\r\n');

    expect(session.history).toBe('prompt$ ls\r\nfile-a\r\n');
    expect(socket.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'output', data: 'prompt$ ls\r\nfile-a\r\n' })
    );
  });

  it('filters terminal response noise from shell-mode broadcast and history', async () => {
    const { createSession } = await import('./ttyServer.js');

    createSession({ id: 'shell-noise', cwd: '/home/user', shell: '/bin/zsh' });
    const sessions = globalThis.__DEVHUB_TTY_SESSIONS__;
    const session = sessions.get('shell-noise');
    const socket = createMockSocket();
    session.sockets.add(socket);

    const onDataHandler = mockPtyProcess.onData.mock.calls.at(-1)?.[0];
    onDataHandler('prompt$ ');
    onDataHandler('\u001b[?1;2c');
    onDataHandler('\u001b[>0;276;0c');
    onDataHandler('\u001b[12;34R');
    onDataHandler('echo ok\r\nok\r\n');

    expect(session.history).toBe('prompt$ echo ok\r\nok\r\n');
    expect(socket.send).toHaveBeenNthCalledWith(
      1,
      JSON.stringify({ type: 'output', data: 'prompt$ ' })
    );
    expect(socket.send).toHaveBeenNthCalledWith(
      2,
      JSON.stringify({ type: 'output', data: 'echo ok\r\nok\r\n' })
    );
    expect(socket.send).toHaveBeenCalledTimes(2);
  });

  it('does not replay stored terminal response noise on existing shell-session reconnect', async () => {
    const { ensureTTYServer } = await import('./ttyServer.js');

    await ensureTTYServer();

    const connectionHandler = mockWssOn.mock.calls.find(([eventName]) => eventName === 'connection')?.[1];
    expect(connectionHandler).toBeInstanceOf(Function);

    const firstSocket = createMockSocket();
    firstSocket.on = jest.fn((event, handler) => {
      firstSocket[`__${event}`] = handler;
    });

    connectionHandler(firstSocket, { url: '/terminal?id=replay-shell&cwd=%2Fhome%2Fuser' });

    const sessions = globalThis.__DEVHUB_TTY_SESSIONS__;
    const session = sessions.get('replay-shell');
    const onDataHandler = mockPtyProcess.onData.mock.calls.at(-1)?.[0];
    onDataHandler('prompt$ ');
    onDataHandler('\u001b[?1;2c');
    onDataHandler('pwd\r\n/home/user\r\n');

    firstSocket.send.mockClear();

    const reconnectSocket = createMockSocket();
    reconnectSocket.on = jest.fn((event, handler) => {
      reconnectSocket[`__${event}`] = handler;
    });

    connectionHandler(reconnectSocket, { url: '/terminal?id=replay-shell&cwd=%2Fhome%2Fuser' });

    expect(reconnectSocket.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'output', data: 'prompt$ pwd\r\n/home/user\r\n' })
    );
    expect(reconnectSocket.send).not.toHaveBeenCalledWith(
      JSON.stringify({ type: 'output', data: expect.stringContaining('[?1;2c') })
    );
  });

  it('falls back to a safe cwd for fresh websocket sessions with an invalid requested cwd', async () => {
    const { ensureTTYServer } = await import('./ttyServer.js');

    await ensureTTYServer();

    const connectionHandler = mockWssOn.mock.calls.find(([eventName]) => eventName === 'connection')?.[1];
    expect(connectionHandler).toBeInstanceOf(Function);

    const socket = createMockSocket();
    socket.on = jest.fn((event, handler) => {
      socket[`__${event}`] = handler;
    });

    connectionHandler(socket, { url: '/terminal?id=invalid-cwd&cwd=%2Fdefinitely%2Fmissing%2Fdevhub' });

    const spawnCall = mockPtySpawn.mock.calls[0];
    expect(spawnCall[2]?.cwd).toBe(process.cwd());

    const sessions = globalThis.__DEVHUB_TTY_SESSIONS__;
    expect(sessions.get('invalid-cwd')?.cwd).toBe(process.cwd());
  });
});
