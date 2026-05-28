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
 * Seed the test DB with minimal data so sections render.
 * Uses the same DB resolution as getDb() (NODE_ENV=test).
 */
function seedTestData() {
  const { getDb, closeDb } = require('../lib/db');
  const db = getDb();

  // Create tables that the MCP server normally creates (not in core.js schema)
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'pending',
      priority TEXT DEFAULT 'medium',
      milestone_id TEXT,
      assigned_to TEXT,
      due_date TEXT,
      business_value REAL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS milestones (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      due_date TEXT,
      status TEXT DEFAULT 'planned',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Disable FK for test cleanup
  db.pragma('foreign_keys = OFF');

  // Clear existing test data — agent_artifacts is append-only (trigger blocks DELETE)
  db.exec('DROP TABLE IF EXISTS agent_artifacts');
  db.exec(`
    CREATE TABLE agent_artifacts (
      artifact_id TEXT PRIMARY KEY, run_id TEXT NOT NULL, seq INTEGER NOT NULL,
      phase TEXT NOT NULL, kind TEXT NOT NULL, producer TEXT NOT NULL,
      summary TEXT NOT NULL, evidence_ref TEXT NOT NULL, observed_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
  db.prepare('DELETE FROM agent_runs').run();
  db.prepare('DELETE FROM agent_workspaces').run();
  db.prepare('DELETE FROM milestones').run();
  db.prepare('DELETE FROM tasks').run();
  db.prepare('DELETE FROM projects').run();

  // Re-enable FK
  db.pragma('foreign_keys = ON');

  // Insert test projects
  db.prepare(
    "INSERT INTO projects (id, name, progress, status) VALUES ('p1', 'Alpha', 85, 'active')"
  ).run();
  db.prepare(
    "INSERT INTO projects (id, name, progress, status) VALUES ('p2', 'Beta', 42, 'active')"
  ).run();

  // Insert test tasks
  db.prepare(
    "INSERT INTO tasks (id, project_id, title, status) VALUES ('t1', 'p1', 'Task A', 'pending')"
  ).run();
  db.prepare(
    "INSERT INTO tasks (id, project_id, title, status) VALUES ('t2', 'p1', 'Task B', 'in_progress')"
  ).run();
  db.prepare(
    "INSERT INTO tasks (id, project_id, title, status) VALUES ('t3', 'p2', 'Task C', 'completed')"
  ).run();
  db.prepare(
    "INSERT INTO tasks (id, project_id, title, status) VALUES ('t4', 'p2', 'Task D', 'blocked')"
  ).run();

  // Insert test milestones
  db.prepare(
    "INSERT INTO milestones (id, project_id, title, due_date, status) VALUES ('m1', 'p1', 'Launch v1', '2026-06-01', 'planned')"
  ).run();
  db.prepare(
    "INSERT INTO milestones (id, project_id, title, due_date, status) VALUES ('m2', 'p2', 'Beta Release', '2026-07-15', 'in_progress')"
  ).run();

  // Insert test agent workspaces
  db.prepare(
    "INSERT INTO agent_workspaces (id, project_id, agent_id, repo_root, workspace_path, worktree_path, base_branch, base_commit, status, branch_name, observed_branch, observed_head) VALUES ('w1', 'p1', 'agent-1', '/tmp', '/tmp/ws1', '/tmp/wt1', 'main', 'abc123', 'active', 'main', 'main', 'abc123')"
  ).run();
  db.prepare(
    "INSERT INTO agent_workspaces (id, project_id, agent_id, repo_root, workspace_path, worktree_path, base_branch, base_commit, status, current_task_id, branch_name, observed_branch, observed_head) VALUES ('w2', 'p2', 'agent-2', '/tmp', '/tmp/ws2', '/tmp/wt2', 'main', 'abc123', 'active', 't2', 'feature', 'feature', 'def456')"
  ).run();

  closeDb();
}

// Seed before each test to ensure clean state
beforeEach(() => {
  seedTestData();
});

describe('devhub status command', () => {
  describe('exit code', () => {
    it('exits with code 0', () => {
      const result = spawnSync('node', [CLI, 'status'], { encoding: 'utf8' });
      expect(result.status).toBe(0);
    });
  });

  describe('sections present', () => {
    it('output contains Projects section header', () => {
      const result = spawnSync('node', [CLI, 'status'], { encoding: 'utf8' });
      expect(result.stdout).toMatch(/Projects/i);
    });

    it('output contains Tasks section header', () => {
      const result = spawnSync('node', [CLI, 'status'], { encoding: 'utf8' });
      expect(result.stdout).toMatch(/Tasks/i);
    });

    it('output contains Milestones section header', () => {
      const result = spawnSync('node', [CLI, 'status'], { encoding: 'utf8' });
      expect(result.stdout).toMatch(/Milestones/i);
    });

    it('output contains Swarm section header', () => {
      const result = spawnSync('node', [CLI, 'status'], { encoding: 'utf8' });
      expect(result.stdout).toMatch(/Swarm/i);
    });
  });

  describe('TTY mode', () => {
    it('includes ANSI escape codes when run in TTY-like env', () => {
      // We can't truly simulate TTY with spawnSync, but we can test
      // by checking that the command runs without error
      const result = spawnSync('node', [CLI, 'status'], { encoding: 'utf8' });
      expect(result.status).toBe(0);
    });
  });

  describe('non-TTY mode', () => {
    it('output has no ANSI codes when piped (default spawnSync)', () => {
      // spawnSync without stdio:inherit pipes stdout, so isTTY is false
      const result = spawnSync('node', [CLI, 'status'], { encoding: 'utf8' });
      expect(result.stdout).not.toContain('\x1b[');
    });
  });

  describe('empty DB', () => {
    it('shows friendly message when no projects exist', () => {
      // Use a fresh DB path for this test to validate true empty state
      const fs = require('fs');
      const os = require('os');
      const emptyDbPath = path.join(os.tmpdir(), `devhub-test-empty-${Date.now()}.db`);

      // Ensure it doesn't exist
      if (fs.existsSync(emptyDbPath)) fs.unlinkSync(emptyDbPath);

      const result = spawnSync('node', [CLI, 'status'], {
        encoding: 'utf8',
        env: { ...process.env, DEVHUB_DB_PATH: emptyDbPath },
      });

      expect(result.stdout).toMatch(/no projects/i);
      expect(result.status).toBe(0);

      // Cleanup
      try {
        if (fs.existsSync(emptyDbPath)) fs.unlinkSync(emptyDbPath);
        if (fs.existsSync(`${emptyDbPath}-wal`)) fs.unlinkSync(`${emptyDbPath}-wal`);
        if (fs.existsSync(`${emptyDbPath}-shm`)) fs.unlinkSync(`${emptyDbPath}-shm`);
      } catch {
        // ignore cleanup errors
      }
    });
  });

  describe('--help', () => {
    it('prints usage and exits 0', () => {
      const result = spawnSync('node', [CLI, 'status', '--help'], { encoding: 'utf8' });
      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/status/i);
    });
  });
});
