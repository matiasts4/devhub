/**
 * Telegram Bot Tests — Session Commands
 *
 * Tests: /sesiones, /nueva_sesion, /session, /project, /status, /agente, /historial
 */

const { TelegramTestHarness } = require('./harness');
const { seedProject, seedSession } = require('../fixtures');

jest.setTimeout(10000);

describe('Telegram Session Commands', () => {
  let harness;
  let getSessions;
  let getActiveSession;
  let switchSession;
  let switchProject;
  let getHistory;
  let setAgent;

  beforeEach(async () => {
    harness = new TelegramTestHarness({ lockOwner: 'telegram-sessions' });
    await harness.setup();

    getSessions = jest.fn(() => []);
    getActiveSession = jest.fn(() => null);
    switchSession = jest.fn(() => null);
    switchProject = jest.fn(() => null);
    getHistory = jest.fn(() => []);
    setAgent = jest.fn();

    harness.mockServices({
      'lib/db-bridge': {
        getUsage: () => ({ total_tokens: 42, tool_calls_count: 2 }),
        findProject: (projectId) =>
          projectId === 'test-proj-info' ? { id: projectId, name: 'Info Project' } : null,
        getActiveProjects: () => [{ id: 'test-proj-info', name: 'Info Project', status: 'active' }],
      },
      'session-bridge': {
        resolveSession: () => Promise.resolve({ id: 'mock-session-id', title: 'Mock Session' }),
        createSession: () => Promise.resolve({ id: 'mock-session-id', title: 'Mock Session' }),
        getSessions,
        switchSession,
        getActiveSession,
        switchProject,
      },
      conversation: {
        startNewSession: () => ({ sessionId: 'mock-conv-session', agent: 'gentleman' }),
        getAgent: () => 'gentleman',
        setAgent,
        getHistory,
      },
      opencode: {
        getServerStatus: () => ({ running: false, ready: false }),
      },
    });
  });

  afterEach(async () => {
    harness.restoreService('opencode');
    harness.restoreService('conversation');
    harness.restoreService('session-bridge');
    harness.restoreService('lib/db-bridge');
    await harness.teardown();
  });

  describe('/sesiones', () => {
    test('lists sessions for chat', async () => {
      getSessions.mockReturnValue([
        { id: 'test-sess-1', title: 'Session 1', status: 'active', project_id: 'test-proj-info' },
        {
          id: 'test-sess-2',
          title: 'Session 2',
          status: 'completed',
          project_id: 'test-proj-info',
        },
      ]);

      const ctx = harness.createMockCtx();
      await harness.executeCommand('sesiones', ctx);

      const replies = harness.getReplies();
      expect(replies).toHaveLength(1);
      expect(replies[0].text).toContain('Sesiones recientes');
      expect(replies[0].text).toContain('Session 1');
    });

    test('shows empty when no sessions', async () => {
      const ctx = harness.createMockCtx();
      await harness.executeCommand('sesiones', ctx);

      const replies = harness.getReplies();
      expect(replies).toHaveLength(1);
      expect(replies[0].text).toContain('No hay sesiones');
    });
  });

  describe('/nueva_sesion', () => {
    test('creates new session', async () => {
      const ctx = harness.createMockCtx();
      await harness.executeCommand('nueva_sesion', ctx);

      const replies = harness.getReplies();
      expect(replies).toHaveLength(1);
      expect(replies[0].text).toContain('Nueva sesión iniciada');
      expect(replies[0].text).toContain('mock\\-conv\\-session');
    });
  });

  describe('/session', () => {
    test('switches active session', async () => {
      switchSession.mockReturnValue({ id: 'test-sess-switch', title: 'Switch Session' });

      const ctx = harness.createMockCtx();
      await harness.executeCommand('session', ctx, 'switch test-sess-switch');

      const replies = harness.getReplies();
      expect(replies).toHaveLength(1);
      expect(replies[0].text).toContain('Sesión cambiada');
    });

    test('shows error for non-existent session', async () => {
      const ctx = harness.createMockCtx();
      await harness.executeCommand('session', ctx, 'switch non-existent-id');

      const replies = harness.getReplies();
      expect(replies).toHaveLength(1);
      expect(replies[0].text).toContain('no encontrada');
    });
  });

  describe('/project', () => {
    test('shows project info', async () => {
      getActiveSession.mockReturnValue({
        id: 'mock-session-id',
        title: 'Mock Session',
        status: 'active',
        project_id: 'test-proj-info',
        directory: '/tmp/devhub',
      });

      const ctx = harness.createMockCtx();
      await harness.executeCommand('project', ctx);

      const replies = harness.getReplies();
      expect(replies).toHaveLength(1);
      expect(replies[0].text).toContain('Proyecto activo');
      expect(replies[0].text).toContain('Info Project');
    });
  });

  describe('/status', () => {
    test('shows detailed status', async () => {
      getActiveSession.mockReturnValue({
        id: 'mock-session-id',
        title: 'Mock Session',
        status: 'active',
        project_id: 'test-proj-info',
        directory: '/tmp/devhub',
        opencode_session_id: 'oc-session-123456',
      });

      const ctx = harness.createMockCtx();
      await harness.executeCommand('status', ctx);

      const replies = harness.getReplies();
      expect(replies).toHaveLength(1);
      expect(replies[0].text).toContain('Estado de sesión');
      expect(replies[0].text).toContain('Mock Session');
    });
  });

  describe('/agente', () => {
    test('shows agent info', async () => {
      const ctx = harness.createMockCtx();
      await harness.executeCommand('agente', ctx);

      const replies = harness.getReplies();
      expect(replies).toHaveLength(1);
      expect(replies[0].text).toContain('Agente actual');
      expect(replies[0].text).toContain('gentleman');
    });
  });

  describe('/historial', () => {
    test('shows chat history', async () => {
      getHistory.mockReturnValue([
        { role: 'user', preview: 'hola', timestamp: '10:00:00' },
        { role: 'assistant', preview: 'todo bien', timestamp: '10:00:02' },
      ]);

      const ctx = harness.createMockCtx();
      await harness.executeCommand('historial', ctx);

      const replies = harness.getReplies();
      expect(replies).toHaveLength(1);
      expect(replies[0].text).toContain('Historial reciente');
      expect(replies[0].text).toContain('todo bien');
    });
  });
});
