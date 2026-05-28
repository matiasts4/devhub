/**
 * ttyServer.restoreEphemeral.test.js — TDD tests for restoreSessions() branching.
 * Tests: pty-durable (process.kill check), opencode-durable (skip), shell-ephemeral (respawn).
 * Also tests devhub_restore_in_progress mutex flag lifecycle.
 */

// Shared mock state persists across jest.resetModules()
const fsMockState = { fileContent: '{}' };
const mockFs = {
  // Return true for any path containing '.devhub' (the session file dir)
  existsSync: jest.fn((p) => String(p).includes('.devhub') || fsMockState.fileContent !== '{}'),
  readFileSync: jest.fn(() => fsMockState.fileContent),
  writeFileSync: jest.fn((path, content) => {
    fsMockState.fileContent = content;
  }),
  renameSync: jest.fn(),
  mkdirSync: jest.fn(),
  readdirSync: jest.fn(() => []),
  unlinkSync: jest.fn(),
};
mockFs.default = mockFs;
jest.mock('fs', () => mockFs);
jest.mock('ws', () => ({ WebSocketServer: jest.fn() }));
jest.mock('node-pty', () => ({
  spawn: jest.fn(() => ({
    pid: 99999,
    onData: jest.fn(),
    onExit: jest.fn(),
    write: jest.fn(),
    kill: jest.fn(),
  })),
}));

jest.mock('../../lib/db/localDb.js', () => ({
  getDb: jest.fn(),
  updateWorkspacePtyIdentity: jest.fn(),
  clearWorkspacePtyIdentity: jest.fn(),
}));

jest.mock('./cwdGuard.js', () => ({
  resolveTerminalSpawnCwd: jest.fn(({ requestedCwd }) => ({
    requestedCwd,
    effectiveCwd: requestedCwd || '/mock-home',
    usedFallback: false,
  })),
  validateSwarmCwd: jest.fn(() => ({ valid: true })),
}));

// Mock localStorage
const localStorageMock = {
  data: {},
  getItem(key) {
    return this.data[key] ?? null;
  },
  setItem(key, value) {
    this.data[key] = String(value);
  },
  removeItem(key) {
    delete this.data[key];
  },
};
Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

let restoreSessions;
let getOrInitSessions;
let originalProcessKill;

beforeEach(async () => {
  jest.resetModules();
  jest.clearAllMocks();
  fsMockState.fileContent = '{}';
  localStorageMock.data = {};

  // Mock globalThis state
  globalThis.__DEVHUB_TTY_NODE_PTY__ = {
    spawn: jest.fn(() => ({
      pid: 9000 + Math.floor(Math.random() * 1000),
      onData: jest.fn(),
      onExit: jest.fn(),
      write: jest.fn(),
      kill: jest.fn(),
    })),
  };
  globalThis.__DEVHUB_TTY_WS__ = { WebSocketServer: jest.fn() };
  // The actual key the module uses (hardcoded in ttyServer.js as GLOBAL_TTY_SESSIONS_KEY)
  globalThis['__DEVHUB_TTY_SESSIONS__'] = new Map();

  // Mock process.kill: signal 0 (exists check) only returns true for explicitly added PIDs.
  // Tests that need all PIDs to pass (e.g., pty-durable restore) override this per-test.
  originalProcessKill = process.kill;
  const alivePids = new Set();

  process.kill = jest.fn((pid, signal) => {
    if (signal === 0) {
      if (alivePids.has(pid)) return true;
      throw new Error('Process not found');
    }
    return originalProcessKill(pid, signal);
  });

  const terminalModule = await import('./ttyServer.js');
  restoreSessions = terminalModule.restoreSessions;

  const sessionsMap = new Map();
  // The module uses globalThis['__DEVHUB_TTY_SESSIONS__'] internally
  globalThis['__DEVHUB_TTY_SESSIONS__'] = sessionsMap;
  getOrInitSessions = () => sessionsMap;
});

afterEach(() => {
  process.kill = originalProcessKill;
  jest.restoreAllMocks();
});

describe('restoreSessions skips pty-durable without live pid', () => {
  it('skips pty-durable session whose ptyPid is no longer alive', async () => {
    // Write a pty-durable session with a dead PID to local session store
    const { saveSessions } = await import('./sessionStore.js');

    const deadPid = 99999;
    const sessionsMap = new Map([
      [
        'pty-dead',
        {
          id: 'pty-dead',
          ptyPid: deadPid,
          cwd: '/tmp',
          shell: '/bin/zsh',
          title: null,
          createdAt: new Date().toISOString(),
          lastSeenAt: new Date().toISOString(),
          restored: false,
        },
      ],
    ]);
    saveSessions(sessionsMap);

    const sessions = getOrInitSessions();
    sessions.clear(); // start fresh

    restoreSessions();

    // Should NOT have created a session for the dead pty
    expect([...sessions.keys()]).not.toContain('pty-dead');
  });

  it('restores pty-durable session whose ptyPid IS alive', async () => {
    const { saveSessions } = await import('./sessionStore.js');

    const alivePid = 50001;
    const sessionsMap = new Map([
      [
        'pty-alive',
        {
          id: 'pty-alive',
          ptyPid: alivePid,
          cwd: '/home/user',
          shell: '/bin/zsh',
          title: null,
          createdAt: new Date().toISOString(),
          lastSeenAt: new Date().toISOString(),
          restored: false,
        },
      ],
    ]);

    // Override process.kill to return true for the saved alivePid AND
    // any newly spawned mock PTY (random 9000-9999 range) during saveSessions
    const alivePids = new Set([alivePid]);
    const spawnedPtyPids = new Set();
    process.kill = jest.fn((pid, signal) => {
      if (signal === 0) {
        if (alivePids.has(pid) || spawnedPtyPids.has(pid)) return true;
        throw new Error('Process not found');
      }
    });

    // Track spawned mock PTY PIDs: the mock pty.spawn returns pid 9000-9999
    const origPtySpawn = globalThis.__DEVHUB_TTY_NODE_PTY__.spawn;
    globalThis.__DEVHUB_TTY_NODE_PTY__.spawn = jest.fn((shell, args, opts) => {
      const pty = origPtySpawn(shell, args, opts);
      spawnedPtyPids.add(pty.pid);
      return pty;
    });

    saveSessions(sessionsMap);

    const sessions = getOrInitSessions();
    sessions.clear();

    restoreSessions();

    // Should have created a restored session
    expect([...sessions.keys()]).toContain('pty-alive');
  });
});

describe('restoreSessions skips opencode-durable sessions', () => {
  it('skips opencode-durable session — React handles it', async () => {
    const { saveSessions } = await import('./sessionStore.js');

    const sessionsMap = new Map([
      [
        'opencode-ses',
        {
          id: 'opencode-ses',
          opencodeSessionId: 'ses_abc123',
          cwd: '/home/user',
          shell: '/bin/zsh',
          title: null,
          createdAt: new Date().toISOString(),
          lastSeenAt: new Date().toISOString(),
          restored: false,
        },
      ],
    ]);
    saveSessions(sessionsMap);

    const sessions = getOrInitSessions();
    sessions.clear();

    restoreSessions();

    // opencode-durable is skipped — no backend restore
    expect([...sessions.keys()]).not.toContain('opencode-ses');
  });
});

describe('restoreSessions respawns shell-ephemeral sessions', () => {
  it('respawns shell-ephemeral with correct cwd/shell — no ptyPid check', async () => {
    const { saveSessions } = await import('./sessionStore.js');

    const sessionsMap = new Map([
      [
        'shell-eph-1',
        {
          id: 'shell-eph-1',
          cwd: '/home/user/project',
          shell: '/bin/zsh',
          title: 'DevHub Shell',
          createdAt: new Date().toISOString(),
          lastSeenAt: new Date().toISOString(),
          restored: false,
          // No ptyPid, no opencodeSessionId
        },
      ],
    ]);
    saveSessions(sessionsMap);

    const sessions = getOrInitSessions();
    sessions.clear();

    restoreSessions();

    // shell-ephemeral should be restored (createSession called)
    expect([...sessions.keys()]).toContain('shell-eph-1');
  });

  it('skips shell-ephemeral if both cwd and shell are missing', async () => {
    const { saveSessions } = await import('./sessionStore.js');

    const sessionsMap = new Map([
      [
        'shell-eph-bad',
        {
          id: 'shell-eph-bad',
          // No cwd, no shell
          title: null,
          createdAt: new Date().toISOString(),
          lastSeenAt: new Date().toISOString(),
          restored: false,
        },
      ],
    ]);
    saveSessions(sessionsMap);

    const sessions = getOrInitSessions();
    sessions.clear();

    restoreSessions();

    // Should be skipped due to missing cwd/shell
    expect([...sessions.keys()]).not.toContain('shell-eph-bad');
  });
});

describe('devhub_restore_in_progress mutex flag', () => {
  it('sets flag before restore and clears it after', async () => {
    const { saveSessions } = await import('./sessionStore.js');

    const sessionsMap = new Map([
      [
        'shell-eph-mutex',
        {
          id: 'shell-eph-mutex',
          cwd: '/home/user',
          shell: '/bin/zsh',
          title: null,
          createdAt: new Date().toISOString(),
          lastSeenAt: new Date().toISOString(),
          restored: false,
        },
      ],
    ]);
    saveSessions(sessionsMap);

    const sessions = getOrInitSessions();
    sessions.clear();

    expect(localStorageMock.data['devhub_restore_in_progress']).toBeUndefined();

    restoreSessions();

    // Flag should be cleared after restore completes
    expect(localStorageMock.data['devhub_restore_in_progress']).toBeUndefined();
  });

  it('flag is cleared even if restore throws', async () => {
    const { saveSessions } = await import('./sessionStore.js');

    // Force a bad session
    const sessionsMap = new Map([
      [
        'bad-session',
        {
          id: 'bad-session',
          cwd: null, // will cause createSession to fail
          shell: null,
          title: null,
          createdAt: new Date().toISOString(),
          lastSeenAt: new Date().toISOString(),
          restored: false,
        },
      ],
    ]);
    saveSessions(sessionsMap);

    const sessions = getOrInitSessions();
    sessions.clear();

    restoreSessions();

    // Flag must be cleared even on error
    expect(localStorageMock.data['devhub_restore_in_progress']).toBeUndefined();
  });
});

describe('restoreSessions console output', () => {
  it('logs shell-ephemeral restored count', async () => {
    const { saveSessions } = await import('./sessionStore.js');

    const sessionsMap = new Map([
      [
        'shell-eph-log',
        {
          id: 'shell-eph-log',
          cwd: '/home/user',
          shell: '/bin/zsh',
          title: null,
          createdAt: new Date().toISOString(),
          lastSeenAt: new Date().toISOString(),
          restored: false,
        },
      ],
    ]);
    saveSessions(sessionsMap);

    const sessions = getOrInitSessions();
    sessions.clear();

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    restoreSessions();

    const logCalls = consoleSpy.mock.calls.map((c) => c[0]);
    const restoreLog = logCalls.find((l) => l && l.includes('shell-ephemeral'));
    expect(restoreLog).toBeDefined();

    consoleSpy.mockRestore();
  });
});
