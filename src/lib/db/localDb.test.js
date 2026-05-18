const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const {
  AGENT_WORKSPACE_BASE_COMMIT,
  buildPrepareAgentWorkspaceAck,
  ensureRuntimeSchema,
  prepareAgentWorkspaceLease,
} = require('./localDb.js');
const { applyTestSchema } = require('../../../lib/test-schema.js');

const FROZEN_BASE_COMMIT = AGENT_WORKSPACE_BASE_COMMIT;

function createWorkspaceRow(overrides = {}) {
  const has = (key) => Object.prototype.hasOwnProperty.call(overrides, key);
  return {
    id: overrides.id || 'ws-1',
    project_id: overrides.project_id || 'project-1',
    agent_id: overrides.agent_id || 'agent-1',
    current_task_id: overrides.current_task_id || 'task-1',
    run_id_or_session_id: overrides.run_id_or_session_id || 'run-1',
    repo_root: overrides.repo_root || '/repo/devhub',
    workspace_path: overrides.workspace_path || 'workspace://project-1/ws-1',
    worktree_path: has('worktree_path') ? overrides.worktree_path : '.worktrees/devhub/ws-1',
    base_branch: overrides.base_branch || 'main',
    base_commit: overrides.base_commit || FROZEN_BASE_COMMIT,
    branch_name: has('branch_name') ? overrides.branch_name : 'agent/agent-1/task-1--ws-1',
    status: overrides.status || 'planned',
    observed_branch: overrides.observed_branch ?? null,
    observed_head: overrides.observed_head ?? null,
    observed_dirty: overrides.observed_dirty ?? null,
    last_error: overrides.last_error ?? null,
    last_error_class: overrides.last_error_class ?? null,
    recovery_reason: overrides.recovery_reason ?? null,
    evidence_ref: overrides.evidence_ref ?? null,
    reservation_token: overrides.reservation_token ?? null,
    correlation_id: overrides.correlation_id ?? null,
    accepted_at: overrides.accepted_at ?? null,
    claimed_at: overrides.claimed_at ?? null,
    started_at: overrides.started_at ?? null,
    updated_at: overrides.updated_at ?? null,
    completed_at: overrides.completed_at ?? null,
  };
}

function insertWorkspace(db, overrides = {}) {
  const row = createWorkspaceRow(overrides);
  const keys = Object.keys(row);
  const values = keys.map((key) => row[key]);
  db.prepare(
    `INSERT INTO agent_workspaces (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`
  ).run(...values);
  return row;
}

function createLegacyProjectsDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE projects (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      name TEXT NOT NULL,
      description TEXT,
      color TEXT DEFAULT '#58A6FF',
      status TEXT DEFAULT 'active',
      progress INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      planning_prompt TEXT,
      planning_status TEXT DEFAULT 'none',
      project_type TEXT DEFAULT 'software',
      local_path TEXT
    );
  `);
  return db;
}

test('adds documentation_policy to legacy projects tables', () => {
  const db = createLegacyProjectsDb();

  assert.doesNotThrow(() => ensureRuntimeSchema(db));

  const columns = db.prepare('PRAGMA table_info(projects)').all();
  const documentationPolicy = columns.find((column) => column.name === 'documentation_policy');

  assert.ok(documentationPolicy);
  assert.equal(documentationPolicy.dflt_value, "'personal'");

  db.prepare('INSERT INTO projects (id, name) VALUES (?, ?)').run('project-1', 'Legacy Project');
  const row = db.prepare('SELECT documentation_policy FROM projects WHERE id = ?').get('project-1');

  assert.equal(row.documentation_policy, 'personal');

  db.close();
});

test('adds documentation_policy to legacy projects tables via test schema helper', () => {
  const db = createLegacyProjectsDb();

  assert.doesNotThrow(() => applyTestSchema(db));

  const columns = db.prepare('PRAGMA table_info(projects)').all();
  const documentationPolicy = columns.find((column) => column.name === 'documentation_policy');

  assert.ok(documentationPolicy);
  assert.equal(documentationPolicy.dflt_value, "'personal'");

  db.prepare('INSERT INTO projects (id, name) VALUES (?, ?)').run('project-2', 'Helper Project');
  const row = db.prepare('SELECT documentation_policy FROM projects WHERE id = ?').get('project-2');

  assert.equal(row.documentation_policy, 'personal');

  db.close();
});

test('creates agent_workspaces schema with frozen baseline and logical workspace path', () => {
  const db = new Database(':memory:');

  ensureRuntimeSchema(db);

  const columns = db.prepare('PRAGMA table_info(agent_workspaces)').all();
  const columnNames = columns.map((column) => column.name);

  assert.equal(
    JSON.stringify(columnNames),
    JSON.stringify([
      'id',
      'project_id',
      'agent_id',
      'current_task_id',
      'run_id_or_session_id',
      'repo_root',
      'workspace_path',
      'worktree_path',
      'base_branch',
      'base_commit',
      'branch_name',
      'status',
      'observed_branch',
      'observed_head',
      'observed_dirty',
      'last_error',
      'last_error_class',
      'recovery_reason',
      'evidence_ref',
      'reservation_token',
      'correlation_id',
      'accepted_at',
      'claimed_at',
      'started_at',
      'updated_at',
      'completed_at',
      'created_at',
    ])
  );

  const row = insertWorkspace(db, {
    status: 'planned',
    workspace_path: 'workspace://project-1/ws-1',
    worktree_path: null,
  });

  const stored = db.prepare('SELECT * FROM agent_workspaces WHERE id = ?').get(row.id);

  assert.equal(stored.base_commit, FROZEN_BASE_COMMIT);
  assert.equal(stored.workspace_path, 'workspace://project-1/ws-1');
  assert.equal(stored.worktree_path, null);

  db.close();
});

test('preserves observed_dirty dirty-excluded verbatim', () => {
  const db = new Database(':memory:');

  ensureRuntimeSchema(db);
  insertWorkspace(db, {
    id: 'ws-dirty',
    status: 'active',
    observed_branch: 'agent/agent-1/task-1--ws-dirty',
    observed_head: 'abc123',
    observed_dirty: 'dirty-excluded',
  });

  const stored = db
    .prepare('SELECT observed_dirty FROM agent_workspaces WHERE id = ?')
    .get('ws-dirty');

  assert.equal(stored.observed_dirty, 'dirty-excluded');

  db.close();
});

test('guards non-terminal agent task ownership and reserved names', () => {
  const db = new Database(':memory:');

  ensureRuntimeSchema(db);
  insertWorkspace(db, {
    id: 'ws-owner-a',
    agent_id: 'agent-1',
    current_task_id: 'task-1',
    branch_name: 'agent/agent-1/task-1--aaaa1111',
    worktree_path: '.worktrees/devhub/ws-owner-a',
  });

  assert.throws(
    () =>
      insertWorkspace(db, {
        id: 'ws-owner-b',
        agent_id: 'agent-1',
        current_task_id: 'task-1',
        branch_name: 'agent/agent-1/task-2--bbbb2222',
        worktree_path: '.worktrees/devhub/ws-owner-b',
      }),
    /UNIQUE constraint failed: agent_workspaces\.agent_id, agent_workspaces\.current_task_id/
  );

  assert.throws(
    () =>
      insertWorkspace(db, {
        id: 'ws-branch-collision',
        agent_id: 'agent-2',
        current_task_id: 'task-2',
        branch_name: 'agent/agent-1/task-1--aaaa1111',
        worktree_path: '.worktrees/devhub/ws-branch-collision',
      }),
    /UNIQUE constraint failed: agent_workspaces\.branch_name/
  );

  assert.throws(
    () =>
      insertWorkspace(db, {
        id: 'ws-worktree-collision',
        agent_id: 'agent-3',
        current_task_id: 'task-3',
        branch_name: 'agent/agent-3/task-3--cccc3333',
        worktree_path: '.worktrees/devhub/ws-owner-a',
      }),
    /UNIQUE constraint failed: agent_workspaces\.worktree_path/
  );

  db.close();
});

test('requires observed fields before ready or active states', () => {
  const db = new Database(':memory:');

  ensureRuntimeSchema(db);

  assert.throws(
    () =>
      insertWorkspace(db, {
        id: 'ws-ready-invalid',
        status: 'ready',
        observed_branch: null,
        observed_head: null,
      }),
    /CHECK constraint failed/
  );

  assert.doesNotThrow(() =>
    insertWorkspace(db, {
      id: 'ws-ready-valid',
      status: 'ready',
      observed_branch: 'agent/agent-1/task-1--ready',
      observed_head: 'def456',
      worktree_path: '.worktrees/devhub/ws-ready-valid',
      branch_name: 'agent/agent-1/task-1--ready',
    })
  );

  db.close();
});

test('prevents mutation after terminal outcome', () => {
  const db = new Database(':memory:');

  ensureRuntimeSchema(db);
  insertWorkspace(db, {
    id: 'ws-terminal',
    status: 'completed',
    observed_branch: 'agent/agent-1/task-1--terminal',
    observed_head: '987654',
    observed_dirty: 'dirty-excluded',
    completed_at: '2026-05-18T20:00:00.000Z',
  });

  assert.throws(
    () =>
      db
        .prepare('UPDATE agent_workspaces SET observed_head = ?, last_error = ? WHERE id = ?')
        .run('new-head', 'should not mutate', 'ws-terminal'),
    /agent_workspaces_terminal_immutable/
  );

  const stored = db
    .prepare('SELECT observed_head, last_error FROM agent_workspaces WHERE id = ?')
    .get('ws-terminal');

  assert.equal(stored.observed_head, '987654');
  assert.equal(stored.last_error, null);

  db.close();
});

test('prepareAgentWorkspaceLease rejects ambiguous identity forms', () => {
  const db = new Database(':memory:');

  ensureRuntimeSchema(db);

  assert.throws(
    () =>
      prepareAgentWorkspaceLease(db, {
        task_id: 'task-1',
        correlation_id: 'corr-missing-agent',
      }),
    /task_id y agent_id deben enviarse juntos/i
  );

  assert.throws(
    () =>
      prepareAgentWorkspaceLease(db, {
        workspace_id: 'ws-1',
        task_id: 'task-1',
        agent_id: 'agent-1',
        correlation_id: 'corr-mixed',
      }),
    /workspace_id no puede combinarse/i
  );

  db.close();
});

test('prepareAgentWorkspaceLease defaults baseline and stores durable-only metadata', () => {
  const db = new Database(':memory:');

  ensureRuntimeSchema(db);
  db.exec('CREATE TABLE tasks (id TEXT PRIMARY KEY, project_id TEXT NOT NULL)');
  db.prepare('INSERT INTO tasks (id, project_id) VALUES (?, ?)').run(
    'task-prepare-1',
    'project-prepare'
  );

  const result = prepareAgentWorkspaceLease(db, {
    task_id: 'task-prepare-1',
    agent_id: 'agent-prepare-1',
    correlation_id: 'corr-prepare-1',
  });

  assert.equal(result.created, true);
  assert.equal(result.ack.requested_base_ref, FROZEN_BASE_COMMIT);
  assert.equal(result.ack.status, 'provisioning');
  assert.equal(result.workspace.last_error_class, null);
  assert.equal(result.workspace.reservation_token.startsWith('rsv-'), true);
  assert.equal(result.workspace.correlation_id, 'corr-prepare-1');
  assert.equal(result.workspace.accepted_at, result.ack.accepted_at);
  assert.equal(result.workspace.observed_branch, null);
  assert.equal(result.workspace.observed_head, null);
  assert.equal(result.workspace.observed_dirty, null);
  assert.equal(result.workspace.worktree_path, null);
  assert.equal(
    result.workspace.workspace_path,
    'workspace://project-prepare/workspace-task-prepare-1-agent-prepare-1'
  );

  db.close();
});

test('prepareAgentWorkspaceLease is idempotent by workspace_id plus correlation_id', () => {
  const db = new Database(':memory:');

  ensureRuntimeSchema(db);
  insertWorkspace(db, {
    id: 'ws-idempotent',
    project_id: 'project-1',
    agent_id: 'agent-1',
    current_task_id: 'task-1',
    status: 'provisioning',
    branch_name: null,
    worktree_path: null,
    reservation_token: 'rsv-fixed',
    correlation_id: 'corr-fixed',
    accepted_at: '2026-05-18T22:00:00.000Z',
  });

  const result = prepareAgentWorkspaceLease(db, {
    workspace_id: 'ws-idempotent',
    correlation_id: 'corr-fixed',
  });

  assert.equal(result.reused, true);
  assert.equal(result.ack.workspace_id, 'ws-idempotent');
  assert.equal(result.ack.correlation_id, 'corr-fixed');
  assert.equal(result.ack.reservation_token, 'rsv-fixed');

  db.close();
});

test('buildPrepareAgentWorkspaceAck exposes opaque correlation fields only', () => {
  const ack = buildPrepareAgentWorkspaceAck({
    id: 'ws-ack-1',
    current_task_id: 'task-ack-1',
    agent_id: 'agent-ack-1',
    base_commit: FROZEN_BASE_COMMIT,
    reservation_token: 'rsv-ack-1',
    correlation_id: 'corr-ack-1',
    status: 'ready',
    accepted_at: '2026-05-18T22:10:00.000Z',
    observed_branch: 'agent/ack',
    observed_head: 'abc123',
    worktree_path: '.worktrees/ack',
    evidence_ref: 'evidence://ack',
  });

  assert.deepEqual(Object.keys(ack).sort(), [
    'accepted_at',
    'agent_id',
    'correlation_id',
    'requested_base_ref',
    'reservation_token',
    'status',
    'task_id',
    'workspace_id',
  ]);
  assert.equal(ack.workspace_id, 'ws-ack-1');
  assert.equal(ack.task_id, 'task-ack-1');
  assert.equal(ack.agent_id, 'agent-ack-1');
  assert.equal(ack.requested_base_ref, FROZEN_BASE_COMMIT);
});
