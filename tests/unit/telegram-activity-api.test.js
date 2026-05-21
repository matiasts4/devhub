const Database = require('better-sqlite3');
const mockGetDb = jest.fn();

jest.mock('@/lib/db/localDb', () => ({
  __esModule: true,
  default: {
    getDb: mockGetDb,
  },
}));

jest.mock('next/server', () => ({
  NextResponse: {
    json(body, init = {}) {
      return {
        status: init.status ?? 200,
        json: async () => body,
      };
    },
  },
}));

const { GET } = require('../../src/app/api/telegram/activity/route');

function createTestDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE telegram_intent_envelopes (
      intent_id TEXT PRIMARY KEY,
      idempotency_key TEXT UNIQUE,
      actor_id TEXT NOT NULL,
      telegram_chat_id TEXT NOT NULL,
      message_id TEXT,
      update_id TEXT,
      action TEXT NOT NULL,
      task_id TEXT,
      workspace_id TEXT,
      run_id TEXT,
      approval_id TEXT,
      payload TEXT,
      status TEXT NOT NULL,
      audit_status TEXT,
      result_ref TEXT,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE telegram_delivery_receipts (
      delivery_key TEXT PRIMARY KEY,
      task_id TEXT,
      workspace_id TEXT,
      run_id TEXT,
      intent_id TEXT,
      telegram_chat_id TEXT NOT NULL,
      status TEXT NOT NULL,
      attempts_count INTEGER DEFAULT 1,
      last_error TEXT,
      last_attempt_at TEXT NOT NULL,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE telegram_subscriptions (
      subscription_key TEXT PRIMARY KEY,
      actor_id TEXT,
      telegram_chat_id TEXT NOT NULL,
      task_id TEXT,
      workspace_id TEXT,
      run_id TEXT,
      status TEXT NOT NULL,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE supervisor_approval_checkpoints (
      checkpoint_key TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      workspace_id TEXT,
      run_id TEXT,
      reason_class TEXT NOT NULL,
      evidence_ref TEXT,
      status TEXT NOT NULL,
      requested_at TEXT NOT NULL,
      decided_at TEXT,
      decision_note TEXT,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE supervisor_snapshots (
      task_id TEXT PRIMARY KEY,
      supervisor_state TEXT NOT NULL,
      outcome TEXT,
      reason_class TEXT,
      task_retry_count INTEGER DEFAULT 0,
      attempt_count INTEGER DEFAULT 0,
      unchanged_failure_count INTEGER DEFAULT 0,
      approval_request_count INTEGER DEFAULT 0,
      orphan_recovery_count INTEGER DEFAULT 0,
      workspace_id TEXT,
      run_id TEXT,
      evidence_ref TEXT,
      approval_checkpoint_key TEXT,
      created_at TEXT,
      updated_at TEXT
    );
  `);

  return db;
}

function createRequest(query = '') {
  return {
    url: `http://localhost/api/telegram/activity${query}`,
  };
}

describe('GET /api/telegram/activity', () => {
  let db;

  beforeEach(() => {
    db = createTestDb();
    mockGetDb.mockReturnValue(db);
  });

  afterEach(() => {
    mockGetDb.mockReset();
    db.close();
  });

  it('returns durable adapter activity ordered from intent, delivery, and subscription records', async () => {
    db.prepare(
      `INSERT INTO supervisor_snapshots (
        task_id, supervisor_state, workspace_id, run_id, evidence_ref, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      'task-1',
      'awaiting_approval',
      'ws-1',
      'run-1',
      'artifact://run-1/qa/1',
      '2026-05-19T10:00:00.000Z',
      '2026-05-19T10:00:00.000Z'
    );
    db.prepare(
      `INSERT INTO supervisor_approval_checkpoints (
        checkpoint_key, task_id, workspace_id, run_id, reason_class, evidence_ref, status,
        requested_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      'task-1|ws-1|run-1|approval_required|artifact://run-1/qa/1',
      'task-1',
      'ws-1',
      'run-1',
      'approval_required',
      'artifact://run-1/qa/1',
      'pending',
      '2026-05-19T10:01:00.000Z',
      '2026-05-19T10:01:00.000Z',
      '2026-05-19T10:01:00.000Z'
    );
    db.prepare(
      `INSERT INTO telegram_intent_envelopes (
        intent_id, idempotency_key, actor_id, telegram_chat_id, action, task_id, workspace_id,
        run_id, approval_id, status, audit_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      'intent-1',
      'idempotency-1',
      'telegram:user-1',
      'chat-1',
      'approval.respond',
      'task-1',
      'ws-1',
      'run-1',
      'task-1|ws-1|run-1|approval_required|artifact://run-1/qa/1',
      'accepted',
      'approved',
      '2026-05-19T10:02:00.000Z',
      '2026-05-19T10:02:00.000Z'
    );
    db.prepare(
      `INSERT INTO telegram_delivery_receipts (
        delivery_key, task_id, workspace_id, run_id, intent_id, telegram_chat_id, status,
        attempts_count, last_error, last_attempt_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      'delivery-1',
      'task-1',
      'ws-1',
      'run-1',
      'intent-1',
      'chat-1',
      'retry_pending',
      3,
      'telegram timeout',
      '2026-05-19T10:03:00.000Z',
      '2026-05-19T10:03:00.000Z',
      '2026-05-19T10:03:00.000Z'
    );
    db.prepare(
      `INSERT INTO telegram_subscriptions (
        subscription_key, actor_id, telegram_chat_id, task_id, workspace_id, run_id, status,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      'subscription-1',
      'telegram:user-1',
      'chat-1',
      'task-1',
      'ws-1',
      'run-1',
      'mute',
      '2026-05-19T10:04:00.000Z',
      '2026-05-19T10:04:00.000Z'
    );

    const response = await GET(createRequest('?limit=10'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.total).toBe(2);
    expect(body.items[0]).toMatchObject({
      id: 'intent-1',
      entry_type: 'intent',
      action: 'approval.respond',
      chat_id: 'chat-1',
      intent_status: 'accepted',
      audit_status: 'approved',
      delivery_status: 'retry_pending',
      delivery_attempts_count: 3,
      approval_status: 'pending',
      evidence_ref: 'artifact://run-1/qa/1',
      task_id: 'task-1',
    });
    expect(body.items[1]).toMatchObject({
      id: 'subscription-1',
      entry_type: 'subscription',
      action: 'subscription.set',
      chat_id: 'chat-1',
      intent_status: 'mute',
    });
  });

  it('filters durable activity by chat and entry type', async () => {
    db.prepare(
      `INSERT INTO telegram_subscriptions (
        subscription_key, actor_id, telegram_chat_id, task_id, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run('subscription-1', 'telegram:user-1', 'chat-1', 'task-1', 'mute', '2026-05-19T10:04:00.000Z', '2026-05-19T10:04:00.000Z');
    db.prepare(
      `INSERT INTO telegram_subscriptions (
        subscription_key, actor_id, telegram_chat_id, task_id, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run('subscription-2', 'telegram:user-2', 'chat-2', 'task-2', 'unmute', '2026-05-19T10:05:00.000Z', '2026-05-19T10:05:00.000Z');

    const response = await GET(createRequest('?chat_id=chat-2&event_type=subscription'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.total).toBe(1);
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({
      id: 'subscription-2',
      chat_id: 'chat-2',
      entry_type: 'subscription',
      intent_status: 'unmute',
    });
  });

  it('returns degraded-unavailable payload on durable read failure', async () => {
    mockGetDb.mockImplementation(() => {
      throw new Error('durable sqlite unavailable');
    });

    const response = await GET(createRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      items: [],
      has_more: false,
      total: 0,
      degraded: true,
      degraded_reason: 'durable-unavailable',
    });
  });
});
