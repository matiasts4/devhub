const mockPtyProcess = {
  onData: jest.fn(),
  onExit: jest.fn(),
  write: jest.fn(),
  resize: jest.fn(),
  kill: jest.fn(),
};

const mockPtySpawn = jest.fn(() => mockPtyProcess);
const mockSaveSessions = jest.fn();

jest.mock('node-pty', () => ({ spawn: mockPtySpawn }), { virtual: true });
jest.mock('./sessionStore.js', () => ({
  saveSessions: mockSaveSessions,
  loadSessions: jest.fn(() => []),
}));
jest.mock('ws', () => ({ WebSocketServer: jest.fn(() => ({ on: jest.fn() })) }), { virtual: true });
jest.mock('net', () => ({
  createServer: jest.fn(() => ({
    once: jest.fn(),
    listen: jest.fn(),
    address: jest.fn(() => ({ port: 4077 })),
    close: jest.fn((cb) => cb && cb()),
  })),
}));
jest.mock('child_process', () => ({
  spawnSync: jest.fn(() => ({ status: 1 })),
}));
jest.mock('os', () => ({
  homedir: () => '/mock-home',
  platform: () => 'linux',
}));

describe('closeSession()', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    delete globalThis.__DEVHUB_TTY_SESSIONS__;
    delete globalThis.__DEVHUB_TTY_SERVER__;
  });

  test('kills the PTY process before removing the session', async () => {
    const { createSession, closeSession } = await import('./ttyServer.js');

    createSession({ id: 'p3', cwd: '/tmp', shell: '/bin/zsh' });
    mockSaveSessions.mockClear();

    closeSession('p3');

    expect(mockPtyProcess.kill).toHaveBeenCalledTimes(1);
    const sessions = globalThis.__DEVHUB_TTY_SESSIONS__;
    expect(sessions.has('p3')).toBe(false);
    expect(mockSaveSessions).toHaveBeenCalled();
  });
});
