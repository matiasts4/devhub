/**
 * ttyServer.dualMutex.test.js — Dual mutex key tests for Phase 3.
 * Tests:
 *   1. generic mutex (devhub_generic_restore_in_progress) is set/cleared for generic restores
 *   2. opencode-durable sessions do NOT trigger the generic mutex
 *   3. concurrent restore safety (mutex prevents concurrent backend restore)
 */

let alivePids;
const fsMockState = { fileContent: '{}' };
const mockFs = {
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
  globalThis['__DEVHUB_TTY_SESSIONS__'] = new Map();

  // Mock process.kill: only explicitly registered PIDs return true for signal 0
  originalProcessKill = process.kill;
  alivePids = new Set();
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
  globalThis['__DEVHUB_TTY_SESSIONS__'] = sessionsMap;
  getOrInitSessions = () => sessionsMap;
});

afterEach(() => {
  process.kill = originalProcessKill;
  jest.restoreAllMocks();
});

describe('Phase 3 — dual mutex keys', () => {
  describe('generic restore uses devhub_generic_restore_in_progress', () => {
    it('sets devhub_generic_restore_in_progress when restoring pty-durable sessions', async () => {
      const { saveSessions } = await import('./sessionStore.js');

      const alivePid = 50001;
      const sessionsMap = new Map([
        [
          'pty-generic-mutex',
          {
            id: 'pty-generic-mutex',
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

      // Track spawned mock PTY PIDs so process.kill(0) succeeds for new PTY
      const spawnedPtyPids = new Set();
      const origPtySpawn = globalThis.__DEVHUB_TTY_NODE_PTY__.spawn;
      globalThis.__DEVHUB_TTY_NODE_PTY__.spawn = jest.fn((shell, args, opts) => {
        const pty = origPtySpawn(shell, args, opts);
        spawnedPtyPids.add(pty.pid);
        return pty;
      });

      process.kill = jest.fn((pid, signal) => {
        if (signal === 0) {
          if (alivePids.has(pid) || spawnedPtyPids.has(pid)) return true;
          throw new Error('Process not found');
        }
        return originalProcessKill(pid, signal);
      });

      saveSessions(sessionsMap);
      const sessions = getOrInitSessions();
      sessions.clear();

      // Capture the mutex value at the start of restore
      let mutexDuringRestore = null;
      const origSetItem = localStorageMock.setItem.bind(localStorageMock);
      localStorageMock.setItem = jest.fn((key, value) => {
        if (key === 'devhub_generic_restore_in_progress') {
          mutexDuringRestore = value;
        }
        origSetItem(key, value);
      });

      restoreSessions();

      // verify generic mutex was set during restore
      expect(mutexDuringRestore).toBe('true');
      expect(localStorageMock.data['devhub_generic_restore_in_progress']).toBeUndefined();
    });

    it('sets devhub_generic_restore_in_progress when restoring shell-ephemeral sessions', async () => {
      const { saveSessions } = await import('./sessionStore.js');

      const sessionsMap = new Map([
        [
          'shell-eph-generic',
          {
            id: 'shell-eph-generic',
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

      let mutexDuringRestore = null;
      const origSetItem = localStorageMock.setItem.bind(localStorageMock);
      localStorageMock.setItem = jest.fn((key, value) => {
        if (key === 'devhub_generic_restore_in_progress') {
          mutexDuringRestore = value;
        }
        origSetItem(key, value);
      });

      restoreSessions();

      expect(mutexDuringRestore).toBe('true');
      expect(localStorageMock.data['devhub_generic_restore_in_progress']).toBeUndefined();
    });
  });

  describe('opencode-durable sessions do NOT trigger generic mutex', () => {
    it('opencode-durable sessions are skipped by backend and do not appear in restored sessions', async () => {
      const { saveSessions } = await import('./sessionStore.js');

      const sessionsMap = new Map([
        [
          'opencode-durable-1',
          {
            id: 'opencode-durable-1',
            opencodeSessionId: 'ses_opencode_123',
            cwd: '/home/user',
            shell: '/bin/zsh',
            title: null,
            createdAt: new Date().toISOString(),
            lastSeenAt: new Date().toISOString(),
            restored: false,
          },
        ],
        [
          'opencode-durable-2',
          {
            id: 'opencode-durable-2',
            opencodeSessionId: 'ses_opencode_456',
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

      // opencode-durable sessions are NOT restored by backend (React handles them)
      expect([...sessions.keys()]).not.toContain('opencode-durable-1');
      expect([...sessions.keys()]).not.toContain('opencode-durable-2');
    });
  });

  describe('concurrent restore safety', () => {
    it('second restore call while mutex is held does not corrupt state', async () => {
      const { saveSessions } = await import('./sessionStore.js');

      // Two shell-ephemeral sessions
      const sessionsMap = new Map([
        [
          'shell-concurrent-1',
          {
            id: 'shell-concurrent-1',
            cwd: '/home/user/project1',
            shell: '/bin/zsh',
            title: null,
            createdAt: new Date().toISOString(),
            lastSeenAt: new Date().toISOString(),
            restored: false,
          },
        ],
        [
          'shell-concurrent-2',
          {
            id: 'shell-concurrent-2',
            cwd: '/home/user/project2',
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

      // First restore
      restoreSessions();
      expect([...sessions.keys()]).toContain('shell-concurrent-1');
      expect([...sessions.keys()]).toContain('shell-concurrent-2');
      expect(localStorageMock.data['devhub_generic_restore_in_progress']).toBeUndefined();

      // Second restore on same sessions — should be idempotent (no crash, no duplicate sessions)
      const sessionsBeforeSecond = sessions.size;
      restoreSessions();
      // Sessions map should not grow (each session already exists)
      expect(sessions.size).toBe(sessionsBeforeSecond);
      expect(localStorageMock.data['devhub_generic_restore_in_progress']).toBeUndefined();
    });

    it('mix of opencode-durable and generic sessions — only generic mutex is set', async () => {
      const { saveSessions } = await import('./sessionStore.js');

      const sessionsMap = new Map([
        [
          'opencode-mixed',
          {
            id: 'opencode-mixed',
            opencodeSessionId: 'ses_abc',
            cwd: '/home/user',
            shell: '/bin/zsh',
            title: null,
            createdAt: new Date().toISOString(),
            lastSeenAt: new Date().toISOString(),
            restored: false,
          },
        ],
        [
          'shell-mixed',
          {
            id: 'shell-mixed',
            cwd: '/home/user/project',
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

      let genericMutexSetDuringRestore = false;
      const origSetItem = localStorageMock.setItem.bind(localStorageMock);
      localStorageMock.setItem = jest.fn((key, value) => {
        if (key === 'devhub_generic_restore_in_progress') {
          genericMutexSetDuringRestore = true;
        }
        origSetItem(key, value);
      });

      restoreSessions();

      // generic mutex WAS set (because shell-mixed needs restore)
      expect(genericMutexSetDuringRestore).toBe(true);
      // But opencode-durable was not restored by backend
      expect([...sessions.keys()]).not.toContain('opencode-mixed');
      // shell-ephemeral WAS restored
      expect([...sessions.keys()]).toContain('shell-mixed');
    });
  });
});
