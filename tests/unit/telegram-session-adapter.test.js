describe('telegram session adapter context', () => {
  function loadModule({ actor, envelope, outcome }) {
    jest.resetModules();

    const durableDb = { prepare: jest.fn() };
    jest.doMock('../../src/lib/db/localDb', () => ({
      getDb: jest.fn(() => durableDb),
    }));
    jest.doMock('../../telegram-bot/services/auth', () => ({
      resolveAllowedActor: jest.fn(() => actor),
    }));
    jest.doMock('../../telegram-bot/services/external-adapter', () => ({
      normalizeInboundTelegramIntent: jest.fn(() => envelope),
      handleInboundTelegramIntent: jest.fn(() => outcome),
    }));
    jest.doMock('../../telegram-bot/lib/db-bridge', () => ({
      findProject: jest.fn(),
      getActiveProjects: jest.fn(() => []),
    }));
    jest.doMock('../../telegram-bot/services/opencode', () => ({
      ensureServer: jest.fn(),
      createSession: jest.fn(),
    }));
    jest.doMock('../../telegram-bot/utils/logger', () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }));

    return require('../../telegram-bot/services/session-bridge');
  }

  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('normalizes allowlisted inbound telegram context into a durable adapter outcome', () => {
    const actor = { actor_id: 'telegram:user-1', devhub_actor_id: 'human-1' };
    const envelope = { action: 'status.query', actor_id: actor.actor_id };
    const outcome = { accepted: true, intent: { intent_id: 'intent-1', audit_status: 'accepted' } };
    const bridge = loadModule({ actor, envelope, outcome });

    expect(
      bridge.resolveTelegramAdapterContext({
        chatId: 'chat-1',
        telegramUserId: 'user-1',
        messageId: '10',
        text: '/estado',
      })
    ).toEqual({ actor, envelope, outcome });
  });

  it('returns an allowlist denial without inventing a local fallback actor', () => {
    const bridge = loadModule({ actor: null, envelope: null, outcome: null });

    expect(
      bridge.resolveTelegramAdapterContext({
        chatId: 'chat-2',
        telegramUserId: 'user-2',
        messageId: '11',
        text: '/spawn task',
      })
    ).toEqual({
      actor: null,
      envelope: null,
      outcome: {
        accepted: false,
        pending_approval: false,
        denial_reason: 'actor-not-allowlisted',
        intent: null,
      },
    });
  });
});
