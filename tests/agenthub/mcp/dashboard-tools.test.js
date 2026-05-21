/**
 * Task 30: Test MCP dashboard and next task tools
 *
 * Tests: get_dashboard, get_project_context, get_next_task, mark_planning_done
 * - Test dashboard returns summary
 * - Test project_context returns complete planning data
 * - Test get_next_task returns prioritized task
 * - Test mark_planning_done updates project planning_status
 */

const { McpTestHarness } = require('./harness');
const { seedProject, seedTask, seedMilestone } = require('../fixtures');
const { assertDbRow, assertDbRowCount } = require('../assertions');

describe('MCP Dashboard & Planning Tools', () => {
  let harness;

  beforeEach(async () => {
    harness = new McpTestHarness();
    await harness.setup();
  });

  afterEach(async () => {
    await harness.teardown();
  });

  // ─── get_dashboard ───────────────────────────────────────────────

  describe('get_dashboard', () => {
    test('returns empty dashboard when no projects exist', async () => {
      const result = await harness.invokeTool('get_dashboard');
      const body = harness.assertToolResponse(result, [
        'total_projects',
        'active_projects',
        'dashboard',
      ]);

      expect(body.total_projects).toBe(0);
      expect(body.active_projects).toBe(0);
      expect(body.dashboard).toEqual([]);
    });

    test('returns dashboard with project summaries', async () => {
      seedProject(harness.db, {
        id: 'proj-1',
        name: 'Project Alpha',
        status: 'active',
        progress: 50,
      });
      seedTask(harness.db, 'proj-1', { id: 'task-1', title: 'Task 1', status: 'completed' });
      seedTask(harness.db, 'proj-1', { id: 'task-2', title: 'Task 2', status: 'in_progress' });
      seedMilestone(harness.db, 'proj-1', {
        id: 'ms-1',
        title: 'MS 1',
        status: 'in_progress',
        due_date: '2026-12-31',
      });

      const result = await harness.invokeTool('get_dashboard');
      const body = harness.assertToolResponse(result, [
        'total_projects',
        'active_projects',
        'dashboard',
      ]);

      expect(body.total_projects).toBe(1);
      expect(body.active_projects).toBe(1);
      expect(body.dashboard).toHaveLength(1);

      const proj = body.dashboard[0];
      expect(proj.id).toBe('proj-1');
      expect(proj.name).toBe('Project Alpha');
      expect(proj.status).toBe('active');
      expect(proj.progress).toBe(50);
      expect(proj.tasks.total).toBe(2);
      expect(proj.tasks.completed).toBe(1);
      expect(proj.tasks.in_progress).toBe(1);
      expect(proj.tasks.blocked).toBe(0);
      expect(proj.next_milestone).toBeDefined();
      expect(proj.next_milestone.title).toBe('MS 1');
    });

    test('counts active vs non-active projects correctly', async () => {
      seedProject(harness.db, { id: 'proj-1', name: 'Active', status: 'active' });
      seedProject(harness.db, { id: 'proj-2', name: 'Paused', status: 'paused' });
      seedProject(harness.db, { id: 'proj-3', name: 'Completed', status: 'completed' });

      const result = await harness.invokeTool('get_dashboard');
      const body = harness.assertToolResponse(result, [
        'total_projects',
        'active_projects',
        'dashboard',
      ]);

      expect(body.total_projects).toBe(3);
      expect(body.active_projects).toBe(1);
      expect(body.dashboard).toHaveLength(3);
    });

    test('task counts are accurate per project', async () => {
      seedProject(harness.db, { id: 'proj-1', name: 'Test' });
      seedTask(harness.db, 'proj-1', { id: 't1', title: 'Done', status: 'completed' });
      seedTask(harness.db, 'proj-1', { id: 't2', title: 'Working', status: 'in_progress' });
      seedTask(harness.db, 'proj-1', { id: 't3', title: 'Blocked', status: 'blocked' });
      seedTask(harness.db, 'proj-1', { id: 't4', title: 'Waiting', status: 'pending' });

      const result = await harness.invokeTool('get_dashboard');
      const body = harness.assertToolResponse(result, ['dashboard']);

      const proj = body.dashboard[0];
      expect(proj.tasks.total).toBe(4);
      expect(proj.tasks.completed).toBe(1);
      expect(proj.tasks.in_progress).toBe(1);
      expect(proj.tasks.blocked).toBe(1);
    });

    test('overdue tasks are counted correctly', async () => {
      seedProject(harness.db, { id: 'proj-1', name: 'Test' });
      // Overdue task (past date, not completed)
      seedTask(harness.db, 'proj-1', {
        id: 't-overdue',
        title: 'Overdue',
        status: 'pending',
        due_date: '2020-01-01',
      });
      // Not overdue (future date)
      seedTask(harness.db, 'proj-1', {
        id: 't-future',
        title: 'Future',
        status: 'pending',
        due_date: '2030-01-01',
      });
      // Not overdue (completed, even with past date)
      seedTask(harness.db, 'proj-1', {
        id: 't-done',
        title: 'Done',
        status: 'completed',
        due_date: '2020-01-01',
      });

      const result = await harness.invokeTool('get_dashboard');
      const body = harness.assertToolResponse(result, ['dashboard']);

      expect(body.dashboard[0].tasks.overdue).toBe(1);
    });

    test('next_milestone is the first non-completed milestone', async () => {
      seedProject(harness.db, { id: 'proj-1', name: 'Test' });
      seedMilestone(harness.db, 'proj-1', {
        id: 'ms-done',
        title: 'Done MS',
        status: 'completed',
        due_date: '2026-01-01',
      });
      seedMilestone(harness.db, 'proj-1', {
        id: 'ms-next',
        title: 'Next MS',
        status: 'planned',
        due_date: '2026-06-01',
      });
      seedMilestone(harness.db, 'proj-1', {
        id: 'ms-later',
        title: 'Later MS',
        status: 'planned',
        due_date: '2026-12-01',
      });

      const result = await harness.invokeTool('get_dashboard');
      const body = harness.assertToolResponse(result, ['dashboard']);

      // Milestones are ordered by due_date ASC, so first non-completed should be ms-next
      expect(body.dashboard[0].next_milestone.id).toBe('ms-next');
    });

    test('next_milestone is null when all milestones are completed', async () => {
      seedProject(harness.db, { id: 'proj-1', name: 'Test' });
      seedMilestone(harness.db, 'proj-1', {
        id: 'ms-1',
        title: 'Done',
        status: 'completed',
      });

      const result = await harness.invokeTool('get_dashboard');
      const body = harness.assertToolResponse(result, ['dashboard']);

      expect(body.dashboard[0].next_milestone).toBeNull();
    });

    test('next_milestone is null when no milestones exist', async () => {
      seedProject(harness.db, { id: 'proj-1', name: 'Test' });

      const result = await harness.invokeTool('get_dashboard');
      const body = harness.assertToolResponse(result, ['dashboard']);

      expect(body.dashboard[0].next_milestone).toBeNull();
    });

    test('dashboard includes project color', async () => {
      seedProject(harness.db, {
        id: 'proj-1',
        name: 'Test',
        color: '#FF5733',
      });

      const result = await harness.invokeTool('get_dashboard');
      const body = harness.assertToolResponse(result, ['dashboard']);

      expect(body.dashboard[0].color).toBe('#FF5733');
    });

    test('multiple projects appear in dashboard', async () => {
      seedProject(harness.db, { id: 'proj-a', name: 'A', status: 'active' });
      seedProject(harness.db, { id: 'proj-b', name: 'B', status: 'active' });
      seedTask(harness.db, 'proj-a', { id: 't-a', title: 'Task A', status: 'pending' });
      seedTask(harness.db, 'proj-b', { id: 't-b', title: 'Task B', status: 'pending' });

      const result = await harness.invokeTool('get_dashboard');
      const body = harness.assertToolResponse(result, ['dashboard']);

      expect(body.dashboard).toHaveLength(2);
      const ids = body.dashboard.map((p) => p.id);
      expect(ids).toContain('proj-a');
      expect(ids).toContain('proj-b');
    });
  });

  // ─── get_project_context ─────────────────────────────────────────

  describe('get_project_context', () => {
    test('returns project context with planning data', async () => {
      seedProject(harness.db, {
        id: 'proj-1',
        name: 'Planning Project',
        description: 'A project for planning',
        planning_prompt: 'Build a testing framework',
        planning_status: 'in_progress',
        documentation_policy: 'shared_legacy',
      });

      const result = await harness.invokeTool('get_project_context', { project_id: 'proj-1' });
      const body = harness.assertToolResponse(result, ['project', 'files', 'summary']);

      expect(body.project.id).toBe('proj-1');
      expect(body.project.name).toBe('Planning Project');
      expect(body.project.description).toBe('A project for planning');
      expect(body.project.planning_prompt).toBe('Build a testing framework');
      expect(body.project.planning_status).toBe('in_progress');
      expect(body.project.documentation_policy).toBe('shared_legacy');
      expect(body.project.documentation_policy_summary).toContain('shared_legacy');
      expect(body.project.documentation_policy_metadata.mode).toBe('legacy-preserve');
      expect(body.project.created_at).toBeDefined();
    });

    test('returns empty files array when no files exist', async () => {
      seedProject(harness.db, { id: 'proj-1', name: 'Test' });

      const result = await harness.invokeTool('get_project_context', { project_id: 'proj-1' });
      const body = harness.assertToolResponse(result, ['project', 'files', 'summary']);

      expect(body.files).toEqual([]);
      expect(body.summary.total_files).toBe(0);
      expect(body.summary.total_chars).toBe(0);
    });

    test('returns project files when they exist', async () => {
      seedProject(harness.db, { id: 'proj-1', name: 'Test' });

      harness.db
        .prepare(
          `INSERT INTO project_files (id, project_id, file_name, file_type, content, size_chars, created_at)
           VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
        )
        .run('file-1', 'proj-1', 'README.md', 'markdown', '# Hello World', 13);

      const result = await harness.invokeTool('get_project_context', { project_id: 'proj-1' });
      const body = harness.assertToolResponse(result, ['project', 'files', 'summary']);

      expect(body.files).toHaveLength(1);
      expect(body.files[0].file_name).toBe('README.md');
      expect(body.files[0].file_type).toBe('markdown');
      expect(body.files[0].content).toBe('# Hello World');
      expect(body.files[0].size_chars).toBe(13);
      expect(body.summary.total_files).toBe(1);
      expect(body.summary.total_chars).toBe(13);
    });

    test('summary includes has_planning_prompt flag', async () => {
      seedProject(harness.db, {
        id: 'proj-1',
        name: 'Test',
        planning_prompt: 'Some prompt',
        documentation_policy: 'archive_only',
      });

      const result = await harness.invokeTool('get_project_context', { project_id: 'proj-1' });
      const body = harness.assertToolResponse(result, ['summary']);

      expect(body.summary.has_planning_prompt).toBe(true);
      expect(body.summary.documentation_policy).toBe('archive_only');
    });

    test('has_planning_prompt is false when no prompt', async () => {
      seedProject(harness.db, { id: 'proj-1', name: 'Test' });

      const result = await harness.invokeTool('get_project_context', { project_id: 'proj-1' });
      const body = harness.assertToolResponse(result, ['summary']);

      expect(body.summary.has_planning_prompt).toBe(false);
    });

    test('total_chars sums up all file sizes', async () => {
      seedProject(harness.db, { id: 'proj-1', name: 'Test' });

      harness.db
        .prepare(
          `INSERT INTO project_files (id, project_id, file_name, content, size_chars, created_at)
           VALUES (?, ?, ?, ?, ?, datetime('now'))`
        )
        .run('file-1', 'proj-1', 'a.txt', 'Hello', 5);
      harness.db
        .prepare(
          `INSERT INTO project_files (id, project_id, file_name, content, size_chars, created_at)
           VALUES (?, ?, ?, ?, ?, datetime('now'))`
        )
        .run('file-2', 'proj-1', 'b.txt', 'World!!', 7);

      const result = await harness.invokeTool('get_project_context', { project_id: 'proj-1' });
      const body = harness.assertToolResponse(result, ['summary']);

      expect(body.summary.total_chars).toBe(12);
    });

    test('returns error for non-existent project', async () => {
      const result = await harness.invokeTool('get_project_context', {
        project_id: '00000000-0000-0000-0000-000000000000',
      });

      expect(result.isError).toBe(true);
    });

    test('files are ordered by created_at ASC', async () => {
      seedProject(harness.db, { id: 'proj-1', name: 'Test' });

      harness.db
        .prepare(
          `INSERT INTO project_files (id, project_id, file_name, content, size_chars, created_at)
           VALUES (?, ?, ?, ?, ?, datetime('now', '-2 days'))`
        )
        .run('file-old', 'proj-1', 'old.txt', 'Old', 3);
      harness.db
        .prepare(
          `INSERT INTO project_files (id, project_id, file_name, content, size_chars, created_at)
           VALUES (?, ?, ?, ?, ?, datetime('now'))`
        )
        .run('file-new', 'proj-1', 'new.txt', 'New', 3);

      const result = await harness.invokeTool('get_project_context', { project_id: 'proj-1' });
      const body = harness.assertToolResponse(result, ['files']);

      expect(body.files[0].file_name).toBe('old.txt');
      expect(body.files[1].file_name).toBe('new.txt');
    });
  });

  // ─── get_next_task ───────────────────────────────────────────────

  describe('get_next_task', () => {
    test('returns null when no pending tasks exist', async () => {
      seedProject(harness.db, { id: 'proj-1', name: 'Test' });
      seedTask(harness.db, 'proj-1', { id: 'task-1', title: 'Done', status: 'completed' });

      const result = await harness.invokeTool('get_next_task', {
        project_id: 'proj-1',
        agent_id: 'agent-1',
      });
      const body = harness.assertToolResponse(result, ['task', 'message']);

      expect(body.task).toBeNull();
      expect(body.message).toContain('Sin tareas pendientes');
    });

    test('returns the highest priority pending task', async () => {
      seedProject(harness.db, { id: 'proj-1', name: 'Test' });
      seedTask(harness.db, 'proj-1', {
        id: 'task-low',
        title: 'Low Priority',
        status: 'pending',
        priority: 'low',
        business_value: 5,
      });
      seedTask(harness.db, 'proj-1', {
        id: 'task-high',
        title: 'High Priority',
        status: 'pending',
        priority: 'high',
        business_value: 5,
      });

      const result = await harness.invokeTool('get_next_task', {
        project_id: 'proj-1',
        agent_id: 'agent-1',
      });
      const body = harness.assertToolResponse(result, ['task', 'message']);

      expect(body.task).not.toBeNull();
      expect(body.task.id).toBe('task-high');
      expect(body.task.status).toBe('in_progress');
      expect(body.message).toContain('Tarea asignada');
    });

    test('task status is updated to in_progress', async () => {
      seedProject(harness.db, { id: 'proj-1', name: 'Test' });
      seedTask(harness.db, 'proj-1', {
        id: 'task-1',
        title: 'Pick Me',
        status: 'pending',
        priority: 'high',
        business_value: 5,
      });

      await harness.invokeTool('get_next_task', {
        project_id: 'proj-1',
        agent_id: 'agent-1',
      });

      // Verify DB state
      assertDbRow(harness.db, 'tasks', { id: 'task-1' }, { status: 'in_progress' });
    });

    test('blocked tasks are skipped', async () => {
      seedProject(harness.db, { id: 'proj-1', name: 'Test' });
      seedTask(harness.db, 'proj-1', {
        id: 'task-blocked',
        title: 'Blocked Task',
        status: 'pending',
        priority: 'critical',
        business_value: 10,
      });
      seedTask(harness.db, 'proj-1', {
        id: 'task-available',
        title: 'Available Task',
        status: 'pending',
        priority: 'medium',
        business_value: 5,
      });

      // Create a blocking dependency: task-blocked depends on task-dep (which is pending)
      harness.db
        .prepare(
          `INSERT INTO task_dependencies (id, task_id, depends_on, tipo, created_at)
           VALUES (?, ?, ?, ?, datetime('now'))`
        )
        .run('dep-1', 'task-blocked', 'task-dep', 'blocks');
      seedTask(harness.db, 'proj-1', {
        id: 'task-dep',
        title: 'Dependency',
        status: 'pending',
      });

      const result = await harness.invokeTool('get_next_task', {
        project_id: 'proj-1',
        agent_id: 'agent-1',
      });
      const body = harness.assertToolResponse(result, ['task']);

      // task-blocked is blocked by task-dep (pending), so task-available should be picked
      expect(body.task.id).toBe('task-available');
    });

    test('blocked tasks with completed dependency are available', async () => {
      seedProject(harness.db, { id: 'proj-1', name: 'Test' });
      seedTask(harness.db, 'proj-1', {
        id: 'task-unblocked',
        title: 'Unblocked Task',
        status: 'pending',
        priority: 'high',
        business_value: 5,
      });
      seedTask(harness.db, 'proj-1', {
        id: 'task-dep',
        title: 'Dependency',
        status: 'completed',
      });

      // Create a dependency where the dependency is completed
      harness.db
        .prepare(
          `INSERT INTO task_dependencies (id, task_id, depends_on, tipo, created_at)
           VALUES (?, ?, ?, ?, datetime('now'))`
        )
        .run('dep-1', 'task-unblocked', 'task-dep', 'blocks');

      const result = await harness.invokeTool('get_next_task', {
        project_id: 'proj-1',
        agent_id: 'agent-1',
      });
      const body = harness.assertToolResponse(result, ['task']);

      expect(body.task.id).toBe('task-unblocked');
    });

    test('returns message when all pending tasks are blocked', async () => {
      seedProject(harness.db, { id: 'proj-1', name: 'Test' });
      seedTask(harness.db, 'proj-1', {
        id: 'task-only',
        title: 'Only Task',
        status: 'pending',
        priority: 'high',
        business_value: 5,
      });
      seedTask(harness.db, 'proj-1', {
        id: 'task-dep',
        title: 'Blocking Dep',
        status: 'pending',
      });

      harness.db
        .prepare(
          `INSERT INTO task_dependencies (id, task_id, depends_on, tipo, created_at)
           VALUES (?, ?, ?, ?, datetime('now'))`
        )
        .run('dep-1', 'task-only', 'task-dep', 'blocks');

      const result = await harness.invokeTool('get_next_task', {
        project_id: 'proj-1',
        agent_id: 'agent-1',
      });
      const body = harness.assertToolResponse(result, ['task', 'message']);

      expect(body.task).toBeNull();
      expect(body.message).toContain('bloqueadas');
    });

    test('task response includes required fields', async () => {
      seedProject(harness.db, { id: 'proj-1', name: 'Test' });
      seedTask(harness.db, 'proj-1', {
        id: 'task-1',
        title: 'Test Task',
        description: 'A task for testing',
        status: 'pending',
        priority: 'medium',
        business_value: 5,
      });

      const result = await harness.invokeTool('get_next_task', {
        project_id: 'proj-1',
        agent_id: 'agent-1',
      });
      const body = harness.assertToolResponse(result, ['task']);

      expect(body.task).toHaveProperty('id', 'task-1');
      expect(body.task).toHaveProperty('title', 'Test Task');
      expect(body.task).toHaveProperty('description', 'A task for testing');
      expect(body.task).toHaveProperty('priority', 'medium');
      expect(body.task).toHaveProperty('status', 'in_progress');
    });

    test('considers business_value in priority scoring', async () => {
      seedProject(harness.db, { id: 'proj-1', name: 'Test' });
      seedTask(harness.db, 'proj-1', {
        id: 'task-low-bv',
        title: 'Low BV',
        status: 'pending',
        priority: 'medium',
        business_value: 1,
      });
      seedTask(harness.db, 'proj-1', {
        id: 'task-high-bv',
        title: 'High BV',
        status: 'pending',
        priority: 'medium',
        business_value: 10,
      });

      const result = await harness.invokeTool('get_next_task', {
        project_id: 'proj-1',
        agent_id: 'agent-1',
      });
      const body = harness.assertToolResponse(result, ['task']);

      // Same priority but higher business_value should win
      expect(body.task.id).toBe('task-high-bv');
    });
  });

  // ─── mark_planning_done ──────────────────────────────────────────

  describe('mark_planning_done', () => {
    test('updates project planning_status to completed', async () => {
      seedProject(harness.db, {
        id: 'proj-1',
        name: 'Planning Project',
        planning_status: 'in_progress',
      });

      const result = await harness.invokeTool('mark_planning_done', { project_id: 'proj-1' });
      const body = harness.assertToolResponse(result, ['success', 'project', 'message']);

      expect(body.success).toBe(true);
      expect(body.project.planning_status).toBe('completed');
      expect(body.message).toContain('Planning marcado como completado');

      // Verify DB state
      assertDbRow(harness.db, 'projects', { id: 'proj-1' }, { planning_status: 'completed' });
    });

    test('returns project id and name', async () => {
      seedProject(harness.db, {
        id: 'proj-1',
        name: 'My Project',
        planning_status: 'none',
      });

      const result = await harness.invokeTool('mark_planning_done', { project_id: 'proj-1' });
      const body = harness.assertToolResponse(result, ['project']);

      expect(body.project.id).toBe('proj-1');
      expect(body.project.name).toBe('My Project');
    });

    test('works from any initial planning_status', async () => {
      seedProject(harness.db, {
        id: 'proj-1',
        name: 'Test',
        planning_status: 'none',
      });

      const result = await harness.invokeTool('mark_planning_done', { project_id: 'proj-1' });
      const body = harness.assertToolResponse(result, ['project']);

      expect(body.project.planning_status).toBe('completed');
    });

    test('returns error for non-existent project', async () => {
      const result = await harness.invokeTool('mark_planning_done', {
        project_id: '00000000-0000-0000-0000-000000000000',
      });

      expect(result.isError).toBe(true);
    });

    test('can call mark_planning_done multiple times (idempotent)', async () => {
      seedProject(harness.db, {
        id: 'proj-1',
        name: 'Test',
        planning_status: 'none',
      });

      // First call
      const result1 = await harness.invokeTool('mark_planning_done', { project_id: 'proj-1' });
      const body1 = harness.assertToolResponse(result1, ['success']);
      expect(body1.success).toBe(true);

      // Second call (should still work)
      const result2 = await harness.invokeTool('mark_planning_done', { project_id: 'proj-1' });
      const body2 = harness.assertToolResponse(result2, ['success']);
      expect(body2.success).toBe(true);

      assertDbRow(harness.db, 'projects', { id: 'proj-1' }, { planning_status: 'completed' });
    });
  });

  // ─── Integration: full planning workflow ─────────────────────────

  describe('integration: full planning workflow', () => {
    test('get_project_context -> create milestones/tasks -> get_next_task -> mark_planning_done', async () => {
      // 1. Seed project with planning data
      seedProject(harness.db, {
        id: 'proj-1',
        name: 'Integration Project',
        description: 'Full workflow test',
        planning_prompt: 'Build a complete system',
        planning_status: 'in_progress',
      });

      // 2. Get project context
      const ctxResult = await harness.invokeTool('get_project_context', { project_id: 'proj-1' });
      const ctxBody = harness.assertToolResponse(ctxResult, ['project', 'summary']);
      expect(ctxBody.project.planning_status).toBe('in_progress');
      expect(ctxBody.summary.has_planning_prompt).toBe(true);

      // 3. Create a milestone
      const msResult = await harness.invokeTool('create_milestone', {
        project_id: 'proj-1',
        user_id: 'user-1',
        title: 'Planning Milestone',
      });
      harness.assertToolResponse(msResult, ['created', 'milestone']);

      // 4. Create tasks
      const taskResult = await harness.invokeTool('create_task', {
        project_id: 'proj-1',
        user_id: 'user-1',
        title: 'First Task',
        priority: 'high',
        business_value: 10,
      });
      const taskBody = harness.assertToolResponse(taskResult, ['created', 'task']);
      const taskId = taskBody.task.id;

      // 5. Get next task (should pick our high-priority task)
      const nextResult = await harness.invokeTool('get_next_task', {
        project_id: 'proj-1',
        agent_id: 'agent-1',
      });
      const nextBody = harness.assertToolResponse(nextResult, ['task']);
      expect(nextBody.task).not.toBeNull();
      expect(nextBody.task.status).toBe('in_progress');

      // 6. Mark planning done
      const doneResult = await harness.invokeTool('mark_planning_done', { project_id: 'proj-1' });
      const doneBody = harness.assertToolResponse(doneResult, ['success', 'project']);
      expect(doneBody.project.planning_status).toBe('completed');

      // 7. Verify final state
      assertDbRow(harness.db, 'projects', { id: 'proj-1' }, { planning_status: 'completed' });
      assertDbRow(harness.db, 'tasks', { id: taskId }, { status: 'in_progress' });
      assertDbRowCount(harness.db, 'milestones', { project_id: 'proj-1' }, 1);
    });

    test('dashboard reflects changes after planning workflow', async () => {
      seedProject(harness.db, {
        id: 'proj-1',
        name: 'Dashboard Test',
        status: 'active',
        planning_status: 'none',
      });
      seedTask(harness.db, 'proj-1', {
        id: 'task-1',
        title: 'Task',
        status: 'pending',
        priority: 'high',
        business_value: 5,
      });

      // Before planning
      const dashBefore = await harness.invokeTool('get_dashboard');
      const bodyBefore = harness.assertToolResponse(dashBefore, ['dashboard']);
      expect(bodyBefore.dashboard[0].tasks.total).toBe(1);
      expect(bodyBefore.dashboard[0].tasks.completed).toBe(0);

      // Get next task (moves task to in_progress)
      await harness.invokeTool('get_next_task', {
        project_id: 'proj-1',
        agent_id: 'agent-1',
      });

      // Update task to completed
      await harness.invokeTool('update_task', {
        task_id: 'task-1',
        status: 'completed',
      });

      // After planning
      const dashAfter = await harness.invokeTool('get_dashboard');
      const bodyAfter = harness.assertToolResponse(dashAfter, ['dashboard']);
      expect(bodyAfter.dashboard[0].tasks.completed).toBe(1);
      expect(bodyAfter.dashboard[0].tasks.in_progress).toBe(0);
    });
  });
});
