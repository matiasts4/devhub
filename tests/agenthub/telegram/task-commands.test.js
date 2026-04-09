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
  });

  afterEach(async () => {
    await harness.teardown();
  });

  describe('/tareas', () => {
    test('returns task list for first active project', async () => {
      seedProject(harness.db, { id: 'test-proj-1', name: 'Test Project', status: 'active' });
      seedTask(harness.db, 'test-proj-1', {
        id: 'test-task-1',
        title: 'Task 1',
        status: 'pending',
      });
      seedTask(harness.db, 'test-proj-1', {
        id: 'test-task-2',
        title: 'Task 2',
        status: 'in_progress',
      });

      const ctx = harness.createMockCtx();
      await harness.executeCommand('tareas', ctx);

      const replies = harness.getReplies();
      expect(replies.length).toBe(1);
      expect(replies[0].text).toContain('Task 1');
    });

    test('shows error when no active projects', async () => {
      const ctx = harness.createMockCtx();
      await harness.executeCommand('tareas', ctx);

      const replies = harness.getReplies();
      expect(replies.length).toBe(1);
      expect(replies[0].text).toContain('No hay proyectos activos');
    });

    test('shows error when project not found by name', async () => {
      const ctx = harness.createMockCtx();
      await harness.executeCommand('tareas', ctx, 'NonExistentProject');

      const replies = harness.getReplies();
      expect(replies.length).toBe(1);
      expect(replies[0].text).toContain('no encontrado');
    });
  });

  describe('/progreso', () => {
    test('shows progress stats', async () => {
      seedProject(harness.db, {
        id: 'test-proj-1',
        name: 'Test Project',
        status: 'active',
        progress: 50,
      });

      const ctx = harness.createMockCtx();
      await harness.executeCommand('progreso', ctx);

      const replies = harness.getReplies();
      expect(replies.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('/agentes', () => {
    test('returns agent list', async () => {
      const ctx = harness.createMockCtx();
      await harness.executeCommand('agentes', ctx);

      const replies = harness.getReplies();
      expect(replies.length).toBeGreaterThanOrEqual(1);
    });
  });
});
