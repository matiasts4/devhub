jest.useFakeTimers();

function flushPromises() {
  return Promise.resolve();
}

async function settleAsync(times = 5) {
  for (let index = 0; index < times; index += 1) {
    await flushPromises();
  }
}

describe('telegram chat realtime progress', () => {
  let mockOpencodeSendMessage;
  let mockResolveSession;
  let mockBuildContextPrompt;
  let mockAddMessage;
  let mockFormatError;

  function loadChatModule() {
    jest.resetModules();

    process.env.TELEGRAM_USE_OPENCODE = 'true';
    process.env.TELEGRAM_MULTI_TURN = 'false';
    process.env.TRACE_PERSISTENCE_ENABLED = 'false';
    delete process.env.TELEGRAM_PROGRESS_INTERVAL_MS;

    mockOpencodeSendMessage = jest.fn();
    mockResolveSession = jest.fn().mockResolvedValue({
      session: {
        id: 'session-123',
        opencode_session_id: 'opencode-456',
        directory: '/tmp/devhub-chat-test',
      },
      isNew: false,
    });
    mockBuildContextPrompt = jest.fn((chatId, text) => text);
    mockAddMessage = jest.fn();
    mockFormatError = jest.fn((message) => `formatted:${message}`);

    jest.doMock('../../telegram-bot/services/opencode', () => ({
      sendMessage: mockOpencodeSendMessage,
      run: jest.fn(),
    }));

    jest.doMock('../../telegram-bot/services/session-bridge', () => ({
      resolveSession: mockResolveSession,
    }));

    jest.doMock('../../telegram-bot/services/conversation', () => ({
      getAgent: jest.fn().mockReturnValue('test-agent'),
      buildContextPrompt: mockBuildContextPrompt,
      addMessage: mockAddMessage,
    }));

    jest.doMock('../../telegram-bot/services/formatter', () => ({
      formatError: mockFormatError,
    }));

    jest.doMock('../../telegram-bot/utils/logger', () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }));

    jest.doMock('../../telegram-bot/services/providers/llm-bridge', () => ({
      getLLMBridgeService: jest.fn(),
      resetLLMBridgeService: jest.fn(),
    }));

    jest.doMock('../../telegram-bot/services/api', () => ({}));

    jest.doMock('../../telegram-bot/services/executor', () => ({
      createSimpleApprovalHandler: jest.fn(() => jest.fn()),
    }));

    jest.doMock('../../telegram-bot/lib/db-bridge', () => ({
      upsertUsage: jest.fn(),
    }));

    jest.doMock('fs', () => ({
      existsSync: jest.fn().mockReturnValue(false),
      statSync: jest.fn(),
      readFileSync: jest.fn(),
    }));

    global.fetch = jest.fn();

    return require('../../telegram-bot/commands/chat');
  }

  function createBot() {
    return {
      sendMessage: jest.fn().mockResolvedValue({ message_id: 900 }),
      deleteMessage: jest.fn().mockResolvedValue({}),
      editMessageText: jest.fn().mockResolvedValue({}),
    };
  }

  beforeEach(() => {
    jest.clearAllTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    delete global.fetch;
    delete process.env.TELEGRAM_USE_OPENCODE;
    delete process.env.TELEGRAM_MULTI_TURN;
    delete process.env.TRACE_PERSISTENCE_ENABLED;
    delete process.env.TELEGRAM_PROGRESS_INTERVAL_MS;
  });

  it('sends a real periodic progress summary from runOpenCodeHeadless after 45s', async () => {
    const { runOpenCodeHeadless } = loadChatModule();
    const bot = createBot();
    const onEvent = jest.fn();
    let finishSendMessage;

    mockOpencodeSendMessage.mockImplementation(
      async (_sessionId, _opencodeId, _agent, _prompt, options) => {
        options.onEvent('[🔧 Ejecutando bash...]');
        options.onEvent('[🔧 Ejecutando bash...]');
        options.onEvent('[🔧 Ejecutando read_file...]');

        return new Promise((resolve) => {
          finishSendMessage = () =>
            resolve({
              output: 'respuesta final',
              events: [],
              durationMs: 90_000,
            });
        });
      }
    );

    const pending = runOpenCodeHeadless(bot, 'test-agent', 'hola', 12345, onEvent);
    await settleAsync();

    jest.advanceTimersByTime(45_000);
    await settleAsync();

    expect(bot.sendMessage).toHaveBeenCalledWith(
      12345,
      expect.stringContaining('⏳ Trabajando... (45s)')
    );
    expect(bot.sendMessage).toHaveBeenCalledWith(12345, expect.stringContaining('bash'));
    expect(bot.sendMessage).toHaveBeenCalledWith(12345, expect.stringContaining('read_file'));
    expect(onEvent).toHaveBeenCalledWith('[🔧 Ejecutando bash...]');

    finishSendMessage();
    await pending;
  });

  it('does not send periodic progress when the single-turn run finishes before 45s', async () => {
    const { runOpenCodeHeadless } = loadChatModule();
    const bot = createBot();

    mockOpencodeSendMessage.mockResolvedValue({
      output: 'done',
      events: [],
      durationMs: 10_000,
    });

    await runOpenCodeHeadless(bot, 'test-agent', 'hola', 12345, jest.fn());

    jest.advanceTimersByTime(45_000);
    await flushPromises();

    expect(bot.sendMessage).not.toHaveBeenCalled();
  });

  it('clears the progress interval in every path, including failures', async () => {
    const { runOpenCodeHeadless } = loadChatModule();
    const bot = createBot();
    const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

    mockOpencodeSendMessage.mockRejectedValue(new Error('opencode exploded'));

    const pending = runOpenCodeHeadless(bot, 'test-agent', 'hola', 12345, jest.fn());
    await settleAsync();
    jest.runOnlyPendingTimers();
    await settleAsync();
    jest.runOnlyPendingTimers();
    await settleAsync();
    jest.runOnlyPendingTimers();
    await settleAsync();

    await expect(pending).rejects.toThrow('opencode exploded');
    expect(clearIntervalSpy).toHaveBeenCalled();

    clearIntervalSpy.mockRestore();
  });

  it('falls back to herramienta desconocida when a tool event cannot be parsed cleanly', async () => {
    const chatModule = loadChatModule();
    const chat = chatModule;
    const bot = createBot();

    mockOpencodeSendMessage.mockImplementation(
      async (_sessionId, _opencodeId, _agent, _prompt, options) => {
        options.onEvent('[🔧 Ejecutando ...]');
        return {
          output: 'resultado',
          events: [],
          durationMs: 46_000,
        };
      }
    );

    await chat(
      bot,
      {
        chat: { id: 12345 },
        text: 'hacé algo',
        from: { id: 1 },
        message_id: 77,
      },
      null
    );

    const editedTexts = bot.editMessageText.mock.calls.map(([text]) => text);
    expect(editedTexts.some((text) => text.includes('desconocida'))).toBe(true);
  });

  it('edits the thinking message with a final summary on success and never deletes it', async () => {
    const chatModule = loadChatModule();
    const chat = chatModule;
    const bot = createBot();

    mockOpencodeSendMessage.mockImplementation(
      async (_sessionId, _opencodeId, _agent, _prompt, options) => {
        options.onEvent('[🔧 Ejecutando bash...]');
        options.onEvent('[🔧 Ejecutando read_file...]');

        return {
          output: 'Resultado final',
          events: [],
          durationMs: 73_000,
        };
      }
    );

    await chat(
      bot,
      {
        chat: { id: 12345 },
        text: 'decime el resultado',
        from: { id: 1 },
        message_id: 77,
      },
      null
    );

    const editedTexts = bot.editMessageText.mock.calls.map(([text]) => text);

    expect(editedTexts.some((text) => text.includes('✅ Listo en 1m 13s'))).toBe(true);
    expect(editedTexts.some((text) => text.includes('bash, read_file'))).toBe(true);
    expect(bot.deleteMessage).not.toHaveBeenCalled();
    expect(bot.sendMessage).toHaveBeenCalledWith(12345, 'Resultado final');
  });

  it('edits the thinking message with ninguna herramienta ejecutada when no tools ran', async () => {
    const chatModule = loadChatModule();
    const chat = chatModule;
    const bot = createBot();

    mockOpencodeSendMessage.mockResolvedValue({
      output: 'Resultado final',
      events: [],
      durationMs: 10_000,
    });

    await chat(
      bot,
      {
        chat: { id: 12345 },
        text: 'decime el resultado',
        from: { id: 1 },
        message_id: 77,
      },
      null
    );

    const editedTexts = bot.editMessageText.mock.calls.map(([text]) => text);
    expect(editedTexts.some((text) => text.includes('ninguna herramienta ejecutada'))).toBe(true);
  });
});
