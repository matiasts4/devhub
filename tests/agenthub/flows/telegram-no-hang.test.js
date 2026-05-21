const { TelegramTestHarness } = require('../telegram/harness');

function createConversationServiceMock() {
  const historyByChat = new Map();

  return {
    getConversation: (chatId) => historyByChat.get(String(chatId)) || [],
    addMessage: (chatId, role, content) => {
      const key = String(chatId);
      const current = historyByChat.get(key) || [];
      historyByChat.set(key, [...current, { role, content }]);
    },
    buildContextPrompt: (chatId, text) => {
      const history = historyByChat.get(String(chatId)) || [];
      const historyLines = history.map((entry) => `${entry.role}: ${entry.content}`);

      return [...historyLines, text].filter(Boolean).join('\n');
    },
    setAgent: () => {},
    getAgent: () => 'sdd-orchestrator',
    resetConversation: (chatId) => historyByChat.delete(String(chatId)),
    startNewSession: () => ({ sessionId: 'chat-session-1', agent: 'sdd-orchestrator' }),
    getSessionInfo: () => ({}),
    getHistory: (chatId) => historyByChat.get(String(chatId)) || [],
    getConversationCount: () => historyByChat.size,
    cleanupOldConversations: () => {},
  };
}

jest.setTimeout(5000);

const MAX_MS = 2000;

describe('Flow: Telegram No Hang', () => {
  let harness;
  let previousUseOpencode;
  let previousMultiTurn;
  let previousTracePersistence;

  beforeEach(async () => {
    previousUseOpencode = process.env.TELEGRAM_USE_OPENCODE;
    previousMultiTurn = process.env.TELEGRAM_MULTI_TURN;
    previousTracePersistence = process.env.TRACE_PERSISTENCE_ENABLED;
    process.env.TELEGRAM_USE_OPENCODE = 'true';
    process.env.TELEGRAM_MULTI_TURN = 'false';
    process.env.TRACE_PERSISTENCE_ENABLED = 'false';

    harness = new TelegramTestHarness({ lockOwner: 'flow-telegram-no-hang' });
    await harness.setup();

    harness.mockService('db', {
      getDashboard: () => [
        {
          id: 'test-proj-1',
          name: 'Test Project',
          status: 'active',
          progress: 20,
          color: null,
          tasks: { total: 1, completed: 0, in_progress: 1, blocked: 0 },
          next_milestone: null,
        },
      ],
      getActiveProjects: () => [{ id: 'test-proj-1', name: 'Test Project', status: 'active' }],
      getTasks: () => [{ id: 'task-1', title: 'Task 1', status: 'pending', priority: 'high' }],
    });
  });

  afterEach(async () => {
    if (previousUseOpencode === undefined) delete process.env.TELEGRAM_USE_OPENCODE;
    else process.env.TELEGRAM_USE_OPENCODE = previousUseOpencode;

    if (previousMultiTurn === undefined) delete process.env.TELEGRAM_MULTI_TURN;
    else process.env.TELEGRAM_MULTI_TURN = previousMultiTurn;

    if (previousTracePersistence === undefined) delete process.env.TRACE_PERSISTENCE_ENABLED;
    else process.env.TRACE_PERSISTENCE_ENABLED = previousTracePersistence;

    harness.restoreService('conversation');
    harness.restoreService('session-bridge');
    harness.restoreService('opencode');
    harness.restoreService('db');
    await harness.teardown();
  });

  async function expectFastReply(commandName) {
    const ctx = harness.createMockCtx({ chatId: `chat-${commandName}` });
    const start = Date.now();

    await harness.executeCommand(commandName, ctx);

    const delta = Date.now() - start;
    const replies = harness.getReplies();
    const lastReply = replies[replies.length - 1];

    expect(delta).toBeLessThan(MAX_MS);
    expect(lastReply.text.trim().length).toBeGreaterThan(0);

    harness.resetMockHistory();
  }

  test('/estado responds in under 2000ms', async () => {
    await expectFastReply('estado');
  });

  test('/tareas responds in under 2000ms', async () => {
    await expectFastReply('tareas');
  });

  test('/help responds in under 2000ms', async () => {
    await expectFastReply('help');
  });

  test('plain-text chat responds in under 2000ms', async () => {
    const conversation = createConversationServiceMock();

    harness.mockServices({
      conversation,
      'session-bridge': {
        resolveSession: async () => ({
          session: {
            id: 'agenthub-session-plain-1',
            opencode_session_id: 'opencode-session-plain-1',
            directory: process.cwd(),
          },
          isNew: false,
        }),
      },
      opencode: {
        sendMessage: jest.fn(async () => ({
          output: 'Respuesta rápida para el mensaje en texto plano.',
          events: [],
        })),
      },
    });

    const chat = harness.loadCommand('chat');
    const ctx = harness.createMockCtx({
      chatId: 'plain-text-chat-1',
      messageId: 201,
      message: {
        chat: { id: 'plain-text-chat-1' },
        from: { id: 'user-1', username: 'Test User', first_name: 'Test User' },
        message_id: 201,
        text: 'Necesito un resumen de la tarea actual',
        date: Math.floor(Date.now() / 1000),
      },
    });

    const start = Date.now();
    await chat(harness.mockBot, ctx.message, harness.db);
    const delta = Date.now() - start;

    const substantiveReplies = harness
      .getReplies()
      .filter((reply) => reply.text !== '⏳ Pensando...');

    expect(delta).toBeLessThan(MAX_MS);
    expect(substantiveReplies).toHaveLength(1);
    expect(substantiveReplies[0].text).toContain('Respuesta rápida');
  });
});
