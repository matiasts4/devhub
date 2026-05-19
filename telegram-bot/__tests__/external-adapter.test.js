const Database = require('better-sqlite3');
const {
  ensureRuntimeSchema,
  upsertTelegramActorMapping,
} = require('../../src/lib/db/localDb');
const {
  normalizeInboundTelegramIntent,
  handleInboundTelegramIntent,
} = require('../services/external-adapter');

function createDb() {
  const db = new Database(':memory:');
  ensureRuntimeSchema(db);
  return db;
}

function allowlistedActor(db, overrides = {}) {
  return upsertTelegramActorMapping(db, {
    telegram_user_id: overrides.telegram_user_id || 'user-1',
    telegram_chat_id: overrides.telegram_chat_id || 'chat-1',
    devhub_actor_id: overrides.devhub_actor_id || 'human-1',
    display_name: overrides.display_name || 'Matias',
    allowlisted: overrides.allowlisted ?? true,
  });
}

describe('telegram external adapter service', () => {
  let db;

  beforeEach(() => {
    db = createDb();
  });

  afterEach(() => {
    db.close();
  });

  test('normalizes adapter-safe commands and blocks forbidden orchestration verbs', () => {
    expect(
      normalizeInboundTelegramIntent({
        text: '/estado',
        actor_id: 'telegram:user-1',
        chat_id: 'chat-1',
        message_id: '10',
        update_id: '20',
      })
    ).toMatchObject({
      action: 'status.query',
      actor_id: 'telegram:user-1',
      chat_id: 'chat-1',
    });

    expect(
      normalizeInboundTelegramIntent({
        text: '/spawn arreglá todo',
        actor_id: 'telegram:user-1',
        chat_id: 'chat-1',
        message_id: '11',
        update_id: '21',
      })
    ).toMatchObject({
      forbidden_reason: 'out-of-scope-orchestration',
      requested_verb: '/spawn arreglá todo',
    });

    expect(
      normalizeInboundTelegramIntent({
        text: '/agente build',
        actor_id: 'telegram:user-1',
        chat_id: 'chat-1',
        message_id: '11b',
        update_id: '21b',
      })
    ).toMatchObject({
      forbidden_reason: 'out-of-scope-orchestration',
      requested_verb: '/agente build',
    });
  });

  test('persists allowlisted task detail intents and reuses prior outcomes on duplicate delivery', () => {
    const actor = allowlistedActor(db);

    const envelope = normalizeInboundTelegramIntent({
      text: '/task task-1',
      actor_id: actor.actor_id,
      chat_id: 'chat-1',
      message_id: '12',
      update_id: '22',
    });

    const first = handleInboundTelegramIntent(db, envelope);
    const replay = handleInboundTelegramIntent(db, envelope);

    expect(first).toMatchObject({
      accepted: true,
      replayed: false,
      intent: {
        action: 'task.detail',
        task_id: 'task-1',
        status: 'accepted',
      },
    });
    expect(replay).toMatchObject({
      accepted: true,
      replayed: true,
    });
    expect(replay.intent.intent_id).toBe(first.intent.intent_id);
  });

  test('creates pending approval audit outcomes for risky bounded writes', () => {
    const actor = allowlistedActor(db);

    const result = handleInboundTelegramIntent(
      db,
      normalizeInboundTelegramIntent({
        text: '/retry task-1',
        actor_id: actor.actor_id,
        chat_id: 'chat-1',
        message_id: '13',
        update_id: '23',
        requires_approval: true,
        approval_reason: 'approval_required',
      })
    );

    expect(result).toMatchObject({
      accepted: false,
      pending_approval: true,
      intent: {
        action: 'notification.retry',
        status: 'pending_approval',
      },
    });
  });

  test('rejects stale approval responses once the checkpoint is no longer pending', () => {
    const actor = allowlistedActor(db);
    db.prepare(
      `INSERT INTO supervisor_approval_checkpoints (
        checkpoint_key,
        task_id,
        reason_class,
        status,
        requested_at,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      'task-1|-|-|approval_required|-',
      'task-1',
      'approval_required',
      'approved',
      '2026-05-19T02:00:00.000Z',
      '2026-05-19T02:00:00.000Z',
      '2026-05-19T02:01:00.000Z'
    );

    const result = handleInboundTelegramIntent(
      db,
      normalizeInboundTelegramIntent({
        callback_data: 'approve:task-1|-|-|approval_required|-:approve',
        actor_id: actor.actor_id,
        chat_id: 'chat-1',
        message_id: '14',
        update_id: '24',
      })
    );

    expect(result).toMatchObject({
      accepted: false,
      pending_approval: false,
      denial_reason: 'stale-approval',
      intent: {
        action: 'approval.respond',
        status: 'denied',
        approval_id: 'task-1|-|-|approval_required|-',
      },
    });
  });
});
