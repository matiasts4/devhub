'use strict';

const path = require('path');
const { createTempDb } = require('../tests/fixtures/seed-factory');

// Set DB path BEFORE any require() that loads lib/db
const dbPath = createTempDb();
process.env.DEVHUB_DB_PATH = dbPath;
jest.resetModules();

const childProcess = require('child_process');
const CLI = path.resolve(__dirname, '..', 'bin', 'devhub');

function spawnSync(command, args, options = {}) {
  return childProcess.spawnSync(command, args, {
    encoding: 'utf8',
    ...options,
    env: {
      ...process.env,
      DEVHUB_DB_PATH: dbPath,
      ...(options.env || {}),
    },
  });
}

beforeAll(() => {
  // DB path already set above
});

afterAll(() => {
  const { closeDb } = require('../lib/db');
  try {
    closeDb();
  } catch {
    // ignore
  }
  delete process.env.DEVHUB_DB_PATH;
  // Note: NOT calling cleanupDb to avoid disk I/O errors in subsequent tests
});

function seedReleaseData() {
  const { getDb, closeDb } = require('../lib/db');
  const db = getDb();

  db.pragma('foreign_keys = OFF');

  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'pending',
      priority TEXT DEFAULT 'medium',
      business_value INTEGER DEFAULT 5,
      due_date TEXT,
      milestone_id TEXT,
      assigned_to TEXT,
      claimed_at TEXT,
      lease_expires_at TEXT,
      claim_token TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.prepare('DELETE FROM tasks').run();
  db.pragma('foreign_keys = ON');

  // Insert dummy project to prevent recovery on reopen
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY, name TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);
  db.prepare('INSERT OR IGNORE INTO projects (id, name) VALUES (?, ?)').run(
    'proj-1',
    'Test Project'
  );

  // Force WAL checkpoint so spawnSync child process sees changes
  db.pragma('wal_checkpoint(RESTART)');
  closeDb();
}

function seedClaimedTask(id, title, token, leaseExpiry, status) {
  const { getDb, closeDb } = require('../lib/db');
  const db = getDb();
  db.prepare(
    'INSERT OR REPLACE INTO tasks (id, project_id, title, status, claim_token, lease_expires_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, 'proj-1', title, status || 'in_progress', token, leaseExpiry);
  closeDb();
}

function seedUnclaimedTask(id, title) {
  const { getDb, closeDb } = require('../lib/db');
  const db = getDb();
  db.prepare(
    'INSERT OR REPLACE INTO tasks (id, project_id, title, status) VALUES (?, ?, ?, ?)'
  ).run(id, 'proj-1', title, 'pending');
  closeDb();
}

function getTaskById(taskId) {
  const { getDb, closeDb } = require('../lib/db');
  const db = getDb();
  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
  closeDb();
  return row;
}

describe('devhub release command', () => {
  beforeEach(() => {
    seedReleaseData();
  });

  describe('missing task-id (task 3.1)', () => {
    it('exits with code 2 when no arguments provided', () => {
      const result = spawnSync('node', [CLI, 'release'], { encoding: 'utf8' });
      expect(result.status).toBe(2);
      expect(result.stderr).toMatch(/missing.*task-id.*claim-token|missing.*arguments/i);
    });
  });

  describe('missing claim-token (task 3.3)', () => {
    it('exits with code 2 when only task-id provided', () => {
      const result = spawnSync('node', [CLI, 'release', 'task-123'], { encoding: 'utf8' });
      expect(result.status).toBe(2);
      expect(result.stderr).toMatch(/missing.*claim-token/i);
    });
  });

  describe('invalid outcome (task 3.5)', () => {
    it('exits with code 2 for invalid outcome value', () => {
      seedClaimedTask('task-123', 'Test task', 'valid-token', '2099-01-01T00:00:00Z');
      const result = spawnSync(
        'node',
        [CLI, 'release', 'task-123', 'valid-token', '--outcome', 'invalid'],
        { encoding: 'utf8' }
      );
      expect(result.status).toBe(2);
      expect(result.stderr).toMatch(/invalid outcome.*invalid.*must be one of/i);
    });
  });

  describe('task not found (task 3.7)', () => {
    it('exits with code 1 for non-existent task', () => {
      const result = spawnSync('node', [CLI, 'release', 'nonexistent', 'any-token'], {
        encoding: 'utf8',
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/task not found.*nonexistent/i);
    });
  });

  describe('task not claimed (task 3.9)', () => {
    it('exits with code 1 when task has NULL claim_token', () => {
      seedUnclaimedTask('task-123', 'Unclaimed task');
      const result = spawnSync('node', [CLI, 'release', 'task-123', 'any-token'], {
        encoding: 'utf8',
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/not currently claimed/i);
    });
  });

  describe('token mismatch (task 3.11)', () => {
    it('exits with code 1 when token does not match', () => {
      seedClaimedTask('task-123', 'Test task', 'correct-token', '2099-01-01T00:00:00Z');
      const result = spawnSync('node', [CLI, 'release', 'task-123', 'wrong-token'], {
        encoding: 'utf8',
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/invalid claim token/i);
    });
  });

  describe('successful release with default outcome (task 3.13)', () => {
    it('sets status to completed, clears lease, exits 0', () => {
      seedClaimedTask('task-123', 'Test task', 'my-token', '2099-01-01T00:00:00Z');
      const result = spawnSync('node', [CLI, 'release', 'task-123', 'my-token'], {
        encoding: 'utf8',
      });
      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/task task-123 released.*completed/i);

      const task = getTaskById('task-123');
      expect(task.status).toBe('completed');
      expect(task.claim_token).toBeNull();
      expect(task.lease_expires_at).toBeNull();
    });
  });

  describe('release with --outcome paused (task 3.15)', () => {
    it('sets status to paused', () => {
      seedClaimedTask('task-123', 'Test task', 'my-token', '2099-01-01T00:00:00Z');
      spawnSync('node', [CLI, 'release', 'task-123', 'my-token', '--outcome', 'paused'], {
        encoding: 'utf8',
      });
      const task = getTaskById('task-123');
      expect(task.status).toBe('paused');
    });
  });

  describe('release with --outcome failed (task 3.17)', () => {
    it('sets status to failed', () => {
      seedClaimedTask('task-123', 'Test task', 'my-token', '2099-01-01T00:00:00Z');
      spawnSync('node', [CLI, 'release', 'task-123', 'my-token', '--outcome', 'failed'], {
        encoding: 'utf8',
      });
      const task = getTaskById('task-123');
      expect(task.status).toBe('failed');
    });
  });

  describe('release with --outcome abandoned (task 3.16/3.18)', () => {
    it('sets status to blocked', () => {
      seedClaimedTask('task-123', 'Test task', 'my-token', '2099-01-01T00:00:00Z');
      spawnSync('node', [CLI, 'release', 'task-123', 'my-token', '--outcome', 'abandoned'], {
        encoding: 'utf8',
      });
      const task = getTaskById('task-123');
      expect(task.status).toBe('blocked');
    });
  });

  describe('expired lease warning (task 3.19)', () => {
    it('displays warning but still succeeds', () => {
      seedClaimedTask('task-123', 'Test task', 'my-token', '2020-01-01T00:00:00Z');
      const result = spawnSync('node', [CLI, 'release', 'task-123', 'my-token'], {
        encoding: 'utf8',
      });
      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/lease expired.*2020-01-01/i);

      const task = getTaskById('task-123');
      expect(task.status).toBe('completed');
      expect(task.claim_token).toBeNull();
    });
  });

  describe('--help', () => {
    it('prints usage and exits 0', () => {
      const result = spawnSync('node', [CLI, 'release', '--help'], { encoding: 'utf8' });
      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/release/i);
    });
  });
});
