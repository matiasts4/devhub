import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { createTestHarness } from '../test-harness.js';

describe('MCP Prepare Agent Workspace Reporting', () => {
  let harness;

  beforeAll(async () => {
    harness = await createTestHarness();
    await harness.initialize();
  });

  afterAll(async () => {
    await harness.cleanup();
  });

  it('records ready outcomes for prepared workspaces and passes evidence_ref through unchanged', async () => {
    const accepted = await harness.callTool('prepare_agent_workspace', {
      task_id: 'task-report-1',
      agent_id: 'agent-report-1',
      correlation_id: 'corr-report-1',
    });

    const reported = await harness.callTool('report_agent_workspace', {
      workspace_id: accepted.ack.workspace_id,
      correlation_id: 'corr-report-1',
      status: 'ready',
      worktree_path: '.worktrees/devhub/ws-report-1',
      observed_branch: 'agent/agent-report-1/task-report-1',
      observed_head: 'abc123',
      evidence_ref: 'evidence://prepare-ready-1',
    });

    expect(reported.updated).toBe(true);
    expect(reported.no_op).toBe(false);
    expect(reported.workspace.status).toBe('ready');
    expect(reported.workspace.correlation_id).toBe('corr-report-1');
    expect(reported.workspace.evidence_ref).toBe('evidence://prepare-ready-1');
    expect(reported.workspace.last_error_class).toBeNull();
  });

  it('treats repeated reports for the same correlation and evidence as a no-op', async () => {
    const accepted = await harness.callTool('prepare_agent_workspace', {
      task_id: 'task-report-2',
      agent_id: 'agent-report-2',
      correlation_id: 'corr-report-2',
    });

    const first = await harness.callTool('report_agent_workspace', {
      workspace_id: accepted.ack.workspace_id,
      correlation_id: 'corr-report-2',
      status: 'failed',
      error_class: 'prepare_failed',
      last_error: 'executor prepare failed',
      evidence_ref: 'evidence://prepare-failed-2',
    });

    const second = await harness.callTool('report_agent_workspace', {
      workspace_id: accepted.ack.workspace_id,
      correlation_id: 'corr-report-2',
      status: 'failed',
      error_class: 'prepare_failed',
      last_error: 'executor prepare failed',
      evidence_ref: 'evidence://prepare-failed-2',
    });

    expect(first.updated).toBe(true);
    expect(second.updated).toBe(false);
    expect(second.no_op).toBe(true);
    expect(second.workspace.status).toBe('failed');
    expect(second.workspace.evidence_ref).toBe('evidence://prepare-failed-2');
  });

  it('reconciles ownership collision and base drift as conflicted while preserving dirty-excluded', async () => {
    const accepted = await harness.callTool('prepare_agent_workspace', {
      task_id: 'task-report-3',
      agent_id: 'agent-report-3',
      correlation_id: 'corr-report-3a',
    });

    const collision = await harness.callTool('report_agent_workspace', {
      workspace_id: accepted.ack.workspace_id,
      correlation_id: 'corr-report-3a',
      status: 'ready',
      worktree_path: '.worktrees/devhub/ws-report-3a',
      observed_branch: 'agent/agent-report-3/task-report-3',
      observed_head: 'head-3a',
      observed_dirty: 'dirty-excluded',
      error_class: 'ownership_collision',
      recovery_reason: 'existing branch already owned',
      evidence_ref: 'evidence://prepare-conflict-3a',
    });

    expect(collision.workspace.status).toBe('conflicted');
    expect(collision.workspace.last_error_class).toBe('ownership_collision');
    expect(collision.workspace.observed_dirty).toBe('dirty-excluded');

    const retry = await harness.callTool('prepare_agent_workspace', {
      workspace_id: accepted.ack.workspace_id,
      correlation_id: 'corr-report-3b',
    });

    expect(retry.reused).toBe(false);
    expect(retry.ack.status).toBe('provisioning');

    const drift = await harness.callTool('report_agent_workspace', {
      workspace_id: accepted.ack.workspace_id,
      correlation_id: 'corr-report-3b',
      status: 'ready',
      worktree_path: '.worktrees/devhub/ws-report-3b',
      observed_branch: 'agent/agent-report-3/task-report-3-retry',
      observed_head: 'head-3b',
      observed_dirty: 'dirty-excluded',
      error_class: 'base_drift',
      evidence_ref: 'evidence://prepare-drift-3b',
    });

    expect(drift.workspace.status).toBe('conflicted');
    expect(drift.workspace.last_error_class).toBe('base_drift');
    expect(drift.workspace.correlation_id).toBe('corr-report-3b');
    expect(drift.workspace.evidence_ref).toBe('evidence://prepare-drift-3b');
    expect(drift.workspace.observed_dirty).toBe('dirty-excluded');
  });

  it('marks executor loss as orphaned and only accepts fresh evidence after a new prepare correlation', async () => {
    const accepted = await harness.callTool('prepare_agent_workspace', {
      task_id: 'task-report-4',
      agent_id: 'agent-report-4',
      correlation_id: 'corr-report-4a',
    });

    const orphaned = await harness.callTool('report_agent_workspace', {
      workspace_id: accepted.ack.workspace_id,
      correlation_id: 'corr-report-4a',
      status: 'orphaned',
      error_class: 'executor_lost',
      recovery_reason: 'heartbeat-timeout',
      evidence_ref: 'evidence://prepare-orphaned-4a',
    });

    expect(orphaned.workspace.status).toBe('orphaned');
    expect(orphaned.workspace.last_error_class).toBe('executor_lost');
    expect(orphaned.workspace.recovery_reason).toBe('heartbeat-timeout');

    const staleCorrelation = await harness.callTool('report_agent_workspace', {
      workspace_id: accepted.ack.workspace_id,
      correlation_id: 'corr-report-4b',
      status: 'ready',
      worktree_path: '.worktrees/devhub/ws-report-4b',
      observed_branch: 'agent/agent-report-4/task-report-4-retry',
      observed_head: 'head-4b',
      evidence_ref: 'evidence://prepare-ready-4b',
    });

    expect(staleCorrelation.raw || JSON.stringify(staleCorrelation)).toMatch(/correlation_id/i);

    const retry = await harness.callTool('prepare_agent_workspace', {
      workspace_id: accepted.ack.workspace_id,
      correlation_id: 'corr-report-4b',
    });

    expect(retry.reused).toBe(false);
    expect(retry.ack.status).toBe('provisioning');

    const ready = await harness.callTool('report_agent_workspace', {
      workspace_id: accepted.ack.workspace_id,
      correlation_id: 'corr-report-4b',
      status: 'ready',
      worktree_path: '.worktrees/devhub/ws-report-4b',
      observed_branch: 'agent/agent-report-4/task-report-4-retry',
      observed_head: 'head-4b',
      evidence_ref: 'evidence://prepare-ready-4b',
    });

    expect(ready.workspace.status).toBe('ready');
    expect(ready.workspace.evidence_ref).toBe('evidence://prepare-ready-4b');
    expect(ready.workspace.correlation_id).toBe('corr-report-4b');
    expect(ready.workspace.last_error_class).toBeNull();
    expect(ready.workspace.recovery_reason).toBeNull();
  });
});
