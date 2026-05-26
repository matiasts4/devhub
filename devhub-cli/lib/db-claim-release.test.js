'use strict';

const path = require('path');
const { createTempDb } = require('../tests/fixtures/seed-factory');

const DB_PATH = path.resolve(__dirname, 'db.js');

// Set DB path BEFORE any require() that loads lib/db
const dbPath = createTempDb();
process.env.DEVHUB_DB_PATH = dbPath;

beforeAll(() => {
  // DB path already set above
});

afterAll(() => {
  const { closeDb } = require(DB_PATH);
  try {
    closeDb();
  } catch {
    // ignore
  }
  delete process.env.DEVHUB_DB_PATH;
  // Note: NOT calling cleanupDb to avoid disk I/O errors in subsequent tests
});

function seedClaimReleaseData() {
  const { getDb, closeDb } = require(DB_PATH);
  const db = getDb();

  // Ensure tables exist
  db.pragma('foreign_keys = OFF');

  // Create agent_registry if not exists
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

  // Create projects if not exists
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

  // Create tasks if not exists
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

  // Create task_dependencies if not exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS task_dependencies (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      depends_on TEXT NOT NULL,
      tipo TEXT DEFAULT 'blocks',
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Clean all data
  db.prepare('DELETE FROM task_dependencies').run();
  db.prepare('DELETE FROM tasks').run();
  db.prepare('DELETE FROM projects').run();
  db.prepare('DELETE FROM agent_registry').run();

  db.pragma('foreign_keys = ON');

  // Insert dummy project to prevent recovery on reopen
  db.prepare('INSERT OR IGNORE INTO projects (id, name) VALUES (?, ?)').run(
    'proj-1',
    'Test Project'
  );

  closeDb();
}

function seedAgent(agentId, projectId) {
  const { getDb, closeDb } = require(DB_PATH);
  const db = getDb();
  db.prepare(
    'INSERT OR REPLACE INTO agent_registry (agent_id, project_id, nombre, status) VALUES (?, ?, ?, ?)'
  ).run(agentId, projectId, 'Test Agent', 'idle');
  closeDb();
}

function seedProject(id, name) {
  const { getDb, closeDb } = require(DB_PATH);
  const db = getDb();
  db.prepare('INSERT OR REPLACE INTO projects (id, name) VALUES (?, ?)').run(id, name);
  closeDb();
}

function seedTask(id, projectId, title, status, priority, businessValue) {
  const { getDb, closeDb } = require(DB_PATH);
  const db = getDb();
  db.prepare(
    'INSERT OR REPLACE INTO tasks (id, project_id, title, status, priority, business_value) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, projectId, title, status, priority || 'medium', businessValue || 5);
  closeDb();
}

function seedDependency(taskId, dependsOn) {
  const { getDb, closeDb } = require(DB_PATH);
  const db = getDb();
  // task_dependencies.id is INTEGER PRIMARY KEY AUTOINCREMENT, so don't insert id manually
  db.prepare('INSERT INTO task_dependencies (task_id, depends_on, tipo) VALUES (?, ?, ?)').run(
    taskId,
    dependsOn,
    'blocks'
  );
  closeDb();
}

function seedClaimedTask(id, projectId, title, token, leaseExpiry) {
  const { getDb, closeDb } = require(DB_PATH);
  const db = getDb();
  db.prepare(
    'INSERT OR REPLACE INTO tasks (id, project_id, title, status, claim_token, lease_expires_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, projectId, title, 'in_progress', token, leaseExpiry);
  closeDb();
}

// Clean slate before all tests
seedClaimReleaseData();

describe('lib/db.js — claimNextTask and releaseTask', () => {
  beforeEach(() => {
    seedClaimReleaseData();
  });

  describe('claimNextTask', () => {
    it('returns null when no pending tasks exist (task 1.3)', () => {
      const { claimNextTask, closeDb } = require(DB_PATH);
      seedProject('proj-1', 'Test Project');
      seedAgent('agent-1', 'proj-1');

      const result = claimNextTask('agent-1');
      expect(result).toBeNull();
      closeDb();
    });

    it('returns first non-blocked pending task when available (task 1.5)', () => {
      const { claimNextTask, closeDb } = require(DB_PATH);
      seedProject('proj-1', 'Test Project');
      seedAgent('agent-1', 'proj-1');
      seedTask('task-1', 'proj-1', 'First pending task', 'pending', 'high', 8);

      const result = claimNextTask('agent-1');
      expect(result).not.toBeNull();
      expect(result.id).toBe('task-1');
      expect(result.title).toBe('First pending task');
      expect(result.blocked).toBe(false);
      closeDb();
    });

    it('skips blocked tasks, returns next pending (task 1.7)', () => {
      const { claimNextTask, closeDb } = require(DB_PATH);
      seedProject('proj-1', 'Test Project');
      seedAgent('agent-1', 'proj-1');
      seedTask('task-blocked', 'proj-1', 'Blocked task', 'pending', 'critical', 10);
      seedTask('task-ok', 'proj-1', 'Available task', 'pending', 'medium', 5);
      seedTask('dep-task', 'proj-1', 'Dependency', 'pending', 'low', 3);
      // task-blocked depends on dep-task which is not completed → blocked
      seedDependency('task-blocked', 'dep-task');

      const result = claimNextTask('agent-1');
      expect(result).not.toBeNull();
      expect(result.id).toBe('task-ok');
      expect(result.blocked).toBe(false);
      closeDb();
    });

    it('returns null when agent not in registry', () => {
      const { claimNextTask, closeDb } = require(DB_PATH);
      const result = claimNextTask('nonexistent-agent');
      expect(result).toBeNull();
      closeDb();
    });
  });

  describe('releaseTask', () => {
    it('returns { changes: 0, taskFound: false } for non-existent task (task 1.9)', () => {
      const { releaseTask, closeDb } = require(DB_PATH);
      const result = releaseTask('nonexistent', 'any-token', 'completed');
      expect(result.changes).toBe(0);
      expect(result.taskFound).toBe(false);
      closeDb();
    });

    it('returns { changes: 0, taskFound: true, wasClaimed: false } when claim_token is NULL (task 1.11)', () => {
      const { releaseTask, closeDb } = require(DB_PATH);
      seedTask('task-1', 'proj-1', 'Unclaimed task', 'pending');
      const result = releaseTask('task-1', 'any-token', 'completed');
      expect(result.changes).toBe(0);
      expect(result.taskFound).toBe(true);
      expect(result.wasClaimed).toBe(false);
      closeDb();
    });

    it('returns { changes: 1 } on valid token match (task 1.13)', () => {
      const { releaseTask, getDb, closeDb } = require(DB_PATH);
      const token = 'abc123def456';
      seedClaimedTask('task-1', 'proj-1', 'Claimed task', token, '2099-01-01T00:00:00Z');
      const result = releaseTask('task-1', token, 'completed');
      expect(result.changes).toBe(1);
      expect(result.taskFound).toBe(true);
      expect(result.wasClaimed).toBe(true);

      // Verify lease fields cleared
      const db = getDb();
      const row = db
        .prepare('SELECT status, claim_token, lease_expires_at FROM tasks WHERE id = ?')
        .get('task-1');
      expect(row.status).toBe('completed');
      expect(row.claim_token).toBeNull();
      expect(row.lease_expires_at).toBeNull();
      closeDb();
    });

    it('maps abandoned outcome to blocked status', () => {
      const { releaseTask, getDb, closeDb } = require(DB_PATH);
      const token = 'token-abandoned';
      seedClaimedTask('task-1', 'proj-1', 'Abandoned task', token, '2099-01-01T00:00:00Z');
      releaseTask('task-1', token, 'abandoned');

      const db = getDb();
      const row = db.prepare('SELECT status FROM tasks WHERE id = ?').get('task-1');
      expect(row.status).toBe('blocked');
      closeDb();
    });
  });
});
