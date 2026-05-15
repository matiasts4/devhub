const { McpTestHarness } = require('./harness');
const { seedProject, seedTask } = require('../fixtures');
const { assertDbRow, assertDbRowCount } = require('../assertions');

describe('MCP task lease tools', () => {
  let harness;

  beforeEach(async () => {
    harness = new McpTestHarness();
    await harness.setup();
  });

  afterEach(async () => {
    await harness.teardown();
  });

  test('claim_next_task creates a lease and is idempotent for the same agent', async () => {
    seedProject(harness.db, { id: 'proj-1', name: 'Lease Project' });
    seedTask(harness.db, 'proj-1', {
      id: 'task-1',
      title: 'Highest Priority',
      status: 'pending',
      priority: 'critical',
      business_value: 10,
    });
    seedTask(harness.db, 'proj-1', {
      id: 'task-2',
      title: 'Lower Priority',
      status: 'pending',
      priority: 'medium',
      business_value: 1,
    });

    await harness.invokeTool('register_agent', {
      agent_id: 'agent-1',
      project_id: 'proj-1',
      nombre: 'Lease Agent',
    });

    const firstResult = await harness.invokeTool('claim_next_task', {
      project_id: 'proj-1',
      agent_id: 'agent-1',
    });
    const firstBody = harness.assertToolResponse(firstResult, ['claimed', 'task', 'message']);

    expect(firstBody.claimed).toBe(true);
    expect(firstBody.task.id).toBe('task-1');
    expect(firstBody.task.assigned_to).toBe('agent-1');
    expect(firstBody.task.claim_token).toBeTruthy();
    expect(firstBody.task.claimed_at).toBeTruthy();
    expect(firstBody.task.lease_expires_at).toBeTruthy();

    const secondResult = await harness.invokeTool('claim_next_task', {
      project_id: 'proj-1',
      agent_id: 'agent-1',
    });
    const secondBody = harness.assertToolResponse(secondResult, ['claimed', 'task', 'message']);

    expect(secondBody.claimed).toBe(true);
    expect(secondBody.task.id).toBe('task-1');
    expect(secondBody.task.claim_token).toBe(firstBody.task.claim_token);
    expect(secondBody.message).toMatch(/ya tiene|already/i);
    assertDbRowCount(harness.db, 'tasks', { status: 'in_progress' }, 1);
  });

  test('renew_task_lease extends the active lease only for the current token', async () => {
    seedProject(harness.db, { id: 'proj-1', name: 'Lease Project' });
    seedTask(harness.db, 'proj-1', {
      id: 'task-1',
      title: 'Renew Me',
      status: 'pending',
      priority: 'high',
      business_value: 8,
    });

    await harness.invokeTool('register_agent', {
      agent_id: 'agent-1',
      project_id: 'proj-1',
      nombre: 'Lease Agent',
    });

    const claimed = harness.assertToolResponse(
      await harness.invokeTool('claim_next_task', {
        project_id: 'proj-1',
        agent_id: 'agent-1',
      }),
      ['task']
    );

    const heartbeatBefore = harness.db
      .prepare("SELECT last_heartbeat FROM agent_registry WHERE agent_id = 'agent-1'")
      .get();

    await new Promise((resolve) => setTimeout(resolve, 10));

    const renewedResult = await harness.invokeTool('renew_task_lease', {
      task_id: 'task-1',
      agent_id: 'agent-1',
      claim_token: claimed.task.claim_token,
    });
    const renewedBody = harness.assertToolResponse(renewedResult, ['renewed', 'task', 'message']);

    expect(renewedBody.renewed).toBe(true);
    expect(new Date(renewedBody.task.lease_expires_at).getTime()).toBeGreaterThan(
      new Date(claimed.task.lease_expires_at).getTime()
    );

    const heartbeatAfter = harness.db
      .prepare("SELECT last_heartbeat FROM agent_registry WHERE agent_id = 'agent-1'")
      .get();
    expect(new Date(heartbeatAfter.last_heartbeat).getTime()).toBeGreaterThan(
      new Date(heartbeatBefore.last_heartbeat).getTime()
    );

    const rejected = await harness.invokeTool('renew_task_lease', {
      task_id: 'task-1',
      agent_id: 'agent-1',
      claim_token: 'wrong-token',
    });
    expect(rejected.isError).toBe(true);
  });

  test('release_task clears lease fields for completed and paused outcomes', async () => {
    seedProject(harness.db, { id: 'proj-1', name: 'Lease Project' });
    seedTask(harness.db, 'proj-1', {
      id: 'task-complete',
      title: 'Complete Me',
      status: 'pending',
      priority: 'critical',
      business_value: 9,
    });
    seedTask(harness.db, 'proj-1', {
      id: 'task-pause',
      title: 'Pause Me',
      status: 'pending',
      priority: 'high',
      business_value: 7,
    });

    await harness.invokeTool('register_agent', {
      agent_id: 'agent-1',
      project_id: 'proj-1',
      nombre: 'Lease Agent',
    });

    const firstClaim = harness.assertToolResponse(
      await harness.invokeTool('claim_next_task', {
        project_id: 'proj-1',
        agent_id: 'agent-1',
      }),
      ['task']
    );

    const completedResult = await harness.invokeTool('release_task', {
      task_id: 'task-complete',
      agent_id: 'agent-1',
      claim_token: firstClaim.task.claim_token,
      outcome: 'completed',
    });
    const completedBody = harness.assertToolResponse(completedResult, ['released', 'task']);
    expect(completedBody.released).toBe(true);
    expect(completedBody.task.status).toBe('completed');
    expect(completedBody.task.claim_token).toBeNull();

    const secondClaim = harness.assertToolResponse(
      await harness.invokeTool('claim_next_task', {
        project_id: 'proj-1',
        agent_id: 'agent-1',
      }),
      ['task']
    );

    const pausedResult = await harness.invokeTool('release_task', {
      task_id: 'task-pause',
      agent_id: 'agent-1',
      claim_token: secondClaim.task.claim_token,
      outcome: 'paused',
    });
    const pausedBody = harness.assertToolResponse(pausedResult, ['released', 'task']);

    expect(pausedBody.task.status).toBe('pending');
    expect(pausedBody.task.assigned_to).toBeNull();
    expect(pausedBody.task.claimed_at).toBeNull();
    expect(pausedBody.task.lease_expires_at).toBeNull();
    expect(pausedBody.task.claim_token).toBeNull();
  });

  test('get_execution_queue releases expired leases before scoring pending work', async () => {
    seedProject(harness.db, { id: 'proj-1', name: 'Lease Project' });
    seedTask(harness.db, 'proj-1', {
      id: 'task-expired',
      title: 'Expired Lease',
      status: 'in_progress',
      priority: 'high',
      business_value: 6,
      assigned_to: 'agent-stale',
    });

    harness.db
      .prepare(
        `UPDATE tasks
         SET claimed_at = ?, lease_expires_at = ?, claim_token = ?, updated_at = ?
         WHERE id = 'task-expired'`
      )
      .run(
        '2026-01-01T00:00:00.000Z',
        '2026-01-01T00:01:00.000Z',
        'expired-token',
        '2026-01-01T00:01:00.000Z'
      );

    const queueResult = await harness.invokeTool('get_execution_queue', {
      project_id: 'proj-1',
      limit: 5,
      include_blocked: true,
    });
    const queueBody = harness.assertToolResponse(queueResult, ['queue']);

    expect(queueBody.queue.some((task) => task.id === 'task-expired')).toBe(true);
    assertDbRow(
      harness.db,
      'tasks',
      { id: 'task-expired' },
      {
        status: 'pending',
        assigned_to: null,
        claim_token: null,
        claimed_at: null,
        lease_expires_at: null,
      }
    );
  });

  test('get_next_task is a compatibility wrapper over tokenized claims and unregister_agent releases ownership', async () => {
    seedProject(harness.db, { id: 'proj-1', name: 'Lease Project' });
    seedTask(harness.db, 'proj-1', {
      id: 'task-1',
      title: 'Wrapper Task',
      status: 'pending',
      priority: 'critical',
      business_value: 9,
    });

    await harness.invokeTool('register_agent', {
      agent_id: 'agent-1',
      project_id: 'proj-1',
      nombre: 'Lease Agent',
    });

    const first = harness.assertToolResponse(
      await harness.invokeTool('get_next_task', {
        project_id: 'proj-1',
        agent_id: 'agent-1',
      }),
      ['task', 'message']
    );
    const second = harness.assertToolResponse(
      await harness.invokeTool('get_next_task', {
        project_id: 'proj-1',
        agent_id: 'agent-1',
      }),
      ['task', 'message']
    );

    expect(first.task.id).toBe('task-1');
    expect(second.task.id).toBe('task-1');
    expect(second.task.claim_token).toBe(first.task.claim_token);
    expect(second.message).toContain('Tarea asignada');

    const unregisterResult = await harness.invokeTool('unregister_agent', {
      agent_id: 'agent-1',
    });
    const unregisterBody = harness.assertToolResponse(unregisterResult, ['success', 'message']);
    expect(unregisterBody.success).toBe(true);

    assertDbRowCount(harness.db, 'agent_registry', { agent_id: 'agent-1' }, 0);
    assertDbRow(
      harness.db,
      'tasks',
      { id: 'task-1' },
      {
        status: 'pending',
        assigned_to: null,
        claim_token: null,
      }
    );
  });
});
