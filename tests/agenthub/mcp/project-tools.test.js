/**
 * Task 25: Test MCP project tools
 *
 * Tests: list_projects, get_project, update_project
 * - Happy path, invalid input, side effects (DB row creation/update)
 * - Use seeded data from fixtures
 */

const { McpTestHarness } = require('./harness');
const { seedProject, seedTask, seedMilestone } = require('../fixtures');
const { assertDbRow, assertDbRowCount, assertBodyShape } = require('../assertions');

describe('MCP Project Tools', () => {
  let harness;

  beforeEach(async () => {
    harness = new McpTestHarness();
    await harness.setup();
  });

  afterEach(async () => {
    await harness.teardown();
  });

  // ─── list_projects ───────────────────────────────────────────────

  describe('list_projects', () => {
    test('returns empty list when no projects exist', async () => {
      const result = await harness.invokeTool('list_projects', { status: 'all' });
      const body = harness.assertToolResponse(result, ['total', 'projects']);

      expect(body.total).toBe(0);
      expect(body.projects).toEqual([]);
    });

    test('returns all projects with status=all', async () => {
      seedProject(harness.db, { id: 'proj-1', name: 'Project Alpha', status: 'active' });
      seedProject(harness.db, { id: 'proj-2', name: 'Project Beta', status: 'paused' });

      const result = await harness.invokeTool('list_projects', { status: 'all' });
      const body = harness.assertToolResponse(result, ['total', 'projects']);

      expect(body.total).toBe(2);
      expect(body.projects).toHaveLength(2);
      expect(body.projects.map((p) => p.id)).toContain('proj-1');
      expect(body.projects.map((p) => p.id)).toContain('proj-2');
    });

    test('filters projects by status', async () => {
      seedProject(harness.db, { id: 'proj-1', name: 'Active Project', status: 'active' });
      seedProject(harness.db, { id: 'proj-2', name: 'Paused Project', status: 'paused' });
      seedProject(harness.db, { id: 'proj-3', name: 'Completed Project', status: 'completed' });

      const result = await harness.invokeTool('list_projects', { status: 'active' });
      const body = harness.assertToolResponse(result, ['total', 'projects']);

      expect(body.total).toBe(1);
      expect(body.projects[0].id).toBe('proj-1');
    });

    test('returns projects ordered by created_at DESC', async () => {
      seedProject(harness.db, { id: 'proj-old', name: 'Old Project', status: 'active' });
      seedProject(harness.db, { id: 'proj-new', name: 'New Project', status: 'active' });

      const result = await harness.invokeTool('list_projects', { status: 'all' });
      const body = harness.assertToolResponse(result, ['total', 'projects']);

      // Newest first (proj-new was inserted after proj-old)
      expect(body.projects[0].id).toBe('proj-new');
    });

    test('response includes required fields: id, name, status, progress', async () => {
      seedProject(harness.db, { id: 'proj-1', name: 'Test', status: 'active', progress: 42 });

      const result = await harness.invokeTool('list_projects', { status: 'all' });
      const body = harness.assertToolResponse(result, ['total', 'projects']);

      const project = body.projects[0];
      expect(project).toHaveProperty('id', 'proj-1');
      expect(project).toHaveProperty('name', 'Test');
      expect(project).toHaveProperty('status', 'active');
      expect(project).toHaveProperty('progress', 42);
    });
  });

  // ─── get_project ─────────────────────────────────────────────────

  describe('get_project', () => {
    test('returns project with tasks and milestones', async () => {
      const project = seedProject(harness.db, { id: 'proj-1', name: 'Full Project' });
      seedTask(harness.db, 'proj-1', { id: 'task-1', title: 'Task One', status: 'pending' });
      seedTask(harness.db, 'proj-1', { id: 'task-2', title: 'Task Two', status: 'completed' });
      seedMilestone(harness.db, 'proj-1', {
        id: 'ms-1',
        title: 'Milestone One',
        status: 'planned',
      });

      const result = await harness.invokeTool('get_project', { project_id: 'proj-1' });
      const body = harness.assertToolResponse(result, [
        'project',
        'tasks',
        'milestones',
        'summary',
      ]);

      expect(body.project.id).toBe('proj-1');
      expect(body.project.name).toBe('Full Project');

      expect(body.tasks).toHaveLength(2);
      expect(body.tasks[0]).toHaveProperty('id');
      expect(body.tasks[0]).toHaveProperty('title');
      expect(body.tasks[0]).toHaveProperty('status');
      expect(body.tasks[0]).toHaveProperty('priority');

      expect(body.milestones).toHaveLength(1);
      expect(body.milestones[0].title).toBe('Milestone One');

      expect(body.summary.total_tasks).toBe(2);
      expect(body.summary.completed_tasks).toBe(1);
      expect(body.summary.in_progress).toBe(0);
      expect(body.summary.blocked).toBe(0);
      expect(body.summary.milestones_done).toBe(0);
    });

    test('returns error for non-existent project', async () => {
      const result = await harness.invokeTool('get_project', {
        project_id: '00000000-0000-0000-0000-000000000000',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('ERROR');
    });

    test('returns empty arrays when no tasks or milestones exist', async () => {
      seedProject(harness.db, { id: 'proj-empty', name: 'Empty Project' });

      const result = await harness.invokeTool('get_project', { project_id: 'proj-empty' });
      const body = harness.assertToolResponse(result, [
        'project',
        'tasks',
        'milestones',
        'summary',
      ]);

      expect(body.tasks).toEqual([]);
      expect(body.milestones).toEqual([]);
      expect(body.summary.total_tasks).toBe(0);
    });
  });

  // ─── update_project ──────────────────────────────────────────────

  describe('update_project', () => {
    test('updates project name', async () => {
      seedProject(harness.db, { id: 'proj-1', name: 'Old Name', status: 'active' });

      const result = await harness.invokeTool('update_project', {
        project_id: 'proj-1',
        name: 'New Name',
      });
      const body = harness.assertToolResponse(result, ['updated', 'project']);

      expect(body.updated).toBe(true);
      expect(body.project.name).toBe('New Name');

      // Verify DB state
      assertDbRow(harness.db, 'projects', { id: 'proj-1' }, { name: 'New Name' });
    });

    test('updates project status', async () => {
      seedProject(harness.db, { id: 'proj-1', name: 'Test', status: 'active' });

      const result = await harness.invokeTool('update_project', {
        project_id: 'proj-1',
        status: 'completed',
      });
      const body = harness.assertToolResponse(result, ['updated', 'project']);

      expect(body.project.status).toBe('completed');
      assertDbRow(harness.db, 'projects', { id: 'proj-1' }, { status: 'completed' });
    });

    test('updates project progress', async () => {
      seedProject(harness.db, { id: 'proj-1', name: 'Test', progress: 0 });

      const result = await harness.invokeTool('update_project', {
        project_id: 'proj-1',
        progress: 75,
      });
      const body = harness.assertToolResponse(result, ['updated', 'project']);

      expect(body.project.progress).toBe(75);
      assertDbRow(harness.db, 'projects', { id: 'proj-1' }, { progress: 75 });
    });

    test('updates multiple fields at once', async () => {
      seedProject(harness.db, { id: 'proj-1', name: 'Old', status: 'active', progress: 0 });

      const result = await harness.invokeTool('update_project', {
        project_id: 'proj-1',
        name: 'Updated',
        status: 'paused',
        progress: 50,
        color: '#FF5733',
      });
      const body = harness.assertToolResponse(result, ['updated', 'project']);

      expect(body.project.name).toBe('Updated');
      expect(body.project.status).toBe('paused');
      expect(body.project.progress).toBe(50);
      expect(body.project.color).toBe('#FF5733');
    });

    test('returns error when no fields provided', async () => {
      seedProject(harness.db, { id: 'proj-1', name: 'Test' });

      const result = await harness.invokeTool('update_project', { project_id: 'proj-1' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('No se proporcionaron campos');
    });

    test('returns error for non-existent project', async () => {
      const result = await harness.invokeTool('update_project', {
        project_id: '00000000-0000-0000-0000-000000000000',
        name: 'Ghost',
      });

      expect(result.isError).toBe(true);
    });
  });
});
