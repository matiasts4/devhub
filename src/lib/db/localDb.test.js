const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const {
  AGENT_WORKSPACE_BASE_COMMIT,
  buildPrepareAgentWorkspaceAck,
  createMissionMessage,
  createSwarmMission,
  buildSupervisorApprovalCheckpointKey,
  ensureRuntimeSchema,
  getAgentPresenceStatus,
  getSwarmMissionDirectorSnapshot,
  getSupervisorApprovalCheckpoint,
  getSupervisorSnapshot,
  listSupervisorApprovalCheckpoints,
  registerMissionParticipant,
  upsertAgentPresence,
  upsertMessageDelivery,
  prepareAgentWorkspaceLease,
  upsertSupervisorApprovalCheckpoint,
  upsertSupervisorSnapshot,
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

test('creates supervisor snapshot projection tables without git ownership fields', () => {
  const db = new Database(':memory:');

  ensureRuntimeSchema(db);

  const snapshotColumns = db
    .prepare('PRAGMA table_info(supervisor_snapshots)')
    .all()
    .map((column) => column.name);
  const approvalColumns = db
    .prepare('PRAGMA table_info(supervisor_approval_checkpoints)')
    .all()
    .map((column) => column.name);

  assert.equal(
    JSON.stringify(snapshotColumns),
    JSON.stringify([
      'task_id',
      'supervisor_state',
      'outcome',
      'reason_class',
      'task_retry_count',
      'attempt_count',
      'unchanged_failure_count',
      'approval_request_count',
      'orphan_recovery_count',
      'workspace_id',
      'run_id',
      'evidence_ref',
      'approval_checkpoint_key',
      'created_at',
      'updated_at',
    ])
  );
  assert.equal(
    JSON.stringify(approvalColumns),
    JSON.stringify([
      'checkpoint_key',
      'task_id',
      'workspace_id',
      'run_id',
      'reason_class',
      'evidence_ref',
      'status',
      'requested_at',
      'decided_at',
      'decision_note',
      'created_at',
      'updated_at',
    ])
  );
  assert.equal(snapshotColumns.includes('branch_name'), false);
  assert.equal(snapshotColumns.includes('worktree_path'), false);
  assert.equal(snapshotColumns.includes('repo_root'), false);
  assert.equal(approvalColumns.includes('branch_name'), false);
  assert.equal(approvalColumns.includes('worktree_path'), false);

  db.close();
});

test('applyTestSchema mirrors supervisor snapshot projection tables', () => {
  const db = new Database(':memory:');

  applyTestSchema(db);

  const snapshotColumns = db
    .prepare('PRAGMA table_info(supervisor_snapshots)')
    .all()
    .map((column) => column.name);
  const approvalColumns = db
    .prepare('PRAGMA table_info(supervisor_approval_checkpoints)')
    .all()
    .map((column) => column.name);

  assert.equal(snapshotColumns.length > 0, true);
  assert.equal(approvalColumns.length > 0, true);
  assert.equal(snapshotColumns.includes('approval_checkpoint_key'), true);
  assert.equal(approvalColumns.includes('checkpoint_key'), true);

  db.close();
});

test('stores supervisor snapshots with reason and evidence fields', () => {
  const db = new Database(':memory:');

  ensureRuntimeSchema(db);
  insertWorkspace(db, {
    id: 'ws-supervisor-1',
    current_task_id: 'task-supervisor-1',
  });
  db.prepare(
    `INSERT INTO agent_runs (
      run_id, workspace_id, task_id, agent_id, requested_base_ref, baseline_commit, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    'run-supervisor-1',
    'ws-supervisor-1',
    'task-supervisor-1',
    'agent-1',
    FROZEN_BASE_COMMIT,
    FROZEN_BASE_COMMIT,
    'running'
  );

  const snapshot = upsertSupervisorSnapshot(db, {
    task_id: 'task-supervisor-1',
    supervisor_state: 'awaiting_approval',
    outcome: 'request_approval',
    reason_class: 'approval_required',
    task_retry_count: 2,
    attempt_count: 3,
    unchanged_failure_count: 1,
    approval_request_count: 1,
    orphan_recovery_count: 0,
    workspace_id: 'ws-supervisor-1',
    run_id: 'run-supervisor-1',
    evidence_ref: 'evidence://supervisor/task-supervisor-1',
  });

  const stored = getSupervisorSnapshot(db, 'task-supervisor-1');

  assert.equal(snapshot.task_id, 'task-supervisor-1');
  assert.equal(stored.supervisor_state, 'awaiting_approval');
  assert.equal(stored.outcome, 'request_approval');
  assert.equal(stored.reason_class, 'approval_required');
  assert.equal(stored.workspace_id, 'ws-supervisor-1');
  assert.equal(stored.run_id, 'run-supervisor-1');
  assert.equal(stored.evidence_ref, 'evidence://supervisor/task-supervisor-1');
  assert.equal(stored.task_retry_count, 2);
  assert.equal(stored.attempt_count, 3);
  assert.equal(stored.unchanged_failure_count, 1);
  assert.equal(stored.approval_request_count, 1);

  db.close();
});

test('builds deterministic approval checkpoint keys from task workspace run and evidence', () => {
  const db = new Database(':memory:');

  ensureRuntimeSchema(db);
  insertWorkspace(db, {
    id: 'ws-supervisor-2',
    current_task_id: 'task-supervisor-2',
  });
  db.prepare(
    `INSERT INTO agent_runs (
      run_id, workspace_id, task_id, agent_id, requested_base_ref, baseline_commit, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    'run-supervisor-2',
    'ws-supervisor-2',
    'task-supervisor-2',
    'agent-1',
    FROZEN_BASE_COMMIT,
    FROZEN_BASE_COMMIT,
    'running'
  );

  const checkpointKey = buildSupervisorApprovalCheckpointKey({
    task_id: 'task-supervisor-2',
    workspace_id: 'ws-supervisor-2',
    run_id: 'run-supervisor-2',
    reason_class: 'approval_required',
    evidence_ref: 'evidence://supervisor/task-supervisor-2',
  });

  const checkpoint = upsertSupervisorApprovalCheckpoint(db, {
    task_id: 'task-supervisor-2',
    workspace_id: 'ws-supervisor-2',
    run_id: 'run-supervisor-2',
    reason_class: 'approval_required',
    evidence_ref: 'evidence://supervisor/task-supervisor-2',
  });

  const stored = getSupervisorApprovalCheckpoint(db, checkpointKey);

  assert.equal(checkpoint.checkpoint_key, checkpointKey);
  assert.equal(stored.checkpoint_key, checkpointKey);
  assert.equal(stored.status, 'pending');
  assert.equal(stored.reason_class, 'approval_required');
  assert.equal(stored.workspace_id, 'ws-supervisor-2');
  assert.equal(stored.run_id, 'run-supervisor-2');
  assert.equal(stored.evidence_ref, 'evidence://supervisor/task-supervisor-2');

  db.close();
});

test('persists approval decisions with auditable timestamps', () => {
  const db = new Database(':memory:');

  ensureRuntimeSchema(db);
  insertWorkspace(db, {
    id: 'ws-supervisor-3',
    current_task_id: 'task-supervisor-3',
  });
  db.prepare(
    `INSERT INTO agent_runs (
      run_id, workspace_id, task_id, agent_id, requested_base_ref, baseline_commit, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    'run-supervisor-3',
    'ws-supervisor-3',
    'task-supervisor-3',
    'agent-1',
    FROZEN_BASE_COMMIT,
    FROZEN_BASE_COMMIT,
    'running'
  );

  const pending = upsertSupervisorApprovalCheckpoint(db, {
    task_id: 'task-supervisor-3',
    workspace_id: 'ws-supervisor-3',
    run_id: 'run-supervisor-3',
    reason_class: 'approval_required',
    evidence_ref: 'evidence://supervisor/task-supervisor-3',
    status: 'pending',
    requested_at: '2026-05-19T01:00:00.000Z',
    updated_at: '2026-05-19T01:00:00.000Z',
  });

  const approved = upsertSupervisorApprovalCheckpoint(db, {
    task_id: 'task-supervisor-3',
    workspace_id: 'ws-supervisor-3',
    run_id: 'run-supervisor-3',
    reason_class: 'approval_required',
    evidence_ref: 'evidence://supervisor/task-supervisor-3',
    status: 'approved',
    decision_note: 'Approved by human supervisor',
    updated_at: '2026-05-19T01:05:00.000Z',
  });

  assert.equal(approved.checkpoint_key, pending.checkpoint_key);
  assert.equal(approved.status, 'approved');
  assert.equal(approved.requested_at, '2026-05-19T01:00:00.000Z');
  assert.equal(approved.decided_at, '2026-05-19T01:05:00.000Z');
  assert.equal(approved.decision_note, 'Approved by human supervisor');

  db.close();
});

test('lists approval checkpoints newest-first so pending and approved audit records stay queryable', () => {
  const db = new Database(':memory:');

  ensureRuntimeSchema(db);
  insertWorkspace(db, {
    id: 'ws-supervisor-4',
    current_task_id: 'task-supervisor-4',
  });
  db.prepare(
    `INSERT INTO agent_runs (
      run_id, workspace_id, task_id, agent_id, requested_base_ref, baseline_commit, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    'run-supervisor-4',
    'ws-supervisor-4',
    'task-supervisor-4',
    'agent-1',
    FROZEN_BASE_COMMIT,
    FROZEN_BASE_COMMIT,
    'running'
  );

  upsertSupervisorApprovalCheckpoint(db, {
    task_id: 'task-supervisor-4',
    workspace_id: 'ws-supervisor-4',
    run_id: 'run-supervisor-4',
    reason_class: 'approval_required',
    evidence_ref: 'evidence://supervisor/task-supervisor-4/pending',
    status: 'pending',
    requested_at: '2026-05-19T02:00:00.000Z',
    updated_at: '2026-05-19T02:00:00.000Z',
  });
  upsertSupervisorApprovalCheckpoint(db, {
    task_id: 'task-supervisor-4',
    workspace_id: 'ws-supervisor-4',
    run_id: 'run-supervisor-4',
    reason_class: 'approval_required',
    evidence_ref: 'evidence://supervisor/task-supervisor-4/approved',
    status: 'approved',
    decision_note: 'Approved after review',
    requested_at: '2026-05-19T02:05:00.000Z',
    updated_at: '2026-05-19T02:06:00.000Z',
    decided_at: '2026-05-19T02:06:00.000Z',
  });

  const checkpoints = listSupervisorApprovalCheckpoints(db, {
    task_id: 'task-supervisor-4',
    limit: 2,
  });

  assert.equal(checkpoints.length, 2);
  assert.equal(checkpoints[0].status, 'approved');
  assert.equal(checkpoints[0].decision_note, 'Approved after review');
  assert.equal(checkpoints[1].status, 'pending');
  assert.equal(checkpoints[1].evidence_ref, 'evidence://supervisor/task-supervisor-4/pending');

  db.close();
});

test('stores unchanged_failure supervisor snapshots with durable counters and evidence refs', () => {
  const db = new Database(':memory:');

  ensureRuntimeSchema(db);
  insertWorkspace(db, {
    id: 'ws-supervisor-5',
    current_task_id: 'task-supervisor-5',
  });
  db.prepare(
    `INSERT INTO agent_runs (
      run_id, workspace_id, task_id, agent_id, requested_base_ref, baseline_commit, status, terminal_reason_class
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    'run-supervisor-5',
    'ws-supervisor-5',
    'task-supervisor-5',
    'agent-1',
    FROZEN_BASE_COMMIT,
    FROZEN_BASE_COMMIT,
    'failed',
    'recoverable_failure'
  );

  upsertSupervisorSnapshot(db, {
    task_id: 'task-supervisor-5',
    supervisor_state: 'blocked',
    outcome: 'block',
    reason_class: 'unchanged_failure',
    task_retry_count: 2,
    attempt_count: 3,
    unchanged_failure_count: 1,
    approval_request_count: 0,
    orphan_recovery_count: 0,
    workspace_id: 'ws-supervisor-5',
    run_id: 'run-supervisor-5',
    evidence_ref: 'evidence://supervisor/task-supervisor-5/repeat',
  });

  const stored = getSupervisorSnapshot(db, 'task-supervisor-5');

  assert.equal(stored.supervisor_state, 'blocked');
  assert.equal(stored.outcome, 'block');
  assert.equal(stored.reason_class, 'unchanged_failure');
  assert.equal(stored.attempt_count, 3);
  assert.equal(stored.task_retry_count, 2);
  assert.equal(stored.unchanged_failure_count, 1);
  assert.equal(stored.evidence_ref, 'evidence://supervisor/task-supervisor-5/repeat');

  db.close();
});

test('creates swarm mission kernel tables with compact coordination-only fields', () => {
  const db = new Database(':memory:');

  ensureRuntimeSchema(db);

  const missionColumns = db
    .prepare('PRAGMA table_info(swarm_missions)')
    .all()
    .map((column) => column.name);
  const participantColumns = db
    .prepare('PRAGMA table_info(mission_participants)')
    .all()
    .map((column) => column.name);
  const messageColumns = db
    .prepare('PRAGMA table_info(mission_messages)')
    .all()
    .map((column) => column.name);
  const deliveryColumns = db
    .prepare('PRAGMA table_info(message_deliveries)')
    .all()
    .map((column) => column.name);
  const presenceColumns = db
    .prepare('PRAGMA table_info(agent_presence)')
    .all()
    .map((column) => column.name);

  assert.equal(
    JSON.stringify(missionColumns),
    JSON.stringify([
      'mission_id',
      'project_id',
      'task_id',
      'workspace_id',
      'run_id',
      'approval_checkpoint_key',
      'owner_agent_id',
      'kind',
      'status',
      'title',
      'summary',
      'evidence_ref',
      'started_at',
      'updated_at',
      'completed_at',
      'created_at',
    ])
  );
  assert.equal(
    JSON.stringify(participantColumns),
    JSON.stringify([
      'participant_id',
      'mission_id',
      'agent_id',
      'role_in_mission',
      'status',
      'joined_at',
      'left_at',
      'created_at',
      'updated_at',
    ])
  );
  assert.equal(
    JSON.stringify(messageColumns),
    JSON.stringify([
      'message_id',
      'mission_id',
      'sender_agent_id',
      'message_kind',
      'body_summary',
      'evidence_ref',
      'related_task_id',
      'related_workspace_id',
      'related_run_id',
      'related_artifact_id',
      'related_approval_checkpoint_key',
      'created_at',
      'updated_at',
    ])
  );
  assert.equal(
    JSON.stringify(deliveryColumns),
    JSON.stringify([
      'delivery_id',
      'message_id',
      'recipient_agent_id',
      'channel',
      'status',
      'delivery_ref',
      'evidence_ref',
      'last_error',
      'attempt_count',
      'last_attempt_at',
      'acked_at',
      'created_at',
      'updated_at',
    ])
  );
  assert.equal(
    JSON.stringify(presenceColumns),
    JSON.stringify([
      'presence_id',
      'mission_id',
      'agent_id',
      'workspace_id',
      'run_id',
      'runtime_surface',
      'presence_state',
      'status_summary',
      'evidence_ref',
      'last_seen_at',
      'expires_at',
      'created_at',
      'updated_at',
    ])
  );

  assert.equal(missionColumns.includes('branch_name'), false);
  assert.equal(missionColumns.includes('observed_head'), false);
  assert.equal(messageColumns.includes('log_content'), false);
  assert.equal(messageColumns.includes('session_id'), false);
  assert.equal(deliveryColumns.includes('tool_output'), false);
  assert.equal(presenceColumns.includes('terminal_log'), false);

  db.close();
});

test('creates mission, participant, message, delivery and presence with compact durable refs only', () => {
  const db = new Database(':memory:');

  ensureRuntimeSchema(db);
  db.prepare('INSERT INTO projects (id, name) VALUES (?, ?)').run(
    'project-mission',
    'Mission Project'
  );
  insertWorkspace(db, {
    id: 'ws-mission-1',
    project_id: 'project-mission',
    current_task_id: 'task-mission-1',
  });
  db.prepare(
    `INSERT INTO agent_runs (
      run_id, workspace_id, task_id, agent_id, requested_base_ref, baseline_commit, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    'run-mission-1',
    'ws-mission-1',
    'task-mission-1',
    'agent-director',
    FROZEN_BASE_COMMIT,
    FROZEN_BASE_COMMIT,
    'running'
  );
  db.prepare(
    `INSERT INTO agent_artifacts (
      artifact_id, run_id, seq, phase, kind, producer, summary, evidence_ref, observed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    'artifact-mission-1',
    'run-mission-1',
    1,
    'execute',
    'decision.note',
    'executor',
    'Mission evidence',
    'evidence://mission/artifact-1',
    '2026-05-19T10:00:00.000Z'
  );
  upsertSupervisorApprovalCheckpoint(db, {
    task_id: 'task-mission-1',
    workspace_id: 'ws-mission-1',
    run_id: 'run-mission-1',
    reason_class: 'approval_required',
    evidence_ref: 'evidence://mission/approval-1',
    status: 'pending',
    requested_at: '2026-05-19T10:01:00.000Z',
    updated_at: '2026-05-19T10:01:00.000Z',
  });

  const mission = createSwarmMission(db, {
    project_id: 'project-mission',
    task_id: 'task-mission-1',
    workspace_id: 'ws-mission-1',
    run_id: 'run-mission-1',
    approval_checkpoint_key:
      'task-mission-1|ws-mission-1|run-mission-1|approval_required|evidence://mission/approval-1',
    owner_agent_id: 'agent-director',
    kind: 'coordination',
    title: 'SW-8.1C mission',
    summary: 'Minimal mission kernel',
    evidence_ref: 'evidence://mission/root',
    started_at: '2026-05-19T10:00:00.000Z',
    updated_at: '2026-05-19T10:00:00.000Z',
  });
  const participant = registerMissionParticipant(db, {
    mission_id: mission.mission_id,
    agent_id: 'agent-worker-1',
    role_in_mission: 'executor',
    status: 'active',
    joined_at: '2026-05-19T10:02:00.000Z',
  });
  const message = createMissionMessage(db, {
    mission_id: mission.mission_id,
    sender_agent_id: 'agent-director',
    message_kind: 'directive',
    body_summary: 'Implement durable mission kernel',
    evidence_ref: 'evidence://mission/message-1',
    related_task_id: 'task-mission-1',
    related_workspace_id: 'ws-mission-1',
    related_run_id: 'run-mission-1',
    related_artifact_id: 'artifact-mission-1',
    related_approval_checkpoint_key:
      'task-mission-1|ws-mission-1|run-mission-1|approval_required|evidence://mission/approval-1',
    created_at: '2026-05-19T10:03:00.000Z',
    updated_at: '2026-05-19T10:03:00.000Z',
  });
  const delivery = upsertMessageDelivery(db, {
    message_id: message.message_id,
    recipient_agent_id: 'agent-worker-1',
    channel: 'runtime_bus',
    status: 'pending',
    delivery_ref: 'receipt://mission/message-1/agent-worker-1',
    evidence_ref: 'evidence://mission/delivery-1',
    last_attempt_at: '2026-05-19T10:03:30.000Z',
  });
  const presence = upsertAgentPresence(db, {
    mission_id: mission.mission_id,
    agent_id: 'agent-worker-1',
    workspace_id: 'ws-mission-1',
    run_id: 'run-mission-1',
    runtime_surface: 'agenthub',
    presence_state: 'busy',
    status_summary: 'Working on mission kernel',
    evidence_ref: 'evidence://mission/presence-1',
    last_seen_at: '2026-05-19T10:04:00.000Z',
  });

  assert.equal(mission.project_id, 'project-mission');
  assert.equal(mission.workspace_id, 'ws-mission-1');
  assert.equal(mission.run_id, 'run-mission-1');
  assert.equal(participant.agent_id, 'agent-worker-1');
  assert.equal(message.related_artifact_id, 'artifact-mission-1');
  assert.equal(delivery.status, 'pending');
  assert.equal(presence.expires_at, '2026-05-19T10:06:00.000Z');

  const storedMission = db
    .prepare('SELECT * FROM swarm_missions WHERE mission_id = ?')
    .get(mission.mission_id);
  const storedMessage = db
    .prepare('SELECT * FROM mission_messages WHERE message_id = ?')
    .get(message.message_id);

  assert.equal('branch_name' in storedMission, false);
  assert.equal('observed_start_head' in storedMission, false);
  assert.equal('baseline_commit' in storedMission, false);
  assert.equal('tool_output' in storedMessage, false);
  assert.equal('content' in storedMessage, false);

  db.close();
});

test('updates delivery receipts and computes active versus stale presence in mission snapshot', () => {
  const db = new Database(':memory:');

  ensureRuntimeSchema(db);
  db.prepare('INSERT INTO projects (id, name) VALUES (?, ?)').run('project-snapshot', 'Snapshot');
  const mission = createSwarmMission(db, {
    project_id: 'project-snapshot',
    owner_agent_id: 'agent-director',
    kind: 'coordination',
    title: 'Snapshot mission',
    status: 'active',
    started_at: '2026-05-19T11:00:00.000Z',
    updated_at: '2026-05-19T11:00:00.000Z',
  });
  registerMissionParticipant(db, {
    mission_id: mission.mission_id,
    agent_id: 'agent-director',
    role_in_mission: 'director',
    status: 'active',
    joined_at: '2026-05-19T11:00:00.000Z',
  });
  registerMissionParticipant(db, {
    mission_id: mission.mission_id,
    agent_id: 'agent-worker-1',
    role_in_mission: 'executor',
    status: 'active',
    joined_at: '2026-05-19T11:00:05.000Z',
  });
  registerMissionParticipant(db, {
    mission_id: mission.mission_id,
    agent_id: 'agent-reviewer-1',
    role_in_mission: 'reviewer',
    status: 'active',
    joined_at: '2026-05-19T11:00:10.000Z',
  });
  const message = createMissionMessage(db, {
    mission_id: mission.mission_id,
    sender_agent_id: 'agent-director',
    message_kind: 'handoff',
    body_summary: 'Take over execution',
    created_at: '2026-05-19T11:01:00.000Z',
    updated_at: '2026-05-19T11:01:00.000Z',
  });
  upsertMessageDelivery(db, {
    message_id: message.message_id,
    recipient_agent_id: 'agent-worker-1',
    channel: 'runtime_bus',
    status: 'pending',
    last_attempt_at: '2026-05-19T11:01:10.000Z',
  });
  const sentDelivery = upsertMessageDelivery(db, {
    message_id: message.message_id,
    recipient_agent_id: 'agent-worker-1',
    channel: 'runtime_bus',
    status: 'sent',
    last_attempt_at: '2026-05-19T11:01:20.000Z',
  });
  upsertMessageDelivery(db, {
    message_id: message.message_id,
    recipient_agent_id: 'agent-reviewer-1',
    channel: 'telegram',
    status: 'retry_pending',
    last_error: 'adapter timeout',
    last_attempt_at: '2026-05-19T11:01:30.000Z',
  });
  upsertAgentPresence(db, {
    mission_id: mission.mission_id,
    agent_id: 'agent-director',
    runtime_surface: 'agenthub',
    presence_state: 'online',
    last_seen_at: '2026-05-19T11:01:40.000Z',
  });
  upsertAgentPresence(db, {
    mission_id: mission.mission_id,
    agent_id: 'agent-worker-1',
    runtime_surface: 'agenthub',
    presence_state: 'busy',
    last_seen_at: '2026-05-19T10:58:00.000Z',
  });
  upsertAgentPresence(db, {
    mission_id: mission.mission_id,
    agent_id: 'agent-reviewer-1',
    runtime_surface: 'telegram',
    presence_state: 'offline',
    last_seen_at: '2026-05-19T11:01:00.000Z',
  });

  assert.equal(sentDelivery.status, 'sent');
  assert.equal(sentDelivery.acked_at, null);
  assert.equal(
    getAgentPresenceStatus(
      { presence_state: 'busy', last_seen_at: '2026-05-19T10:58:00.000Z' },
      { now: '2026-05-19T11:01:40.000Z' }
    ).effective_state,
    'stale'
  );
  assert.equal(
    getAgentPresenceStatus(
      { presence_state: 'offline', last_seen_at: '2026-05-19T11:01:00.000Z' },
      { now: '2026-05-19T11:01:40.000Z' }
    ).effective_state,
    'offline'
  );

  const snapshot = getSwarmMissionDirectorSnapshot(db, mission.mission_id, {
    now: '2026-05-19T11:01:40.000Z',
  });

  assert.equal(snapshot.mission.mission_id, mission.mission_id);
  assert.equal(snapshot.participants.length, 3);
  assert.equal(snapshot.latest_message.message_id, message.message_id);
  assert.equal(snapshot.pending_deliveries.length, 1);
  assert.equal(snapshot.pending_deliveries[0].status, 'retry_pending');
  assert.equal(snapshot.presence.active.length, 1);
  assert.equal(snapshot.presence.stale.length, 1);
  assert.equal(snapshot.presence.offline.length, 1);

  db.close();
});

test('rejects runtime logs and operational identity metadata in mission kernel payloads', () => {
  const db = new Database(':memory:');

  ensureRuntimeSchema(db);
  db.prepare('INSERT INTO projects (id, name) VALUES (?, ?)').run(
    'project-guardrails',
    'Guardrails'
  );
  const mission = createSwarmMission(db, {
    project_id: 'project-guardrails',
    owner_agent_id: 'agent-director',
    kind: 'coordination',
    title: 'Guardrails mission',
    started_at: '2026-05-19T12:00:00.000Z',
    updated_at: '2026-05-19T12:00:00.000Z',
  });
  const message = createMissionMessage(db, {
    mission_id: mission.mission_id,
    sender_agent_id: 'agent-director',
    message_kind: 'directive',
    body_summary: 'Safe summary',
    created_at: '2026-05-19T12:01:00.000Z',
    updated_at: '2026-05-19T12:01:00.000Z',
  });

  assert.throws(
    () =>
      registerMissionParticipant(db, {
        mission_id: mission.mission_id,
        agent_id: 'agent-worker-2',
        role_in_mission: 'executor',
        profile_key: 'sdd-orchestrator',
      }),
    /identity metadata canónica/i
  );
  assert.throws(
    () =>
      createMissionMessage(db, {
        mission_id: mission.mission_id,
        sender_agent_id: 'agent-director',
        message_kind: 'directive',
        body_summary: 'Unsafe message',
        terminal_log: 'raw terminal output',
      }),
    /runtime-only payload/i
  );
  assert.throws(
    () =>
      upsertMessageDelivery(db, {
        message_id: message.message_id,
        recipient_agent_id: 'agent-worker-2',
        channel: 'runtime_bus',
        status: 'delivered',
      }),
    /status inválido/i
  );

  db.close();
});
