'use strict';
/**
 * @module telegram.test
 * TDD tests for src/lib/db/telegram.js
 */
const Database = require('better-sqlite3');
const { ensureRuntimeSchema } = require('./core');
const {
  buildTelegramActorId,
  buildTelegramIntentIdempotencyKey,
  getTelegramActorMappingByTelegramUser,
  upsertTelegramActorMapping,
  recordTelegramIntentEnvelope,
  getTelegramIntentByIdempotencyKey,
} = require('./telegram');

let db;

beforeEach(() => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  ensureRuntimeSchema(db);
});

afterEach(() => {
  db.close();
});

// ---------------------------------------------------------------------------
// buildTelegramActorId
// ---------------------------------------------------------------------------

describe('buildTelegramActorId', () => {
  it('prefixes with telegram:', () => {
    expect(buildTelegramActorId('123')).toBe('telegram:123');
  });

  it('trims whitespace', () => {
    expect(buildTelegramActorId('  456  ')).toBe('telegram:456');
  });
});

// ---------------------------------------------------------------------------
// buildTelegramIntentIdempotencyKey
// ---------------------------------------------------------------------------

describe('buildTelegramIntentIdempotencyKey', () => {
  it('builds key from all parts', () => {
    const key = buildTelegramIntentIdempotencyKey({
      update_id: 'u1',
      actor_id: 'a1',
      action: 'approve',
      target_ref: { task_id: 't1', workspace_id: 'w1', run_id: 'r1', approval_id: 'ap1' },
    });
    expect(key).toBe('telegram:u1:a1:approve:t1:w1:r1:ap1');
  });

  it('uses dashes for missing fields', () => {
    const key = buildTelegramIntentIdempotencyKey({ action: 'status' });
    expect(key).toContain('telegram:-:-:status');
  });
});

// ---------------------------------------------------------------------------
// upsertTelegramActorMapping + getTelegramActorMappingByTelegramUser
// ---------------------------------------------------------------------------

describe('upsertTelegramActorMapping', () => {
  it('inserts a new mapping and returns it', () => {
    const result = upsertTelegramActorMapping(db, {
      telegram_user_id: '111',
      devhub_actor_id: 'user-abc',
      allowlisted: true,
    });
    expect(result).not.toBeNull();
    expect(result.telegram_user_id).toBe('111');
    expect(result.devhub_actor_id).toBe('user-abc');
  });

  it('updates existing mapping on conflict', () => {
    upsertTelegramActorMapping(db, { telegram_user_id: '222', devhub_actor_id: 'old-id' });
    upsertTelegramActorMapping(db, { telegram_user_id: '222', devhub_actor_id: 'new-id' });
    const result = getTelegramActorMappingByTelegramUser(db, '222');
    expect(result.devhub_actor_id).toBe('new-id');
  });

  it('returns null for unknown telegram_user_id', () => {
    const result = getTelegramActorMappingByTelegramUser(db, 'nonexistent');
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// recordTelegramIntentEnvelope + getTelegramIntentByIdempotencyKey
// ---------------------------------------------------------------------------

describe('recordTelegramIntentEnvelope', () => {
  beforeEach(() => {
    // Seed an allowlisted actor (required by recordTelegramIntentEnvelope)
    upsertTelegramActorMapping(db, {
      telegram_user_id: 'tg-111',
      devhub_actor_id: 'actor-1',
      allowlisted: true,
    });
  });

  const validInput = {
    actor_id: 'telegram:tg-111',
    chat_id: 'chat-1',
    action: 'status.query',
    status: 'accepted',
    update_id: 'upd-1',
  };

  it('records an intent and returns it', () => {
    const result = recordTelegramIntentEnvelope(db, validInput);
    expect(result).not.toBeNull();
    expect(result.actor_id).toBe('telegram:tg-111');
    expect(result.action).toBe('status.query');
  });

  it('is idempotent by update_id', () => {
    const r1 = recordTelegramIntentEnvelope(db, validInput);
    const r2 = recordTelegramIntentEnvelope(db, validInput);
    expect(r1.intent_id).toBe(r2.intent_id);
  });

  it('returns null when looking up nonexistent idempotency key', () => {
    expect(getTelegramIntentByIdempotencyKey(db, 'no-such-key')).toBeNull();
  });
});
