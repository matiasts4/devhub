function loadPersister({ session = { id: 'session-1' }, messages = [] } = {}) {
  jest.resetModules();

  const insertMessage = jest.fn(() => ({ changes: 1 }));
  jest.doMock('../../telegram-bot/lib/db-bridge', () => ({
    insertMessage,
    getMessagesForSession: jest.fn(() => messages),
    getSession: jest.fn(() => session),
  }));
  jest.doMock('../../telegram-bot/utils/logger', () => ({
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }));

  return {
    persister: require('../../telegram-bot/services/telegram-persister'),
    insertMessage,
  };
}

describe('telegram persister adapter metadata', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('stores durable adapter audit refs in message metadata', () => {
    const { persister, insertMessage } = loadPersister();

    persister.persistMessage('chat-1', 'session-1', 'assistant', 'Fuera de alcance', {
      adapterOutcome: {
        actor: { actor_id: 'telegram:user-1', devhub_actor_id: 'human-1' },
        envelope: { action: 'status.query' },
        outcome: {
          denial_reason: 'out-of-scope-orchestration',
          intent: {
            intent_id: 'intent-1',
            idempotency_key: 'key-1',
            approval_id: 'approval-1',
            audit_status: 'denied',
            result_ref: 'telegram-intent://result-1',
          },
        },
      },
    });

    expect(insertMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'telegram-adapter',
        meta: expect.objectContaining({
          telegram_actor_id: 'telegram:user-1',
          telegram_devhub_actor_id: 'human-1',
          telegram_intent_id: 'intent-1',
          telegram_idempotency_key: 'key-1',
          telegram_approval_id: 'approval-1',
          telegram_audit_status: 'denied',
          telegram_result_ref: 'telegram-intent://result-1',
          telegram_denial_reason: 'out-of-scope-orchestration',
        }),
      })
    );
  });

  it('merges durable adapter metadata with existing message metadata', () => {
    const { persister, insertMessage } = loadPersister();

    persister.persistMessage('chat-1', 'session-1', 'assistant', 'Estado durable', {
      meta: { channel: 'telegram', existing_flag: true },
      adapterOutcome: {
        actor: { actor_id: 'telegram:user-2', devhub_actor_id: 'human-2' },
        envelope: { action: 'status.query' },
        outcome: {
          intent: {
            intent_id: 'intent-2',
            idempotency_key: 'key-2',
            audit_status: 'accepted',
            result_ref: 'telegram-intent://result-2',
          },
        },
      },
    });

    expect(insertMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        meta: expect.objectContaining({
          channel: 'telegram',
          existing_flag: true,
          telegram_actor_id: 'telegram:user-2',
          telegram_intent_id: 'intent-2',
          telegram_audit_status: 'accepted',
        }),
      })
    );
  });
});
