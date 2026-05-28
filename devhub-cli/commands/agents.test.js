'use strict';

const path = require('path');
const { createTempDb } = require('../tests/fixtures/seed-factory');

// Set DB path BEFORE any require() that loads lib/db
const dbPath = createTempDb();
process.env.DEVHUB_DB_PATH = dbPath;
jest.resetModules();

const { spawnSync } = require('child_process');
const CLI = path.resolve(__dirname, '..', 'bin', 'devhub');

function runAgents(args = [], options = {}) {
  return spawnSync('node', [CLI, 'agents', ...args], {
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
 * Seed the test DB with agent data.
 */
function seedAgentData() {
  const { getDb, closeDb } = require('../lib/db');
  const db = getDb();

  db.pragma('foreign_keys = OFF');
  // Don't DROP TABLE - just clean data to maintain schema consistency

  // Ensure other tables exist for the CLI to not crash
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT,
      progress REAL DEFAULT 0, status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, user_id TEXT,
      title TEXT NOT NULL, description TEXT, status TEXT DEFAULT 'pending',
      priority TEXT DEFAULT 'medium', due_date TEXT, completed_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')), milestone_id TEXT,
      business_value INTEGER DEFAULT 5, stale_alert INTEGER DEFAULT 0,
      retry_count INTEGER DEFAULT 0, last_qa_feedback TEXT,
      assigned_to TEXT, claimed_at TEXT, lease_expires_at TEXT,
      claim_token TEXT
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
    CREATE TABLE IF NOT EXISTS milestones (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, user_id TEXT,
      title TEXT NOT NULL, description TEXT, due_date TEXT,
      status TEXT DEFAULT 'planned', created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

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
  db.prepare('DELETE FROM tasks').run();
  db.prepare('DELETE FROM projects').run();
  db.prepare('DELETE FROM milestones').run();
  db.pragma('foreign_keys = ON');

  // Insert dummy project to prevent recovery on reopen
  db.prepare('INSERT OR IGNORE INTO projects (id, name) VALUES (?, ?)').run(
    'proj-1',
    'Test Project'
  );

  // Force WAL checkpoint so spawnSync child process sees changes
  db.pragma('wal_checkpoint(RESTART)');
  closeDb();
}

/**
 * Seed agents into agent_registry.
 */
function seedAgents(agents) {
  const { getDb, closeDb } = require('../lib/db');
  const db = getDb();
  const now = new Date().toISOString();

  for (const a of agents) {
    db.prepare(
      `INSERT INTO agent_registry (agent_id, nombre, modelo_llm, project_id, status, current_task_id, last_heartbeat)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      a.agent_id,
      a.nombre || 'Test Agent',
      a.modelo_llm || 'claude-sonnet-4-6',
      a.project_id || 'proj-1',
      a.status || 'idle',
      a.current_task_id || null,
      a.last_heartbeat !== undefined ? a.last_heartbeat : now
    );
  }

  closeDb();
}

/**
 * Seed workspaces into agent_workspaces.
 */
function seedWorkspaces(workspaces) {
  const { getDb, closeDb } = require('../lib/db');
  const db = getDb();
  const now = new Date().toISOString();

  for (const w of workspaces) {
    db.prepare(
      `INSERT INTO agent_workspaces (id, project_id, agent_id, repo_root, workspace_path, base_branch, base_commit, branch_name, status, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      w.id,
      w.project_id || 'proj-1',
      w.agent_id,
      w.repo_root || '/tmp/repo',
      w.workspace_path || '/tmp/ws',
      w.base_branch || 'main',
      w.base_commit || 'abc123',
      w.branch_name || null,
      w.status || 'planned',
      w.updated_at || now
    );
  }

  closeDb();
}

// Also clean before each test to prevent contamination
beforeEach(() => {
  seedAgentData();
});

describe('devhub agents command', () => {
  describe('empty state', () => {
    beforeEach(() => {
      seedAgentData();
    });

    it('outputs "No agents registered" and exits 0 on empty DB', () => {
      const result = runAgents();
      expect(result.stdout).toMatch(/No agents registered/i);
      expect(result.status).toBe(0);
    });

    it('outputs "No agents registered" when filter matches nothing', () => {
      seedAgents([{ agent_id: 'agent-1', status: 'idle' }]);
      const result = runAgents(['--status', 'nonexistent']);
      expect(result.stdout).toMatch(/No agents registered/i);
      expect(result.status).toBe(0);
    });
  });

  describe('TTY table output', () => {
    beforeEach(() => {
      seedAgentData();
    });

    it('shows two agents with correct columns in TTY mode', () => {
      seedAgents([
        {
          agent_id: 'agent-alpha',
          nombre: 'Alpha',
          modelo_llm: 'claude-sonnet-4-6',
          status: 'working',
          current_task_id: 'task-1',
        },
        { agent_id: 'agent-beta', nombre: 'Beta', modelo_llm: 'gpt-4o', status: 'idle' },
      ]);
      seedWorkspaces([
        { id: 'ws-1', agent_id: 'agent-alpha', branch_name: 'feature/auth' },
        { id: 'ws-2', agent_id: 'agent-beta', branch_name: 'main' },
      ]);

      const result = runAgents([], { env: { FORCE_TTY: '1' } });
      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/AGENT/);
      expect(result.stdout).toMatch(/STATUS/);
      expect(result.stdout).toMatch(/TASK/);
      expect(result.stdout).toMatch(/BRANCH/);
      expect(result.stdout).toMatch(/MODEL/);
      expect(result.stdout).toMatch(/HEARTBEAT/);
      expect(result.stdout).toMatch(/agent-alpha/);
      expect(result.stdout).toMatch(/agent-beta/);
      expect(result.stdout).toMatch(/feature\/auth/);
    });

    it('shows "—" for BRANCH when agent has no workspace', () => {
      seedAgents([{ agent_id: 'agent-lone', status: 'idle' }]);

      const result = runAgents([], { env: { FORCE_TTY: '1' } });
      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/agent-lone/);
    });

    it('shows only latest workspace branch when agent has multiple', () => {
      const now = new Date().toISOString();
      const old = new Date(Date.now() - 3600000).toISOString();

      seedAgents([{ agent_id: 'agent-multi', status: 'working' }]);
      seedWorkspaces([
        { id: 'ws-old', agent_id: 'agent-multi', branch_name: 'feature/old', updated_at: old },
        { id: 'ws-new', agent_id: 'agent-multi', branch_name: 'feature/new', updated_at: now },
      ]);

      const result = runAgents([], { env: { FORCE_TTY: '1' } });
      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/feature\/new/);
      expect(result.stdout).not.toMatch(/feature\/old/);
    });
  });

  describe('--status filter', () => {
    beforeEach(() => {
      seedAgentData();
      seedAgents([
        { agent_id: 'agent-idle', status: 'idle' },
        { agent_id: 'agent-working', status: 'working' },
        { agent_id: 'agent-error', status: 'error' },
      ]);
    });

    it('filters to exact status match', () => {
      const result = runAgents(['--status', 'idle']);
      expect(result.stdout).toMatch(/agent-idle/);
      expect(result.stdout).not.toMatch(/agent-working/);
      expect(result.stdout).not.toMatch(/agent-error/);
      expect(result.status).toBe(0);
    });
  });

  describe('--active flag', () => {
    beforeEach(() => {
      seedAgentData();
      seedAgents([
        { agent_id: 'agent-working', status: 'working' },
        { agent_id: 'agent-idle', status: 'idle' },
        { agent_id: 'agent-thinking', status: 'thinking' },
        { agent_id: 'agent-running', status: 'running' },
        { agent_id: 'agent-active', status: 'active' },
        { agent_id: 'agent-completed', status: 'completed' },
      ]);
    });

    it('filters to active statuses: active, working, running, thinking', () => {
      const result = runAgents(['--active']);
      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/agent-working/);
      expect(result.stdout).toMatch(/agent-thinking/);
      expect(result.stdout).toMatch(/agent-running/);
      expect(result.stdout).toMatch(/agent-active/);
      expect(result.stdout).not.toMatch(/agent-idle/);
      expect(result.stdout).not.toMatch(/agent-completed/);
    });
  });

  describe('flag mutual exclusion', () => {
    beforeEach(() => {
      seedAgentData();
      seedAgents([{ agent_id: 'agent-1', status: 'idle' }]);
    });

    it('exits with code 2 when both --active and --status are provided', () => {
      const result = runAgents(['--active', '--status', 'idle']);
      expect(result.status).toBe(2);
      expect(result.stderr).toMatch(/conflict|mutually exclusive|cannot use both/i);
    });
  });

  describe('non-TTY output', () => {
    beforeEach(() => {
      seedAgentData();
      seedAgents([
        { agent_id: 'agent-a', status: 'working', current_task_id: 'task-1' },
        { agent_id: 'agent-b', status: 'idle' },
      ]);
      seedWorkspaces([{ id: 'ws-a', agent_id: 'agent-a', branch_name: 'feature/x' }]);
    });

    it('contains no ANSI escape sequences', () => {
      const result = runAgents();
      expect(result.stdout).not.toContain('\x1b[');
    });

    it('uses pipe-delimited format', () => {
      const result = runAgents();
      const lines = result.stdout.trim().split('\n');
      for (const line of lines) {
        expect(line).toMatch(/\|/);
      }
    });

    it('has no header row in non-TTY mode', () => {
      const result = runAgents();
      expect(result.stdout).not.toMatch(/^AGENT\|/i);
    });
  });

  describe('heartbeat computation', () => {
    beforeEach(() => {
      seedAgentData();
    });

    it('shows "2m ago" for recent heartbeat', () => {
      const twoMinAgo = new Date(Date.now() - 2 * 60000).toISOString();
      seedAgents([{ agent_id: 'agent-recent', status: 'working', last_heartbeat: twoMinAgo }]);

      const result = runAgents();
      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/2m ago/);
    });

    it('shows "stale" for heartbeat older than 5 minutes', () => {
      const tenMinAgo = new Date(Date.now() - 10 * 60000).toISOString();
      seedAgents([{ agent_id: 'agent-stale', status: 'working', last_heartbeat: tenMinAgo }]);

      const result = runAgents();
      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/stale/);
    });

    it('shows "unknown" for null heartbeat', () => {
      seedAgents([{ agent_id: 'agent-no-hb', status: 'idle', last_heartbeat: null }]);

      const result = runAgents();
      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/unknown/);
    });
  });

  describe('--help', () => {
    it('prints usage and exits 0', () => {
      const result = runAgents(['--help']);
      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/agents/i);
      expect(result.stdout).toMatch(/status/);
      expect(result.stdout).toMatch(/active/);
    });
  });
});
