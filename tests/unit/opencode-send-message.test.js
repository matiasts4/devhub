describe('opencode.sendMessage', () => {
  function loadModule() {
    jest.resetModules();

    jest.doMock('../../telegram-bot/utils/logger', () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }));

    jest.doMock('../../telegram-bot/services/activityLogger', () => ({
      logAgentEvent: jest.fn(),
    }));

    return require('../../telegram-bot/services/opencode');
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.resetModules();
    delete global.fetch;
  });

  test('rejects immediately when the OpenCode session ID is missing', async () => {
    const opencode = loadModule();
    global.fetch = jest.fn();

    await expect(
      opencode.sendMessage('agenthub-session-1', null, 'gentleman', 'hola')
    ).rejects.toThrow('OpenCode session ID is required for AgentHub session agenthub-session-1');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('rejects with a descriptive error and closes SSE when message submission fails', async () => {
    const reader = {
      read: jest.fn(),
      cancel: jest.fn().mockResolvedValue(undefined),
    };

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({
        ok: true,
        body: {
          getReader: () => reader,
        },
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => 'session missing',
      });

    const opencode = loadModule();

    await expect(
      opencode.sendMessage('agenthub-session-2', 'oc-stale-session', 'gentleman', 'hola')
    ).rejects.toThrow(
      'Failed to send message to OpenCode session oc-stale-session: 404 session missing'
    );

    expect(reader.cancel).toHaveBeenCalledTimes(1);
    expect(reader.read).not.toHaveBeenCalled();
    expect(global.fetch).toHaveBeenNthCalledWith(1, 'http://127.0.0.1:4153/global/health', {
      method: 'GET',
      signal: expect.any(Object),
    });
    expect(global.fetch).toHaveBeenNthCalledWith(2, 'http://127.0.0.1:4153/event', {});
    expect(global.fetch).toHaveBeenNthCalledWith(
      3,
      'http://127.0.0.1:4153/session/oc-stale-session/message',
      expect.objectContaining({ method: 'POST' })
    );
  });
});
