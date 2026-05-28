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

/**
 * Seed the test DB with minimal data for update-status tests.
 */
function seedUpdateStatusData() {
  const { getDb, closeDb } = require('../lib/db');
  const db = getDb();

  db.pragma('foreign_keys = OFF');
  // Don't DROP TABLE - just clean data to maintain schema consistency
  db.prepare('DELETE FROM agent_registry').run();
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

function seedAgent(agentId, status, taskDescription) {
  const { getDb, closeDb } = require('../lib/db');
  const db = getDb();
  db.prepare(
    'INSERT INTO agent_registry (agent_id, project_id, nombre, status, task_description) VALUES (?, ?, ?, ?, ?)'
  ).run(agentId, 'proj-1', 'Test Agent', status || 'idle', taskDescription || null);
  // Force WAL checkpoint so spawnSync child process sees changes
  db.pragma('wal_checkpoint(RESTART)');
  closeDb();
}

function getAgentRow(agentId) {
  const { getDb, closeDb } = require('../lib/db');
  const db = getDb();
  const row = db
    .prepare('SELECT status, task_description FROM agent_registry WHERE agent_id = ?')
    .get(agentId);
  closeDb();
  return row || null;
}

describe('devhub update-status command', () => {
  beforeEach(() => {
    seedUpdateStatusData();
  });

  describe('missing arguments', () => {
    it('exits with code 2 when no arguments provided', () => {
      const result = spawnSync('node', [CLI, 'update-status'], { encoding: 'utf8' });
      expect(result.status).toBe(2);
      expect(result.stderr).toMatch(/missing|usage|error|required/i);
    });

    it('exits with code 2 when status is missing', () => {
      const result = spawnSync('node', [CLI, 'update-status', 'test-agent-1'], {
        encoding: 'utf8',
      });
      expect(result.status).toBe(2);
      expect(result.stderr).toMatch(/missing|usage|error|required/i);
    });
  });

  describe('status enum validation', () => {
    it('exits with code 1 for invalid status value', () => {
      seedAgent('test-agent-1', 'idle');
      const result = spawnSync('node', [CLI, 'update-status', 'test-agent-1', 'invalid-status'], {
        encoding: 'utf8',
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/valid|invalid/i);
    });

    it('accepts all valid status values', () => {
      seedAgent('test-agent-1', 'idle');
      const validStatuses = [
        'active',
        'idle',
        'working',
        'running',
        'thinking',
        'asking_questions',
        'completed',
        'failed',
        'error',
        'offline',
      ];
      for (const status of validStatuses) {
        const result = spawnSync('node', [CLI, 'update-status', 'test-agent-1', status], {
          encoding: 'utf8',
        });
        expect(result.status).toBe(0);
        const row = getAgentRow('test-agent-1');
        expect(row.status).toBe(status);
      }
    });
  });

  describe('successful update', () => {
    it('exits with code 0 and updates status in DB', () => {
      seedAgent('test-agent-1', 'idle');
      const result = spawnSync('node', [CLI, 'update-status', 'test-agent-1', 'working'], {
        encoding: 'utf8',
      });
      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/updated|status|ok/i);
      const row = getAgentRow('test-agent-1');
      expect(row.status).toBe('working');
    });

    it('updates status with optional task_description', () => {
      seedAgent('test-agent-1', 'idle');
      const result = spawnSync(
        'node',
        [CLI, 'update-status', 'test-agent-1', 'working', 'processing queue'],
        { encoding: 'utf8' }
      );
      expect(result.status).toBe(0);
      const row = getAgentRow('test-agent-1');
      expect(row.status).toBe('working');
      expect(row.task_description).toBe('processing queue');
    });

    it('preserves existing task_description when not provided', () => {
      seedAgent('test-agent-1', 'idle', 'existing task');
      const result = spawnSync('node', [CLI, 'update-status', 'test-agent-1', 'working'], {
        encoding: 'utf8',
      });
      expect(result.status).toBe(0);
      const row = getAgentRow('test-agent-1');
      expect(row.status).toBe('working');
      expect(row.task_description).toBe('existing task');
    });
  });

  describe('agent not found', () => {
    it('exits with code 1 for unknown agent', () => {
      const result = spawnSync('node', [CLI, 'update-status', 'nonexistent-agent', 'active'], {
        encoding: 'utf8',
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/not found|unknown|does not exist/i);
    });
  });

  describe('--help', () => {
    it('prints usage and exits 0', () => {
      const result = spawnSync('node', [CLI, 'update-status', '--help'], { encoding: 'utf8' });
      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/update-status|update.*status/i);
    });
  });
});
