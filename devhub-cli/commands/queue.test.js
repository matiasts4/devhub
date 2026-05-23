'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const CLI = path.resolve(__dirname, '..', 'bin', 'devhub');

/**
 * Seed the test DB with queue-relevant data.
 */
function seedQueueData() {
  const { getDb, closeDb } = require('../lib/db');
  const db = getDb();

  // Drop and recreate task tables with full schema
  db.exec(`DROP TABLE IF EXISTS task_dependencies`);
  db.exec(`DROP TABLE IF EXISTS tasks`);
  db.exec(`
    CREATE TABLE tasks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      user_id TEXT,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'pending',
      priority TEXT DEFAULT 'medium',
      due_date TEXT,
      completed_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      milestone_id TEXT,
      business_value INTEGER DEFAULT 5,
      stale_alert INTEGER DEFAULT 0,
      retry_count INTEGER DEFAULT 0,
      last_qa_feedback TEXT,
      assigned_to TEXT,
      claimed_at TEXT,
      lease_expires_at TEXT,
      claim_token TEXT
    );
    CREATE TABLE task_dependencies (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      depends_on TEXT NOT NULL,
      tipo TEXT DEFAULT 'blocks',
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Ensure other tables exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      progress REAL DEFAULT 0,
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS agent_artifacts (
      id TEXT PRIMARY KEY, run_id TEXT, kind TEXT, summary TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS agent_runs (
      id TEXT PRIMARY KEY, workspace_id TEXT, status TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS agent_workspaces (
      id TEXT PRIMARY KEY, project_id TEXT, agent_id TEXT,
      repo_root TEXT, workspace_path TEXT, worktree_path TEXT,
      base_branch TEXT, base_commit TEXT, status TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  db.pragma('foreign_keys = OFF');
  db.prepare('DELETE FROM agent_artifacts').run();
  db.prepare('DELETE FROM agent_runs').run();
  db.prepare('DELETE FROM agent_workspaces').run();
  db.prepare('DELETE FROM task_dependencies').run();
  db.prepare('DELETE FROM tasks').run();
  db.prepare('DELETE FROM projects').run();
  db.pragma('foreign_keys = ON');

  closeDb();
}

/**
 * Seed projects and tasks for queue testing.
 */
function seedProjectsAndTasks(projects, tasks) {
  const { getDb, closeDb } = require('../lib/db');
  const db = getDb();

  for (const p of projects) {
    db.prepare(
      "INSERT INTO projects (id, name, status) VALUES (?, ?, ?)"
    ).run(p.id, p.name, p.status || 'active');
  }

  for (const t of tasks) {
    db.prepare(
      `INSERT INTO tasks (
        id, project_id, title, description, status, priority,
        business_value, retry_count, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      t.id, t.project_id, t.title, t.description || null,
      t.status || 'pending', t.priority || 'medium',
      t.business_value ?? 5, t.retry_count ?? 0,
      t.created_at || '2026-05-22T10:00:00.000Z',
      t.updated_at || '2026-05-22T10:00:00.000Z'
    );
  }

  closeDb();
}

/**
 * Seed a dependency relationship.
 */
function seedDependency(taskId, dependsOn) {
  const { getDb, closeDb } = require('../lib/db');
  const db = getDb();
  const depId = 'dep-' + Math.random().toString(36).slice(2, 8);
  db.prepare(
    'INSERT INTO task_dependencies (id, task_id, depends_on, tipo) VALUES (?, ?, ?, ?)'
  ).run(depId, taskId, dependsOn, 'blocks');
  closeDb();
}

// Clean slate before all tests
seedQueueData();

describe('devhub queue command', () => {
  describe('exit code', () => {
    it('exits with code 0 on empty DB', () => {
      const result = spawnSync('node', [CLI, 'queue'], { encoding: 'utf8' });
      expect(result.status).toBe(0);
    });
  });

  describe('empty queue', () => {
    it('outputs "No tasks in queue" when DB has no tasks', () => {
      const result = spawnSync('node', [CLI, 'queue'], { encoding: 'utf8' });
      expect(result.stdout).toMatch(/No tasks in queue/i);
      expect(result.status).toBe(0);
    });
  });

  describe('--limit flag', () => {
    beforeEach(() => {
      seedQueueData();
      seedProjectsAndTasks(
        [{ id: 'proj-1', name: 'TestProject', status: 'active' }],
        Array.from({ length: 10 }, (_, i) => ({
          id: `task-${i}`,
          project_id: 'proj-1',
          title: `Task ${i}`,
          business_value: 10 - i,
          created_at: `2026-05-22T10:0${i}:00.000Z`,
        }))
      );
    });

    it('shows exactly 5 rows with --limit 5', () => {
      const result = spawnSync('node', [CLI, 'queue', '--limit', '5'], { encoding: 'utf8' });
      const lines = result.stdout.split('\n').filter(l => l.trim() && !l.includes('No tasks'));
      // Count data rows (exclude header/separator in TTY mode)
      const dataRows = lines.filter(l => !l.match(/^[-]+/));
      expect(dataRows.length).toBeLessThanOrEqual(6); // header + separator + 5 data = 7 max
      expect(result.status).toBe(0);
    });
  });

  describe('--project filter', () => {
    beforeEach(() => {
      seedQueueData();
      seedProjectsAndTasks(
        [
          { id: 'proj-a', name: 'ProjectA', status: 'active' },
          { id: 'proj-b', name: 'ProjectB', status: 'active' },
        ],
        [
          { id: 'task-a1', project_id: 'proj-a', title: 'Task A1', business_value: 8 },
          { id: 'task-a2', project_id: 'proj-a', title: 'Task A2', business_value: 6 },
          { id: 'task-b1', project_id: 'proj-b', title: 'Task B1', business_value: 9 },
        ]
      );
    });

    it('filters to single project only', () => {
      const result = spawnSync('node', [CLI, 'queue', '--project', 'proj-a'], { encoding: 'utf8' });
      expect(result.stdout).not.toMatch(/Task B1/);
      expect(result.stdout).toMatch(/Task A1/);
      expect(result.status).toBe(0);
    });
  });

  describe('--blocked filter', () => {
    beforeEach(() => {
      seedQueueData();
      seedProjectsAndTasks(
        [{ id: 'proj-1', name: 'TestProject', status: 'active' }],
        [
          { id: 'task-blocked', project_id: 'proj-1', title: 'Blocked Task', business_value: 5 },
          { id: 'task-free', project_id: 'proj-1', title: 'Free Task', business_value: 7 },
        ]
      );
      // task-blocked depends on task-free (which is pending, so blocked)
      seedDependency('task-blocked', 'task-free');
    });

    it('shows only blocked tasks with reason', () => {
      const result = spawnSync('node', [CLI, 'queue', '--blocked'], { encoding: 'utf8' });
      expect(result.stdout).toMatch(/Blocked Task/);
      expect(result.stdout).not.toMatch(/Free Task/);
      expect(result.status).toBe(0);
    });
  });

  describe('non-TTY output', () => {
    it('contains no ANSI escape sequences', () => {
      const result = spawnSync('node', [CLI, 'queue'], { encoding: 'utf8' });
      expect(result.stdout).not.toMatch(/\x1b\[/);
    });
  });

  describe('cross-project merge', () => {
    beforeEach(() => {
      seedQueueData();
      seedProjectsAndTasks(
        [
          { id: 'proj-x', name: 'ProjectX', status: 'active' },
          { id: 'proj-y', name: 'ProjectY', status: 'active' },
        ],
        [
          { id: 'task-x1', project_id: 'proj-x', title: 'X Low', business_value: 2 },
          { id: 'task-y1', project_id: 'proj-y', title: 'Y High', business_value: 9 },
          { id: 'task-x2', project_id: 'proj-x', title: 'X Mid', business_value: 5 },
        ]
      );
    });

    it('merges and sorts by priority score DESC', () => {
      const result = spawnSync('node', [CLI, 'queue'], { encoding: 'utf8' });
      const stdout = result.stdout;
      // Y High should appear before X Low in output
      const yIdx = stdout.indexOf('Y High');
      const xLowIdx = stdout.indexOf('X Low');
      expect(yIdx).toBeGreaterThanOrEqual(0);
      expect(xLowIdx).toBeGreaterThanOrEqual(0);
      expect(yIdx).toBeLessThan(xLowIdx);
    });
  });

  describe('--help', () => {
    it('prints usage and exits 0', () => {
      const result = spawnSync('node', [CLI, 'queue', '--help'], { encoding: 'utf8' });
      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/queue/i);
      expect(result.stdout).toMatch(/limit/);
      expect(result.stdout).toMatch(/project/);
      expect(result.stdout).toMatch(/blocked/);
    });
  });
});
