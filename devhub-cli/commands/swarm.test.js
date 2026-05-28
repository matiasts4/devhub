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
 * Seed the test DB with data for all 4 swarm sections.
 * Mirrors the pattern from status.test.js and agents.test.js.
 */
function seedSwarmData() {
  const { getDb, closeDb } = require('../lib/db');
  const db = getDb();

  // Create tables that the MCP server normally creates
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
    CREATE TABLE IF NOT EXISTS task_dependencies (
      id TEXT PRIMARY KEY, task_id TEXT NOT NULL, depends_on TEXT NOT NULL,
      tipo TEXT DEFAULT 'blocks', created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS agent_runs (
      id TEXT PRIMARY KEY, workspace_id TEXT, status TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS agent_artifacts (
      id TEXT PRIMARY KEY, run_id TEXT, kind TEXT, summary TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Recreate agent_registry (may not exist in core schema)
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_registry (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL UNIQUE,
      project_id TEXT NOT NULL,
      nombre TEXT NOT NULL,
      modelo_llm TEXT,
      status TEXT DEFAULT 'idle',
      current_task_id TEXT,
      last_heartbeat TEXT DEFAULT (datetime('now')),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      error_message TEXT
    );
  `);

  // Disable FK for cleanup
  db.pragma('foreign_keys = OFF');

  // agent_artifacts is append-only (trigger blocks DELETE)
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
  db.prepare('DELETE FROM agent_registry').run();
  db.prepare('DELETE FROM task_dependencies').run();
  db.prepare('DELETE FROM milestones').run();
  db.prepare('DELETE FROM tasks').run();
  db.prepare('DELETE FROM projects').run();

  db.pragma('foreign_keys = ON');

  // Projects
  db.prepare(
    "INSERT INTO projects (id, name, progress, status) VALUES ('p1', 'Alpha', 85, 'active')"
  ).run();
  db.prepare(
    "INSERT INTO projects (id, name, progress, status) VALUES ('p2', 'Beta', 42, 'active')"
  ).run();
  db.prepare(
    "INSERT INTO projects (id, name, progress, status) VALUES ('p3', 'Gamma', 15, 'active')"
  ).run();

  // Tasks (various statuses for queue counts)
  db.prepare(
    "INSERT INTO tasks (id, project_id, title, status, priority) VALUES ('t1', 'p1', 'Task A', 'pending', 'high')"
  ).run();
  db.prepare(
    "INSERT INTO tasks (id, project_id, title, status, priority) VALUES ('t2', 'p1', 'Task B', 'pending', 'medium')"
  ).run();
  db.prepare(
    "INSERT INTO tasks (id, project_id, title, status, priority) VALUES ('t3', 'p1', 'Task C', 'in_progress', 'high')"
  ).run();
  db.prepare(
    "INSERT INTO tasks (id, project_id, title, status, priority) VALUES ('t4', 'p2', 'Task D', 'in_progress', 'medium')"
  ).run();
  db.prepare(
    "INSERT INTO tasks (id, project_id, title, status, priority) VALUES ('t5', 'p2', 'Task E', 'blocked', 'low')"
  ).run();
  db.prepare(
    "INSERT INTO tasks (id, project_id, title, status, priority) VALUES ('t6', 'p2', 'Task F', 'completed', 'medium')"
  ).run();

  // Milestones
  db.prepare(
    "INSERT INTO milestones (id, project_id, title, due_date, status) VALUES ('m1', 'p1', 'Launch v1', '2026-06-01', 'planned')"
  ).run();
  db.prepare(
    "INSERT INTO milestones (id, project_id, title, due_date, status) VALUES ('m2', 'p2', 'Beta Release', '2026-07-15', 'in_progress')"
  ).run();

  // Agent registry
  const now = new Date().toISOString();
  db.prepare(
    "INSERT INTO agent_registry (agent_id, nombre, modelo_llm, project_id, status, current_task_id, last_heartbeat) VALUES ('agent-1', 'Worker One', 'claude-sonnet-4-6', 'p1', 'working', 't3', ?)"
  ).run(now);
  db.prepare(
    "INSERT INTO agent_registry (agent_id, nombre, modelo_llm, project_id, status, current_task_id, last_heartbeat) VALUES ('agent-2', 'Worker Two', 'gpt-4o', 'p2', 'idle', NULL, ?)"
  ).run(now);

  // Agent workspaces
  db.prepare(
    "INSERT INTO agent_workspaces (id, project_id, agent_id, repo_root, workspace_path, worktree_path, base_branch, base_commit, status, branch_name, observed_branch, observed_head, current_task_id) VALUES ('w1', 'p1', 'agent-1', '/tmp', '/tmp/ws1', '/tmp/wt1', 'main', 'abc123', 'active', 'feature/auth', 'feature/auth', 'def456', 't3')"
  ).run();
  db.prepare(
    "INSERT INTO agent_workspaces (id, project_id, agent_id, repo_root, workspace_path, worktree_path, base_branch, base_commit, status, branch_name, observed_branch, observed_head) VALUES ('w2', 'p2', 'agent-2', '/tmp', '/tmp/ws2', '/tmp/wt2', 'main', 'abc123', 'active', 'main', 'main', 'abc123')"
  ).run();

  closeDb();
}

/**
 * Clear all swarm data for empty-state tests.
 */
function _clearSwarmData() {
  const { getDb, closeDb } = require('../lib/db');
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, project_id TEXT, title TEXT, status TEXT DEFAULT 'pending');
    CREATE TABLE IF NOT EXISTS milestones (id TEXT PRIMARY KEY, project_id TEXT, title TEXT, due_date TEXT, status TEXT DEFAULT 'planned');
    CREATE TABLE IF NOT EXISTS task_dependencies (id TEXT PRIMARY KEY, task_id TEXT, depends_on TEXT, tipo TEXT DEFAULT 'blocks');
    CREATE TABLE IF NOT EXISTS agent_runs (id TEXT PRIMARY KEY, workspace_id TEXT, status TEXT);
    CREATE TABLE IF NOT EXISTS agent_artifacts (id TEXT PRIMARY KEY, run_id TEXT, kind TEXT, summary TEXT);
  `);

  db.exec(`DROP TABLE IF EXISTS agent_registry`);
  db.exec(`
    CREATE TABLE agent_registry (
      agent_id TEXT PRIMARY KEY, project_id TEXT, nombre TEXT,
      modelo_llm TEXT, status TEXT DEFAULT 'idle',
      current_task_id TEXT, last_heartbeat TEXT
    );
  `);

  db.pragma('foreign_keys = OFF');
  db.prepare('DELETE FROM agent_artifacts').run();
  db.prepare('DELETE FROM agent_runs').run();
  db.prepare('DELETE FROM agent_workspaces').run();
  db.prepare('DELETE FROM agent_registry').run();
  db.prepare('DELETE FROM task_dependencies').run();
  db.prepare('DELETE FROM milestones').run();
  db.prepare('DELETE FROM tasks').run();
  db.prepare('DELETE FROM projects').run();
  db.pragma('foreign_keys = ON');

  closeDb();
}

/**
 * Seed only projects (for partial data test).
 */
function seedProjectsOnly() {
  const { getDb, closeDb } = require('../lib/db');
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, project_id TEXT, title TEXT, status TEXT DEFAULT 'pending');
    CREATE TABLE IF NOT EXISTS milestones (id TEXT PRIMARY KEY, project_id TEXT, title TEXT, due_date TEXT, status TEXT DEFAULT 'planned');
    CREATE TABLE IF NOT EXISTS task_dependencies (id TEXT PRIMARY KEY, task_id TEXT, depends_on TEXT, tipo TEXT DEFAULT 'blocks');
    CREATE TABLE IF NOT EXISTS agent_runs (id TEXT PRIMARY KEY, workspace_id TEXT, status TEXT);
    CREATE TABLE IF NOT EXISTS agent_artifacts (id TEXT PRIMARY KEY, run_id TEXT, kind TEXT, summary TEXT);
  `);

  db.exec(`DROP TABLE IF EXISTS agent_registry`);
  db.exec(`
    CREATE TABLE agent_registry (
      agent_id TEXT PRIMARY KEY, project_id TEXT, nombre TEXT,
      modelo_llm TEXT, status TEXT DEFAULT 'idle',
      current_task_id TEXT, last_heartbeat TEXT
    );
  `);

  db.pragma('foreign_keys = OFF');
  db.prepare('DELETE FROM agent_artifacts').run();
  db.prepare('DELETE FROM agent_runs').run();
  db.prepare('DELETE FROM agent_workspaces').run();
  db.prepare('DELETE FROM agent_registry').run();
  db.prepare('DELETE FROM task_dependencies').run();
  db.prepare('DELETE FROM milestones').run();
  db.prepare('DELETE FROM tasks').run();
  db.prepare('DELETE FROM projects').run();
  db.pragma('foreign_keys = ON');

  db.prepare(
    "INSERT INTO projects (id, name, progress, status) VALUES ('p1', 'Alpha', 85, 'active')"
  ).run();

  closeDb();
}

// Seed before each test to ensure clean state
beforeEach(() => {
  seedSwarmData();
});

describe('devhub swarm command', () => {
  // 1.10: swarm invokes handler (exit 0, not stub exit 1)
  describe('command registration', () => {
    it('exits 0 when running devhub swarm (not stub exit 1)', () => {
      seedSwarmData();
      const result = spawnSync('node', [CLI, 'swarm'], { encoding: 'utf8' });
      expect(result.status).toBe(0);
    });

    // 1.11: devhub --help includes "swarm"
    it('devhub --help includes "swarm" in command list', () => {
      const result = spawnSync('node', [CLI, '--help'], { encoding: 'utf8' });
      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/swarm/i);
    });
  });

  // 1.2: exits 0 and output contains all 4 section headers
  describe('full output with data', () => {
    beforeEach(() => {
      seedSwarmData();
    });

    it('exits 0 and contains all 4 section headers', () => {
      const result = spawnSync('node', [CLI, 'swarm'], { encoding: 'utf8' });
      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/Projects/i);
      expect(result.stdout).toMatch(/Queue/i);
      expect(result.stdout).toMatch(/Agents/i);
      expect(result.stdout).toMatch(/Milestones/i);
    });

    // 1.3: section ordering — Projects → Queue → Agents → Milestones
    it('sections appear in order: Projects → Queue → Agents → Milestones', () => {
      const result = spawnSync('node', [CLI, 'swarm'], { encoding: 'utf8' });
      const output = result.stdout;

      const projectsIdx = output.search(/Projects/i);
      const queueIdx = output.search(/Queue/i);
      const agentsIdx = output.search(/Agents/i);
      const milestonesIdx = output.search(/Milestones/i);

      expect(projectsIdx).toBeGreaterThanOrEqual(0);
      expect(queueIdx).toBeGreaterThan(projectsIdx);
      expect(agentsIdx).toBeGreaterThan(queueIdx);
      expect(milestonesIdx).toBeGreaterThan(agentsIdx);
    });
  });

  // 1.4: --compact flag produces under 30 lines
  describe('--compact flag', () => {
    beforeEach(() => {
      seedSwarmData();
    });

    it('produces under 30 lines with single-line summary', () => {
      const result = spawnSync('node', [CLI, 'swarm', '--compact'], { encoding: 'utf8' });
      expect(result.status).toBe(0);
      const lines = result.stdout
        .trim()
        .split('\n')
        .filter((l) => l.trim().length > 0);
      expect(lines.length).toBeLessThan(30);
    });
  });

  // 1.5: --compact with empty DB shows empty-state messages, under 30 lines
  describe('--compact with empty DB', () => {
    it('shows empty-state messages and stays under 30 lines', () => {
      // Use a fresh DB path for this test to validate true empty state
      const fs = require('fs');
      const os = require('os');
      const emptyDbPath = path.join(os.tmpdir(), `devhub-test-empty-${Date.now()}.db`);

      // Ensure it doesn't exist
      if (fs.existsSync(emptyDbPath)) fs.unlinkSync(emptyDbPath);

      const result = spawnSync('node', [CLI, 'swarm', '--compact'], {
        encoding: 'utf8',
        env: { ...process.env, DEVHUB_DB_PATH: emptyDbPath },
      });

      expect(result.status).toBe(0);
      const lines = result.stdout
        .trim()
        .split('\n')
        .filter((l) => l.trim().length > 0);
      expect(lines.length).toBeLessThan(30);
      expect(result.stdout).toMatch(/no swarm data/i);

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

  // 1.6: non-TTY output contains no ANSI escape codes
  describe('non-TTY output', () => {
    beforeEach(() => {
      seedSwarmData();
    });

    it('contains no ANSI escape codes (spawnSync default is non-TTY)', () => {
      const result = spawnSync('node', [CLI, 'swarm'], { encoding: 'utf8' });
      expect(result.stdout).not.toContain('\x1b[');
    });

    // 1.7: non-TTY output contains key=value pairs per section
    it('contains key=value pairs per section', () => {
      const result = spawnSync('node', [CLI, 'swarm'], { encoding: 'utf8' });
      expect(result.stdout).toMatch(/total=/);
    });
  });

  // 1.8: empty DB shows "No swarm data available" per section, exit 0
  describe('empty state', () => {
    it('shows "No swarm data available" per section and exits 0', () => {
      // Use a fresh DB path for this test to validate true empty state
      const fs = require('fs');
      const os = require('os');
      const emptyDbPath = path.join(os.tmpdir(), `devhub-test-empty-${Date.now()}.db`);

      // Ensure it doesn't exist
      if (fs.existsSync(emptyDbPath)) fs.unlinkSync(emptyDbPath);

      const result = spawnSync('node', [CLI, 'swarm'], {
        encoding: 'utf8',
        env: { ...process.env, DEVHUB_DB_PATH: emptyDbPath },
      });

      expect(result.status).toBe(0);
      // Each section should show empty state message
      const matches = result.stdout.match(/no swarm data available/gi);
      expect(matches).not.toBeNull();
      expect(matches.length).toBeGreaterThanOrEqual(4);

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

  // 1.9: partial data — seed only projects, Agents section shows empty message
  describe('partial data', () => {
    it('seed only projects — Agents section shows empty message', () => {
      seedProjectsOnly();
      const result = spawnSync('node', [CLI, 'swarm'], { encoding: 'utf8' });
      expect(result.status).toBe(0);
      // Projects section should have data
      expect(result.stdout).toMatch(/Alpha/i);
      // Agents section should show empty message
      expect(result.stdout).toMatch(/no swarm data available/i);
    });
  });
});
