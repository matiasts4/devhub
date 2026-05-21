const { McpTestHarness } = require('./harness');

describe('MCP Prepare Agent Workspace Tool', () => {
  let harness;

  beforeEach(async () => {
    harness = new McpTestHarness();
    await harness.setup();
    harness.db
      .prepare('INSERT INTO projects (id, name, status) VALUES (?, ?, ?)')
      .run('550e8400-e29b-41d4-a716-446655440000', 'Workspace Contract Project', 'active');
    harness.db
      .prepare('INSERT INTO tasks (id, project_id, title, status, priority) VALUES (?, ?, ?, ?, ?)')
      .run(
        'task-prepare-1',
        '550e8400-e29b-41d4-a716-446655440000',
        'Prepare workspace',
        'pending',
        'high'
      );
  });

  afterEach(async () => {
    await harness.teardown();
  });

  test('rejects ambiguous identity when task_id or agent_id is missing', async () => {
    const result = await harness.invokeTool('prepare_agent_workspace', {
      task_id: 'task-prepare-1',
      correlation_id: 'corr-missing-agent',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('task_id y agent_id deben enviarse juntos');
  });

  test('accepts task plus agent identity and defaults baseline commit', async () => {
    const result = await harness.invokeTool('prepare_agent_workspace', {
      task_id: 'task-prepare-1',
      agent_id: 'agent-prepare-1',
      correlation_id: 'corr-prepare-1',
    });
    const body = harness.assertToolResponse(result, ['accepted', 'ack', 'contract']);

    expect(body.accepted).toBe(true);
    expect(body.created).toBe(true);
    expect(body.ack).toEqual(
      expect.objectContaining({
        workspace_id: 'workspace-task-prepare-1-agent-prepare-1',
        task_id: 'task-prepare-1',
        agent_id: 'agent-prepare-1',
        requested_base_ref: 'f814998dd05cb491caf8637bf570dbd74b539090',
        correlation_id: 'corr-prepare-1',
        status: 'provisioning',
      })
    );
    expect(body.contract).toEqual(
      expect.objectContaining({
        frozen_base_commit: 'f814998dd05cb491caf8637bf570dbd74b539090',
        sw_2_1_checkpoint: '02d82361449a09e93e5880a08e35e3043617002d',
        sw_3_1_checkpoint: '4b1e344dcd202c911498af17236fcb86a2a2cb1e',
      })
    );

    const workspace = harness.verifyDbState(
      'agent_workspaces',
      { id: 'workspace-task-prepare-1-agent-prepare-1' },
      {
        project_id: '550e8400-e29b-41d4-a716-446655440000',
        base_commit: 'f814998dd05cb491caf8637bf570dbd74b539090',
        status: 'provisioning',
        correlation_id: 'corr-prepare-1',
      }
    );

    expect(workspace.observed_branch).toBeNull();
    expect(workspace.observed_head).toBeNull();
    expect(workspace.observed_dirty).toBeNull();
    expect(workspace.evidence_ref).toBeNull();
    expect(workspace.workspace_path).toBe(
      'workspace://550e8400-e29b-41d4-a716-446655440000/workspace-task-prepare-1-agent-prepare-1'
    );
  });

  test('reuses prior ack when workspace_id and correlation_id repeat', async () => {
    const first = await harness.invokeAndParse('prepare_agent_workspace', {
      task_id: 'task-prepare-1',
      agent_id: 'agent-prepare-1',
      correlation_id: 'corr-repeat-1',
    });

    const second = await harness.invokeAndParse('prepare_agent_workspace', {
      workspace_id: first.ack.workspace_id,
      correlation_id: 'corr-repeat-1',
    });

    expect(second.accepted).toBe(true);
    expect(second.created).toBe(false);
    expect(second.reused).toBe(true);
    expect(second.ack).toEqual(first.ack);

    const count = harness.db
      .prepare('SELECT COUNT(*) AS total FROM agent_workspaces WHERE id = ?')
      .get(first.ack.workspace_id);
    expect(count.total).toBe(1);
  });
});
