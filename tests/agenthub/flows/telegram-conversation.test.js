const { TelegramTestHarness } = require('../telegram/harness');
const { FlowVerifier } = require('../flow-verifier');

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

      return [
        '[CONTEXTO DE CONVERSACIÓN PREVIA]',
        ...historyLines,
        '[NUEVO MENSAJE DEL USUARIO]',
        text,
      ]
        .filter(Boolean)
        .join('\n');
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

describe('Flow: Telegram Conversation', () => {
  let harness;
  let verifier;
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

    harness = new TelegramTestHarness({ lockOwner: 'flow-telegram-conversation' });
    await harness.setup();
    verifier = new FlowVerifier(harness);

    harness.mockServices({
      db: {
        getDashboard: () => [
          {
            id: 'test-proj-1',
            name: 'Test Project',
            status: 'active',
            progress: 75,
            color: null,
            tasks: { total: 3, completed: 2, in_progress: 1, blocked: 0 },
            next_milestone: null,
          },
        ],
        getActiveProjects: () => [{ id: 'test-proj-1', name: 'Test Project', status: 'active' }],
        getTasks: () => [
          { id: 'task-1', title: 'Task 1', status: 'pending', priority: 'high' },
          { id: 'task-2', title: 'Task 2', status: 'in_progress', priority: 'medium' },
        ],
      },
      opencode: {
        getServerStatus: () => ({ running: false, ready: false }),
        sendMessage: () => Promise.resolve('ok'),
        createSession: () => Promise.resolve({ id: 'oc-1' }),
      },
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

  test('completes a three-step conversation with non-empty replies', async () => {
    const result = await verifier.execute({
      name: 'telegram-conversation',
      timeout: 5000,
      onFailure: 'abort',
      steps: [
        {
          name: 'tareas',
          action: 'telegram',
          command: 'tareas',
          ctx: { chatId: 'test-chat-1' },
          assert: { replyContains: 'Task 1' },
        },
        {
          name: 'estado',
          action: 'telegram',
          command: 'estado',
          ctx: { chatId: 'test-chat-1' },
          assert: { replyContains: 'Test Project' },
        },
        {
          name: 'help',
          action: 'telegram',
          command: 'help',
          ctx: { chatId: 'test-chat-1' },
          assert: { replyContains: 'Ayuda' },
        },
      ],
    });

    const replies = harness.getReplies();

    expect(result.success).toBe(true);
    expect(result.failedSteps).toBe(0);
    expect(replies.length).toBeGreaterThanOrEqual(3);

    for (const reply of replies) {
      expect(reply.text.trim().length).toBeGreaterThan(0);
    }
  });

  test('keeps context across two plain-text turns in the same chat', async () => {
    const conversation = createConversationServiceMock();
    const opencodeSendMessage = jest.fn(async (_sessionId, _opencodeSessionId, _agent, prompt) => {
      if (prompt.includes('¿Qué prioridad tenía esa tarea?')) {
        return {
          output: 'La tarea Corregir login sigue siendo la prioridad alta que mencionamos recién.',
          events: [],
        };
      }

      return {
        output:
          'Vamos a enfocarnos en Corregir login. Esa tarea quedó marcada como prioridad alta.',
        events: [],
      };
    });

    harness.mockServices({
      conversation,
      'session-bridge': {
        resolveSession: async () => ({
          session: {
            id: 'agenthub-session-1',
            opencode_session_id: 'opencode-session-1',
            directory: process.cwd(),
          },
          isNew: false,
        }),
      },
      opencode: {
        sendMessage: opencodeSendMessage,
      },
    });

    const chat = harness.loadCommand('chat');
    const firstCtx = harness.createMockCtx({
      chatId: 'plain-chat-1',
      messageId: 101,
      message: {
        chat: { id: 'plain-chat-1' },
        from: { id: 'user-1', username: 'Test User', first_name: 'Test User' },
        message_id: 101,
        text: 'Necesito ayuda con la tarea Corregir login',
        date: Math.floor(Date.now() / 1000),
      },
    });
    const secondCtx = harness.createMockCtx({
      chatId: 'plain-chat-1',
      messageId: 102,
      message: {
        chat: { id: 'plain-chat-1' },
        from: { id: 'user-1', username: 'Test User', first_name: 'Test User' },
        message_id: 102,
        text: '¿Qué prioridad tenía esa tarea?',
        date: Math.floor(Date.now() / 1000),
      },
    });

    await chat(harness.mockBot, firstCtx.message, harness.db);
    await chat(harness.mockBot, secondCtx.message, harness.db);

    const substantiveReplies = harness
      .getReplies()
      .filter((reply) => reply.text !== '⏳ Pensando...');

    expect(substantiveReplies).toHaveLength(2);
    expect(substantiveReplies[0].text).toContain('Corregir login');
    expect(substantiveReplies[0].text).toContain('prioridad alta');
    expect(substantiveReplies[1].text).toContain('Corregir login');
    expect(substantiveReplies[1].text).toContain('prioridad alta');
    expect(substantiveReplies[1].text).toContain('mencionamos recién');
    expect(opencodeSendMessage).toHaveBeenCalledTimes(2);
    expect(opencodeSendMessage.mock.calls[1][3]).toContain(
      'user: Necesito ayuda con la tarea Corregir login'
    );
  });
});
