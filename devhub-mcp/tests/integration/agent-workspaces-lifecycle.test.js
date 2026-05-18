import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { createTestHarness } from '../test-harness.js';

const FROZEN_BASE_COMMIT = 'f814998dd05cb491caf8637bf570dbd74b539090';

describe('MCP Agent Workspace Lifecycle Tools', () => {
  let harness;
  let projectId;

  beforeAll(async () => {
    harness = await createTestHarness();
    await harness.initialize();
    const projects = await harness.callTool('list_projects', { status: 'all' });
    projectId = projects.projects[0]?.id;
  });

  afterAll(async () => {
    await harness.cleanup();
  });

  it('creates a planned workspace before executor action', async () => {
    const result = await harness.callTool('create_agent_workspace', {
      workspace_id: 'ws-plan-1',
      project_id: projectId,
      agent_id: 'agent-1',
      current_task_id: 'task-1',
      run_id_or_session_id: 'run-1',
      repo_root: '/repo/devhub',
      workspace_path: 'workspace://devhub/ws-plan-1',
      base_branch: 'main',
      branch_name: 'agent/agent-1/task-1--plan1',
    });

    expect(result.created).toBe(true);
    expect(result.workspace.status).toBe('planned');
    expect(result.workspace.base_commit).toBe(FROZEN_BASE_COMMIT);
    expect(result.workspace.workspace_path).toBe('workspace://devhub/ws-plan-1');
    expect(result.workspace.worktree_path).toBeNull();
  });

  it('accepts narrow prepare_agent_workspace ack with idempotent correlation', async () => {
    const first = await harness.callTool('prepare_agent_workspace', {
      task_id: 'task-prepare-int-1',
      agent_id: 'agent-prepare-int-1',
      correlation_id: 'corr-prepare-int-1',
    });

    expect(first.accepted).toBe(true);
    expect(first.created).toBe(true);
    expect(first.ack.workspace_id).toBe('workspace-task-prepare-int-1-agent-prepare-int-1');
    expect(first.ack.requested_base_ref).toBe(FROZEN_BASE_COMMIT);
    expect(first.ack.status).toBe('provisioning');
    expect(first.contract.sw_2_1_checkpoint).toBe('02d82361449a09e93e5880a08e35e3043617002d');
    expect(first.contract.sw_3_1_checkpoint).toBe('4b1e344dcd202c911498af17236fcb86a2a2cb1e');

    const second = await harness.callTool('prepare_agent_workspace', {
      workspace_id: first.ack.workspace_id,
      correlation_id: 'corr-prepare-int-1',
    });

    expect(second.accepted).toBe(true);
    expect(second.created).toBe(false);
    expect(second.reused).toBe(true);
    expect(second.ack).toEqual(first.ack);
  });

  it('reports provisioning, pause/resume, cleanup, orphan, and terminal outcomes without git actions', async () => {
    await harness.callTool('create_agent_workspace', {
      workspace_id: 'ws-life-1',
      project_id: projectId,
      agent_id: 'agent-2',
      current_task_id: 'task-2',
      run_id_or_session_id: 'run-2',
      repo_root: '/repo/devhub',
      workspace_path: 'workspace://devhub/ws-life-1',
      base_branch: 'main',
      branch_name: 'agent/agent-2/task-2--life1',
    });

    const ready = await harness.callTool('report_agent_workspace', {
      workspace_id: 'ws-life-1',
      status: 'ready',
      worktree_path: '.worktrees/devhub/ws-life-1',
      observed_branch: 'agent/agent-2/task-2--life1',
      observed_head: 'abc123',
      observed_dirty: 'dirty-excluded',
      evidence_ref: 'evidence://ready-1',
    });
    expect(ready.updated).toBe(true);
    expect(ready.workspace.status).toBe('ready');
    expect(ready.workspace.observed_dirty).toBe('dirty-excluded');

    const active = await harness.callTool('update_agent_workspace', {
      workspace_id: 'ws-life-1',
      status: 'active',
      observed_branch: 'agent/agent-2/task-2--life1',
      observed_head: 'abc124',
      worktree_path: '.worktrees/devhub/ws-life-1',
    });
    expect(active.workspace.status).toBe('active');

    const paused = await harness.callTool('update_agent_workspace', {
      workspace_id: 'ws-life-1',
      status: 'paused',
      recovery_reason: 'awaiting-human-review',
    });
    expect(paused.workspace.status).toBe('paused');
    expect(paused.workspace.recovery_reason).toBe('awaiting-human-review');

    const resumed = await harness.callTool('update_agent_workspace', {
      workspace_id: 'ws-life-1',
      status: 'active',
      observed_branch: 'agent/agent-2/task-2--life1',
      observed_head: 'abc125',
      worktree_path: '.worktrees/devhub/ws-life-1',
    });
    expect(resumed.workspace.status).toBe('active');

    const cleanupPending = await harness.callTool('update_agent_workspace', {
      workspace_id: 'ws-life-1',
      status: 'cleanup_pending',
      evidence_ref: 'evidence://cleanup-request',
    });
    expect(cleanupPending.workspace.status).toBe('cleanup_pending');

    const completed = await harness.callTool('report_agent_workspace', {
      workspace_id: 'ws-life-1',
      status: 'completed',
      evidence_ref: 'evidence://cleanup-done',
    });
    expect(completed.workspace.status).toBe('completed');
    expect(completed.workspace.evidence_ref).toBe('evidence://cleanup-done');

    await harness.callTool('create_agent_workspace', {
      workspace_id: 'ws-orphan-1',
      project_id: projectId,
      agent_id: 'agent-3',
      current_task_id: 'task-3',
      run_id_or_session_id: 'run-3',
      repo_root: '/repo/devhub',
      workspace_path: 'workspace://devhub/ws-orphan-1',
      base_branch: 'main',
      branch_name: 'agent/agent-3/task-3--orphan1',
    });

    await harness.callTool('report_agent_workspace', {
      workspace_id: 'ws-orphan-1',
      status: 'active',
      worktree_path: '.worktrees/devhub/ws-orphan-1',
      observed_branch: 'agent/agent-3/task-3--orphan1',
      observed_head: 'ddd111',
    });

    const orphaned = await harness.callTool('update_agent_workspace', {
      workspace_id: 'ws-orphan-1',
      status: 'orphaned',
      recovery_reason: 'executor-heartbeat-lost',
    });
    expect(orphaned.workspace.status).toBe('orphaned');
    expect(orphaned.workspace.recovery_reason).toBe('executor-heartbeat-lost');
  });

  it('detects collisions, drift, and preserves last_error and recovery metadata', async () => {
    await harness.callTool('create_agent_workspace', {
      workspace_id: 'ws-collision-1',
      project_id: projectId,
      agent_id: 'agent-4',
      current_task_id: 'task-4',
      run_id_or_session_id: 'run-4',
      repo_root: '/repo/devhub',
      workspace_path: 'workspace://devhub/ws-collision-1',
      base_branch: 'main',
      branch_name: 'agent/agent-4/task-4--same',
    });

    const collision = await harness.callTool('create_agent_workspace', {
      workspace_id: 'ws-collision-2',
      project_id: projectId,
      agent_id: 'agent-5',
      current_task_id: 'task-5',
      run_id_or_session_id: 'run-5',
      repo_root: '/repo/devhub',
      workspace_path: 'workspace://devhub/ws-collision-2',
      base_branch: 'main',
      branch_name: 'agent/agent-4/task-4--same',
    });

    expect(collision.created).toBe(false);
    expect(collision.workspace.status).toBe('conflicted');
    expect(collision.workspace.last_error).toMatch(/branch_name/i);

    await harness.callTool('report_agent_workspace', {
      workspace_id: 'ws-collision-1',
      status: 'ready',
      worktree_path: '.worktrees/devhub/ws-collision-1',
      observed_branch: 'agent/agent-4/task-4--same',
      observed_head: 'aaa111',
    });

    const drift = await harness.callTool('report_agent_workspace', {
      workspace_id: 'ws-collision-1',
      status: 'active',
      worktree_path: '.worktrees/devhub/ws-collision-1-drift',
      observed_branch: 'agent/agent-4/task-4--different',
      observed_head: 'aaa222',
      evidence_ref: 'evidence://drift-1',
    });

    expect(drift.workspace.status).toBe('conflicted');
    expect(drift.workspace.last_error).toMatch(/drift/i);
    expect(drift.workspace.evidence_ref).toBe('evidence://drift-1');

    await harness.callTool('create_agent_workspace', {
      workspace_id: 'ws-path-1',
      project_id: projectId,
      agent_id: 'agent-6',
      current_task_id: 'task-6',
      run_id_or_session_id: 'run-6',
      repo_root: '/repo/devhub',
      workspace_path: 'workspace://devhub/ws-path-1',
      worktree_path: '.worktrees/devhub/shared-path',
      base_branch: 'main',
      branch_name: 'agent/agent-6/task-6--path1',
    });

    const pathCollision = await harness.callTool('create_agent_workspace', {
      workspace_id: 'ws-path-2',
      project_id: projectId,
      agent_id: 'agent-7',
      current_task_id: 'task-7',
      run_id_or_session_id: 'run-7',
      repo_root: '/repo/devhub',
      workspace_path: 'workspace://devhub/ws-path-2',
      worktree_path: '.worktrees/devhub/shared-path',
      base_branch: 'main',
      branch_name: 'agent/agent-7/task-7--path2',
    });

    expect(pathCollision.created).toBe(false);
    expect(pathCollision.workspace.status).toBe('conflicted');
    expect(pathCollision.workspace.last_error).toMatch(/worktree_path/i);
    expect(pathCollision.collision_reason).toBe('worktree_path');

    const idCollision = await harness.callTool('create_agent_workspace', {
      workspace_id: 'ws-path-1',
      project_id: projectId,
      agent_id: 'agent-6',
      current_task_id: 'task-6',
      run_id_or_session_id: 'run-6b',
      repo_root: '/repo/devhub',
      workspace_path: 'workspace://devhub/ws-path-1',
      base_branch: 'main',
      branch_name: 'agent/agent-6/task-6--path1',
    });

    expect(idCollision.created).toBe(false);
    expect(idCollision.workspace.id).toBe('ws-path-1');
    expect(idCollision.collision_reason).toBe('workspace_id');
  });

  it('preserves historical metadata across orphaned and cleanup terminal outcomes', async () => {
    await harness.callTool('create_agent_workspace', {
      workspace_id: 'ws-history-1',
      project_id: projectId,
      agent_id: 'agent-8',
      current_task_id: 'task-8',
      run_id_or_session_id: 'run-8',
      repo_root: '/repo/devhub',
      workspace_path: 'workspace://devhub/ws-history-1',
      base_branch: 'main',
      branch_name: 'agent/agent-8/task-8--history1',
    });

    await harness.callTool('report_agent_workspace', {
      workspace_id: 'ws-history-1',
      status: 'active',
      worktree_path: '.worktrees/devhub/ws-history-1',
      observed_branch: 'agent/agent-8/task-8--history1',
      observed_head: 'head-111',
      observed_dirty: 'dirty-excluded',
      evidence_ref: 'evidence://history-active',
    });

    const orphaned = await harness.callTool('update_agent_workspace', {
      workspace_id: 'ws-history-1',
      status: 'orphaned',
      recovery_reason: 'lease-lost',
    });

    expect(orphaned.workspace.status).toBe('orphaned');
    expect(orphaned.workspace.observed_head).toBe('head-111');
    expect(orphaned.workspace.observed_dirty).toBe('dirty-excluded');

    await harness.callTool('update_agent_workspace', {
      workspace_id: 'ws-history-1',
      status: 'cleanup_pending',
      evidence_ref: 'evidence://cleanup-pending-history',
    });

    const failed = await harness.callTool('report_agent_workspace', {
      workspace_id: 'ws-history-1',
      status: 'failed',
      last_error: 'cleanup executor failed',
      evidence_ref: 'evidence://cleanup-failed-history',
    });

    expect(failed.workspace.status).toBe('failed');
    expect(failed.workspace.observed_branch).toBe('agent/agent-8/task-8--history1');
    expect(failed.workspace.observed_head).toBe('head-111');
    expect(failed.workspace.observed_dirty).toBe('dirty-excluded');
    expect(failed.workspace.last_error).toBe('cleanup executor failed');
    expect(failed.workspace.completed_at).toBeTruthy();
  });

  it('exposes workspace listing and terminal immutability', async () => {
    const list = await harness.callTool('list_agent_workspaces', {
      project_id: projectId,
      status: 'all',
    });

    expect(Array.isArray(list.workspaces)).toBe(true);
    expect(list.workspaces.some((workspace) => workspace.id === 'ws-life-1')).toBe(true);

    const immutable = await harness.callTool('update_agent_workspace', {
      workspace_id: 'ws-life-1',
      status: 'failed',
      last_error: 'should-not-overwrite-terminal',
    });

    const immutableText = immutable.raw || JSON.stringify(immutable);
    expect(immutableText).toMatch(/terminal_immutable|terminal/i);
  });
});
