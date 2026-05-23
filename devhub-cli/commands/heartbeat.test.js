'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const CLI = path.resolve(__dirname, '..', 'bin', 'devhub');

/**
 * Seed the test DB with minimal data for heartbeat tests.
 */
function seedHeartbeatData() {
  const { getDb, closeDb } = require('../lib/db');
  const db = getDb();

  db.pragma('foreign_keys = OFF');
  db.exec(`DROP TABLE IF EXISTS agent_registry`);

  db.exec(`
    CREATE TABLE agent_registry (
      agent_id TEXT PRIMARY KEY,
      project_id TEXT,
      nombre TEXT,
      modelo_llm TEXT,
      status TEXT DEFAULT 'idle',
      current_task_id TEXT,
      last_heartbeat TEXT,
      task_description TEXT
    );
  `);

  db.prepare('DELETE FROM agent_registry').run();
  db.pragma('foreign_keys = ON');

  closeDb();
}

function seedAgent(agentId) {
  const { getDb, closeDb } = require('../lib/db');
  const db = getDb();
  db.prepare(
    'INSERT INTO agent_registry (agent_id, nombre, status, last_heartbeat) VALUES (?, ?, ?, ?)'
  ).run(agentId, 'Test Agent', 'idle', '2026-01-01T00:00:00.000Z');
  closeDb();
}

function getLastHeartbeat(agentId) {
  const { getDb, closeDb } = require('../lib/db');
  const db = getDb();
  const row = db.prepare('SELECT last_heartbeat FROM agent_registry WHERE agent_id = ?').get(agentId);
  closeDb();
  return row ? row.last_heartbeat : null;
}

// Clean slate before all tests
seedHeartbeatData();

describe('devhub heartbeat command', () => {
  beforeEach(() => {
    seedHeartbeatData();
  });

  describe('missing agent-id', () => {
    it('exits with code 2 when no agent-id is provided', () => {
      const result = spawnSync('node', [CLI, 'heartbeat'], { encoding: 'utf8' });
      expect(result.status).toBe(2);
      expect(result.stderr).toMatch(/missing|usage|error|required/i);
    });
  });

  describe('successful heartbeat', () => {
    it('exits with code 0 for a known agent', () => {
      seedAgent('test-agent-1');
      const result = spawnSync('node', [CLI, 'heartbeat', 'test-agent-1'], { encoding: 'utf8' });
      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/heartbeat|updated|ok/i);
    });

    it('writes last_heartbeat to the database', () => {
      seedAgent('test-agent-1');
      const before = getLastHeartbeat('test-agent-1');
      spawnSync('node', [CLI, 'heartbeat', 'test-agent-1'], { encoding: 'utf8' });
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
      const r1 = spawnSync('node', [CLI, 'heartbeat', 'test-agent-1'], { encoding: 'utf8' });
      const r2 = spawnSync('node', [CLI, 'heartbeat', 'test-agent-1'], { encoding: 'utf8' });
      expect(r1.status).toBe(0);
      expect(r2.status).toBe(0);
    });

    it('updates last_heartbeat on each call', () => {
      seedAgent('test-agent-1');
      spawnSync('node', [CLI, 'heartbeat', 'test-agent-1'], { encoding: 'utf8' });
      const hb1 = getLastHeartbeat('test-agent-1');
      // Small delay to ensure different timestamp
      const start = Date.now();
      while (Date.now() - start < 1100) { /* spin */ }
      spawnSync('node', [CLI, 'heartbeat', 'test-agent-1'], { encoding: 'utf8' });
      const hb2 = getLastHeartbeat('test-agent-1');
      expect(hb2).not.toBe(hb1);
    });
  });

  describe('agent not found', () => {
    it('exits with code 1 for unknown agent', () => {
      const result = spawnSync('node', [CLI, 'heartbeat', 'nonexistent-agent'], { encoding: 'utf8' });
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/not found|unknown|does not exist/i);
    });
  });

  describe('--help', () => {
    it('prints usage and exits 0', () => {
      const result = spawnSync('node', [CLI, 'heartbeat', '--help'], { encoding: 'utf8' });
      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/heartbeat/i);
    });
  });
});
