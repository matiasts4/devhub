/**
 * sessionStore.migration.test.js — TDD tests for schema migration and session classification.
 * RED phase: tests fail before implementation. GREEN: implementation makes them pass.
 */

const mockFs = {
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
  renameSync: jest.fn(),
  readFileSync: jest.fn(),
};

const MOCK_HOME = '/mock-home';
// File paths reserved for future migration tests that need actual file I/O simulation
const _MOCK_SESSIONS_FILE = `${MOCK_HOME}/.devhub/terminal-sessions.json`;
const _MOCK_TMP_FILE = `${MOCK_HOME}/.devhub/terminal-sessions.json.tmp`;

jest.mock('fs', () => mockFs);
jest.mock('os', () => ({ homedir: () => MOCK_HOME }));

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
});

describe('classifySession', () => {
  it('returns opencode-durable when opencodeSessionId is present', async () => {
    const { classifySession } = await import('./sessionStore.js');
    expect(classifySession({ opencodeSessionId: 'ses_abc123' })).toBe('opencode-durable');
  });

  it('returns pty-durable when ptyPid is present (no opencodeSessionId)', async () => {
    const { classifySession } = await import('./sessionStore.js');
    expect(classifySession({ ptyPid: 12345 })).toBe('pty-durable');
  });

  it('returns shell-ephemeral when neither ptyPid nor opencodeSessionId is present', async () => {
    const { classifySession } = await import('./sessionStore.js');
    expect(classifySession({ cwd: '/home/user', shell: '/bin/zsh' })).toBe('shell-ephemeral');
  });

  it('opencode-durable takes precedence over pty-durable when both are set', async () => {
    const { classifySession } = await import('./sessionStore.js');
    expect(classifySession({ opencodeSessionId: 'ses_abc', ptyPid: 999 })).toBe('opencode-durable');
  });

  it('returns shell-ephemeral for empty object', async () => {
    const { classifySession } = await import('./sessionStore.js');
    expect(classifySession({})).toBe('shell-ephemeral');
  });
});

describe('saveSessions writes version:2 with sessionType', () => {
  it('writes version:2 in JSON root', async () => {
    mockFs.existsSync.mockReturnValue(true);
    const { saveSessions } = await import('./sessionStore.js');

    const sessions = new Map([
      [
        'term-1',
        {
          id: 'term-1',
          cwd: '/home/user',
          shell: '/bin/zsh',
          title: null,
          createdAt: new Date().toISOString(),
          lastSeenAt: new Date().toISOString(),
          restored: false,
        },
      ],
    ]);

    saveSessions(sessions);

    const written = mockFs.writeFileSync.mock.calls[0][1];
    const parsed = JSON.parse(written);
    expect(parsed.version).toBe(2);
  });

  it('writes sessionType per session for pty-durable', async () => {
    mockFs.existsSync.mockReturnValue(true);
    const { saveSessions } = await import('./sessionStore.js');

    const sessions = new Map([
      [
        'term-1',
        {
          id: 'term-1',
          ptyPid: 12345,
          cwd: '/home/user',
          shell: '/bin/zsh',
          title: null,
          createdAt: new Date().toISOString(),
          lastSeenAt: new Date().toISOString(),
          restored: false,
        },
      ],
    ]);

    saveSessions(sessions);

    const written = mockFs.writeFileSync.mock.calls[0][1];
    const parsed = JSON.parse(written);
    expect(parsed.sessions[0].sessionType).toBe('pty-durable');
  });

  it('writes sessionType per session for opencode-durable', async () => {
    mockFs.existsSync.mockReturnValue(true);
    const { saveSessions } = await import('./sessionStore.js');

    const sessions = new Map([
      [
        'term-1',
        {
          id: 'term-1',
          opencodeSessionId: 'ses_abc',
          cwd: '/home/user',
          shell: '/bin/zsh',
          title: null,
          createdAt: new Date().toISOString(),
          lastSeenAt: new Date().toISOString(),
          restored: false,
        },
      ],
    ]);

    saveSessions(sessions);

    const written = mockFs.writeFileSync.mock.calls[0][1];
    const parsed = JSON.parse(written);
    expect(parsed.sessions[0].sessionType).toBe('opencode-durable');
  });

  it('writes sessionType per session for shell-ephemeral', async () => {
    mockFs.existsSync.mockReturnValue(true);
    const { saveSessions } = await import('./sessionStore.js');

    const sessions = new Map([
      [
        'term-1',
        {
          id: 'term-1',
          cwd: '/home/user',
          shell: '/bin/zsh',
          title: null,
          createdAt: new Date().toISOString(),
          lastSeenAt: new Date().toISOString(),
          restored: false,
        },
      ],
    ]);

    saveSessions(sessions);

    const written = mockFs.writeFileSync.mock.calls[0][1];
    const parsed = JSON.parse(written);
    expect(parsed.sessions[0].sessionType).toBe('shell-ephemeral');
  });

  it('writes opencodeSessionId and initialCommand fields when present', async () => {
    mockFs.existsSync.mockReturnValue(true);
    const { saveSessions } = await import('./sessionStore.js');

    const sessions = new Map([
      [
        'term-1',
        {
          id: 'term-1',
          opencodeSessionId: 'ses_abc',
          initialCommand: 'opencode --agent coder',
          cwd: '/home/user',
          shell: '/bin/zsh',
          title: null,
          createdAt: new Date().toISOString(),
          lastSeenAt: new Date().toISOString(),
          restored: false,
        },
      ],
    ]);

    saveSessions(sessions);

    const written = mockFs.writeFileSync.mock.calls[0][1];
    const parsed = JSON.parse(written);
    expect(parsed.sessions[0].opencodeSessionId).toBe('ses_abc');
    expect(parsed.sessions[0].initialCommand).toBe('opencode --agent coder');
  });

  it('writes swarmRole and swarmId when present', async () => {
    mockFs.existsSync.mockReturnValue(true);
    const { saveSessions } = await import('./sessionStore.js');

    const sessions = new Map([
      [
        'term-1',
        {
          id: 'term-1',
          cwd: '/home/user',
          shell: '/bin/zsh',
          swarmRole: 'director',
          swarmId: 'swarm-abc',
          title: null,
          createdAt: new Date().toISOString(),
          lastSeenAt: new Date().toISOString(),
          restored: false,
        },
      ],
    ]);

    saveSessions(sessions);

    const written = mockFs.writeFileSync.mock.calls[0][1];
    const parsed = JSON.parse(written);
    expect(parsed.sessions[0].swarmRole).toBe('director');
    expect(parsed.sessions[0].swarmId).toBe('swarm-abc');
  });
});

describe('loadSessions migrates v1 sessions to sessionType', () => {
  it('loadSessions migrates v1 session without sessionType to shell-ephemeral', async () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(
      JSON.stringify({
        version: 1,
        sessions: [
          {
            id: 'v1-shell',
            cwd: '/home/user',
            shell: '/bin/zsh',
            title: null,
            createdAt: new Date().toISOString(),
            lastSeenAt: new Date().toISOString(),
            restored: false,
            // No ptyPid, no opencodeSessionId — legacy shell-ephemeral
          },
        ],
      })
    );

    const { loadSessions } = await import('./sessionStore.js');
    const result = loadSessions();

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('v1-shell');
    expect(result[0].sessionType).toBe('shell-ephemeral');
  });

  it('loadSessions migrates v1 session with ptyPid to pty-durable', async () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(
      JSON.stringify({
        version: 1,
        sessions: [
          {
            id: 'v1-pty',
            ptyPid: 99999,
            cwd: '/home/user',
            shell: '/bin/zsh',
            title: null,
            createdAt: new Date().toISOString(),
            lastSeenAt: new Date().toISOString(),
            restored: false,
          },
        ],
      })
    );

    const { loadSessions } = await import('./sessionStore.js');
    const result = loadSessions();

    expect(result).toHaveLength(1);
    expect(result[0].sessionType).toBe('pty-durable');
  });

  it('loadSessions migrates v1 session with opencodeSessionId to opencode-durable', async () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(
      JSON.stringify({
        version: 1,
        sessions: [
          {
            id: 'v1-opencode',
            opencodeSessionId: 'ses_xyz',
            cwd: '/home/user',
            shell: '/bin/zsh',
            title: null,
            createdAt: new Date().toISOString(),
            lastSeenAt: new Date().toISOString(),
            restored: false,
          },
        ],
      })
    );

    const { loadSessions } = await import('./sessionStore.js');
    const result = loadSessions();

    expect(result).toHaveLength(1);
    expect(result[0].sessionType).toBe('opencode-durable');
  });

  it('loadSessions preserves existing sessionType on v2 sessions', async () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(
      JSON.stringify({
        version: 2,
        sessions: [
          {
            id: 'v2-shell',
            sessionType: 'shell-ephemeral',
            cwd: '/home/user',
            shell: '/bin/zsh',
            title: null,
            createdAt: new Date().toISOString(),
            lastSeenAt: new Date().toISOString(),
            restored: false,
          },
        ],
      })
    );

    const { loadSessions } = await import('./sessionStore.js');
    const result = loadSessions();

    expect(result).toHaveLength(1);
    expect(result[0].sessionType).toBe('shell-ephemeral');
  });

  it('loadSessions marks all returned sessions with restored: true', async () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(
      JSON.stringify({
        version: 1,
        sessions: [
          {
            id: 'session-1',
            cwd: '/home/user',
            shell: '/bin/zsh',
            title: null,
            createdAt: new Date().toISOString(),
            lastSeenAt: new Date().toISOString(),
            restored: false,
          },
        ],
      })
    );

    const { loadSessions } = await import('./sessionStore.js');
    const result = loadSessions();

    expect(result[0].restored).toBe(true);
  });

  it('loadSessions filters out stale sessions (7-day TTL)', async () => {
    mockFs.existsSync.mockReturnValue(true);

    const now = Date.now();
    const eightDaysAgo = new Date(now - 8 * 24 * 60 * 60 * 1000).toISOString();
    const freshTime = new Date(now - 1000).toISOString();

    mockFs.readFileSync.mockReturnValue(
      JSON.stringify({
        version: 1,
        sessions: [
          {
            id: 'stale-shell',
            cwd: '/tmp',
            shell: '/bin/zsh',
            title: null,
            createdAt: eightDaysAgo,
            lastSeenAt: eightDaysAgo,
            restored: false,
          },
          {
            id: 'fresh-shell',
            cwd: '/home/user',
            shell: '/bin/zsh',
            title: null,
            createdAt: freshTime,
            lastSeenAt: freshTime,
            restored: false,
          },
        ],
      })
    );

    const { loadSessions } = await import('./sessionStore.js');
    const result = loadSessions();

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('fresh-shell');
  });
});
