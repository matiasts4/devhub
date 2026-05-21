const Database = require('better-sqlite3');
const mockGetDb = jest.fn();

jest.mock('@/lib/db/localDb', () => ({
  __esModule: true,
  default: {
    getDb: mockGetDb,
    getLatestTelegramChannelSnapshot: (...args) =>
      jest.requireActual('../../src/lib/db/localDb').getLatestTelegramChannelSnapshot(...args),
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

const { GET } = require('../../src/app/api/telegram/status/route');

function createTestDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE telegram_sessions (
      id TEXT PRIMARY KEY,
      chat_id TEXT,
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE telegram_activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT,
      event_type TEXT,
      direction TEXT,
      source TEXT,
      status TEXT DEFAULT 'ok',
      content_preview TEXT,
      metadata TEXT,
      command TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE agent_workspaces (
      id TEXT PRIMARY KEY,
      status TEXT,
      evidence_ref TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE agent_runs (
      run_id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      status TEXT,
      terminal_reason_class TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE agent_artifacts (
      artifact_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      seq INTEGER NOT NULL,
      kind TEXT,
      evidence_ref TEXT,
      created_at TEXT DEFAULT (datetime('now'))
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
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE supervisor_approval_checkpoints (
      checkpoint_key TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      workspace_id TEXT,
      run_id TEXT,
      reason_class TEXT NOT NULL,
      evidence_ref TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      requested_at TEXT NOT NULL,
      decided_at TEXT,
      decision_note TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
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
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

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
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE telegram_subscriptions (
      subscription_key TEXT PRIMARY KEY,
      actor_id TEXT,
      telegram_chat_id TEXT NOT NULL,
      task_id TEXT,
      workspace_id TEXT,
      run_id TEXT,
      status TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  return db;
}

function insertWorkspaceAudit(db, overrides = {}) {
  db.prepare(
    `INSERT INTO agent_workspaces (id, status, evidence_ref, updated_at)
     VALUES (?, ?, ?, ?)`
  ).run(
    overrides.id || 'ws-1',
    overrides.status || 'cleanup_pending',
    overrides.evidence_ref || 'evidence://workspace-1',
    overrides.updated_at || '2026-05-18T22:00:00.000Z'
  );
}

function insertRunAudit(db, overrides = {}) {
  db.prepare(
    `INSERT INTO agent_runs (run_id, workspace_id, status, terminal_reason_class, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(
    overrides.run_id || 'run-1',
    overrides.workspace_id || 'ws-1',
    overrides.status || 'succeeded',
    overrides.terminal_reason_class || 'qa_approved',
    overrides.created_at || '2026-05-18T22:01:00.000Z'
  );
}

function insertArtifactAudit(db, overrides = {}) {
  db.prepare(
    `INSERT INTO agent_artifacts (artifact_id, run_id, seq, kind, evidence_ref, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    overrides.artifact_id || 'artifact-1',
    overrides.run_id || 'run-1',
    overrides.seq || 1,
    overrides.kind || 'decision.note',
    overrides.evidence_ref || 'artifact://run-1/1',
    overrides.created_at || '2026-05-18T22:02:00.000Z'
  );
}

function insertSupervisorSnapshot(db, overrides = {}) {
  db.prepare(
    `INSERT INTO supervisor_snapshots (
      task_id,
      supervisor_state,
      outcome,
      reason_class,
      workspace_id,
      run_id,
      evidence_ref,
      approval_checkpoint_key,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    overrides.task_id || 'task-1',
    overrides.supervisor_state || 'dispatch_pending',
    overrides.outcome || 'dispatch',
    overrides.reason_class || null,
    overrides.workspace_id || 'ws-1',
    overrides.run_id || 'run-1',
    overrides.evidence_ref || 'evidence://supervisor-1',
    overrides.approval_checkpoint_key || null,
    overrides.updated_at || '2026-05-18T22:03:00.000Z'
  );
}

function insertApprovalCheckpoint(db, overrides = {}) {
  db.prepare(
    `INSERT INTO supervisor_approval_checkpoints (
      checkpoint_key,
      task_id,
      workspace_id,
      run_id,
      reason_class,
      evidence_ref,
      status,
      requested_at,
      decided_at,
      decision_note,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    overrides.checkpoint_key || 'task-1|ws-1|run-1|approval_required|artifact://run-1/qa/2',
    overrides.task_id || 'task-1',
    overrides.workspace_id || 'ws-1',
    overrides.run_id || 'run-1',
    overrides.reason_class || 'approval_required',
    overrides.evidence_ref || 'artifact://run-1/qa/2',
    overrides.status || 'pending',
    overrides.requested_at || '2026-05-18T22:02:30.000Z',
    overrides.decided_at || null,
    overrides.decision_note || null,
    overrides.updated_at || '2026-05-18T22:02:30.000Z'
  );
}

function insertDeliveryReceipt(db, overrides = {}) {
  db.prepare(
    `INSERT INTO telegram_delivery_receipts (
      delivery_key,
      task_id,
      workspace_id,
      run_id,
      telegram_chat_id,
      status,
      attempts_count,
      last_error,
      last_attempt_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    overrides.delivery_key || 'delivery-1',
    overrides.task_id || 'task-1',
    overrides.workspace_id || 'ws-1',
    overrides.run_id || 'run-1',
    overrides.telegram_chat_id || 'chat-1',
    overrides.status || 'retry_pending',
    overrides.attempts_count || 2,
    overrides.last_error || 'telegram timeout',
    overrides.last_attempt_at || '2026-05-18T22:04:00.000Z',
    overrides.updated_at || '2026-05-18T22:04:00.000Z'
  );
}

function insertIntentAudit(db, overrides = {}) {
  db.prepare(
    `INSERT INTO telegram_intent_envelopes (
      intent_id,
      idempotency_key,
      actor_id,
      telegram_chat_id,
      action,
      task_id,
      workspace_id,
      run_id,
      approval_id,
      status,
      audit_status,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    overrides.intent_id || 'intent-1',
    overrides.idempotency_key || 'idempotency-1',
    overrides.actor_id || 'telegram:user-1',
    overrides.telegram_chat_id || 'chat-1',
    overrides.action || 'status.query',
    overrides.task_id || null,
    overrides.workspace_id || null,
    overrides.run_id || null,
    overrides.approval_id || null,
    overrides.status || 'accepted',
    overrides.audit_status || 'accepted',
    overrides.created_at || '2026-05-18T22:04:00.000Z',
    overrides.updated_at || '2026-05-18T22:04:00.000Z'
  );
}

describe('GET /api/telegram/status', () => {
  let db;

  beforeEach(() => {
    db = createTestDb();
    mockGetDb.mockReturnValue(db);
  });

  afterEach(() => {
    mockGetDb.mockReset();
    db.close();
  });

  it('projects shared durable channel snapshot instead of telegram-local busy heuristics', async () => {
    insertWorkspaceAudit(db, {
      id: 'ws-shared-1',
      status: 'cleanup_pending',
      evidence_ref: 'evidence://workspace-shared-1',
    });
    insertRunAudit(db, {
      run_id: 'run-shared-1',
      workspace_id: 'ws-shared-1',
      status: 'running',
      terminal_reason_class: null,
    });
    insertArtifactAudit(db, {
      artifact_id: 'artifact-shared-1',
      run_id: 'run-shared-1',
      seq: 2,
      kind: 'qa.result',
      evidence_ref: 'artifact://run-shared-1/qa/2',
    });
    insertApprovalCheckpoint(db, {
      checkpoint_key: 'task-shared-1|ws-shared-1|run-shared-1|approval_required|artifact://run-shared-1/qa/2',
      task_id: 'task-shared-1',
      workspace_id: 'ws-shared-1',
      run_id: 'run-shared-1',
      evidence_ref: 'artifact://run-shared-1/qa/2',
      status: 'pending',
    });
    insertSupervisorSnapshot(db, {
      task_id: 'task-shared-1',
      supervisor_state: 'dispatch_pending',
      outcome: 'dispatch',
      workspace_id: 'ws-shared-1',
      run_id: 'run-shared-1',
      evidence_ref: 'artifact://run-shared-1/qa/2',
      approval_checkpoint_key:
        'task-shared-1|ws-shared-1|run-shared-1|approval_required|artifact://run-shared-1/qa/2',
    });
    insertDeliveryReceipt(db, {
      delivery_key: 'delivery-shared-1',
      task_id: 'task-shared-1',
      workspace_id: 'ws-shared-1',
      run_id: 'run-shared-1',
      status: 'retry_pending',
      attempts_count: 3,
      last_error: 'telegram timeout',
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      bot_connected: false,
      active_chats: 0,
      total_sessions: 0,
      last_activity: '2026-05-18T22:04:00.000Z',
      last_event_type: 'notification.delivery',
      recent_errors: 0,
      is_busy: true,
      current_tool: null,
      workspace_status: 'cleanup_pending',
      run_status: 'running',
      latest_artifact_kind: 'qa.result',
      latest_artifact_evidence_ref: 'artifact://run-shared-1/qa/2',
      artifact_count: 1,
    });
    expect(body.snapshot).toMatchObject({
      task_id: 'task-shared-1',
      supervisor_state: 'dispatch_pending',
      outcome: 'dispatch',
      workspace_id: 'ws-shared-1',
      run_id: 'run-shared-1',
      evidence_ref: 'artifact://run-shared-1/qa/2',
      degraded: false,
      approval: {
        id: 'task-shared-1|ws-shared-1|run-shared-1|approval_required|artifact://run-shared-1/qa/2',
        status: 'pending',
      },
      delivery: {
        last_status: 'retry_pending',
        attempts_count: 3,
      },
    });
  });

  it('returns idle status when no durable supervisor snapshot exists', async () => {

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.is_busy).toBe(false);
    expect(body.current_tool).toBe(null);
    expect(body.snapshot).toBe(null);
  });

  it('returns HTTP 200 with false/null when no durable snapshot is available', async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.is_busy).toBe(false);
    expect(body.current_tool).toBe(null);
  });

  it('returns degraded-unavailable status instead of leaking stale local truth on durable read failure', async () => {
    mockGetDb.mockImplementation(() => {
      throw new Error('durable sqlite unavailable');
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      bot_connected: false,
      active_chats: 0,
      total_sessions: 0,
      recent_errors: 0,
      is_busy: false,
      current_tool: null,
      snapshot: {
        degraded: true,
        degraded_reason: 'durable-unavailable',
      },
    });
  });

  it('projects durable run and artifact audit fields for telegram consumers', async () => {
    insertWorkspaceAudit(db, {
      id: 'ws-audit-1',
      status: 'cleanup_pending',
      evidence_ref: 'evidence://workspace-audit-1',
    });
    insertRunAudit(db, {
      run_id: 'run-audit-1',
      workspace_id: 'ws-audit-1',
      status: 'failed',
      terminal_reason_class: 'qa_blocked',
    });
    insertArtifactAudit(db, {
      artifact_id: 'artifact-audit-1',
      run_id: 'run-audit-1',
      seq: 1,
      kind: 'decision.note',
      evidence_ref: 'run://run-audit-1/startup-intent',
    });
    insertArtifactAudit(db, {
      artifact_id: 'artifact-audit-2',
      run_id: 'run-audit-1',
      seq: 2,
      kind: 'qa.result',
      evidence_ref: 'artifact://run-audit-1/qa/2',
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      workspace_status: 'cleanup_pending',
      run_status: 'failed',
      terminal_reason_class: 'qa_blocked',
      latest_artifact_kind: 'qa.result',
      latest_artifact_evidence_ref: 'artifact://run-audit-1/qa/2',
      artifact_count: 2,
      evidence_ref: 'artifact://run-audit-1/qa/2',
    });
  });

  it('derives connectivity and recent error counters from durable adapter history', async () => {
    const now = new Date().toISOString();

    insertIntentAudit(db, {
      intent_id: 'intent-live-1',
      idempotency_key: 'idempotency-live-1',
      action: 'status.query',
      telegram_chat_id: 'chat-live-1',
      created_at: now,
      updated_at: now,
    });
    insertDeliveryReceipt(db, {
      delivery_key: 'delivery-live-1',
      task_id: null,
      workspace_id: null,
      run_id: null,
      intent_id: null,
      telegram_chat_id: 'chat-live-1',
      status: 'failed',
      last_error: 'telegram unavailable',
      last_attempt_at: now,
      updated_at: now,
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      bot_connected: true,
      active_chats: 1,
      total_sessions: 1,
      last_event_type: 'status.query',
      recent_errors: 1,
    });
  });
});
