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

    createSession({ id: 'snap-1', cwd: '/home/user/snap', shell: '/bin/zsh', restored: true });

    const snapshot = getTTYSessionsSnapshot();
    const entry = snapshot.find((s) => s.terminalId === 'snap-1');

    expect(entry).toBeDefined();
    expect(entry.cwd).toBe('/home/user/snap');
    expect(entry.restored).toBe(true);
  });
});
