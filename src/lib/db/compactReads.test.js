'use strict';

const Database = require('better-sqlite3');
const { ensureRuntimeSchema, AGENT_WORKSPACE_BASE_COMMIT } = require('./core');
const { applyTestSchema } = require('../../../lib/test-schema');
const {
  readExecutionQueueSummary,
  readWorkspaceEvidenceSummary,
  presentExecutionQueue,
  presentWorkspaceEvidence,
  createDirectorQueueContract,
} = require('./compactReads');

function seedProject(db, id = 'proj-1') {
  db.prepare('INSERT INTO projects (id, name) VALUES (?, ?)').run(id, `Project ${id}`);
}

function ensureTaskTables(db) {
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
      claim_token TEXT
    );

    CREATE TABLE IF NOT EXISTS task_dependencies (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      depends_on TEXT NOT NULL,
      tipo TEXT DEFAULT 'blocks',
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
}

function seedTask(db, projectId, overrides = {}) {
  const row = {
    id: overrides.id || `task-${Math.random().toString(36).slice(2, 8)}`,
    project_id: projectId,
    title: overrides.title || 'Task',
    description: overrides.description || null,
    status: overrides.status || 'pending',
    priority: overrides.priority || 'medium',
    business_value: overrides.business_value ?? 5,
    retry_count: overrides.retry_count ?? 0,
    due_date: overrides.due_date ?? null,
    milestone_id: overrides.milestone_id ?? null,
    assigned_to: overrides.assigned_to ?? null,
    created_at: overrides.created_at || '2026-05-22T10:00:00.000Z',
    updated_at: overrides.updated_at || overrides.created_at || '2026-05-22T10:00:00.000Z',
  };

  db.prepare(
    `INSERT INTO tasks (
      id, project_id, title, description, status, priority, business_value,
      retry_count, due_date, milestone_id, assigned_to, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    row.id,
    row.project_id,
    row.title,
    row.description,
    row.status,
    row.priority,
    row.business_value,
    row.retry_count,
    row.due_date,
    row.milestone_id,
    row.assigned_to,
    row.created_at,
    row.updated_at
  );

  return row;
}

function seedDependency(db, { id, task_id, depends_on, tipo = 'blocks' }) {
  db.prepare(
    'INSERT INTO task_dependencies (id, task_id, depends_on, tipo) VALUES (?, ?, ?, ?)'
  ).run(id, task_id, depends_on, tipo);
}

function seedWorkspace(db, overrides = {}) {
  const row = {
    id: overrides.id || 'ws-1',
    project_id: overrides.project_id || 'proj-1',
    agent_id: overrides.agent_id || 'agent-1',
    current_task_id: overrides.current_task_id ?? null,
    run_id_or_session_id: overrides.run_id_or_session_id ?? null,
    repo_root: overrides.repo_root || '/repo/devhub',
    workspace_path: overrides.workspace_path || 'workspace://proj-1/ws-1',
    worktree_path: overrides.worktree_path ?? null,
    base_branch: overrides.base_branch || 'main',
    base_commit: overrides.base_commit || AGENT_WORKSPACE_BASE_COMMIT,
    branch_name: overrides.branch_name ?? null,
    status: overrides.status || 'planned',
    observed_branch: overrides.observed_branch ?? null,
    observed_head: overrides.observed_head ?? null,
    observed_dirty: overrides.observed_dirty ?? null,
    evidence_ref: overrides.evidence_ref ?? null,
    updated_at: overrides.updated_at || '2026-05-22T10:00:00.000Z',
    created_at: overrides.created_at || overrides.updated_at || '2026-05-22T10:00:00.000Z',
  };

  db.prepare(
    `INSERT INTO agent_workspaces (
      id, project_id, agent_id, current_task_id, run_id_or_session_id, repo_root,
      workspace_path, worktree_path, base_branch, base_commit, branch_name, status,
      observed_branch, observed_head, observed_dirty, evidence_ref, updated_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    row.id,
    row.project_id,
    row.agent_id,
    row.current_task_id,
    row.run_id_or_session_id,
    row.repo_root,
    row.workspace_path,
    row.worktree_path,
    row.base_branch,
    row.base_commit,
    row.branch_name,
    row.status,
    row.observed_branch,
    row.observed_head,
    row.observed_dirty,
    row.evidence_ref,
    row.updated_at,
    row.created_at
  );

  return row;
}

function seedRun(db, overrides = {}) {
  const row = {
    run_id: overrides.run_id || 'run-1',
    workspace_id: overrides.workspace_id || 'ws-1',
    task_id: overrides.task_id ?? null,
    agent_id: overrides.agent_id || 'agent-1',
    requested_base_ref: overrides.requested_base_ref || AGENT_WORKSPACE_BASE_COMMIT,
    baseline_commit: overrides.baseline_commit || AGENT_WORKSPACE_BASE_COMMIT,
    status: overrides.status || 'running',
    terminal_reason_class: overrides.terminal_reason_class ?? null,
    created_at: overrides.created_at || '2026-05-22T10:00:00.000Z',
    started_at: overrides.started_at || overrides.created_at || '2026-05-22T10:00:00.000Z',
    updated_at: overrides.updated_at || overrides.created_at || '2026-05-22T10:00:00.000Z',
  };

  db.prepare(
    `INSERT INTO agent_runs (
      run_id, workspace_id, task_id, agent_id, requested_base_ref, baseline_commit,
      status, terminal_reason_class, started_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    row.run_id,
    row.workspace_id,
    row.task_id,
    row.agent_id,
    row.requested_base_ref,
    row.baseline_commit,
    row.status,
    row.terminal_reason_class,
    row.started_at,
    row.created_at,
    row.updated_at
  );

  return row;
}

function seedArtifact(db, overrides = {}) {
  const row = {
    artifact_id: overrides.artifact_id || `artifact-${Math.random().toString(36).slice(2, 8)}`,
    run_id: overrides.run_id || 'run-1',
    seq: overrides.seq ?? 1,
    phase: overrides.phase || 'execute',
    kind: overrides.kind || 'decision.note',
    producer: overrides.producer || 'executor',
    summary: overrides.summary || 'Artifact summary',
    evidence_ref: overrides.evidence_ref || `evidence://${overrides.run_id || 'run-1'}/1`,
    observed_at: overrides.observed_at || '2026-05-22T10:00:00.000Z',
  };

  db.prepare(
    `INSERT INTO agent_artifacts (
      artifact_id, run_id, seq, phase, kind, producer, summary, evidence_ref, observed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    row.artifact_id,
    row.run_id,
    row.seq,
    row.phase,
    row.kind,
    row.producer,
    row.summary,
    row.evidence_ref,
    row.observed_at
  );

  return row;
}

function seedSupervisorSnapshot(db, overrides = {}) {
  const row = {
    task_id: overrides.task_id,
    supervisor_state: overrides.supervisor_state || 'awaiting_approval',
    outcome: overrides.outcome || 'wait',
    reason_class: overrides.reason_class || 'approval_required',
    workspace_id: overrides.workspace_id ?? null,
    run_id: overrides.run_id ?? null,
    evidence_ref: overrides.evidence_ref ?? null,
    approval_checkpoint_key: overrides.approval_checkpoint_key ?? null,
    updated_at: overrides.updated_at || '2026-05-22T10:10:00.000Z',
    created_at: overrides.created_at || overrides.updated_at || '2026-05-22T10:10:00.000Z',
  };

  db.prepare(
    `INSERT INTO supervisor_snapshots (
      task_id, supervisor_state, outcome, reason_class, workspace_id, run_id,
      evidence_ref, approval_checkpoint_key, updated_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    row.task_id,
    row.supervisor_state,
    row.outcome,
    row.reason_class,
    row.workspace_id,
    row.run_id,
    row.evidence_ref,
    row.approval_checkpoint_key,
    row.updated_at,
    row.created_at
  );

  return row;
}

function seedApprovalCheckpoint(db, overrides = {}) {
  const row = {
    checkpoint_key: overrides.checkpoint_key || `${overrides.task_id}|-|-|approval_required|-`,
    task_id: overrides.task_id,
    workspace_id: overrides.workspace_id ?? null,
    run_id: overrides.run_id ?? null,
    reason_class: overrides.reason_class || 'approval_required',
    evidence_ref: overrides.evidence_ref ?? null,
    status: overrides.status || 'pending',
    requested_at: overrides.requested_at || '2026-05-22T10:05:00.000Z',
    updated_at: overrides.updated_at || '2026-05-22T10:05:00.000Z',
    created_at: overrides.created_at || overrides.updated_at || '2026-05-22T10:05:00.000Z',
  };

  db.prepare(
    `INSERT INTO supervisor_approval_checkpoints (
      checkpoint_key, task_id, workspace_id, run_id, reason_class, evidence_ref,
      status, requested_at, updated_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    row.checkpoint_key,
    row.task_id,
    row.workspace_id,
    row.run_id,
    row.reason_class,
    row.evidence_ref,
    row.status,
    row.requested_at,
    row.updated_at,
    row.created_at
  );

  return row;
}

describe('compactReads', () => {
  let db;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    ensureRuntimeSchema(db);
    applyTestSchema(db);
    ensureTaskTables(db);
  });

  afterEach(() => {
    db.close();
  });

  test('readExecutionQueueSummary keeps deterministic order and blocked semantics from durable truth', () => {
    seedProject(db, 'proj-1');
    seedTask(db, 'proj-1', {
      id: 'dep-1',
      title: 'Dependency still open',
      status: 'blocked',
      priority: 'critical',
      business_value: 10,
      created_at: '2026-05-22T09:00:00.000Z',
    });
    seedTask(db, 'proj-1', {
      id: 'task-alpha',
      title: 'Alpha first on tie',
      priority: 'high',
      business_value: 8,
      created_at: '2026-05-22T10:00:00.000Z',
      updated_at: '2026-05-22T10:00:00.000Z',
    });
    seedTask(db, 'proj-1', {
      id: 'task-beta',
      title: 'Beta second on tie',
      priority: 'high',
      business_value: 8,
      created_at: '2026-05-22T10:01:00.000Z',
      updated_at: '2026-05-22T10:01:00.000Z',
    });
    seedTask(db, 'proj-1', {
      id: 'task-blocked',
      title: 'Blocked by dependency',
      priority: 'high',
      business_value: 9,
      created_at: '2026-05-22T10:02:00.000Z',
      updated_at: '2026-05-22T10:02:00.000Z',
    });
    seedDependency(db, { id: 'task-dep-1', task_id: 'task-blocked', depends_on: 'dep-1' });
    seedApprovalCheckpoint(db, {
      checkpoint_key: 'task-alpha|-|-|approval_required|evidence://queue/task-alpha',
      task_id: 'task-alpha',
      reason_class: 'approval_required',
      evidence_ref: 'evidence://queue/task-alpha',
      status: 'pending',
    });
    seedSupervisorSnapshot(db, {
      task_id: 'task-alpha',
      supervisor_state: 'awaiting_approval',
      outcome: 'wait',
      reason_class: 'approval_required',
      evidence_ref: 'evidence://queue/task-alpha',
      approval_checkpoint_key: 'task-alpha|-|-|approval_required|evidence://queue/task-alpha',
    });

    const summary = readExecutionQueueSummary(db, {
      projectId: 'proj-1',
      includeBlocked: true,
      limit: 10,
    });

    expect(summary.total).toBe(3);
    expect(summary.queue.map((task) => task.id)).toEqual([
      'task-alpha',
      'task-beta',
      'task-blocked',
    ]);
    expect(summary.queue[0]).toEqual(
      expect.objectContaining({
        blocked: false,
        blocked_reason: null,
        blocking_dependencies: [],
        supervisor: expect.objectContaining({
          supervisor_state: 'awaiting_approval',
          reason_class: 'approval_required',
          approval_checkpoint: expect.objectContaining({
            checkpoint_key: 'task-alpha|-|-|approval_required|evidence://queue/task-alpha',
            status: 'pending',
          }),
        }),
      })
    );
    expect(summary.queue[2]).toEqual(
      expect.objectContaining({
        id: 'task-blocked',
        blocked: true,
        blocked_reason: 'dep-1',
        blocking_dependencies: ['dep-1'],
        priority_score: 0,
      })
    );
  });

  test('presentExecutionQueue and createDirectorQueueContract keep stable queue contracts', () => {
    const presented = presentExecutionQueue({ total: 0, queue: [] });
    const contract = createDirectorQueueContract({
      queue: [
        {
          id: 'task-blocked',
          title: 'Blocked durable task',
          status: 'pending',
          blocked: true,
          priority: 'high',
          blocking_dependencies: ['dep-1'],
        },
      ],
    });

    expect(presented).toEqual({ total: 0, queue: [] });
    expect(contract).toEqual({
      authority: 'authoritative',
      freshness: 'current',
      items: [
        {
          id: 'task-blocked',
          title: 'Blocked durable task',
          status: 'blocked',
          position: 1,
          priority: 'high',
          blocked_reason: 'dep-1',
          supervisor: null,
        },
      ],
      handoff: {
        status: 'idle',
        recipient_agent_id: null,
        message: null,
        task: null,
        workspace: null,
        run: null,
        artifact: null,
        supervisor: null,
      },
    });
  });

  test('readWorkspaceEvidenceSummary returns latest durable run and artifact for a workspace', () => {
    seedProject(db, 'proj-1');
    seedWorkspace(db, {
      id: 'ws-1',
      project_id: 'proj-1',
      current_task_id: 'task-1',
      status: 'active',
      branch_name: 'feat/ws-1',
      worktree_path: '.worktrees/ws-1',
      observed_branch: 'feat/ws-1',
      observed_head: 'abc123',
    });
    seedRun(db, {
      run_id: 'run-1',
      workspace_id: 'ws-1',
      task_id: 'task-1',
      created_at: '2026-05-22T10:00:00.000Z',
      updated_at: '2026-05-22T10:00:00.000Z',
    });
    seedRun(db, {
      run_id: 'run-2',
      workspace_id: 'ws-1',
      task_id: 'task-1',
      created_at: '2026-05-22T10:05:00.000Z',
      updated_at: '2026-05-22T10:05:00.000Z',
    });
    seedArtifact(db, {
      artifact_id: 'artifact-1',
      run_id: 'run-1',
      seq: 1,
      observed_at: '2026-05-22T10:00:00.000Z',
    });
    seedArtifact(db, {
      artifact_id: 'artifact-2a',
      run_id: 'run-2',
      seq: 1,
      observed_at: '2026-05-22T10:05:00.000Z',
    });
    seedArtifact(db, {
      artifact_id: 'artifact-2b',
      run_id: 'run-2',
      seq: 2,
      observed_at: '2026-05-22T10:06:00.000Z',
    });

    const summary = readWorkspaceEvidenceSummary(db, { workspaceId: 'ws-1' });
    const presented = presentWorkspaceEvidence(summary);

    expect(summary).toEqual(
      expect.objectContaining({
        workspace: expect.objectContaining({ id: 'ws-1', workspace_id: 'ws-1' }),
        latest_run: expect.objectContaining({ run_id: 'run-2' }),
        latest_artifact: expect.objectContaining({ artifact_id: 'artifact-2b', seq: 2 }),
      })
    );
    expect(presented.workspace.workspace_id).toBe('ws-1');
    expect(presented.latest_run.run_id).toBe('run-2');
    expect(presented.latest_artifact.artifact_id).toBe('artifact-2b');
  });

  test('readWorkspaceEvidenceSummary prefers durable emptiness over runtime-only hints', () => {
    seedProject(db, 'proj-1');
    seedWorkspace(db, {
      id: 'ws-runtime-hint',
      project_id: 'proj-1',
      current_task_id: 'task-runtime-hint',
      run_id_or_session_id: 'session-only-hint',
      status: 'active',
      branch_name: 'feat/runtime-hint',
      worktree_path: '.worktrees/runtime-hint',
      observed_branch: 'feat/runtime-hint',
      observed_head: 'def456',
    });

    const summary = readWorkspaceEvidenceSummary(db, { workspaceId: 'ws-runtime-hint' });

    expect(summary).toEqual({
      workspace: expect.objectContaining({
        id: 'ws-runtime-hint',
        workspace_id: 'ws-runtime-hint',
        run_id_or_session_id: 'session-only-hint',
      }),
      latest_run: null,
      latest_artifact: null,
    });
  });
});
