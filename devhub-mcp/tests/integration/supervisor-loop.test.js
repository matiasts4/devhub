import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { createTestHarness } from '../test-harness.js';

const USER_ID = '54fee7d7-340d-4683-b259-b61a39567f94';
const BASE_REF = 'f814998dd05cb491caf8637bf570dbd74b539090';

function uniqueId(prefix) {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

function openDb(harness) {
  return new Database(harness.dbPath);
}

function buildCheckpointKey({ taskId, workspaceId, runId, reasonClass, evidenceRef }) {
  return [taskId, workspaceId || '-', runId || '-', reasonClass, evidenceRef || '-'].join('|');
}

function insertApprovalCheckpoint(
  harness,
  { taskId, workspaceId, runId, reasonClass = 'approval_required', evidenceRef, status = 'pending' }
) {
  const db = openDb(harness);
  const checkpointKey = buildCheckpointKey({
    taskId,
    workspaceId,
    runId,
    reasonClass,
    evidenceRef,
  });
  const requestedAt = '2026-05-19T01:00:00.000Z';
  const decidedAt = status === 'pending' ? null : '2026-05-19T01:05:00.000Z';
  db.prepare(
    `INSERT INTO supervisor_approval_checkpoints (
      checkpoint_key,
      task_id,
      workspace_id,
      run_id,
      reason_class,
      evidence_ref,
      status,
      requested_at,
      decided_at,
      decision_note,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    checkpointKey,
    taskId,
    workspaceId,
    runId,
    reasonClass,
    evidenceRef,
    status,
    requestedAt,
    decidedAt,
    status === 'pending' ? null : `Decision: ${status}`,
    requestedAt,
    decidedAt || requestedAt
  );
  db.close();
  return checkpointKey;
}

async function createProject(harness, name) {
  const result = await harness.callTool('create_project', { name });
  return result.project.id;
}

async function createTask(harness, projectId, title) {
  const result = await harness.callTool('create_task', {
    project_id: projectId,
    user_id: USER_ID,
    title,
  });
  return result.task;
}

async function createReadyWorkspace(harness, { projectId, taskId, agentId, workspaceId }) {
  const branchName = `agent/${agentId}/${taskId}`;
  return harness.callTool('create_agent_workspace', {
    workspace_id: workspaceId,
    project_id: projectId,
    agent_id: agentId,
    current_task_id: taskId,
    run_id_or_session_id: uniqueId('session'),
    repo_root: '/repo/devhub',
    workspace_path: `workspace://devhub/${workspaceId}`,
    worktree_path: `.worktrees/devhub/${workspaceId}`,
    base_branch: 'main',
    branch_name: branchName,
    status: 'ready',
    observed_branch: branchName,
    observed_head: uniqueId('head'),
    observed_dirty: 'clean',
  });
}

async function createFailedRunWithArtifact(
  harness,
  { workspaceId, taskId, agentId, runId, predecessorRunId, recoveryGroupId, evidenceRef }
) {
  await harness.callTool('create_agent_run', {
    run_id: runId,
    workspace_id: workspaceId,
    task_id: taskId,
    agent_id: agentId,
    requested_base_ref: BASE_REF,
    baseline_commit: BASE_REF,
    status: 'running',
    predecessor_run_id: predecessorRunId,
    recovery_group_id: recoveryGroupId,
  });

  await harness.callTool('append_agent_artifact', {
    run_id: runId,
    phase: 'qa',
    kind: 'error.report',
    producer: 'qa',
    summary: `Failure for ${runId}`,
    evidence_ref: evidenceRef,
  });

  await harness.callTool('complete_agent_run', {
    run_id: runId,
    status: 'failed',
    terminal_reason_class: 'recoverable_failure',
  });
}

describe('Supervisor loop integration', () => {
  let harness;

  beforeAll(async () => {
    harness = await createTestHarness();
    await harness.initialize();
  });

  afterAll(async () => {
    await harness.cleanup();
  });

  it('emits dispatch for an assignable task with ready workspace metadata', async () => {
    const projectId = await createProject(harness, 'Supervisor Dispatch Project');
    const task = await createTask(harness, projectId, 'Dispatch candidate');
    const workspaceId = uniqueId('ws-dispatch');

    await createReadyWorkspace(harness, {
      projectId,
      taskId: task.id,
      agentId: 'agent-dispatch',
      workspaceId,
    });

    const queue = await harness.callTool('get_execution_queue', {
      project_id: projectId,
      limit: 10,
    });

    expect(queue.queue).toHaveLength(1);
    expect(queue.queue[0].supervisor).toEqual(
      expect.objectContaining({
        supervisor_state: 'dispatch_pending',
        outcome: 'dispatch',
        reason_class: null,
        workspace_id: workspaceId,
        attempt_count: 0,
        task_retry_count: 0,
      })
    );
  });

  it('emits wait when workspace preparation was acknowledged but is not ready yet', async () => {
    const projectId = await createProject(harness, 'Supervisor Wait Project');
    const task = await createTask(harness, projectId, 'Wait candidate');

    const prepared = await harness.callTool('prepare_agent_workspace', {
      task_id: task.id,
      agent_id: 'agent-wait',
      correlation_id: uniqueId('corr-wait'),
    });

    const queue = await harness.callTool('get_execution_queue', {
      project_id: projectId,
      limit: 10,
    });

    expect(queue.queue).toHaveLength(1);
    expect(queue.queue[0].supervisor).toEqual(
      expect.objectContaining({
        supervisor_state: 'idle',
        outcome: 'wait',
        reason_class: null,
        workspace_id: prepared.ack.workspace_id,
      })
    );
  });

  it('emits request_approval for the first pending approval checkpoint', async () => {
    const projectId = await createProject(harness, 'Supervisor Approval Request Project');
    const task = await createTask(harness, projectId, 'Approval request candidate');
    const workspaceId = uniqueId('ws-approval-request');
    const runId = uniqueId('run-approval-request');
    const evidenceRef = 'evidence://supervisor/approval-request';

    await createReadyWorkspace(harness, {
      projectId,
      taskId: task.id,
      agentId: 'agent-approval-request',
      workspaceId,
    });
    await harness.callTool('create_agent_run', {
      run_id: runId,
      workspace_id: workspaceId,
      task_id: task.id,
      agent_id: 'agent-approval-request',
      requested_base_ref: BASE_REF,
      baseline_commit: BASE_REF,
      status: 'running',
    });
    insertApprovalCheckpoint(harness, {
      taskId: task.id,
      workspaceId,
      runId,
      evidenceRef,
    });

    const queue = await harness.callTool('get_execution_queue', {
      project_id: projectId,
      limit: 10,
    });

    expect(queue.queue[0].supervisor).toEqual(
      expect.objectContaining({
        supervisor_state: 'awaiting_approval',
        outcome: 'request_approval',
        reason_class: 'approval_required',
        workspace_id: workspaceId,
        run_id: runId,
        evidence_ref: evidenceRef,
        approval_request_count: 1,
      })
    );
  });

  it('emits wait while the same approval checkpoint remains pending after request creation', async () => {
    const projectId = await createProject(harness, 'Supervisor Approval Pending Wait Project');
    const task = await createTask(harness, projectId, 'Approval wait candidate');
    const workspaceId = uniqueId('ws-approval-wait');
    const runId = uniqueId('run-approval-wait');
    const evidenceRef = 'evidence://supervisor/approval-wait';

    await createReadyWorkspace(harness, {
      projectId,
      taskId: task.id,
      agentId: 'agent-approval-wait',
      workspaceId,
    });
    await harness.callTool('create_agent_run', {
      run_id: runId,
      workspace_id: workspaceId,
      task_id: task.id,
      agent_id: 'agent-approval-wait',
      requested_base_ref: BASE_REF,
      baseline_commit: BASE_REF,
      status: 'running',
    });
    insertApprovalCheckpoint(harness, {
      taskId: task.id,
      workspaceId,
      runId,
      evidenceRef,
    });

    await harness.callTool('get_execution_queue', {
      project_id: projectId,
      limit: 10,
    });
    const secondQueue = await harness.callTool('get_execution_queue', {
      project_id: projectId,
      limit: 10,
    });

    expect(secondQueue.queue[0].supervisor).toEqual(
      expect.objectContaining({
        supervisor_state: 'awaiting_approval',
        outcome: 'wait',
        reason_class: 'approval_required',
        workspace_id: workspaceId,
        run_id: runId,
        evidence_ref: evidenceRef,
        approval_request_count: 1,
      })
    );
    expect(secondQueue.queue[0].supervisor_snapshot).toEqual(secondQueue.queue[0].supervisor);
  });

  it('emits block when an approval checkpoint is rejected', async () => {
    const projectId = await createProject(harness, 'Supervisor Approval Rejected Project');
    const task = await createTask(harness, projectId, 'Approval rejected candidate');
    const workspaceId = uniqueId('ws-approval-rejected');
    const runId = uniqueId('run-approval-rejected');
    const evidenceRef = 'evidence://supervisor/approval-rejected';

    await createReadyWorkspace(harness, {
      projectId,
      taskId: task.id,
      agentId: 'agent-approval-rejected',
      workspaceId,
    });
    await harness.callTool('create_agent_run', {
      run_id: runId,
      workspace_id: workspaceId,
      task_id: task.id,
      agent_id: 'agent-approval-rejected',
      requested_base_ref: BASE_REF,
      baseline_commit: BASE_REF,
      status: 'running',
    });
    insertApprovalCheckpoint(harness, {
      taskId: task.id,
      workspaceId,
      runId,
      evidenceRef,
      status: 'rejected',
    });

    const queue = await harness.callTool('get_execution_queue', {
      project_id: projectId,
      limit: 10,
    });

    expect(queue.queue[0].supervisor).toEqual(
      expect.objectContaining({
        supervisor_state: 'blocked',
        outcome: 'block',
        reason_class: 'approval_rejected',
        workspace_id: workspaceId,
        run_id: runId,
        evidence_ref: evidenceRef,
      })
    );
  });

  it('does not infer approval from executor progress while checkpoint remains pending', async () => {
    const projectId = await createProject(harness, 'Supervisor No Implicit Approval Project');
    const task = await createTask(harness, projectId, 'No implicit approval candidate');
    const workspaceId = uniqueId('ws-no-implicit');
    const runId = uniqueId('run-no-implicit');
    const evidenceRef = 'evidence://supervisor/no-implicit-approval';

    await createReadyWorkspace(harness, {
      projectId,
      taskId: task.id,
      agentId: 'agent-no-implicit',
      workspaceId,
    });
    await harness.callTool('create_agent_run', {
      run_id: runId,
      workspace_id: workspaceId,
      task_id: task.id,
      agent_id: 'agent-no-implicit',
      requested_base_ref: BASE_REF,
      baseline_commit: BASE_REF,
      status: 'running',
    });
    await harness.callTool('append_agent_artifact', {
      run_id: runId,
      phase: 'cleanup',
      kind: 'decision.note',
      producer: 'supervisor',
      summary: 'Executor reached cleanup candidate but approval still pending',
      evidence_ref: evidenceRef,
    });
    await harness.callTool('complete_agent_run', {
      run_id: runId,
      status: 'succeeded',
      terminal_reason_class: 'completed',
    });
    insertApprovalCheckpoint(harness, {
      taskId: task.id,
      workspaceId,
      runId,
      evidenceRef,
    });

    const queue = await harness.callTool('get_execution_queue', {
      project_id: projectId,
      limit: 10,
    });

    expect(queue.queue[0].supervisor).toEqual(
      expect.objectContaining({
        supervisor_state: 'awaiting_approval',
        outcome: 'request_approval',
        reason_class: 'approval_required',
        workspace_id: workspaceId,
        run_id: runId,
        evidence_ref: evidenceRef,
      })
    );
  });

  it('emits retry with lineage counters from recoverable terminal evidence', async () => {
    const projectId = await createProject(harness, 'Supervisor Retry Project');
    const task = await createTask(harness, projectId, 'Retry candidate');
    const workspaceId = uniqueId('ws-retry');

    await createReadyWorkspace(harness, {
      projectId,
      taskId: task.id,
      agentId: 'agent-retry',
      workspaceId,
    });

    const db = openDb(harness);
    db.prepare('UPDATE tasks SET retry_count = ? WHERE id = ?').run(1, task.id);
    db.close();

    await createFailedRunWithArtifact(harness, {
      workspaceId,
      taskId: task.id,
      agentId: 'agent-retry',
      runId: uniqueId('run-retry'),
      evidenceRef: 'evidence://supervisor/retry-1',
    });

    const queue = await harness.callTool('get_execution_queue', {
      project_id: projectId,
      limit: 10,
    });

    expect(queue.queue[0].supervisor).toEqual(
      expect.objectContaining({
        supervisor_state: 'retry_pending',
        outcome: 'retry',
        reason_class: 'recoverable_failure',
        evidence_ref: 'evidence://supervisor/retry-1',
        attempt_count: 1,
        task_retry_count: 1,
      })
    );
  });

  it('emits block when unchanged recoverable failure repeats across run lineage', async () => {
    const projectId = await createProject(harness, 'Supervisor Block Project');
    const task = await createTask(harness, projectId, 'Block candidate');
    const workspaceId = uniqueId('ws-block');
    const recoveryGroupId = uniqueId('recovery');
    const firstRunId = uniqueId('run-block-a');
    const secondRunId = uniqueId('run-block-b');

    await createReadyWorkspace(harness, {
      projectId,
      taskId: task.id,
      agentId: 'agent-block',
      workspaceId,
    });

    const db = openDb(harness);
    db.prepare('UPDATE tasks SET retry_count = ? WHERE id = ?').run(2, task.id);
    db.close();

    await createFailedRunWithArtifact(harness, {
      workspaceId,
      taskId: task.id,
      agentId: 'agent-block',
      runId: firstRunId,
      recoveryGroupId,
      evidenceRef: 'evidence://supervisor/repeat-1',
    });
    await createFailedRunWithArtifact(harness, {
      workspaceId,
      taskId: task.id,
      agentId: 'agent-block',
      runId: secondRunId,
      predecessorRunId: firstRunId,
      recoveryGroupId,
      evidenceRef: 'evidence://supervisor/repeat-1',
    });

    const queue = await harness.callTool('get_execution_queue', {
      project_id: projectId,
      limit: 10,
    });

    expect(queue.queue[0].supervisor).toEqual(
      expect.objectContaining({
        supervisor_state: 'blocked',
        outcome: 'block',
        reason_class: 'unchanged_failure',
        evidence_ref: 'evidence://supervisor/repeat-1',
        attempt_count: 2,
        unchanged_failure_count: 1,
      })
    );

    const reread = await harness.callTool('get_execution_queue', {
      project_id: projectId,
      limit: 10,
    });

    expect(reread.queue[0].supervisor).toEqual(
      expect.objectContaining({
        supervisor_state: 'blocked',
        outcome: 'block',
        reason_class: 'unchanged_failure',
        evidence_ref: 'evidence://supervisor/repeat-1',
        attempt_count: 2,
        unchanged_failure_count: 1,
      })
    );
  });

  it('emits recover_orphan for expired lease while workspace remains active', async () => {
    const projectId = await createProject(harness, 'Supervisor Recover Lease Project');
    const task = await createTask(harness, projectId, 'Recover orphan stale lease');
    const workspaceId = uniqueId('ws-stale');
    const runId = uniqueId('run-stale');

    await harness.callTool('create_agent_workspace', {
      workspace_id: workspaceId,
      project_id: projectId,
      agent_id: 'agent-stale',
      current_task_id: task.id,
      run_id_or_session_id: runId,
      repo_root: '/repo/devhub',
      workspace_path: `workspace://devhub/${workspaceId}`,
      worktree_path: `.worktrees/devhub/${workspaceId}`,
      base_branch: 'main',
      branch_name: `agent/agent-stale/${task.id}`,
      status: 'active',
      observed_branch: `agent/agent-stale/${task.id}`,
      observed_head: uniqueId('head-stale'),
      observed_dirty: 'clean',
    });

    await harness.callTool('create_agent_run', {
      run_id: runId,
      workspace_id: workspaceId,
      task_id: task.id,
      agent_id: 'agent-stale',
      requested_base_ref: BASE_REF,
      baseline_commit: BASE_REF,
      status: 'running',
    });
    await harness.callTool('append_agent_artifact', {
      run_id: runId,
      phase: 'recovery',
      kind: 'decision.note',
      producer: 'supervisor',
      summary: 'Last evidence before stale lease cleanup',
      evidence_ref: 'evidence://supervisor/stale-lease',
    });

    const db = openDb(harness);
    db.prepare(
      `UPDATE tasks
       SET status = 'in_progress', assigned_to = ?, claim_token = ?, claimed_at = ?, lease_expires_at = ?
       WHERE id = ?`
    ).run(
      'agent-stale',
      'claim-stale',
      '2026-05-18T10:00:00.000Z',
      '2026-05-18T10:01:00.000Z',
      task.id
    );
    db.close();

    const queue = await harness.callTool('get_execution_queue', {
      project_id: projectId,
      limit: 10,
    });

    expect(queue.queue[0].supervisor).toEqual(
      expect.objectContaining({
        supervisor_state: 'recovering_orphan',
        outcome: 'recover_orphan',
        reason_class: 'stale_lease',
        workspace_id: workspaceId,
        run_id: runId,
        evidence_ref: 'evidence://supervisor/stale-lease',
      })
    );
  });

  it('emits recover_orphan for orphaned workspace metadata', async () => {
    const projectId = await createProject(harness, 'Supervisor Orphaned Workspace Project');
    const task = await createTask(harness, projectId, 'Recover orphan workspace');
    const workspaceId = uniqueId('ws-orphaned-workspace');

    await harness.callTool('create_agent_workspace', {
      workspace_id: workspaceId,
      project_id: projectId,
      agent_id: 'agent-orphan-workspace',
      current_task_id: task.id,
      run_id_or_session_id: uniqueId('session-orphan'),
      repo_root: '/repo/devhub',
      workspace_path: `workspace://devhub/${workspaceId}`,
      base_branch: 'main',
      status: 'orphaned',
      recovery_reason: 'executor_missing',
    });

    const queue = await harness.callTool('get_execution_queue', {
      project_id: projectId,
      limit: 10,
    });

    expect(queue.queue[0].supervisor).toEqual(
      expect.objectContaining({
        supervisor_state: 'recovering_orphan',
        outcome: 'recover_orphan',
        reason_class: 'orphaned_workspace',
        workspace_id: workspaceId,
      })
    );
    expect(queue.queue[0].supervisor_snapshot).toEqual(queue.queue[0].supervisor);
  });

  it('prefers the latest orphaned workspace over a stale healthy snapshot linkage', async () => {
    const projectId = await createProject(harness, 'Supervisor Latest Orphan Workspace Project');
    const task = await createTask(harness, projectId, 'Latest orphan workspace wins');
    const healthyWorkspaceId = uniqueId('ws-healthy-old');
    const orphanedWorkspaceId = uniqueId('ws-orphaned-new');
    const healthyRunId = uniqueId('run-healthy-old');
    const healthyAgentId = 'agent-latest-workspace-healthy';
    const orphanedAgentId = 'agent-latest-workspace-orphaned';

    await createReadyWorkspace(harness, {
      projectId,
      taskId: task.id,
      agentId: healthyAgentId,
      workspaceId: healthyWorkspaceId,
    });
    await harness.callTool('create_agent_run', {
      run_id: healthyRunId,
      workspace_id: healthyWorkspaceId,
      task_id: task.id,
      agent_id: healthyAgentId,
      requested_base_ref: BASE_REF,
      baseline_commit: BASE_REF,
      status: 'running',
    });

    const db = openDb(harness);
    db.prepare(
      `INSERT INTO supervisor_snapshots (
        task_id,
        supervisor_state,
        outcome,
        reason_class,
        task_retry_count,
        attempt_count,
        unchanged_failure_count,
        approval_request_count,
        orphan_recovery_count,
        workspace_id,
        run_id,
        evidence_ref,
        approval_checkpoint_key,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      task.id,
      'dispatch_pending',
      'dispatch',
      null,
      0,
      0,
      0,
      0,
      0,
      healthyWorkspaceId,
      healthyRunId,
      'evidence://supervisor/healthy-old',
      null,
      '2026-05-19T09:00:00.000Z',
      '2026-05-19T09:00:00.000Z'
    );
    db.close();

    await harness.callTool('create_agent_workspace', {
      workspace_id: orphanedWorkspaceId,
      project_id: projectId,
      agent_id: orphanedAgentId,
      current_task_id: task.id,
      run_id_or_session_id: uniqueId('session-orphaned-new'),
      repo_root: '/repo/devhub',
      workspace_path: `workspace://devhub/${orphanedWorkspaceId}`,
      base_branch: 'main',
      status: 'orphaned',
      recovery_reason: 'executor_missing',
      evidence_ref: 'evidence://workspace/orphaned-new',
    });

    const queue = await harness.callTool('get_execution_queue', {
      project_id: projectId,
      limit: 10,
    });

    expect(queue.queue[0].supervisor).toEqual(
      expect.objectContaining({
        supervisor_state: 'recovering_orphan',
        outcome: 'recover_orphan',
        reason_class: 'orphaned_workspace',
        workspace_id: orphanedWorkspaceId,
        evidence_ref: 'evidence://workspace/orphaned-new',
      })
    );
  });

  it('clears stale orphan recovery after the latest healthy workspace and run relink the task', async () => {
    const projectId = await createProject(harness, 'Supervisor Healthy Relink Project');
    const task = await createTask(harness, projectId, 'Healthy relink clears orphan state');
    const orphanedWorkspaceId = uniqueId('ws-orphaned-old');
    const healthyWorkspaceId = uniqueId('ws-healthy-new');
    const healthyRunId = uniqueId('run-healthy-new');
    const orphanedAgentId = 'agent-healthy-relink-orphaned';
    const healthyAgentId = 'agent-healthy-relink-healthy';

    await harness.callTool('create_agent_workspace', {
      workspace_id: orphanedWorkspaceId,
      project_id: projectId,
      agent_id: orphanedAgentId,
      current_task_id: task.id,
      run_id_or_session_id: uniqueId('session-orphaned-old'),
      repo_root: '/repo/devhub',
      workspace_path: `workspace://devhub/${orphanedWorkspaceId}`,
      base_branch: 'main',
      status: 'orphaned',
      recovery_reason: 'executor_missing',
      evidence_ref: 'evidence://workspace/orphaned-old',
    });

    const db = openDb(harness);
    db.prepare(
      `INSERT INTO supervisor_snapshots (
        task_id,
        supervisor_state,
        outcome,
        reason_class,
        task_retry_count,
        attempt_count,
        unchanged_failure_count,
        approval_request_count,
        orphan_recovery_count,
        workspace_id,
        run_id,
        evidence_ref,
        approval_checkpoint_key,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      task.id,
      'recovering_orphan',
      'recover_orphan',
      'orphaned_workspace',
      0,
      0,
      0,
      0,
      1,
      orphanedWorkspaceId,
      null,
      'evidence://workspace/orphaned-old',
      null,
      '2026-05-19T09:00:00.000Z',
      '2026-05-19T09:00:00.000Z'
    );
    db.close();

    await createReadyWorkspace(harness, {
      projectId,
      taskId: task.id,
      agentId: healthyAgentId,
      workspaceId: healthyWorkspaceId,
    });
    await harness.callTool('create_agent_run', {
      run_id: healthyRunId,
      workspace_id: healthyWorkspaceId,
      task_id: task.id,
      agent_id: healthyAgentId,
      requested_base_ref: BASE_REF,
      baseline_commit: BASE_REF,
      status: 'running',
    });

    const queue = await harness.callTool('get_execution_queue', {
      project_id: projectId,
      limit: 10,
    });

    expect(queue.queue[0].supervisor).toEqual(
      expect.objectContaining({
        supervisor_state: 'dispatch_pending',
        outcome: 'dispatch',
        reason_class: null,
        workspace_id: healthyWorkspaceId,
        run_id: healthyRunId,
      })
    );
  });

  it('emits recover_orphan for missing durable run while workspace points to a run/session', async () => {
    const projectId = await createProject(harness, 'Supervisor Orphaned Run Project');
    const task = await createTask(harness, projectId, 'Recover orphan run');
    const workspaceId = uniqueId('ws-orphaned-run');
    const runRef = uniqueId('run-missing');
    const branchName = `agent/agent-orphan-run/${task.id}`;

    await harness.callTool('create_agent_workspace', {
      workspace_id: workspaceId,
      project_id: projectId,
      agent_id: 'agent-orphan-run',
      current_task_id: task.id,
      run_id_or_session_id: runRef,
      repo_root: '/repo/devhub',
      workspace_path: `workspace://devhub/${workspaceId}`,
      worktree_path: `.worktrees/devhub/${workspaceId}`,
      base_branch: 'main',
      branch_name: branchName,
      status: 'active',
      observed_branch: branchName,
      observed_head: uniqueId('head-orphan-run'),
      observed_dirty: 'clean',
    });

    const queue = await harness.callTool('get_execution_queue', {
      project_id: projectId,
      limit: 10,
    });

    expect(queue.queue[0].supervisor).toEqual(
      expect.objectContaining({
        supervisor_state: 'recovering_orphan',
        outcome: 'recover_orphan',
        reason_class: 'orphaned_run',
        workspace_id: workspaceId,
      })
    );
    expect(queue.queue[0].supervisor_snapshot).toEqual(queue.queue[0].supervisor);
  });

  it('persists dirty_excluded_observed without normalizing workspace state', async () => {
    const projectId = await createProject(harness, 'Supervisor Dirty Excluded Project');
    const task = await createTask(harness, projectId, 'Dirty excluded observation');
    const workspaceId = uniqueId('ws-dirty-excluded');
    const branchName = `agent/agent-dirty/${task.id}`;

    await harness.callTool('create_agent_workspace', {
      workspace_id: workspaceId,
      project_id: projectId,
      agent_id: 'agent-dirty',
      current_task_id: task.id,
      run_id_or_session_id: uniqueId('session-dirty'),
      repo_root: '/repo/devhub',
      workspace_path: `workspace://devhub/${workspaceId}`,
      worktree_path: `.worktrees/devhub/${workspaceId}`,
      base_branch: 'main',
      branch_name: branchName,
      status: 'ready',
      observed_branch: branchName,
      observed_head: uniqueId('head-dirty'),
      observed_dirty: 'dirty-excluded',
      evidence_ref: 'evidence://supervisor/dirty-excluded',
    });

    const queue = await harness.callTool('get_execution_queue', {
      project_id: projectId,
      limit: 10,
    });
    const workspace = await harness.callTool('get_agent_workspace', { workspace_id: workspaceId });

    expect(queue.queue[0].supervisor).toEqual(
      expect.objectContaining({
        supervisor_state: 'awaiting_evidence',
        outcome: 'wait',
        reason_class: 'dirty_excluded_observed',
        evidence_ref: 'evidence://supervisor/dirty-excluded',
        workspace_id: workspaceId,
      })
    );
    expect(workspace.workspace.observed_dirty).toBe('dirty-excluded');
  });
});
