const Database = require('better-sqlite3');
const { ensureRuntimeSchema, upsertTelegramActorMapping } = require('../../src/lib/db/localDb');
const { resolveAllowedActor } = require('../services/auth');

describe('telegram auth allowlisted actor mapping', () => {
  let db;

  beforeEach(() => {
    db = new Database(':memory:');
    ensureRuntimeSchema(db);
  });

  afterEach(() => {
    db.close();
  });

  test('resolves allowlisted telegram actors to durable devhub identities', () => {
    upsertTelegramActorMapping(db, {
      telegram_user_id: 'user-allowed',
      telegram_chat_id: 'chat-allowed',
      devhub_actor_id: 'human-allowed',
      display_name: 'Allowed Human',
      allowlisted: true,
    });

    expect(resolveAllowedActor(db, 'user-allowed', 'chat-allowed')).toMatchObject({
      actor_id: 'telegram:user-allowed',
      devhub_actor_id: 'human-allowed',
      allowlisted: true,
    });
  });

  test('rejects non-allowlisted or mismatched chat mappings', () => {
    upsertTelegramActorMapping(db, {
      telegram_user_id: 'user-denied',
      telegram_chat_id: 'chat-denied',
      devhub_actor_id: 'human-denied',
      allowlisted: false,
    });

    expect(resolveAllowedActor(db, 'user-denied', 'chat-denied')).toBe(null);

    upsertTelegramActorMapping(db, {
      telegram_user_id: 'user-chat-check',
      telegram_chat_id: 'chat-canonical',
      devhub_actor_id: 'human-chat-check',
      allowlisted: true,
    });

    expect(resolveAllowedActor(db, 'user-chat-check', 'chat-other')).toBe(null);
  });
});
