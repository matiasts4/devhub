/**
 * Telegram Bot Tests — Task Commands
 *
 * Tests: /tareas, /progreso, /agentes
 */

const { TelegramTestHarness } = require('./harness');
const { seedProject, seedTask } = require('../fixtures');

describe('Telegram Task Commands', () => {
  let harness;

  beforeEach(async () => {
    harness = new TelegramTestHarness({ lockOwner: 'telegram-tasks' });
    await harness.setup();

    // Mock db service — prevents real disk DB access
    harness.mockService('db', {
      getDashboard: () => [],
      getActiveProjects: () => [],
      getTasks: () => [],
      getAgents: () => [],
      getProgress: () => null,
      getProjectByName: () => null,
      getAgentStats: () => ({ total: 0, active: 0, idle: 0 }),
      getNextTask: () => null,
    });
  });

  afterEach(async () => {
    await harness.teardown();
  });

  describe('/tareas', () => {
    test('returns task list for first active project', async () => {
      // Override db mock to return project + tasks
      harness.mockService('db', {
        getDashboard: () => [],
        getActiveProjects: () => [{ id: 'test-proj-1', name: 'Test Project', status: 'active' }],
        getTasks: () => [
          { id: 'test-task-1', title: 'Task 1', status: 'pending' },
          { id: 'test-task-2', title: 'Task 2', status: 'in_progress' },
        ],
        getAgents: () => [],
        getProgress: () => null,
        getProjectByName: () => null,
        getAgentStats: () => ({ total: 0, active: 0, idle: 0 }),
        getNextTask: () => null,
      });

      const ctx = harness.createMockCtx();
      await harness.executeCommand('tareas', ctx);

      const replies = harness.getReplies();
      expect(replies.length).toBe(1);
      expect(replies[0].text).toContain('Task 1');
    });

    test('shows error when no active projects', async () => {
      // db mock already returns empty arrays
      const ctx = harness.createMockCtx();
      await harness.executeCommand('tareas', ctx);

      const replies = harness.getReplies();
      expect(replies.length).toBe(1);
      expect(replies[0].text).toContain('No hay proyectos activos');
    });

    test('shows error when project not found by name', async () => {
      // db mock returns null for getProjectByName
      const ctx = harness.createMockCtx();
      await harness.executeCommand('tareas', ctx, 'NonExistentProject');

      const replies = harness.getReplies();
      expect(replies.length).toBe(1);
      expect(replies[0].text).toContain('no encontrado');
    });
  });

  describe('/progreso', () => {
    test('shows progress stats', async () => {
      harness.mockService('db', {
        getDashboard: () => [],
        getActiveProjects: () => [
          { id: 'test-proj-1', name: 'Test Project', status: 'active', progress: 50 },
        ],
        getTasks: () => [],
        getProgress: () => ({ total: 2, completed: 1, percentage: 50 }),
        getProjectByName: () => null,
        getAgents: () => [],
        getAgentStats: () => ({ total: 0, active: 0, idle: 0 }),
        getNextTask: () => null,
      });

      const ctx = harness.createMockCtx();
      await harness.executeCommand('progreso', ctx);

      const replies = harness.getReplies();
      expect(replies.length).toBe(1);
      expect(replies[0].text).toContain('Test Project');
      expect(replies[0].text).toContain('50%');
      expect(replies[0].text).toContain('1/2 tareas completadas');
    });
  });

  describe('/agentes', () => {
    test('returns agent list', async () => {
      harness.mockService('db', {
        getDashboard: () => [],
        getActiveProjects: () => [],
        getTasks: () => [],
        getProgress: () => null,
        getProjectByName: () => null,
        getAgents: () => [
          {
            agent_id: 'agent-1',
            nombre: 'Worker Uno',
            status: 'working',
            last_heartbeat: new Date().toISOString(),
            current_task_id: 'task-99',
            modelo_llm: 'gpt-5.4',
          },
        ],
        getAgentStats: () => ({ total: 1, active: 1, idle: 0 }),
        getNextTask: () => null,
      });

      const ctx = harness.createMockCtx();
      await harness.executeCommand('agentes', ctx);

      const replies = harness.getReplies();
      expect(replies.length).toBe(1);
      expect(replies[0].text).toContain('Worker Uno');
      expect(replies[0].text).toContain('agent\\-1');
      expect(replies[0].text).toContain('task\\-99');
    });
  });
});
