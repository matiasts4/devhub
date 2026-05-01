const { McpTestHarness } = require('../agenthub/mcp/harness');
const { seedProject, seedTask, seedMilestone } = require('../agenthub/fixtures');

describe('MCP harness regressions', () => {
  let harness;

  beforeEach(async () => {
    harness = new McpTestHarness();
    await harness.setup();
  });

  afterEach(async () => {
    await harness.teardown();
  });

  test('list_projects returns totals and seeded progress values', async () => {
    seedProject(harness.db, {
      id: 'proj-1',
      name: 'Project Alpha',
      status: 'active',
      progress: 50,
      color: '#FF5733',
    });

    const result = await harness.invokeTool('list_projects', { status: 'all' });
    const body = harness.assertToolResponse(result, ['total', 'projects']);

    expect(body.total).toBe(1);
    expect(body.projects[0]).toMatchObject({
      id: 'proj-1',
      progress: 50,
      color: '#FF5733',
    });
  });

  test('milestone and docops helpers preserve due-date ordering and documentation policy', async () => {
    seedProject(harness.db, {
      id: 'proj-1',
      name: 'DocOps',
      documentation_policy: 'archive_only',
      planning_prompt: 'Plan canonico',
    });
    seedMilestone(harness.db, 'proj-1', { id: 'late', title: 'Late', due_date: '2026-12-01' });
    seedMilestone(harness.db, 'proj-1', { id: 'early', title: 'Early', due_date: '2026-01-01' });

    const milestones = await harness.invokeTool('list_milestones', { project_id: 'proj-1' });
    const milestoneBody = harness.assertToolResponse(milestones, ['milestones']);
    expect(milestoneBody.milestones.map((m) => m.id)).toEqual(['early', 'late']);

    const context = await harness.invokeTool('build_context_pack', {
      project_id: 'proj-1',
      objective: 'Documentar',
      topic_key: 'project/docs/archive',
    });
    const contextBody = harness.assertToolResponse(context, ['context_pack']);
    expect(contextBody.context_pack.documentation_policy).toBe('archive_only');
    expect(contextBody.context_pack.documentation_policy_metadata.mode).toBe('archive-first');
  });

  test('get_next_task skips blockers and prefers higher business value', async () => {
    seedProject(harness.db, { id: 'proj-1', name: 'Planning' });
    seedTask(harness.db, 'proj-1', {
      id: 'task-blocked',
      title: 'Blocked',
      status: 'pending',
      priority: 'critical',
      business_value: 10,
    });
    seedTask(harness.db, 'proj-1', {
      id: 'task-high-bv',
      title: 'High BV',
      status: 'pending',
      priority: 'medium',
      business_value: 10,
    });
    seedTask(harness.db, 'proj-1', {
      id: 'task-low-bv',
      title: 'Low BV',
      status: 'pending',
      priority: 'medium',
      business_value: 1,
    });
    seedTask(harness.db, 'proj-1', {
      id: 'task-dep',
      title: 'Dependency',
      status: 'pending',
    });

    harness.db
      .prepare(
        `INSERT INTO task_dependencies (id, task_id, depends_on, tipo, created_at)
         VALUES (?, ?, ?, ?, datetime('now'))`
      )
      .run('dep-1', 'task-blocked', 'task-dep', 'blocks');

    const result = await harness.invokeTool('get_next_task', {
      project_id: 'proj-1',
      agent_id: 'agent-1',
    });
    const body = harness.assertToolResponse(result, ['task']);

    expect(body.task.id).toBe('task-high-bv');
  });
});
