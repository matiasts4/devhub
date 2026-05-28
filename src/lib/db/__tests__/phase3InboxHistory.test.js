/**
 * Phase 3 tests — Operator Inbox + Task History + Tags column + Team Chat targeting
 */

const { describe, it, beforeAll, afterAll, expect } = require('@jest/globals');
const Database = require('better-sqlite3');
const path = require('path');

const SCHEMA_PATH = path.resolve(__dirname, '../../db/localDb.js');

describe('Operator Inbox (OPI)', () => {
  let db;

  beforeAll(() => {
    const mod = require(SCHEMA_PATH);
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    mod.ensureRuntimeSchema(db);
    // Insert a project for FK
    db.prepare('INSERT OR IGNORE INTO projects (id, name) VALUES (?, ?)').run(
      'proj-1',
      'Test Project'
    );
  });

  afterAll(() => {
    db.close();
  });

  it('OPI-1: recordInboxItem creates an unread inbox entry', () => {
    const { recordInboxItem } = require(SCHEMA_PATH);
    const result = recordInboxItem(db, {
      projectId: 'proj-1',
      actorId: 'agent-test',
      category: 'task_claimed',
      sourceTable: 'tasks',
      sourceId: 'task-1',
      message: 'Task "Implement feature" claimed by agent-test',
    });
    expect(result).toBeTruthy();
    expect(result.inbox_id).toMatch(/^inbox-/);
    expect(result.status).toBe('unread');

    const row = db.prepare('SELECT * FROM operator_inbox WHERE inbox_id = ?').get(result.inbox_id);
    expect(row.category).toBe('task_claimed');
    expect(row.status).toBe('unread');
    expect(row.source_table).toBe('tasks');
  });

  it('OPI-1: rejects invalid category', () => {
    const { recordInboxItem } = require(SCHEMA_PATH);
    expect(() =>
      recordInboxItem(db, {
        projectId: 'proj-1',
        actorId: 'a1',
        category: 'invalid_category',
        sourceTable: 'tasks',
        sourceId: 'task-1',
        message: 'test',
      })
    ).toThrow('Invalid inbox category');
  });

  it('OPI-2: queryOperatorInbox filters by project, status, category', () => {
    const { queryOperatorInbox } = require(SCHEMA_PATH);
    const all = queryOperatorInbox(db, { projectId: 'proj-1' });
    expect(all.length).toBeGreaterThanOrEqual(1);

    const unread = queryOperatorInbox(db, { projectId: 'proj-1', status: 'unread' });
    expect(unread.length).toBeGreaterThanOrEqual(1);
    expect(unread[0].status).toBe('unread');

    const claimed = queryOperatorInbox(db, { projectId: 'proj-1', category: 'task_claimed' });
    expect(claimed.length).toBeGreaterThanOrEqual(1);
  });

  it('OPI-4: markInboxItemRead changes status from unread to read', () => {
    const { recordInboxItem, markInboxItemRead } = require(SCHEMA_PATH);
    const item = recordInboxItem(db, {
      projectId: 'proj-1',
      actorId: 'a2',
      category: 'system',
      sourceTable: 'tasks',
      sourceId: 'task-2',
      message: 'System notification',
    });
    const result = markInboxItemRead(db, item.inbox_id);
    expect(result).toBe(true);

    const row = db
      .prepare('SELECT status FROM operator_inbox WHERE inbox_id = ?')
      .get(item.inbox_id);
    expect(row.status).toBe('read');
  });

  it('OPI-5: dismissInboxItem changes status to dismissed', () => {
    const { recordInboxItem, dismissInboxItem } = require(SCHEMA_PATH);
    const item = recordInboxItem(db, {
      projectId: 'proj-1',
      actorId: 'a3',
      category: 'supervisor_action',
      sourceTable: 'agent_workspaces',
      sourceId: 'ws-1',
      message: 'Workspace orphaned',
    });
    const result = dismissInboxItem(db, item.inbox_id);
    expect(result).toBe(true);

    const row = db
      .prepare('SELECT status FROM operator_inbox WHERE inbox_id = ?')
      .get(item.inbox_id);
    expect(row.status).toBe('dismissed');
  });
});

describe('Task History (OBH)', () => {
  let db;

  beforeAll(() => {
    const mod = require(SCHEMA_PATH);
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    mod.ensureRuntimeSchema(db);
    // Create tasks table (normally created by MCP ensureLocalMcpTables)
    db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
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
        claim_token TEXT,
        tags TEXT DEFAULT '[]'
      )
    `);
    // Insert project + task for FK
    db.prepare('INSERT OR IGNORE INTO projects (id, name) VALUES (?, ?)').run(
      'proj-1',
      'Test Project'
    );
    db.prepare(
      'INSERT OR IGNORE INTO tasks (id, project_id, title, user_id) VALUES (?, ?, ?, ?)'
    ).run('task-1', 'proj-1', 'Test Task', 'user-1');
  });

  afterAll(() => {
    db.close();
  });

  it('OBH-1: recordTaskHistory appends an entry', () => {
    const { recordTaskHistory } = require(SCHEMA_PATH);
    recordTaskHistory(db, {
      taskId: 'task-1',
      actorId: 'agent-1',
      action: 'claimed',
      fromStatus: 'pending',
      toStatus: 'in_progress',
      metadata: { claim_token: 'ct-123' },
    });

    const rows = db.prepare('SELECT * FROM task_history WHERE task_id = ?').all('task-1');
    expect(rows.length).toBe(1);
    expect(rows[0].action).toBe('claimed');
    expect(rows[0].from_status).toBe('pending');
    expect(rows[0].to_status).toBe('in_progress');
    expect(JSON.parse(rows[0].metadata)).toEqual({ claim_token: 'ct-123' });
  });

  it('OBH-2: getTaskHistory returns entries ordered by history_id DESC', () => {
    const { recordTaskHistory, getTaskHistory } = require(SCHEMA_PATH);
    // Add another history entry
    recordTaskHistory(db, {
      taskId: 'task-1',
      actorId: 'agent-1',
      action: 'released',
      fromStatus: 'in_progress',
      toStatus: 'completed',
    });

    const history = getTaskHistory(db, { taskId: 'task-1' });
    expect(history.length).toBe(2);
    expect(history[0].action).toBe('released'); // Most recent first
    expect(history[1].action).toBe('claimed');
  });

  it('OBH-4: tags column exists on tasks', () => {
    const row = db.prepare('SELECT tags FROM tasks WHERE id = ?').get('task-1');
    expect(row.tags).toBeDefined();
    // Default value should be '[]'
    expect(row.tags).toBe('[]');
  });

  it('OBH-4: tags column can be updated with JSON array', () => {
    db.prepare('UPDATE tasks SET tags = ? WHERE id = ?').run('["priority", "bug"]', 'task-1');
    const row = db.prepare('SELECT tags FROM tasks WHERE id = ?').get('task-1');
    expect(JSON.parse(row.tags)).toEqual(['priority', 'bug']);
  });
});
