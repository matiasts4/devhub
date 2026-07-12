'use strict';

const path = require('path');
const pkg = require('./package.json');
const { cleanupDb, createTempDb, writeDb } = require('./tests/fixtures/seed-factory');

// Set DB path BEFORE any require() that loads lib/db
const dbPath = createTempDb();
process.env.DEVHUB_DB_PATH = dbPath;
jest.resetModules();

const { spawnSync } = require('child_process');
const CLI = path.resolve(__dirname, 'bin', 'devhub');

beforeAll(() => {
  // DB path already set above
});

afterAll(() => {
  const { closeDb } = require('./lib/db');
  try {
    closeDb();
  } catch {
    // ignore
  }
  delete process.env.DEVHUB_DB_PATH;
  // Note: NOT calling cleanupDb to avoid disk I/O errors in subsequent tests
});

// ── CLI Exit Code Tests ──────────────────────────────────────────

describe('CLI --help', () => {
  it('exits 0 and stdout contains command list', () => {
    const result = spawnSync('node', [CLI, '--help'], { encoding: 'utf8' });
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/Commands?/i);
  });
});

describe('CLI --version', () => {
  it('exits 0 and stdout contains version from package.json', () => {
    const result = spawnSync('node', [CLI, '--version'], { encoding: 'utf8' });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(pkg.version);
  });
});

describe('CLI unknown command', () => {
  it('exits 2 for unrecognized command', () => {
    const result = spawnSync('node', [CLI, 'nonexistent'], { encoding: 'utf8' });
    expect(result.status).toBe(2);
  });
});

describe('CLI --db override', () => {
  it('selects the requested database before command modules initialize', () => {
    const overrideDbPath = createTempDb();
    writeDb(
      overrideDbPath,
      'INSERT INTO agent_registry (agent_id, project_id, nombre, status) VALUES (?, ?, ?, ?)',
      ['db-override-agent', 'override-project', 'Override Agent', 'idle']
    );

    try {
      const result = spawnSync('node', [CLI, '--db', overrideDbPath, 'agents'], {
        encoding: 'utf8',
        env: { ...process.env, DEVHUB_DB_PATH: dbPath },
      });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('db-override-agent');
    } finally {
      cleanupDb(overrideDbPath);
    }
  });
});

describe('CLI auth command with manual flags', () => {
  it('accepts --agent-id and --workspace-id flags without unknown option error', () => {
    const result = spawnSync(
      'node',
      [CLI, 'auth', 'login', '--agent-id', 'test-agent', '--workspace-id', 'ws-test'],
      { encoding: 'utf8' }
    );
    // Should not exit with unknown option error
    expect(result.stderr).not.toContain('unknown option');
    // May exit with auth-specific error (e.g., missing config), but that's OK — we're testing that flags are accepted
  });
});

describe('CLI run command', () => {
  it('exits 0 and shows Usage: devhub run', () => {
    const result = spawnSync('node', [CLI, 'run'], { encoding: 'utf8' });
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/Usage: devhub run/i);
  });
});

// ── Formatter Tests ──────────────────────────────────────────────

describe('lib/format.js', () => {
  let formatModule;

  describe('colorize when not TTY', () => {
    it('strips ANSI escape sequences', () => {
      jest.resetModules();
      // Ensure isTTY is falsy (default in Jest)
      process.stdout.isTTY = undefined;
      formatModule = require('./lib/format.js');

      const result = formatModule.colorize('hello', 31);
      expect(result).not.toContain('\x1b[');
      expect(result).toBe('hello');
    });
  });

  describe('colorize when TTY', () => {
    it('includes ANSI escape codes', () => {
      jest.resetModules();
      process.stdout.isTTY = true;
      formatModule = require('./lib/format.js');

      try {
        const result = formatModule.colorize('hello', 31);
        expect(result).toContain('\x1b[');
        expect(result).toContain('hello');
      } finally {
        process.stdout.isTTY = undefined;
      }
    });
  });

  describe('compactOutput', () => {
    it('returns text as string', () => {
      formatModule = require('./lib/format.js');
      expect(formatModule.compactOutput(42)).toBe('42');
      expect(formatModule.compactOutput('hello')).toBe('hello');
    });
  });
});

// ── Shared Core Re-Export Tests ──────────────────────────────────

describe('lib/db.js barrel', () => {
  it('re-exports all 8 functions from compactReads.js', () => {
    const db = require('./lib/db.js');
    expect(typeof db.readExecutionQueueSummary).toBe('function');
    expect(typeof db.readWorkspaceEvidenceSummary).toBe('function');
    expect(typeof db.readAgentRegistrySummary).toBe('function');
    expect(typeof db.readTaskById).toBe('function');
    expect(typeof db.heartbeatLabel).toBe('function');
    expect(typeof db.presentExecutionQueue).toBe('function');
    expect(typeof db.presentWorkspaceEvidence).toBe('function');
    expect(typeof db.createDirectorQueueContract).toBe('function');
  });
});
