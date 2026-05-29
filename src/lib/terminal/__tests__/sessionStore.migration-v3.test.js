/**
 * sessionStore.migration-v3.test.js — TDD tests for schema v2→v3 migration.
 * Phase 2: restorePolicy field migration.
 *
 * RED: tests fail before implementation. GREEN: implementation makes them pass.
 *
 * Test scenarios per tasks.md Phase 2:
 * - v2 sessions without restorePolicy get defaulted to 'auto'
 * - v3 sessions with restorePolicy are preserved
 * - unknown policy values are sanitized to 'auto'
 * - migration only runs once (idempotent)
 */

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

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Helper — builds a minimal v2 session fixture
// ---------------------------------------------------------------------------
function makeV2Session(overrides = {}) {
  return {
    id: 'session-v2',
    cwd: '/home/user',
    shell: '/bin/zsh',
    title: 'Terminal',
    createdAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    restored: false,
    // NO restorePolicy field — that's what the migration adds
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// RED Phase: tests for v2→v3 migration
// ---------------------------------------------------------------------------

describe('v2 → v3 migration: restorePolicy defaults to "auto"', () => {
  it('loadSessions adds restorePolicy:"auto" to v2 session without that field', async () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(
      JSON.stringify({
        version: 2,
        sessions: [makeV2Session({ id: 'v2-no-policy' })],
      })
    );

    const { loadSessions } = await import('../sessionStore.js');
    const result = loadSessions();

    expect(result).toHaveLength(1);
    expect(result[0].restorePolicy).toBe('auto');
  });

  it('loadSessions migrates ALL v2 sessions in the file', async () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(
      JSON.stringify({
        version: 2,
        sessions: [
          makeV2Session({ id: 'v2-a' }),
          makeV2Session({ id: 'v2-b', ptyPid: 12345 }),
          makeV2Session({ id: 'v2-c', opencodeSessionId: 'ses_xyz' }),
        ],
      })
    );

    const { loadSessions: load2 } = await import('../sessionStore.js');
    const result = load2();

    expect(result).toHaveLength(3);
    expect(result[0].restorePolicy).toBe('auto');
    expect(result[1].restorePolicy).toBe('auto');
    expect(result[2].restorePolicy).toBe('auto');
  });
});

describe('v3 sessions: restorePolicy is preserved', () => {
  it('loadSessions preserves restorePolicy:"auto" on v3 session', async () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(
      JSON.stringify({
        version: 3,
        sessions: [makeV2Session({ id: 'v3-auto', restorePolicy: 'auto' })],
      })
    );

    const { loadSessions } = await import('../sessionStore.js');
    const result = loadSessions();

    expect(result).toHaveLength(1);
    expect(result[0].restorePolicy).toBe('auto');
  });

  it('loadSessions preserves restorePolicy:"manual" on v3 session', async () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(
      JSON.stringify({
        version: 3,
        sessions: [makeV2Session({ id: 'v3-manual', restorePolicy: 'manual' })],
      })
    );

    const { loadSessions } = await import('../sessionStore.js');
    const result = loadSessions();

    expect(result).toHaveLength(1);
    expect(result[0].restorePolicy).toBe('manual');
  });

  it('loadSessions preserves restorePolicy:"off" on v3 session', async () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(
      JSON.stringify({
        version: 3,
        sessions: [makeV2Session({ id: 'v3-off', restorePolicy: 'off' })],
      })
    );

    const { loadSessions } = await import('../sessionStore.js');
    const result = loadSessions();

    expect(result).toHaveLength(1);
    expect(result[0].restorePolicy).toBe('off');
  });
});

describe('sanitizeRestorePolicy: unknown values default to "auto"', () => {
  it('loadSessions sanitizes unknown restorePolicy to "auto"', async () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(
      JSON.stringify({
        version: 3,
        sessions: [makeV2Session({ id: 'v3-unknown', restorePolicy: 'invalid-value' })],
      })
    );

    const { loadSessions } = await import('../sessionStore.js');
    const result = loadSessions();

    expect(result).toHaveLength(1);
    expect(result[0].restorePolicy).toBe('auto');
  });

  it('loadSessions sanitizes null restorePolicy to "auto"', async () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(
      JSON.stringify({
        version: 3,
        sessions: [makeV2Session({ id: 'v3-null', restorePolicy: null })],
      })
    );

    const { loadSessions } = await import('../sessionStore.js');
    const result = loadSessions();

    expect(result).toHaveLength(1);
    expect(result[0].restorePolicy).toBe('auto');
  });

  it('loadSessions sanitizes undefined restorePolicy to "auto"', async () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(
      JSON.stringify({
        version: 3,
        sessions: [makeV2Session({ id: 'v3-undefined' })],
      })
    );

    const { loadSessions } = await import('../sessionStore.js');
    const result = loadSessions();

    expect(result).toHaveLength(1);
    expect(result[0].restorePolicy).toBe('auto');
  });

  it('loadSessions sanitizes empty string restorePolicy to "auto"', async () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(
      JSON.stringify({
        version: 3,
        sessions: [makeV2Session({ id: 'v3-empty', restorePolicy: '' })],
      })
    );

    const { loadSessions } = await import('../sessionStore.js');
    const result = loadSessions();

    expect(result).toHaveLength(1);
    expect(result[0].restorePolicy).toBe('auto');
  });
});

describe('migration idempotency: only runs once', () => {
  it('loadSessions does NOT overwrite v3 restorePolicy when already set to "manual"', async () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(
      JSON.stringify({
        version: 3,
        sessions: [makeV2Session({ id: 'v3-persist-manual', restorePolicy: 'manual' })],
      })
    );

    const { loadSessions } = await import('../sessionStore.js');
    const result = loadSessions();

    // If migration ran again it would default to 'auto' — but it must NOT run
    expect(result[0].restorePolicy).toBe('manual');
  });

  it('loadSessions does NOT overwrite v3 restorePolicy when already set to "off"', async () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(
      JSON.stringify({
        version: 3,
        sessions: [makeV2Session({ id: 'v3-persist-off', restorePolicy: 'off' })],
      })
    );

    const { loadSessions } = await import('../sessionStore.js');
    const result = loadSessions();

    expect(result[0].restorePolicy).toBe('off');
  });

  it('multiple loadSessions calls all return the same restorePolicy value (idempotent)', async () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(
      JSON.stringify({
        version: 3,
        sessions: [makeV2Session({ id: 'v3-idempotent', restorePolicy: 'manual' })],
      })
    );

    const { loadSessions } = await import('../sessionStore.js');
    const first = loadSessions();
    const second = loadSessions();

    expect(first[0].restorePolicy).toBe('manual');
    expect(second[0].restorePolicy).toBe('manual');
  });
});

describe('saveSessions persists restorePolicy', () => {
  it('saveSessions writes restorePolicy field when present on session object', async () => {
    mockFs.existsSync.mockReturnValue(true);
    const { saveSessions } = await import('../sessionStore.js');

    const sessions = new Map([
      [
        'term-manual',
        {
          id: 'term-manual',
          cwd: '/home/user',
          shell: '/bin/zsh',
          title: null,
          createdAt: new Date().toISOString(),
          lastSeenAt: new Date().toISOString(),
          restored: false,
          restorePolicy: 'manual',
          ptyPid: 99999,
        },
      ],
    ]);

    saveSessions(sessions);

    const written = mockFs.writeFileSync.mock.calls[0][1];
    const parsed = JSON.parse(written);
    expect(parsed.sessions[0].restorePolicy).toBe('manual');
  });

  it('saveSessions writes restorePolicy:"auto" when session has no restorePolicy', async () => {
    mockFs.existsSync.mockReturnValue(true);
    const { saveSessions } = await import('../sessionStore.js');

    const sessions = new Map([
      [
        'term-no-policy',
        {
          id: 'term-no-policy',
          cwd: '/home/user',
          shell: '/bin/zsh',
          title: null,
          createdAt: new Date().toISOString(),
          lastSeenAt: new Date().toISOString(),
          restored: false,
          // No restorePolicy field — should default to auto
        },
      ],
    ]);

    saveSessions(sessions);

    const written = mockFs.writeFileSync.mock.calls[0][1];
    const parsed = JSON.parse(written);
    expect(parsed.sessions[0].restorePolicy).toBe('auto');
  });

  it('saveSessions writes version:3 in JSON root', async () => {
    mockFs.existsSync.mockReturnValue(true);
    const { saveSessions } = await import('../sessionStore.js');

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
          restorePolicy: 'auto',
        },
      ],
    ]);

    saveSessions(sessions);

    const written = mockFs.writeFileSync.mock.calls[0][1];
    const parsed = JSON.parse(written);
    expect(parsed.version).toBe(3);
  });
});