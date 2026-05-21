/**
 * Telegram Bot Tests — Basic Commands
 *
 * Tests: /help, /estado, /reset
 */

const { TelegramTestHarness } = require('./harness');
const { seedProject, seedTask, seedSession } = require('../fixtures');

describe('Telegram Basic Commands', () => {
  let harness;

  beforeEach(async () => {
    harness = new TelegramTestHarness({ lockOwner: 'telegram-basic' });
    await harness.setup();

    // Mock db service — prevents real disk DB access from estado command
    harness.mockService('db', {
      getDashboard: () => [],
      getActiveProjects: () => [],
      getTasks: () => [],
      getAgents: () => [],
      getAgentStats: () => ({ total: 0, active: 0, idle: 0 }),
    });

    // Mock conversation + lib/db-bridge to avoid db-bridge opening real DB
    harness.mockService('conversation', {
      getConversation: () => [],
      addMessage: () => {},
      buildContextPrompt: () => '',
      setAgent: () => {},
      getAgent: () => null,
      resetConversation: () => {},
      startNewSession: () => {},
      getSessionInfo: () => ({}),
      getHistory: () => [],
      getConversationCount: () => 0,
      cleanupOldConversations: () => {},
    });

    harness.mockService('session-bridge', {
      resolveTelegramAdapterContext: () => ({
        actor: { actor_id: 'telegram:test-user-1', devhub_actor_id: 'human-test-user-1' },
        envelope: { action: 'status.query' },
        outcome: {
          accepted: false,
          pending_approval: false,
          denial_reason: 'out-of-scope-orchestration',
          intent: {
            intent_id: 'intent-reset-1',
            audit_status: 'denied',
            result_ref: 'telegram-intent://intent-reset-1',
          },
        },
      }),
      getActiveSession: () => null,
    });

    harness.mockService('telegram-persister', {
      persistMessage: () => null,
    });

    harness.mockService('lib/db-bridge', {
      getTelegramSession: () => null,
      createTelegramSession: () => ({}),
      getSessionsByChat: () => [],
      getSession: () => null,
      createSession: () => ({}),
      updateSessionStatus: () => {},
      insertMessage: () => {},
      getMessagesForSession: () => [],
      findProject: () => null,
      getActiveProjects: () => [],
      getUsage: () => null,
      close: () => {},
      db: harness.db,
    });
  });

  afterEach(async () => {
    await harness.teardown();
  });

  describe('/help', () => {
    test('returns command list', async () => {
      const ctx = harness.createMockCtx();
      await harness.executeCommand('help', ctx);

      const replies = harness.getReplies();
      expect(replies.length).toBe(1);
      expect(replies[0].text).toContain('Ayuda');
      expect(replies[0].text).toContain('/estado');
    });

    test('uses Markdown parse mode', async () => {
      const ctx = harness.createMockCtx();
      await harness.executeCommand('help', ctx);

      const replies = harness.getReplies();
      expect(replies[0].options.parse_mode).toBe('Markdown');
    });
  });

  describe('/estado', () => {
    test('shows dashboard with projects', async () => {
      // Override db mock to return our seeded project with full shape
      harness.mockService('db', {
        getDashboard: () => [
          {
            id: 'test-proj-1',
            name: 'Mi Proyecto',
            status: 'active',
            progress: 0,
            color: null,
            tasks: { total: 0, completed: 0, in_progress: 0, blocked: 0 },
            next_milestone: null,
          },
        ],
        getActiveProjects: () => [],
        getTasks: () => [],
        getAgents: () => [],
        getAgentStats: () => ({ total: 0, active: 0, idle: 0 }),
      });

      const ctx = harness.createMockCtx();
      await harness.executeCommand('estado', ctx);

      const replies = harness.getReplies();
      expect(replies.length).toBe(1);
      expect(replies[0].text).toContain('Mi Proyecto');
    });

    test('shows empty state when no projects', async () => {
      const ctx = harness.createMockCtx();
      await harness.executeCommand('estado', ctx);

      const replies = harness.getReplies();
      expect(replies.length).toBe(1);
      expect(replies[0].text).toContain('DevHub — Estado');
      expect(replies[0].text).toContain('No hay proyectos registrados');
    });
  });

  describe('/reset', () => {
    test('denies reset because orchestration remains quarantined in Telegram', async () => {
      const ctx = harness.createMockCtx();
      await harness.executeCommand('reset', ctx);

      const replies = harness.getReplies();
      expect(replies.length).toBe(1);
      expect(replies[0].text).toContain('Fuera de alcance');
      expect(replies[0].text).toContain('intent\\-reset\\-1');
    });
  });
});
