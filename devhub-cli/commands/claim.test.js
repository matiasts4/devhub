'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const CLI = path.resolve(__dirname, '..', 'bin', 'devhub');

function seedClaimData() {
  const { getDb, closeDb } = require('../lib/db');
  const db = getDb();

  db.pragma('foreign_keys = OFF');

  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_registry (
      agent_id TEXT PRIMARY KEY,
      project_id TEXT,
      nombre TEXT,
      modelo_llm TEXT,
      status TEXT DEFAULT 'idle',
      current_task_id TEXT,
      last_heartbeat TEXT,
      task_description TEXT
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      name TEXT NOT NULL,
      description TEXT,
      color TEXT DEFAULT '#58A6FF',
      status TEXT DEFAULT 'active',
      progress INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

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

  db.exec(`
    CREATE TABLE IF NOT EXISTS task_dependencies (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      depends_on TEXT NOT NULL,
      tipo TEXT DEFAULT 'blocks',
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.prepare('DELETE FROM task_dependencies').run();
  db.prepare('DELETE FROM tasks').run();
  db.prepare('DELETE FROM projects').run();
  db.prepare('DELETE FROM agent_registry').run();

  db.pragma('foreign_keys = ON');
  closeDb();
}

function seedAgent(agentId, projectId) {
  const { getDb, closeDb } = require('../lib/db');
  const db = getDb();
  db.prepare(
    'INSERT OR REPLACE INTO agent_registry (agent_id, project_id, nombre, status) VALUES (?, ?, ?, ?)'
  ).run(agentId, projectId, 'Test Agent', 'idle');
  closeDb();
}

function seedProject(id, name) {
  const { getDb, closeDb } = require('../lib/db');
  const db = getDb();
  db.prepare('INSERT OR REPLACE INTO projects (id, name) VALUES (?, ?)').run(id, name);
  closeDb();
}

function seedTask(id, projectId, title, status, priority, businessValue) {
  const { getDb, closeDb } = require('../lib/db');
  const db = getDb();
  db.prepare(
    'INSERT OR REPLACE INTO tasks (id, project_id, title, status, priority, business_value) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, projectId, title, status, priority || 'medium', businessValue || 5);
  closeDb();
}

function getTaskById(taskId) {
  const { getDb, closeDb } = require('../lib/db');
  const db = getDb();
  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
  closeDb();
  return row;
}

// Clean slate before all tests
seedClaimData();

describe('devhub claim command', () => {
  beforeEach(() => {
    seedClaimData();
  });

  describe('missing agent-id (task 2.1)', () => {
    it('exits with code 2 when no agent-id is provided', () => {
      const result = spawnSync('node', [CLI, 'claim'], { encoding: 'utf8' });
      expect(result.status).toBe(2);
      expect(result.stderr).toMatch(/missing|required|agent-id/i);
    });
  });

  describe('agent not in registry (task 2.3)', () => {
    it('exits with code 1 for unknown agent', () => {
      const result = spawnSync('node', [CLI, 'claim', 'nonexistent-agent'], { encoding: 'utf8' });
      expect(result.status).toBe(1);
    });
  });

  describe('no pending tasks (task 2.5)', () => {
    it('exits with code 1 when no pending tasks available', () => {
      seedProject('proj-1', 'Test Project');
      seedAgent('agent-1', 'proj-1');
      // No tasks at all
      const result = spawnSync('node', [CLI, 'claim', 'agent-1'], { encoding: 'utf8' });
      expect(result.status).toBe(1);
      expect(result.stdout).toMatch(/no pending tasks/i);
    });

    it('exits with code 1 when all tasks are completed', () => {
      seedProject('proj-1', 'Test Project');
      seedAgent('agent-1', 'proj-1');
      seedTask('task-1', 'proj-1', 'Done task', 'completed');
      const result = spawnSync('node', [CLI, 'claim', 'agent-1'], { encoding: 'utf8' });
      expect(result.status).toBe(1);
    });
  });

  describe('successful claim (task 2.7)', () => {
    it('exits with code 0, updates DB with claim_token and lease_expires_at', () => {
      seedProject('proj-1', 'Test Project');
      seedAgent('agent-1', 'proj-1');
      seedTask('task-1', 'proj-1', 'My task', 'pending', 'high', 8);

      const result = spawnSync('node', [CLI, 'claim', 'agent-1'], { encoding: 'utf8' });
      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/task-1/i);
      expect(result.stdout).toMatch(/my task/i);

      const task = getTaskById('task-1');
      expect(task.status).toBe('in_progress');
      expect(task.claim_token).toMatch(/^[a-f0-9]{32}$/);
      expect(task.lease_expires_at).not.toBeNull();

      // Lease should be approximately now + 300s
      const leaseTime = new Date(task.lease_expires_at).getTime();
      const expectedTime = Date.now() + 300_000;
      expect(Math.abs(leaseTime - expectedTime)).toBeLessThan(5000); // 5s tolerance
    });
  });

  describe('piped JSON output (task 2.9)', () => {
    it('outputs valid JSON when not a TTY', () => {
      seedProject('proj-1', 'Test Project');
      seedAgent('agent-1', 'proj-1');
      seedTask('task-1', 'proj-1', 'JSON task', 'pending');

      // FORCE_TTY=0 to simulate piped output
      const result = spawnSync('node', [CLI, 'claim', 'agent-1'], {
        encoding: 'utf8',
        env: { ...process.env, FORCE_TTY: '0' },
      });
      expect(result.status).toBe(0);

      // Parse JSON output
      const json = JSON.parse(result.stdout);
      expect(json.id).toBe('task-1');
      expect(json.title).toBe('JSON task');
      expect(json.project).toBe('Test Project');
      expect(json.claim_token).toMatch(/^[a-f0-9]{32}$/);
      expect(json.lease_expires_at).toBeDefined();
    });
  });

  describe('double-claim prevention (task 2.11)', () => {
    it('second claim of same task exits with code 1', () => {
      seedProject('proj-1', 'Test Project');
      seedAgent('agent-1', 'proj-1');
      seedAgent('agent-2', 'proj-1');
      seedTask('task-1', 'proj-1', 'Single claim task', 'pending');

      // First claim succeeds
      const r1 = spawnSync('node', [CLI, 'claim', 'agent-1'], { encoding: 'utf8' });
      expect(r1.status).toBe(0);

      // Second claim should fail — task is no longer pending
      const r2 = spawnSync('node', [CLI, 'claim', 'agent-2'], { encoding: 'utf8' });
      expect(r2.status).toBe(1);
    });
  });

  describe('--help', () => {
    it('prints usage and exits 0', () => {
      const result = spawnSync('node', [CLI, 'claim', '--help'], { encoding: 'utf8' });
      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/claim/i);
    });
  });
});
