'use strict';

const path = require('path');
const { createTempDb } = require('../tests/fixtures/seed-factory');

// Set DB path BEFORE any require() that loads lib/db
const dbPath = createTempDb();
process.env.DEVHUB_DB_PATH = dbPath;
jest.resetModules();

const { spawnSync } = require('child_process');
const CLI = path.resolve(__dirname, '..', 'bin', 'devhub');

function runHeartbeat(args = [], options = {}) {
  return spawnSync('node', [CLI, 'heartbeat', ...args], {
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
 * Seed the test DB with minimal data for heartbeat tests.
 */
function seedHeartbeatData() {
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

function seedAgent(agentId) {
  const { getDb, closeDb } = require('../lib/db');
  const db = getDb();
  db.prepare(
    'INSERT INTO agent_registry (agent_id, project_id, nombre, status, last_heartbeat) VALUES (?, ?, ?, ?, ?)'
  ).run(agentId, 'proj-1', 'Test Agent', 'idle', '2026-01-01T00:00:00.000Z');
  // Force WAL checkpoint so spawnSync child process sees changes
  db.pragma('wal_checkpoint(RESTART)');
  closeDb();
}

function getLastHeartbeat(agentId) {
  const { getDb, closeDb } = require('../lib/db');
  const db = getDb();
  const row = db
    .prepare('SELECT last_heartbeat FROM agent_registry WHERE agent_id = ?')
    .get(agentId);
  closeDb();
  return row ? row.last_heartbeat : null;
}

describe('devhub heartbeat command', () => {
  beforeEach(() => {
    seedHeartbeatData();
  });

  describe('missing agent-id', () => {
    it('exits with code 2 when no agent-id is provided', () => {
      const result = runHeartbeat();
      expect(result.status).toBe(2);
      expect(result.stderr).toMatch(/missing|usage|error|required/i);
    });
  });

  describe('successful heartbeat', () => {
    it('exits with code 0 for a known agent', () => {
      seedAgent('test-agent-1');
      const result = runHeartbeat(['test-agent-1']);
      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/heartbeat|updated|ok/i);
    });

    it('writes last_heartbeat to the database', () => {
      seedAgent('test-agent-1');
      const before = getLastHeartbeat('test-agent-1');
      runHeartbeat(['test-agent-1']);
      const after = getLastHeartbeat('test-agent-1');
      expect(after).not.toBe(before);
      // Should be a recent timestamp
      const diff = Date.now() - new Date(after).getTime();
      expect(diff).toBeLessThan(10000); // within 10 seconds
    });
  });

  describe('idempotency', () => {
    it('is safe to call repeatedly — exits 0 both times', () => {
      seedAgent('test-agent-1');
      const r1 = runHeartbeat(['test-agent-1']);
      const r2 = runHeartbeat(['test-agent-1']);
      expect(r1.status).toBe(0);
      expect(r2.status).toBe(0);
    });

    it('updates last_heartbeat on each call', () => {
      seedAgent('test-agent-1');
      runHeartbeat(['test-agent-1']);
      const hb1 = getLastHeartbeat('test-agent-1');
      // Small delay to ensure different timestamp
      const start = Date.now();
      while (Date.now() - start < 1100) {
        /* spin */
      }
      runHeartbeat(['test-agent-1']);
      const hb2 = getLastHeartbeat('test-agent-1');
      expect(hb2).not.toBe(hb1);
    });
  });

  describe('agent not found', () => {
    it('exits with code 1 for unknown agent', () => {
      const result = runHeartbeat(['nonexistent-agent']);
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/not found|unknown|does not exist/i);
    });
  });

  describe('--help', () => {
    it('prints usage and exits 0', () => {
      const result = runHeartbeat(['--help']);
      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/heartbeat/i);
    });
  });
});
