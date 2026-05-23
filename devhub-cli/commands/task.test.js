'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const CLI = path.resolve(__dirname, '..', 'bin', 'devhub');

/**
 * Seed the test DB with required tables.
 */
function seedTestData() {
  const { getDb, closeDb } = require('../lib/db');
  const db = getDb();

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
  `);

  db.pragma('foreign_keys = OFF');
  db.prepare('DELETE FROM tasks').run();
  db.prepare('DELETE FROM projects').run();
  db.pragma('foreign_keys = ON');

  closeDb();
}

/**
 * Seed a single task into the DB.
 */
function seedTask(task) {
  const { getDb, closeDb } = require('../lib/db');
  const db = getDb();

  db.prepare(
    "INSERT OR IGNORE INTO projects (id, name) VALUES (?, ?)"
  ).run(task.project_id || 'proj-1', 'Test Project');

  db.prepare(
    `INSERT INTO tasks (id, project_id, title, description, status, priority, assigned_to, due_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    task.id,
    task.project_id || 'proj-1',
    task.title || 'Test Task',
    task.description || null,
    task.status || 'pending',
    task.priority || 'medium',
    task.assigned_to || null,
    task.due_date || null,
  );

  closeDb();
}

// Clean slate before all tests
seedTestData();

describe('devhub task command', () => {
  describe('missing ID argument', () => {
    it('exits with code 2 and stderr contains "ID required"', () => {
      const result = spawnSync('node', [CLI, 'task'], { encoding: 'utf8' });
      expect(result.status).toBe(2);
      expect(result.stderr).toMatch(/ID required/i);
    });
  });

  describe('task found — TTY output', () => {
    beforeEach(() => {
      seedTestData();
    });

    it('shows formatted sections and exits 0', () => {
      seedTask({
        id: 'task-tty-1',
        title: 'Fix N+1 query',
        status: 'completed',
        priority: 'high',
        assigned_to: 'worker-claude-1',
        due_date: '2026-06-01',
        description: 'Replace nested SELECT with JOIN',
      });

      const result = spawnSync('node', [CLI, 'task', 'task-tty-1'], {
        encoding: 'utf8',
        env: { ...process.env, FORCE_TTY: '1' },
      });
      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/Fix N\+1 query/);
      expect(result.stdout).toMatch(/completed/);
      expect(result.stdout).toMatch(/high/);
      expect(result.stdout).toMatch(/worker-claude-1/);
      expect(result.stdout).toMatch(/2026-06-01/);
      expect(result.stdout).toMatch(/Replace nested SELECT/);
    });

    it('includes ANSI escape codes in TTY mode', () => {
      seedTask({ id: 'task-ansi-1', title: 'ANSI Test' });

      const result = spawnSync('node', [CLI, 'task', 'task-ansi-1'], {
        encoding: 'utf8',
        env: { ...process.env, FORCE_TTY: '1' },
      });
      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/\x1b\[/);
    });
  });

  describe('task found — non-TTY output', () => {
    beforeEach(() => {
      seedTestData();
    });

    it('shows key=value pairs and exits 0', () => {
      seedTask({
        id: 'task-plain-1',
        title: 'Plain Task',
        status: 'pending',
        priority: 'medium',
        assigned_to: 'agent-1',
        due_date: '2026-07-01',
        description: 'Do something',
      });

      const result = spawnSync('node', [CLI, 'task', 'task-plain-1'], { encoding: 'utf8' });
      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/title=Plain Task/);
      expect(result.stdout).toMatch(/status=pending/);
      expect(result.stdout).toMatch(/priority=medium/);
      expect(result.stdout).toMatch(/assigned_to=agent-1/);
      expect(result.stdout).toMatch(/due_date=2026-07-01/);
      expect(result.stdout).toMatch(/description=Do something/);
    });

    it('contains no ANSI escape sequences', () => {
      seedTask({ id: 'task-no-ansi', title: 'No ANSI' });

      const result = spawnSync('node', [CLI, 'task', 'task-no-ansi'], { encoding: 'utf8' });
      expect(result.stdout).not.toMatch(/\x1b\[/);
    });
  });

  describe('task not found', () => {
    beforeEach(() => {
      seedTestData();
    });

    it('exits with code 1 and stderr contains "Task not found"', () => {
      const result = spawnSync('node', [CLI, 'task', 'nonexistent-id'], { encoding: 'utf8' });
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/Task not found/i);
    });
  });

  describe('description truncation', () => {
    beforeEach(() => {
      seedTestData();
    });

    it('truncates descriptions longer than 120 chars in TTY mode', () => {
      const longDesc = 'A'.repeat(200);
      seedTask({ id: 'task-long', title: 'Long Desc', description: longDesc });

      const result = spawnSync('node', [CLI, 'task', 'task-long'], {
        encoding: 'utf8',
        env: { ...process.env, FORCE_TTY: '1' },
      });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('A'.repeat(120) + '...');
      expect(result.stdout).not.toContain('A'.repeat(200));
    });

    it('shows full description with --verbose flag', () => {
      const longDesc = 'B'.repeat(200);
      seedTask({ id: 'task-verbose', title: 'Verbose', description: longDesc });

      const result = spawnSync('node', [CLI, 'task', 'task-verbose', '--verbose'], {
        encoding: 'utf8',
        env: { ...process.env, FORCE_TTY: '1' },
      });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('B'.repeat(200));
    });
  });

  describe('--help', () => {
    it('prints usage and exits 0', () => {
      const result = spawnSync('node', [CLI, 'task', '--help'], { encoding: 'utf8' });
      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/task/i);
    });
  });
});
