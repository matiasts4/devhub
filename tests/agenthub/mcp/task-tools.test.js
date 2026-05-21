/**
 * Task 26: Test MCP task tools
 *
 * Tests: list_tasks, create_task, update_task, delete_task, add_task_comment
 * - Include tool chain test: create → update → list verifies chain
 * - Test milestone linkage
 */

const { McpTestHarness } = require('./harness');
const { seedProject, seedTask, seedMilestone } = require('../fixtures');
const { assertDbRow, assertDbRowCount, assertBodyShape } = require('../assertions');

describe('MCP Task Tools', () => {
  let harness;

  beforeEach(async () => {
    harness = new McpTestHarness();
    await harness.setup();
  });

  afterEach(async () => {
    await harness.teardown();
  });

  // ─── list_tasks ──────────────────────────────────────────────────

  describe('list_tasks', () => {
    test('returns empty list when no tasks exist', async () => {
      seedProject(harness.db, { id: 'proj-1', name: 'Test' });

      const result = await harness.invokeTool('list_tasks', { project_id: 'proj-1' });
      const body = harness.assertToolResponse(result, ['total', 'tasks']);

      expect(body.total).toBe(0);
      expect(body.tasks).toEqual([]);
    });

    test('returns all tasks for a project', async () => {
      seedProject(harness.db, { id: 'proj-1', name: 'Test' });
      seedTask(harness.db, 'proj-1', { id: 'task-1', title: 'Task A', status: 'pending' });
      seedTask(harness.db, 'proj-1', { id: 'task-2', title: 'Task B', status: 'in_progress' });

      const result = await harness.invokeTool('list_tasks', { project_id: 'proj-1' });
      const body = harness.assertToolResponse(result, ['total', 'tasks']);

      expect(body.total).toBe(2);
      expect(body.tasks.map((t) => t.id)).toContain('task-1');
      expect(body.tasks.map((t) => t.id)).toContain('task-2');
    });

    test('filters tasks by status', async () => {
      seedProject(harness.db, { id: 'proj-1', name: 'Test' });
      seedTask(harness.db, 'proj-1', { id: 'task-1', title: 'Pending', status: 'pending' });
      seedTask(harness.db, 'proj-1', { id: 'task-2', title: 'Done', status: 'completed' });
      seedTask(harness.db, 'proj-1', { id: 'task-3', title: 'Blocked', status: 'blocked' });

      const result = await harness.invokeTool('list_tasks', {
        project_id: 'proj-1',
        status: 'completed',
      });
      const body = harness.assertToolResponse(result, ['total', 'tasks']);

      expect(body.total).toBe(1);
      expect(body.tasks[0].id).toBe('task-2');
    });

    test('filters tasks by priority', async () => {
      seedProject(harness.db, { id: 'proj-1', name: 'Test' });
      seedTask(harness.db, 'proj-1', { id: 'task-1', title: 'Low', priority: 'low' });
      seedTask(harness.db, 'proj-1', { id: 'task-2', title: 'High', priority: 'high' });
      seedTask(harness.db, 'proj-1', { id: 'task-3', title: 'Critical', priority: 'critical' });

      const result = await harness.invokeTool('list_tasks', {
        project_id: 'proj-1',
        priority: 'high',
      });
      const body = harness.assertToolResponse(result, ['total', 'tasks']);

      expect(body.total).toBe(1);
      expect(body.tasks[0].priority).toBe('high');
    });

    test('response includes required fields: id, title, status, priority, description', async () => {
      seedProject(harness.db, { id: 'proj-1', name: 'Test' });
      seedTask(harness.db, 'proj-1', {
        id: 'task-1',
        title: 'Detailed Task',
        description: 'A detailed description',
        status: 'pending',
        priority: 'high',
      });

      const result = await harness.invokeTool('list_tasks', { project_id: 'proj-1' });
      const body = harness.assertToolResponse(result, ['total', 'tasks']);

      const task = body.tasks[0];
      expect(task).toHaveProperty('id', 'task-1');
      expect(task).toHaveProperty('title', 'Detailed Task');
      expect(task).toHaveProperty('status', 'pending');
      expect(task).toHaveProperty('priority', 'high');
      expect(task).toHaveProperty('description', 'A detailed description');
    });
  });

  // ─── create_task ─────────────────────────────────────────────────

  describe('create_task', () => {
    test('creates a task with minimal fields', async () => {
      seedProject(harness.db, { id: 'proj-1', name: 'Test' });

      const result = await harness.invokeTool('create_task', {
        project_id: 'proj-1',
        user_id: 'user-1',
        title: 'New Task',
      });
      const body = harness.assertToolResponse(result, ['created', 'task']);

      expect(body.created).toBe(true);
      expect(body.task.title).toBe('New Task');
      expect(body.task.project_id).toBe('proj-1');
      expect(body.task.status).toBe('pending');
      expect(body.task.priority).toBe('medium');
      expect(body.task.id).toBeDefined();

      // Verify DB state
      assertDbRowCount(harness.db, 'tasks', { project_id: 'proj-1' }, 1);
    });

    test('creates a task with all fields', async () => {
      seedProject(harness.db, { id: 'proj-1', name: 'Test' });
      seedMilestone(harness.db, 'proj-1', { id: 'ms-1', title: 'MS1' });

      const result = await harness.invokeTool('create_task', {
        project_id: 'proj-1',
        user_id: 'user-1',
        title: 'Full Task',
        description: 'Full description',
        status: 'in_progress',
        priority: 'critical',
        due_date: '2025-12-31',
        milestone_id: 'ms-1',
        assigned_to: 'agent-1',
      });
      const body = harness.assertToolResponse(result, ['created', 'task']);

      expect(body.task.title).toBe('Full Task');
      expect(body.task.description).toBe('Full description');
      expect(body.task.status).toBe('in_progress');
      expect(body.task.priority).toBe('critical');
      expect(body.task.due_date).toBe('2025-12-31');
      expect(body.task.milestone_id).toBe('ms-1');
      expect(body.task.assigned_to).toBe('agent-1');
    });

    test('links task to milestone', async () => {
      seedProject(harness.db, { id: 'proj-1', name: 'Test' });
      seedMilestone(harness.db, 'proj-1', { id: 'ms-1', title: 'MS1' });

      const result = await harness.invokeTool('create_task', {
        project_id: 'proj-1',
        user_id: 'user-1',
        title: 'Milestone Task',
        milestone_id: 'ms-1',
      });
      const body = harness.assertToolResponse(result, ['created', 'task']);

      expect(body.task.milestone_id).toBe('ms-1');
      assertDbRow(harness.db, 'tasks', { id: body.task.id }, { milestone_id: 'ms-1' });
    });
  });

  // ─── update_task ─────────────────────────────────────────────────

  describe('update_task', () => {
    test('updates task status', async () => {
      seedProject(harness.db, { id: 'proj-1', name: 'Test' });
      seedTask(harness.db, 'proj-1', { id: 'task-1', title: 'Task', status: 'pending' });

      const result = await harness.invokeTool('update_task', {
        task_id: 'task-1',
        status: 'completed',
      });
      const body = harness.assertToolResponse(result, ['updated', 'task']);

      expect(body.updated).toBe(true);
      expect(body.task.status).toBe('completed');
      expect(body.task.completed_at).toBeDefined();
      assertDbRow(harness.db, 'tasks', { id: 'task-1' }, { status: 'completed' });
    });

    test('updates task priority and title', async () => {
      seedProject(harness.db, { id: 'proj-1', name: 'Test' });
      seedTask(harness.db, 'proj-1', { id: 'task-1', title: 'Old Title', priority: 'low' });

      const result = await harness.invokeTool('update_task', {
        task_id: 'task-1',
        title: 'New Title',
        priority: 'high',
      });
      const body = harness.assertToolResponse(result, ['updated', 'task']);

      expect(body.task.title).toBe('New Title');
      expect(body.task.priority).toBe('high');
    });

    test('updating to completed sets completed_at', async () => {
      seedProject(harness.db, { id: 'proj-1', name: 'Test' });
      seedTask(harness.db, 'proj-1', { id: 'task-1', title: 'Task', status: 'pending' });

      const result = await harness.invokeTool('update_task', {
        task_id: 'task-1',
        status: 'completed',
      });
      const body = harness.assertToolResponse(result, ['updated', 'task']);

      expect(body.task.completed_at).toBeDefined();
      expect(body.task.completed_at).toMatch(/\d{4}-\d{2}-\d{2}T/);
    });

    test('can set milestone_id to null to unlink', async () => {
      seedProject(harness.db, { id: 'proj-1', name: 'Test' });
      seedMilestone(harness.db, 'proj-1', { id: 'ms-1', title: 'MS1' });
      seedTask(harness.db, 'proj-1', {
        id: 'task-1',
        title: 'Task',
        milestone_id: 'ms-1',
      });

      const result = await harness.invokeTool('update_task', {
        task_id: 'task-1',
        milestone_id: null,
      });
      const body = harness.assertToolResponse(result, ['updated', 'task']);

      expect(body.task.milestone_id).toBeNull();
    });
  });

  // ─── delete_task ─────────────────────────────────────────────────

  describe('delete_task', () => {
    test('deletes a task', async () => {
      seedProject(harness.db, { id: 'proj-1', name: 'Test' });
      seedTask(harness.db, 'proj-1', { id: 'task-1', title: 'To Delete' });

      const result = await harness.invokeTool('delete_task', { task_id: 'task-1' });
      const body = harness.assertToolResponse(result, ['deleted', 'task_id']);

      expect(body.deleted).toBe(true);
      expect(body.task_id).toBe('task-1');

      // Verify DB state
      assertDbRowCount(harness.db, 'tasks', { project_id: 'proj-1' }, 0);
    });

    test('deleting non-existent task returns success (no-op)', async () => {
      const result = await harness.invokeTool('delete_task', {
        task_id: 'non-existent-task',
      });
      const body = harness.assertToolResponse(result, ['deleted', 'task_id']);

      expect(body.deleted).toBe(true);
    });
  });

  // ─── add_task_comment ────────────────────────────────────────────

  describe('add_task_comment', () => {
    test('adds a comment to a task', async () => {
      seedProject(harness.db, { id: 'proj-1', name: 'Test' });
      seedTask(harness.db, 'proj-1', { id: 'task-1', title: 'Task' });

      const result = await harness.invokeTool('add_task_comment', {
        task_id: 'task-1',
        content: 'This is a test comment',
        author_type: 'agent',
      });
      const body = harness.assertToolResponse(result, ['created', 'comment']);

      expect(body.created).toBe(true);
      expect(body.comment.task_id).toBe('task-1');
      expect(body.comment.content).toBe('This is a test comment');
      expect(body.comment.author_type).toBe('agent');

      // Verify DB state
      assertDbRowCount(harness.db, 'task_comments', { task_id: 'task-1' }, 1);
    });

    test('adds a comment with human author type', async () => {
      seedProject(harness.db, { id: 'proj-1', name: 'Test' });
      seedTask(harness.db, 'proj-1', { id: 'task-1', title: 'Task' });

      const result = await harness.invokeTool('add_task_comment', {
        task_id: 'task-1',
        content: 'Human comment',
        author_type: 'human',
      });
      const body = harness.assertToolResponse(result, ['created', 'comment']);

      expect(body.comment.author_type).toBe('human');
    });

    test('multiple comments accumulate on a task', async () => {
      seedProject(harness.db, { id: 'proj-1', name: 'Test' });
      seedTask(harness.db, 'proj-1', { id: 'task-1', title: 'Task' });

      await harness.invokeTool('add_task_comment', {
        task_id: 'task-1',
        content: 'Comment 1',
      });
      await harness.invokeTool('add_task_comment', {
        task_id: 'task-1',
        content: 'Comment 2',
      });
      await harness.invokeTool('add_task_comment', {
        task_id: 'task-1',
        content: 'Comment 3',
      });

      assertDbRowCount(harness.db, 'task_comments', { task_id: 'task-1' }, 3);
    });
  });

  // ─── Tool chain test ─────────────────────────────────────────────

  describe('tool chain: create → update → list', () => {
    test('full lifecycle: create task, update it, verify via list', async () => {
      seedProject(harness.db, { id: 'proj-1', name: 'Test' });
      seedMilestone(harness.db, 'proj-1', { id: 'ms-1', title: 'MS1' });

      // Step 1: Create task
      const createResult = await harness.invokeTool('create_task', {
        project_id: 'proj-1',
        user_id: 'user-1',
        title: 'Chain Task',
        description: 'Original description',
        priority: 'low',
        milestone_id: 'ms-1',
      });
      const createBody = harness.assertToolResponse(createResult, ['created', 'task']);
      const taskId = createBody.task.id;

      // Step 2: Update task
      const updateResult = await harness.invokeTool('update_task', {
        task_id: taskId,
        status: 'in_progress',
        priority: 'high',
        description: 'Updated description',
      });
      const updateBody = harness.assertToolResponse(updateResult, ['updated', 'task']);

      expect(updateBody.task.status).toBe('in_progress');
      expect(updateBody.task.priority).toBe('high');
      expect(updateBody.task.description).toBe('Updated description');

      // Step 3: List tasks and verify the updated task appears
      const listResult = await harness.invokeTool('list_tasks', { project_id: 'proj-1' });
      const listBody = harness.assertToolResponse(listResult, ['total', 'tasks']);

      const found = listBody.tasks.find((t) => t.id === taskId);
      expect(found).toBeDefined();
      expect(found.status).toBe('in_progress');
      expect(found.priority).toBe('high');
      expect(found.description).toBe('Updated description');

      // Step 4: Verify DB state
      assertDbRow(
        harness.db,
        'tasks',
        { id: taskId },
        {
          status: 'in_progress',
          priority: 'high',
          milestone_id: 'ms-1',
        }
      );
    });
  });
});
