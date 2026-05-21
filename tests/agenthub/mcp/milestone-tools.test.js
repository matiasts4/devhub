/**
 * Task 27: Test MCP milestone tools
 *
 * Tests: list_milestones, create_milestone, update_milestone
 * - Test project linkage, task linkage
 */

const { McpTestHarness } = require('./harness');
const { seedProject, seedTask, seedMilestone } = require('../fixtures');
const { assertDbRow, assertDbRowCount } = require('../assertions');

describe('MCP Milestone Tools', () => {
  let harness;

  beforeEach(async () => {
    harness = new McpTestHarness();
    await harness.setup();
  });

  afterEach(async () => {
    await harness.teardown();
  });

  // ─── list_milestones ─────────────────────────────────────────────

  describe('list_milestones', () => {
    test('returns empty list when no milestones exist', async () => {
      seedProject(harness.db, { id: 'proj-1', name: 'Test' });

      const result = await harness.invokeTool('list_milestones', { project_id: 'proj-1' });
      const body = harness.assertToolResponse(result, ['total', 'milestones']);

      expect(body.total).toBe(0);
      expect(body.milestones).toEqual([]);
    });

    test('returns all milestones for a project', async () => {
      seedProject(harness.db, { id: 'proj-1', name: 'Test' });
      seedMilestone(harness.db, 'proj-1', { id: 'ms-1', title: 'MS One', status: 'planned' });
      seedMilestone(harness.db, 'proj-1', { id: 'ms-2', title: 'MS Two', status: 'in_progress' });

      const result = await harness.invokeTool('list_milestones', { project_id: 'proj-1' });
      const body = harness.assertToolResponse(result, ['total', 'milestones']);

      expect(body.total).toBe(2);
      expect(body.milestones.map((m) => m.id)).toContain('ms-1');
      expect(body.milestones.map((m) => m.id)).toContain('ms-2');
    });

    test('filters milestones by status', async () => {
      seedProject(harness.db, { id: 'proj-1', name: 'Test' });
      seedMilestone(harness.db, 'proj-1', { id: 'ms-1', title: 'Planned', status: 'planned' });
      seedMilestone(harness.db, 'proj-1', { id: 'ms-2', title: 'Done', status: 'completed' });
      seedMilestone(harness.db, 'proj-1', { id: 'ms-3', title: 'Risk', status: 'at_risk' });

      const result = await harness.invokeTool('list_milestones', {
        project_id: 'proj-1',
        status: 'completed',
      });
      const body = harness.assertToolResponse(result, ['total', 'milestones']);

      expect(body.total).toBe(1);
      expect(body.milestones[0].id).toBe('ms-2');
    });

    test('returns milestones ordered by due_date ASC', async () => {
      seedProject(harness.db, { id: 'proj-1', name: 'Test' });
      seedMilestone(harness.db, 'proj-1', {
        id: 'ms-late',
        title: 'Late',
        due_date: '2026-06-01',
      });
      seedMilestone(harness.db, 'proj-1', {
        id: 'ms-early',
        title: 'Early',
        due_date: '2026-01-01',
      });

      const result = await harness.invokeTool('list_milestones', { project_id: 'proj-1' });
      const body = harness.assertToolResponse(result, ['total', 'milestones']);

      // Earliest due_date first
      expect(body.milestones[0].id).toBe('ms-early');
      expect(body.milestones[1].id).toBe('ms-late');
    });

    test('milestones are scoped to their project', async () => {
      seedProject(harness.db, { id: 'proj-a', name: 'Project A' });
      seedProject(harness.db, { id: 'proj-b', name: 'Project B' });
      seedMilestone(harness.db, 'proj-a', { id: 'ms-a', title: 'MS A' });
      seedMilestone(harness.db, 'proj-b', { id: 'ms-b', title: 'MS B' });

      const resultA = await harness.invokeTool('list_milestones', { project_id: 'proj-a' });
      const bodyA = harness.assertToolResponse(resultA, ['total', 'milestones']);
      expect(bodyA.total).toBe(1);
      expect(bodyA.milestones[0].id).toBe('ms-a');

      const resultB = await harness.invokeTool('list_milestones', { project_id: 'proj-b' });
      const bodyB = harness.assertToolResponse(resultB, ['total', 'milestones']);
      expect(bodyB.total).toBe(1);
      expect(bodyB.milestones[0].id).toBe('ms-b');
    });
  });

  // ─── create_milestone ────────────────────────────────────────────

  describe('create_milestone', () => {
    test('creates a milestone with minimal fields', async () => {
      seedProject(harness.db, { id: 'proj-1', name: 'Test' });

      const result = await harness.invokeTool('create_milestone', {
        project_id: 'proj-1',
        user_id: 'user-1',
        title: 'New Milestone',
      });
      const body = harness.assertToolResponse(result, ['created', 'milestone']);

      expect(body.created).toBe(true);
      expect(body.milestone.title).toBe('New Milestone');
      expect(body.milestone.project_id).toBe('proj-1');
      expect(body.milestone.status).toBe('planned');
      expect(body.milestone.id).toBeDefined();

      // Verify DB state
      assertDbRowCount(harness.db, 'milestones', { project_id: 'proj-1' }, 1);
    });

    test('creates a milestone with all fields', async () => {
      seedProject(harness.db, { id: 'proj-1', name: 'Test' });

      const result = await harness.invokeTool('create_milestone', {
        project_id: 'proj-1',
        user_id: 'user-1',
        title: 'Full Milestone',
        description: 'Detailed description',
        status: 'in_progress',
        due_date: '2026-03-15',
      });
      const body = harness.assertToolResponse(result, ['created', 'milestone']);

      expect(body.milestone.title).toBe('Full Milestone');
      expect(body.milestone.description).toBe('Detailed description');
      expect(body.milestone.status).toBe('in_progress');
      expect(body.milestone.due_date).toBe('2026-03-15');
    });

    test('milestone is linked to correct project', async () => {
      seedProject(harness.db, { id: 'proj-1', name: 'Project 1' });
      seedProject(harness.db, { id: 'proj-2', name: 'Project 2' });

      const result = await harness.invokeTool('create_milestone', {
        project_id: 'proj-2',
        user_id: 'user-1',
        title: 'Project 2 Milestone',
      });
      const body = harness.assertToolResponse(result, ['created', 'milestone']);

      expect(body.milestone.project_id).toBe('proj-2');
      assertDbRow(harness.db, 'milestones', { id: body.milestone.id }, { project_id: 'proj-2' });
    });

    test('project-1 has 0 milestones, project-2 has 1', async () => {
      seedProject(harness.db, { id: 'proj-1', name: 'Project 1' });
      seedProject(harness.db, { id: 'proj-2', name: 'Project 2' });

      await harness.invokeTool('create_milestone', {
        project_id: 'proj-2',
        user_id: 'user-1',
        title: 'Only for P2',
      });

      assertDbRowCount(harness.db, 'milestones', { project_id: 'proj-1' }, 0);
      assertDbRowCount(harness.db, 'milestones', { project_id: 'proj-2' }, 1);
    });
  });

  // ─── update_milestone ────────────────────────────────────────────

  describe('update_milestone', () => {
    test('updates milestone status', async () => {
      seedProject(harness.db, { id: 'proj-1', name: 'Test' });
      seedMilestone(harness.db, 'proj-1', {
        id: 'ms-1',
        title: 'Milestone',
        status: 'planned',
      });

      const result = await harness.invokeTool('update_milestone', {
        milestone_id: 'ms-1',
        status: 'completed',
      });
      const body = harness.assertToolResponse(result, ['updated', 'milestone']);

      expect(body.updated).toBe(true);
      expect(body.milestone.status).toBe('completed');
      assertDbRow(harness.db, 'milestones', { id: 'ms-1' }, { status: 'completed' });
    });

    test('updates milestone title and description', async () => {
      seedProject(harness.db, { id: 'proj-1', name: 'Test' });
      seedMilestone(harness.db, 'proj-1', {
        id: 'ms-1',
        title: 'Old Title',
        description: 'Old desc',
      });

      const result = await harness.invokeTool('update_milestone', {
        milestone_id: 'ms-1',
        title: 'New Title',
        description: 'New desc',
      });
      const body = harness.assertToolResponse(result, ['updated', 'milestone']);

      expect(body.milestone.title).toBe('New Title');
      expect(body.milestone.description).toBe('New desc');
    });

    test('updates milestone due_date', async () => {
      seedProject(harness.db, { id: 'proj-1', name: 'Test' });
      seedMilestone(harness.db, 'proj-1', {
        id: 'ms-1',
        title: 'Milestone',
        due_date: '2026-01-01',
      });

      const result = await harness.invokeTool('update_milestone', {
        milestone_id: 'ms-1',
        due_date: '2026-06-01',
      });
      const body = harness.assertToolResponse(result, ['updated', 'milestone']);

      expect(body.milestone.due_date).toBe('2026-06-01');
    });

    test('can set due_date to null', async () => {
      seedProject(harness.db, { id: 'proj-1', name: 'Test' });
      seedMilestone(harness.db, 'proj-1', {
        id: 'ms-1',
        title: 'Milestone',
        due_date: '2026-01-01',
      });

      const result = await harness.invokeTool('update_milestone', {
        milestone_id: 'ms-1',
        due_date: null,
      });
      const body = harness.assertToolResponse(result, ['updated', 'milestone']);

      expect(body.milestone.due_date).toBeNull();
    });

    test('updates assigned_to', async () => {
      seedProject(harness.db, { id: 'proj-1', name: 'Test' });
      seedMilestone(harness.db, 'proj-1', { id: 'ms-1', title: 'Milestone' });

      const result = await harness.invokeTool('update_milestone', {
        milestone_id: 'ms-1',
        assigned_to: '00000000-0000-0000-0000-000000000001',
      });
      const body = harness.assertToolResponse(result, ['updated', 'milestone']);

      expect(body.milestone.assigned_to).toBe('00000000-0000-0000-0000-000000000001');
    });

    test('returns error for non-existent milestone', async () => {
      const result = await harness.invokeTool('update_milestone', {
        milestone_id: 'non-existent-ms',
        status: 'completed',
      });

      expect(result.isError).toBe(true);
    });

    test('returns error when no fields provided', async () => {
      seedProject(harness.db, { id: 'proj-1', name: 'Test' });
      seedMilestone(harness.db, 'proj-1', { id: 'ms-1', title: 'Milestone' });

      const result = await harness.invokeTool('update_milestone', {
        milestone_id: 'ms-1',
      });

      expect(result.isError).toBe(true);
    });
  });

  // ─── Task linkage to milestones ──────────────────────────────────

  describe('task linkage to milestones', () => {
    test('tasks can be created under a milestone', async () => {
      seedProject(harness.db, { id: 'proj-1', name: 'Test' });
      seedMilestone(harness.db, 'proj-1', { id: 'ms-1', title: 'MS1' });

      const taskResult = await harness.invokeTool('create_task', {
        project_id: 'proj-1',
        user_id: 'user-1',
        title: 'Milestone Task',
        milestone_id: 'ms-1',
      });
      const taskBody = harness.assertToolResponse(taskResult, ['created', 'task']);

      expect(taskBody.task.milestone_id).toBe('ms-1');
      assertDbRow(harness.db, 'tasks', { id: taskBody.task.id }, { milestone_id: 'ms-1' });
    });

    test('multiple tasks can share the same milestone', async () => {
      seedProject(harness.db, { id: 'proj-1', name: 'Test' });
      seedMilestone(harness.db, 'proj-1', { id: 'ms-1', title: 'MS1' });

      await harness.invokeTool('create_task', {
        project_id: 'proj-1',
        user_id: 'user-1',
        title: 'Task A',
        milestone_id: 'ms-1',
      });
      await harness.invokeTool('create_task', {
        project_id: 'proj-1',
        user_id: 'user-1',
        title: 'Task B',
        milestone_id: 'ms-1',
      });

      assertDbRowCount(harness.db, 'tasks', { milestone_id: 'ms-1' }, 2);
    });
  });
});
