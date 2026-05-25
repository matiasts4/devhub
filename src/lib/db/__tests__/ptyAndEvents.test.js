/**
 * @module ptyAndEvents.test
 * Strict TDD tests for PTY identity columns (3.1-3.4) and agent_events table (3.6-3.7).
 * RED phase: written FIRST, implementation follows.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');

const { ensureRuntimeSchema } = require('../localDb');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a fresh in-memory DB with runtime schema applied. */
function createTestDb() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  ensureRuntimeSchema(db);
  return db;
}

// ---------------------------------------------------------------------------
// PTY-1: agent_workspaces gains nullable columns pane_id, terminal_id, opencode_pid
// Task 3.1 RED
// ---------------------------------------------------------------------------

test('agent_workspaces has pane_id column', () => {
  const db = createTestDb();
  const columns = db.pragma('table_info(agent_workspaces)').map((c) => c.name);
  assert.ok(columns.includes('pane_id'), 'agent_workspaces must have pane_id column');
  db.close();
});

test('agent_workspaces has terminal_id column', () => {
  const db = createTestDb();
  const columns = db.pragma('table_info(agent_workspaces)').map((c) => c.name);
  assert.ok(columns.includes('terminal_id'), 'agent_workspaces must have terminal_id column');
  db.close();
});

test('agent_workspaces has opencode_pid column', () => {
  const db = createTestDb();
  const columns = db.pragma('table_info(agent_workspaces)').map((c) => c.name);
  assert.ok(columns.includes('opencode_pid'), 'agent_workspaces must have opencode_pid column');
  db.close();
});

test('PTY columns are nullable (no NOT NULL constraint)', () => {
  const db = createTestDb();
  const colInfo = db.pragma('table_info(agent_workspaces)');
  for (const col of ['pane_id', 'terminal_id', 'opencode_pid']) {
    const info = colInfo.find((c) => c.name === col);
    assert.ok(info, `column ${col} must exist`);
    assert.equal(info.notnull, 0, `${col} must be nullable`);
  }
  db.close();
});

test('PTY columns can be inserted as NULL on new workspace', () => {
  const db = createTestDb();
  // Create a project first (FK requirement)
  db.exec(`INSERT INTO projects (id, name) VALUES ('proj-1', 'Test Project')`);
  db.exec(`
    INSERT INTO agent_workspaces (id, project_id, agent_id, repo_root, workspace_path, base_branch, status)
    VALUES ('ws-1', 'proj-1', 'agent-1', '/repo', '/ws', 'main', 'planned')
  `);
  const row = db
    .prepare('SELECT pane_id, terminal_id, opencode_pid FROM agent_workspaces WHERE id = ?')
    .get('ws-1');
  assert.equal(row.pane_id, null, 'pane_id should default to NULL');
  assert.equal(row.terminal_id, null, 'terminal_id should default to NULL');
  assert.equal(row.opencode_pid, null, 'opencode_pid should default to NULL');
  db.close();
});

test('PTY columns can be updated with values', () => {
  const db = createTestDb();
  db.exec(`INSERT INTO projects (id, name) VALUES ('proj-1', 'Test Project')`);
  db.exec(`
    INSERT INTO agent_workspaces (id, project_id, agent_id, repo_root, workspace_path, base_branch, status)
    VALUES ('ws-1', 'proj-1', 'agent-1', '/repo', '/ws', 'main', 'planned')
  `);
  db.prepare(
    `UPDATE agent_workspaces SET pane_id = ?, terminal_id = ?, opencode_pid = ? WHERE id = ?`
  ).run('pane-abc', 'term-123', 42, 'ws-1');
  const row = db
    .prepare('SELECT pane_id, terminal_id, opencode_pid FROM agent_workspaces WHERE id = ?')
    .get('ws-1');
  assert.equal(row.pane_id, 'pane-abc');
  assert.equal(row.terminal_id, 'term-123');
  assert.equal(row.opencode_pid, 42);
  db.close();
});

// ---------------------------------------------------------------------------
// PTY-2: updateWorkspacePtyIdentity + clearWorkspacePtyIdentity domain ops
// Task 3.3 RED + 3.4 RED
// ---------------------------------------------------------------------------

test('updateWorkspacePtyIdentity updates PTY columns on a workspace', () => {
  const { ensureRuntimeSchema, updateWorkspacePtyIdentity } = require('../localDb');
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  ensureRuntimeSchema(db);

  db.exec(`INSERT INTO projects (id, name) VALUES ('proj-1', 'Test Project')`);
  db.exec(`
    INSERT INTO agent_workspaces (id, project_id, agent_id, repo_root, workspace_path, base_branch, status)
    VALUES ('ws-pty-1', 'proj-1', 'agent-1', '/repo', '/ws', 'main', 'planned')
  `);

  updateWorkspacePtyIdentity(db, {
    workspaceId: 'ws-pty-1',
    paneId: 'pane-x1',
    terminalId: 'term-y2',
    opencodePid: 12345,
  });

  const row = db
    .prepare('SELECT pane_id, terminal_id, opencode_pid FROM agent_workspaces WHERE id = ?')
    .get('ws-pty-1');
  assert.equal(row.pane_id, 'pane-x1');
  assert.equal(row.terminal_id, 'term-y2');
  assert.equal(row.opencode_pid, 12345);
  db.close();
});

test('updateWorkspacePtyIdentity sets unspecified PTY fields to NULL', () => {
  const { ensureRuntimeSchema, updateWorkspacePtyIdentity } = require('../localDb');
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  ensureRuntimeSchema(db);

  db.exec(`INSERT INTO projects (id, name) VALUES ('proj-1', 'Test Project')`);
  db.exec(`
    INSERT INTO agent_workspaces (id, project_id, agent_id, repo_root, workspace_path, base_branch, status)
    VALUES ('ws-pty-2', 'proj-1', 'agent-1', '/repo', '/ws', 'main', 'planned')
  `);

  // First set all PTY fields
  updateWorkspacePtyIdentity(db, {
    workspaceId: 'ws-pty-2',
    paneId: 'pane-old',
    terminalId: 'term-old',
    opencodePid: 999,
  });

  // Now update with only paneId — others should go to NULL
  updateWorkspacePtyIdentity(db, {
    workspaceId: 'ws-pty-2',
    paneId: 'pane-new',
  });

  const row = db
    .prepare('SELECT pane_id, terminal_id, opencode_pid FROM agent_workspaces WHERE id = ?')
    .get('ws-pty-2');
  assert.equal(row.pane_id, 'pane-new');
  assert.equal(row.terminal_id, null, 'terminal_id should be NULL when not provided');
  assert.equal(row.opencode_pid, null, 'opencode_pid should be NULL when not provided');
  db.close();
});

test('clearWorkspacePtyIdentity sets all PTY columns to NULL', () => {
  const {
    ensureRuntimeSchema,
    updateWorkspacePtyIdentity,
    clearWorkspacePtyIdentity,
  } = require('../localDb');
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  ensureRuntimeSchema(db);

  db.exec(`INSERT INTO projects (id, name) VALUES ('proj-1', 'Test Project')`);
  db.exec(`
    INSERT INTO agent_workspaces (id, project_id, agent_id, repo_root, workspace_path, base_branch, status,
      branch_name, worktree_path, observed_branch, observed_head)
    VALUES ('ws-pty-3', 'proj-1', 'agent-1', '/repo', '/ws', 'main', 'active',
      'feature/x', '/wt', 'feature/x', 'abc123')
  `);

  // Set PTY fields first
  updateWorkspacePtyIdentity(db, {
    workspaceId: 'ws-pty-3',
    paneId: 'pane-clear',
    terminalId: 'term-clear',
    opencodePid: 777,
  });

  // Clear them
  clearWorkspacePtyIdentity(db, 'ws-pty-3');

  const row = db
    .prepare('SELECT pane_id, terminal_id, opencode_pid FROM agent_workspaces WHERE id = ?')
    .get('ws-pty-3');
  assert.equal(row.pane_id, null);
  assert.equal(row.terminal_id, null);
  assert.equal(row.opencode_pid, null);
  db.close();
});

// ---------------------------------------------------------------------------
// EVT-1: agent_events table creation
// Task 3.6 RED + 3.7 RED
// ---------------------------------------------------------------------------

test('agent_events table exists after ensureRuntimeSchema', () => {
  const db = createTestDb();
  const result = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='agent_events'")
    .get();
  assert.ok(result, 'agent_events table must exist');
  db.close();
});

test('agent_events has all required columns', () => {
  const db = createTestDb();
  const columns = db.pragma('table_info(agent_events)').map((c) => c.name);
  const required = [
    'id',
    'agent_id',
    'workspace_id',
    'event_type',
    'payload_json',
    'mission_id',
    'client_event_id',
    'created_at',
  ];
  for (const col of required) {
    assert.ok(columns.includes(col), `agent_events must have ${col} column`);
  }
  db.close();
});

test('agent_events id is INTEGER PRIMARY KEY AUTOINCREMENT', () => {
  const db = createTestDb();
  const columns = db.pragma('table_info(agent_events)');
  const idCol = columns.find((c) => c.name === 'id');
  assert.ok(idCol, 'id column must exist');
  assert.equal(idCol.type, 'INTEGER', 'id must be INTEGER');
  assert.equal(idCol.pk, 1, 'id must be PRIMARY KEY');
  db.close();
});

test('agent_events id auto-increments', () => {
  const db = createTestDb();
  const result = db
    .prepare(
      `INSERT INTO agent_events (agent_id, event_type, created_at) VALUES (?, ?, datetime('now'))`
    )
    .run('agent-auto', 'agent_booted');
  assert.ok(result.lastInsertRowid > 0, 'auto-increment id must be positive integer');
  db.close();
});

test('agent_events event_type has CHECK constraint rejecting unknown types', () => {
  const db = createTestDb();
  // Valid event type should succeed
  db.exec(`
    INSERT INTO agent_events (agent_id, event_type, created_at)
    VALUES ('agent-1', 'agent_booted', datetime('now'))
  `);

  // Invalid event type should be rejected by CHECK constraint
  assert.throws(
    () => {
      db.exec(`
      INSERT INTO agent_events (agent_id, event_type, created_at)
      VALUES ('agent-1', 'invalid_type', datetime('now'))
    `);
    },
    /CHECK|constraint/i,
    'agent_events must reject unknown event_type values'
  );
  db.close();
});

test('agent_events has required indexes', () => {
  const db = createTestDb();
  const indexes = db.pragma('index_list(agent_events)').map((idx) => idx.name);
  assert.ok(indexes.includes('idx_agent_events_agent_id'), 'must have idx_agent_events_agent_id');
  assert.ok(indexes.includes('idx_agent_events_type'), 'must have idx_agent_events_type');
  assert.ok(
    indexes.includes('idx_agent_events_created_at'),
    'must have idx_agent_events_created_at'
  );
  assert.ok(
    indexes.includes('idx_agent_events_client_event_id'),
    'must have idx_agent_events_client_event_id'
  );
  db.close();
});

test('agent_events workspace_id is nullable', () => {
  const db = createTestDb();
  // workspace_id should be nullable
  db.exec(`
    INSERT INTO agent_events (agent_id, event_type, created_at)
    VALUES ('agent-1', 'agent_booted', datetime('now'))
  `);
  const row = db.prepare('SELECT workspace_id FROM agent_events WHERE agent_id = ?').get('agent-1');
  assert.equal(row.workspace_id, null, 'workspace_id should accept NULL');
  db.close();
});

test('agent_events client_event_id is nullable', () => {
  const db = createTestDb();
  db.exec(`
    INSERT INTO agent_events (agent_id, event_type, created_at)
    VALUES ('agent-1', 'agent_shutdown', datetime('now'))
  `);
  const row = db
    .prepare('SELECT client_event_id FROM agent_events WHERE agent_id = ?')
    .get('agent-1');
  assert.equal(row.client_event_id, null, 'client_event_id should accept NULL');
  db.close();
});

test('agent_events all valid event_types are accepted', () => {
  const db = createTestDb();
  const validTypes = [
    'agent_booted',
    'agent_shutdown',
    'workspace_orphaned',
    'quota_blocked',
    'supervisor_action',
    'mission_joined',
    'mission_left',
  ];
  for (let i = 0; i < validTypes.length; i++) {
    const eventType = validTypes[i];
    db.exec(`
      INSERT INTO agent_events (agent_id, event_type, created_at)
      VALUES ('agent-1', '${eventType}', datetime('now'))
    `);
  }
  const count = db.prepare('SELECT count(*) as c FROM agent_events').get().c;
  assert.equal(count, validTypes.length, 'all valid event types should be accepted');
  db.close();
});
