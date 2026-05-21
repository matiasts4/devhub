import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { createTestHarness } from '../test-harness.js';

describe('MCP Agent Runs + Artifacts tools', () => {
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

  it('creates durable runs and append-only artifacts without exposing git verbs', async () => {
    await harness.callTool('create_agent_workspace', {
      workspace_id: 'ws-run-tool-1',
      project_id: projectId,
      agent_id: 'agent-run-tool-1',
      current_task_id: 'task-run-tool-1',
      run_id_or_session_id: 'session-run-tool-1',
      repo_root: '/repo/devhub',
      workspace_path: 'workspace://devhub/ws-run-tool-1',
      base_branch: 'main',
    });

    const created = await harness.callTool('create_agent_run', {
      run_id: 'run-tool-1',
      workspace_id: 'ws-run-tool-1',
      task_id: 'task-run-tool-1',
      agent_id: 'agent-run-tool-1',
      requested_base_ref: 'f814998dd05cb491caf8637bf570dbd74b539090',
      baseline_commit: 'f814998dd05cb491caf8637bf570dbd74b539090',
      observed_start_dirty: 'dirty-excluded',
      observed_start_path: 'workspace://devhub/ws-run-tool-1',
      status: 'running',
    });

    const artifact = await harness.callTool('append_agent_artifact', {
      artifact_id: 'artifact-tool-1',
      run_id: 'run-tool-1',
      phase: 'execute',
      kind: 'decision.note',
      producer: 'devhub',
      summary: 'Executor intent accepted.',
      evidence_ref: 'evidence://run-tool-1/intent',
      observed_at: '2026-05-18T23:00:00.000Z',
    });

    const runs = await harness.callTool('list_agent_runs', {
      workspace_id: 'ws-run-tool-1',
    });
    const artifacts = await harness.callTool('list_agent_artifacts', {
      run_id: 'run-tool-1',
    });
    const workspaceEvidence = await harness.callTool('get_workspace_evidence', {
      workspace_id: 'ws-run-tool-1',
    });

    expect(created.created).toBe(true);
    expect(created.run.run_id).toBe('run-tool-1');
    expect(artifact.created).toBe(true);
    expect(artifact.artifact.seq).toBe(1);
    expect(runs.runs).toHaveLength(1);
    expect(artifacts.artifacts).toHaveLength(1);
    expect(workspaceEvidence.workspace.workspace_id).toBe('ws-run-tool-1');
    expect(workspaceEvidence.latest_run.run_id).toBe('run-tool-1');
    expect(workspaceEvidence.latest_artifact.artifact_id).toBe('artifact-tool-1');
  });

  it('closes a run with terminal metadata while keeping prior artifacts immutable', async () => {
    await harness.callTool('complete_agent_run', {
      run_id: 'run-tool-1',
      status: 'succeeded',
      terminal_reason_class: 'qa_approved',
      completed_at: '2026-05-18T23:10:00.000Z',
    });

    const run = await harness.callTool('get_agent_run', {
      run_id: 'run-tool-1',
    });
    const artifacts = await harness.callTool('list_agent_artifacts', {
      run_id: 'run-tool-1',
    });

    expect(run.run.status).toBe('succeeded');
    expect(run.run.terminal_reason_class).toBe('qa_approved');
    expect(artifacts.artifacts).toHaveLength(1);
    expect(artifacts.artifacts[0].summary).toBe('Executor intent accepted.');
  });
});
