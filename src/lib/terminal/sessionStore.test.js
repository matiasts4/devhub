/**
 * sessionStore.test.js — TDD tests for session persistence
 * RED phase: these tests fail before implementation exists.
 */

// --- Manual mocks ---
const mockFs = {
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
  renameSync: jest.fn(),
  readFileSync: jest.fn(),
};

const MOCK_HOME = '/mock-home';

jest.mock('fs', () => mockFs);
jest.mock('os', () => ({ homedir: () => MOCK_HOME }));

const MOCK_DIR = `${MOCK_HOME}/.devhub`;
const MOCK_SESSIONS_FILE = `${MOCK_HOME}/.devhub/terminal-sessions.json`;
const MOCK_TMP_FILE = `${MOCK_HOME}/.devhub/terminal-sessions.json.tmp`;

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
});

describe('SESSION_FILE_PATH constant', () => {
  it('resolves to ~/.devhub/terminal-sessions.json', async () => {
    const { getSessionFilePath } = await import('./sessionStore.js');
    expect(getSessionFilePath()).toBe(MOCK_SESSIONS_FILE);
  });

  it('honors DEVHUB_HOME when set', async () => {
    process.env.DEVHUB_HOME = '/mock-devhub-home';
    const { getSessionFilePath } = await import('./sessionStore.js');
    expect(getSessionFilePath()).toBe('/mock-devhub-home/terminal-sessions.json');
    delete process.env.DEVHUB_HOME;
  });
});

describe('STALE_TTL_MS constant', () => {
  it('equals 7 days in milliseconds', async () => {
    const { STALE_TTL_MS } = await import('./sessionStore.js');
    expect(STALE_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

describe('saveSessions', () => {
  it('writes JSON via tmp+rename (atomic write)', async () => {
    mockFs.existsSync.mockReturnValue(true);

    const { saveSessions } = await import('./sessionStore.js');

    const now = new Date().toISOString();
    const sessions = new Map([
      [
        'term-1',
        {
          id: 'term-1',
          cwd: '/home/user',
          shell: '/bin/zsh',
          title: null,
          createdAt: now,
          lastSeenAt: now,
          restored: false,
        },
      ],
    ]);

    saveSessions(sessions);

    expect(mockFs.writeFileSync).toHaveBeenCalledWith(MOCK_TMP_FILE, expect.any(String), 'utf8');
    expect(mockFs.renameSync).toHaveBeenCalledWith(MOCK_TMP_FILE, MOCK_SESSIONS_FILE);
  });

  it('writes correct JSON schema with version=1', async () => {
    mockFs.existsSync.mockReturnValue(true);

    const { saveSessions } = await import('./sessionStore.js');

    const now = new Date().toISOString();
    const sessions = new Map([
      [
        'term-1',
        {
          id: 'term-1',
          cwd: '/home/user/project',
          shell: '/bin/zsh',
          title: 'My Terminal',
          createdAt: now,
          lastSeenAt: now,
          restored: false,
        },
      ],
    ]);

    saveSessions(sessions);

    const written = mockFs.writeFileSync.mock.calls[0][1];
    const parsed = JSON.parse(written);

    expect(parsed.version).toBe(4);
    expect(Array.isArray(parsed.sessions)).toBe(true);
    expect(parsed.sessions).toHaveLength(1);
    expect(parsed.sessions[0].id).toBe('term-1');
    expect(parsed.sessions[0].cwd).toBe('/home/user/project');
    expect(parsed.sessions[0].shell).toBe('/bin/zsh');
    expect(parsed.sessions[0].title).toBe('My Terminal');
    expect(parsed.sessions[0].sessionType).toBe('shell-ephemeral'); // classified by classifySession
    expect(parsed.sessions[0].opencodeSessionId).toBeNull();
    expect(parsed.sessions[0].ptyPid).toBeNull();
  });

  it('creates the ~/.devhub directory if it does not exist', async () => {
    mockFs.existsSync.mockReturnValue(false);

    const { saveSessions } = await import('./sessionStore.js');

    saveSessions(new Map());

    expect(mockFs.mkdirSync).toHaveBeenCalledWith(MOCK_DIR, { recursive: true });
  });

  it('skips mkdirSync if directory already exists', async () => {
    mockFs.existsSync.mockReturnValue(true);

    const { saveSessions } = await import('./sessionStore.js');
    saveSessions(new Map());

    expect(mockFs.mkdirSync).not.toHaveBeenCalled();
  });
});

describe('loadSessions', () => {
  it('returns [] if session file does not exist', async () => {
    mockFs.existsSync.mockReturnValue(false);

    const { loadSessions } = await import('./sessionStore.js');
    const result = loadSessions();

    expect(result).toEqual([]);
  });

  it('returns [] if session file contains invalid JSON', async () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue('NOT VALID JSON }{');

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { loadSessions } = await import('./sessionStore.js');
    const result = loadSessions();

    expect(result).toEqual([]);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('filters out sessions older than 7 days', async () => {
    mockFs.existsSync.mockReturnValue(true);

    const now = Date.now();
    const eightDaysAgo = new Date(now - 8 * 24 * 60 * 60 * 1000).toISOString();
    const freshTime = new Date(now - 1000).toISOString();

    const fileContent = JSON.stringify({
      version: 1,
      sessions: [
        {
          id: 'stale-1',
          cwd: '/tmp',
          shell: '/bin/zsh',
          title: null,
          createdAt: eightDaysAgo,
          lastSeenAt: eightDaysAgo,
          restored: false,
        },
        {
          id: 'stale-2',
          cwd: '/tmp',
          shell: '/bin/zsh',
          title: null,
          createdAt: eightDaysAgo,
          lastSeenAt: eightDaysAgo,
          restored: false,
        },
        {
          id: 'fresh-1',
          cwd: '/home/user',
          shell: '/bin/zsh',
          title: null,
          createdAt: freshTime,
          lastSeenAt: freshTime,
          restored: false,
        },
      ],
    });

    mockFs.readFileSync.mockReturnValue(fileContent);

    const { loadSessions } = await import('./sessionStore.js');
    const result = loadSessions();

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('fresh-1');
  });

  it('marks all returned sessions with restored: true', async () => {
    mockFs.existsSync.mockReturnValue(true);

    const freshTime = new Date().toISOString();
    const fileContent = JSON.stringify({
      version: 1,
      sessions: [
        {
          id: 'session-1',
          cwd: '/home/user',
          shell: '/bin/zsh',
          title: null,
          createdAt: freshTime,
          lastSeenAt: freshTime,
          restored: false,
        },
      ],
    });

    mockFs.readFileSync.mockReturnValue(fileContent);

    const { loadSessions } = await import('./sessionStore.js');
    const result = loadSessions();

    expect(result).toHaveLength(1);
    expect(result[0].restored).toBe(true);
  });

  it('returns all fresh sessions without modification (except restored flag)', async () => {
    mockFs.existsSync.mockReturnValue(true);

    const freshTime = new Date().toISOString();
    const fileContent = JSON.stringify({
      version: 1,
      sessions: [
        {
          id: 's1',
          cwd: '/proj',
          shell: '/bin/bash',
          title: 'Server',
          createdAt: freshTime,
          lastSeenAt: freshTime,
          restored: false,
        },
        {
          id: 's2',
          cwd: '/home',
          shell: '/bin/zsh',
          title: null,
          createdAt: freshTime,
          lastSeenAt: freshTime,
          restored: false,
        },
      ],
    });

    mockFs.readFileSync.mockReturnValue(fileContent);

    const { loadSessions } = await import('./sessionStore.js');
    const result = loadSessions();

    expect(result).toHaveLength(2);
    expect(result[0].cwd).toBe('/proj');
    expect(result[0].shell).toBe('/bin/bash');
    expect(result[0].title).toBe('Server');
    expect(result[1].id).toBe('s2');
  });
});

describe('readPersistedSessionEvidence', () => {
  it('returns missing evidence when no persisted session matches the runtime hint', async () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(
      JSON.stringify({
        version: 1,
        sessions: [
          {
            id: 'other-session',
            cwd: '/proj',
            shell: '/bin/zsh',
            title: null,
            createdAt: '2026-05-20T10:00:00.000Z',
            lastSeenAt: '2026-05-20T10:00:00.000Z',
            restored: false,
          },
        ],
      })
    );

    const { readPersistedSessionEvidence } = await import('./sessionStore.js');

    expect(readPersistedSessionEvidence({ terminalId: 'missing-session' })).toEqual({
      provider: 'session_store',
      availability: 'missing',
      handle_ref: null,
      evidence: {
        terminalId: 'missing-session',
      },
    });
  });

  it('returns restorable evidence for a fresh matching persisted session', async () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(
      JSON.stringify({
        version: 1,
        sessions: [
          {
            id: 'restore-me',
            cwd: '/workspace/devhub',
            shell: '/bin/zsh',
            title: 'DevHub Shell',
            createdAt: '2026-05-20T09:00:00.000Z',
            lastSeenAt: '2026-05-20T10:59:59.000Z',
            restored: false,
          },
        ],
      })
    );

    const { readPersistedSessionEvidence } = await import('./sessionStore.js');

    expect(
      readPersistedSessionEvidence({
        terminalId: 'restore-me',
        now: new Date('2026-05-20T11:00:00.000Z').getTime(),
      })
    ).toEqual({
      provider: 'session_store',
      availability: 'restorable',
      handle_ref: null,
      evidence: {
        terminalId: 'restore-me',
        cwd: '/workspace/devhub',
        shell: '/bin/zsh',
        title: 'DevHub Shell',
        createdAt: '2026-05-20T09:00:00.000Z',
        lastSeenAt: '2026-05-20T10:59:59.000Z',
      },
    });
  });

  it('returns stale evidence for an expired persisted session without reviving it', async () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(
      JSON.stringify({
        version: 1,
        sessions: [
          {
            id: 'stale-session',
            cwd: '/workspace/devhub',
            shell: '/bin/bash',
            title: null,
            createdAt: '2026-05-01T09:00:00.000Z',
            lastSeenAt: '2026-05-01T09:00:00.000Z',
            restored: false,
          },
        ],
      })
    );

    const { readPersistedSessionEvidence, STALE_TTL_MS } = await import('./sessionStore.js');
    const staleNow = new Date('2026-05-01T09:00:00.000Z').getTime() + STALE_TTL_MS + 1;

    expect(readPersistedSessionEvidence({ terminalId: 'stale-session', now: staleNow })).toEqual({
      provider: 'session_store',
      availability: 'stale',
      handle_ref: null,
      evidence: {
        terminalId: 'stale-session',
        cwd: '/workspace/devhub',
        shell: '/bin/bash',
        title: null,
        createdAt: '2026-05-01T09:00:00.000Z',
        lastSeenAt: '2026-05-01T09:00:00.000Z',
      },
    });
  });
});
