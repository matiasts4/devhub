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
  // Reset task_history to avoid contamination
  db.exec(`CREATE TABLE IF NOT EXISTS task_history (
    history_id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL,
    actor_id TEXT,
    action TEXT NOT NULL,
    from_status TEXT,
    to_status TEXT,
    metadata TEXT,
    created_at TEXT NOT NULL DEFAULT(datetime('now'))
  )`);
  db.prepare('DELETE FROM task_history').run();
  db.pragma('foreign_keys = ON');

  closeDb();
}

/**
 * Seed a single task into the DB.
 */
function seedTask(task) {
  const { getDb, closeDb } = require('../lib/db');
  const db = getDb();

  db.prepare('INSERT OR IGNORE INTO projects (id, name) VALUES (?, ?)').run(
    task.project_id || 'proj-1',
    'Test Project'
  );

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
    task.due_date || null
  );

  closeDb();
}

// Also clean before each test to prevent contamination
beforeEach(() => {
  seedTestData();
});

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
      expect(result.stdout).toContain('\x1b[');
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

      const result = spawnSync('node', [CLI, 'task', 'task-plain-1'], {
        encoding: 'utf8',
        env: process.env,
      });
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

      const result = spawnSync('node', [CLI, 'task', 'task-no-ansi'], {
        encoding: 'utf8',
        env: process.env,
      });
      expect(result.stdout).not.toContain('\x1b[');
    });

    it('returns real JSON for task detail with --json', () => {
      seedTask({
        id: 'task-json-1',
        title: 'JSON Task',
        status: 'pending',
        priority: 'high',
        description: 'Structured output',
      });

      const result = spawnSync('node', [CLI, 'task', 'task-json-1', '--json'], {
        encoding: 'utf8',
        env: process.env,
      });

      expect(result.status).toBe(0);
      const parsed = JSON.parse(result.stdout);
      expect(parsed.task).toEqual(
        expect.objectContaining({
          id: 'task-json-1',
          title: 'JSON Task',
          priority: 'high',
        })
      );
    });
  });

  describe('task not found', () => {
    beforeEach(() => {
      seedTestData();
    });

    it('exits with code 1 and stderr contains "Task not found"', () => {
      const result = spawnSync('node', [CLI, 'task', 'nonexistent-id'], {
        encoding: 'utf8',
        env: process.env,
      });
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

  describe('task history', () => {
    /**
     * Seed task_history table with test entries.
     */
    function seedTaskHistory(entries) {
      const { getDb, closeDb } = require('../lib/db');
      const db = getDb();

      db.exec(`
        CREATE TABLE IF NOT EXISTS task_history (
          history_id INTEGER PRIMARY KEY AUTOINCREMENT,
          task_id TEXT NOT NULL,
          actor_id TEXT,
          action TEXT NOT NULL,
          from_status TEXT,
          to_status TEXT,
          metadata TEXT,
          created_at TEXT NOT NULL DEFAULT(datetime('now'))
        );
      `);

      // Clean task_history before inserting to avoid residual duplicates
      db.prepare('DELETE FROM task_history').run();

      const stmt = db.prepare(
        `INSERT INTO task_history (task_id, actor_id, action, from_status, to_status, metadata, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      );

      for (const entry of entries) {
        stmt.run(
          entry.task_id,
          entry.actor_id || null,
          entry.action,
          entry.from_status || null,
          entry.to_status || null,
          entry.metadata || null,
          entry.created_at || new Date().toISOString()
        );
      }

      closeDb();
    }

    beforeEach(() => {
      seedTestData();
    });

    it('shows JSON output with --json flag', () => {
      seedTask({ id: 'task-hist-1', title: 'Task with History' });
      seedTaskHistory([
        {
          task_id: 'task-hist-1',
          actor_id: 'agent-1',
          action: 'created',
          from_status: null,
          to_status: 'pending',
          metadata: '{"note":"Initial creation"}',
          created_at: '2026-05-20T10:00:00Z',
        },
        {
          task_id: 'task-hist-1',
          actor_id: 'agent-2',
          action: 'status_change',
          from_status: 'pending',
          to_status: 'in-progress',
          metadata: '{"note":"Started work"}',
          created_at: '2026-05-21T11:00:00Z',
        },
      ]);

      const result = spawnSync('node', [CLI, 'task', 'history', 'task-hist-1', '--json'], {
        encoding: 'utf8',
      });

      expect(result.status).toBe(0);
      const parsed = JSON.parse(result.stdout);
      expect(parsed.task_id).toBe('task-hist-1');
      expect(Array.isArray(parsed.history)).toBe(true);
      expect(parsed.history.length).toBeGreaterThanOrEqual(2);
      expect(parsed.history[0].action).toMatch(/status_change|created/);
    });

    it('shows formatted table in TTY mode', () => {
      seedTask({ id: 'task-hist-2', title: 'Task TTY History' });
      seedTaskHistory([
        {
          task_id: 'task-hist-2',
          actor_id: 'worker-claude',
          action: 'completed',
          from_status: 'in-progress',
          to_status: 'completed',
          metadata: '{"note":"All done"}',
          created_at: '2026-05-22T12:00:00Z',
        },
      ]);

      const result = spawnSync('node', [CLI, 'task', 'history', 'task-hist-2'], {
        encoding: 'utf8',
        env: { ...process.env, FORCE_TTY: '1' },
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/TASK HISTORY: task-hist-2/);
      expect(result.stdout).toMatch(/completed/);
      expect(result.stdout).toMatch(/worker-claude/);
    });

    it('shows pipe-delimited output in non-TTY mode', () => {
      seedTask({ id: 'task-hist-3', title: 'Task Pipe History' });
      seedTaskHistory([
        {
          task_id: 'task-hist-3',
          actor_id: 'system',
          action: 'assigned',
          from_status: null,
          to_status: null,
          metadata: null,
          created_at: '2026-05-23T13:00:00Z',
        },
      ]);

      const result = spawnSync('node', [CLI, 'task', 'history', 'task-hist-3'], {
        encoding: 'utf8',
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/2026-05-23T13:00:00Z\|assigned\|system\|/);
    });

    it('shows "No history found" when task has no history', () => {
      seedTask({ id: 'task-no-hist', title: 'Task Without History' });

      const result = spawnSync('node', [CLI, 'task', 'history', 'task-no-hist'], {
        encoding: 'utf8',
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/No history found/);
    });

    it('respects --limit flag', () => {
      seedTask({ id: 'task-hist-limit', title: 'Task Limit Test' });
      const entries = [];
      for (let i = 0; i < 20; i++) {
        entries.push({
          task_id: 'task-hist-limit',
          actor_id: `agent-${i}`,
          action: 'update',
          created_at: new Date(Date.now() + i * 1000).toISOString(),
        });
      }
      seedTaskHistory(entries);

      const result = spawnSync(
        'node',
        [CLI, 'task', 'history', 'task-hist-limit', '--limit', '5', '--json'],
        {
          encoding: 'utf8',
        }
      );

      expect(result.status).toBe(0);
      const parsed = JSON.parse(result.stdout);
      expect(parsed.history.length).toBe(5);
    });
  });
});
