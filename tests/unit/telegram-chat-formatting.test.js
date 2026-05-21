function loadChatModule() {
  jest.resetModules();

  process.env.TELEGRAM_USE_OPENCODE = 'true';
  process.env.TELEGRAM_MULTI_TURN = 'false';
  process.env.TRACE_PERSISTENCE_ENABLED = 'false';

  jest.doMock('../../telegram-bot/services/opencode', () => ({
    sendMessage: jest.fn(),
    run: jest.fn(),
  }));

  jest.doMock('../../telegram-bot/services/session-bridge', () => ({
    resolveSession: jest.fn(),
  }));

  jest.doMock('../../telegram-bot/services/conversation', () => ({
    getAgent: jest.fn().mockReturnValue('test-agent'),
    buildContextPrompt: jest.fn((_chatId, text) => text),
    addMessage: jest.fn(),
  }));

  jest.doMock('../../telegram-bot/services/formatter', () => ({
    formatError: jest.fn((message) => `formatted:${message}`),
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

  jest.doMock('fs', () => ({
    existsSync: jest.fn().mockReturnValue(false),
    statSync: jest.fn(),
    readFileSync: jest.fn(),
  }));

  return require('../../telegram-bot/commands/chat');
}

describe('telegram chat response formatting', () => {
  afterEach(() => {
    delete process.env.TELEGRAM_USE_OPENCODE;
    delete process.env.TELEGRAM_MULTI_TURN;
    delete process.env.TRACE_PERSISTENCE_ENABLED;
  });

  it('joins soft-wrapped prose into readable paragraphs', () => {
    const chatModule = loadChatModule();
    const { normalizeTelegramResponseLayout } = chatModule.__private__;

    const input = [
      'Este es un párrafo que llegó',
      'cortado en varias líneas',
      'sin intención real de separarlo.',
      '',
      'Y este segundo párrafo',
      'también debería quedar unido.',
    ].join('\n');

    expect(normalizeTelegramResponseLayout(input)).toBe(
      'Este es un párrafo que llegó cortado en varias líneas sin intención real de separarlo.\n\nY este segundo párrafo también debería quedar unido.'
    );
  });

  it('strips literal fences and repairs fragmented listing-like bash blocks', () => {
    const chatModule = loadChatModule();
    const { normalizeTelegramResponseLayout, normalizeTelegramCodeAndListingBlocks } =
      chatModule.__private__;

    const input = [
      '```bash',
      'add',
      '-m',
      'cp',
      '-tool',
      '.js',
      'build',
      '_log',
      '.txt',
      'CODE',
      'BASE',
      '_A',
      'UD',
      'IT',
      '_REPORT',
      '_DEL',
      'TA',
      '.md',
      '```',
    ].join('\n');

    const normalized = normalizeTelegramCodeAndListingBlocks(
      normalizeTelegramResponseLayout(input)
    );

    expect(normalized).toBe(
      ['add-mcp-tool.js', 'build_log.txt', 'CODEBASE_AUDIT_REPORT_DELTA.md'].join('\n')
    );

    expect(normalized).not.toContain('```');
    expect(normalized).not.toContain('`bash');
  });

  it('keeps prose readable when a code block is present', () => {
    const chatModule = loadChatModule();
    const { normalizeTelegramResponseLayout, normalizeTelegramCodeAndListingBlocks } =
      chatModule.__private__;

    const input = [
      'Acá tenés el comando',
      'para revisar el estado.',
      '',
      '```bash',
      'ls -la',
      'pwd',
      '```',
      '',
      'Después podés seguir',
      'con el próximo paso.',
    ].join('\n');

    expect(normalizeTelegramCodeAndListingBlocks(normalizeTelegramResponseLayout(input))).toBe(
      [
        'Acá tenés el comando para revisar el estado.',
        '',
        'ls -la',
        'pwd',
        '',
        'Después podés seguir con el próximo paso.',
      ].join('\n')
    );
  });

  it('keeps chunking readable after layout normalization', () => {
    const chatModule = loadChatModule();
    const { sendChunkedResponse } = chatModule.__private__;
    const bot = {
      sendMessage: jest.fn(),
    };

    const softWrappedParagraph = `${'Esta es una oración extensa '.repeat(45).trim()}\n${'que el modelo devolvió en otra línea '.repeat(45).trim()}\n${'y que debería viajar como un párrafo normal. '.repeat(45).trim()}`;
    const input = `${softWrappedParagraph}\n\n${softWrappedParagraph}`;

    sendChunkedResponse(bot, 12345, input);

    expect(bot.sendMessage.mock.calls.length).toBeGreaterThan(1);

    const chunks = bot.sendMessage.mock.calls.map(([, chunk]) => chunk);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(4096);
      expect(chunk).not.toContain('normal.\nque el modelo');
    }
  });

  it('preserves simple file listings line by line', () => {
    const chatModule = loadChatModule();
    const { normalizeTelegramResponseLayout } = chatModule.__private__;

    const input = ['src/', 'package.json', 'README.md', 'telegram-bot/'].join('\n');

    expect(normalizeTelegramResponseLayout(input)).toBe(input);
  });
});
