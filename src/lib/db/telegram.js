/**
 * @module telegram
 * Telegram actor mappings, intent envelopes, delivery receipts,
 * subscriptions, and channel snapshot helpers.
 */

'use strict';

const crypto = require('crypto');
const {
  getDb,
  resolveDbArgs,
  getAgentRunById,
  TELEGRAM_INTENT_ACTIONS,
  TELEGRAM_INTENT_STATUSES,
  TELEGRAM_DELIVERY_STATUSES,
  TELEGRAM_SUBSCRIPTION_STATUSES,
} = require('./core');
const { getLatestAgentArtifactForRun } = require('./artifacts');

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

function isTelegramIntentAction(value) {
  return TELEGRAM_INTENT_ACTIONS.includes(value);
}

function isTelegramIntentStatus(value) {
  return TELEGRAM_INTENT_STATUSES.includes(value);
}

function isTelegramDeliveryStatus(value) {
  return TELEGRAM_DELIVERY_STATUSES.includes(value);
}

function isTelegramSubscriptionStatus(value) {
  return TELEGRAM_SUBSCRIPTION_STATUSES.includes(value);
}

// ---------------------------------------------------------------------------
// Normalizers
// ---------------------------------------------------------------------------

function parseJsonField(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizeTelegramActorRow(row) {
  if (!row) return null;
  return {
    ...row,
    allowlisted: Number(row.allowlisted || 0),
    metadata: parseJsonField(row.metadata),
  };
}

function normalizeTelegramIntentRow(row) {
  if (!row) return null;
  return {
    ...row,
    payload: parseJsonField(row.payload),
  };
}

function normalizeTelegramDeliveryRow(row) {
  if (!row) return null;
  return {
    ...row,
    attempts_count: Number(row.attempts_count || 0),
  };
}

function normalizeTelegramSubscriptionRow(row) {
  if (!row) return null;
  return {
    ...row,
  };
}

// ---------------------------------------------------------------------------
// Actor ID helpers
// ---------------------------------------------------------------------------

function buildTelegramActorId(telegramUserId) {
  return `telegram:${String(telegramUserId).trim()}`;
}

function buildTelegramIntentIdempotencyKey({
  update_id,
  message_id,
  actor_id,
  action,
  target_ref = {},
}) {
  const anchor = update_id || message_id || '-';
  return [
    'telegram',
    anchor,
    actor_id || '-',
    action || '-',
    target_ref.task_id || '-',
    target_ref.workspace_id || '-',
    target_ref.run_id || '-',
    target_ref.approval_id || '-',
  ].join(':');
}

// ---------------------------------------------------------------------------
// Actor mapping
// ---------------------------------------------------------------------------

function getTelegramActorMappingByTelegramUser(dbOrUserId, maybeUserId) {
  const hasDb = dbOrUserId && typeof dbOrUserId.prepare === 'function';
  const db = hasDb ? dbOrUserId : getDb();
  const telegramUserId = hasDb ? maybeUserId : dbOrUserId;
  if (!telegramUserId) return null;
  return normalizeTelegramActorRow(
    db
      .prepare('SELECT * FROM telegram_actor_mappings WHERE telegram_user_id = ? LIMIT 1')
      .get(String(telegramUserId)) || null
  );
}

function getTelegramActorMappingByActorId(dbOrActorId, maybeActorId) {
  const hasDb = dbOrActorId && typeof dbOrActorId.prepare === 'function';
  const db = hasDb ? dbOrActorId : getDb();
  const actorId = hasDb ? maybeActorId : dbOrActorId;
  if (!actorId) return null;
  return normalizeTelegramActorRow(
    db.prepare('SELECT * FROM telegram_actor_mappings WHERE actor_id = ? LIMIT 1').get(actorId) ||
      null
  );
}

function upsertTelegramActorMapping(dbOrInput, maybeInput) {
  const { db, input } = resolveDbArgs(dbOrInput, maybeInput);
  if (!input.telegram_user_id) throw new Error('telegram_user_id es requerido para actor mapping.');
  if (!input.devhub_actor_id) throw new Error('devhub_actor_id es requerido para actor mapping.');

  const existing = getTelegramActorMappingByTelegramUser(db, input.telegram_user_id);
  const timestamp = input.updated_at || new Date().toISOString();
  const row = {
    actor_id: input.actor_id || existing?.actor_id || buildTelegramActorId(input.telegram_user_id),
    telegram_user_id: String(input.telegram_user_id),
    telegram_chat_id: input.telegram_chat_id
      ? String(input.telegram_chat_id)
      : existing?.telegram_chat_id || null,
    devhub_actor_id: input.devhub_actor_id,
    display_name: input.display_name ?? existing?.display_name ?? null,
    allowlisted: input.allowlisted ? 1 : 0,
    metadata:
      input.metadata !== undefined
        ? JSON.stringify(input.metadata)
        : existing?.metadata
          ? JSON.stringify(existing.metadata)
          : null,
    created_at: existing?.created_at || input.created_at || timestamp,
    updated_at: timestamp,
  };
  const keys = Object.keys(row);
  db.prepare(
    `INSERT INTO telegram_actor_mappings (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})
     ON CONFLICT(telegram_user_id) DO UPDATE SET ${keys
       .filter((key) => key !== 'created_at' && key !== 'telegram_user_id')
       .map((key) => `${key} = excluded.${key}`)
       .join(', ')}`
  ).run(...keys.map((key) => row[key] ?? null));
  return getTelegramActorMappingByTelegramUser(db, input.telegram_user_id);
}

// ---------------------------------------------------------------------------
// Intent envelopes
// ---------------------------------------------------------------------------

function getTelegramIntentByIdempotencyKey(dbOrKey, maybeKey) {
  const hasDb = dbOrKey && typeof dbOrKey.prepare === 'function';
  const db = hasDb ? dbOrKey : getDb();
  const key = hasDb ? maybeKey : dbOrKey;
  if (!key) return null;
  return normalizeTelegramIntentRow(
    db
      .prepare('SELECT * FROM telegram_intent_envelopes WHERE idempotency_key = ? LIMIT 1')
      .get(key) || null
  );
}

function recordTelegramIntentEnvelope(dbOrInput, maybeInput) {
  const { db, input } = resolveDbArgs(dbOrInput, maybeInput);
  if (!input.actor_id) throw new Error('actor_id es requerido para telegram intents.');
  if (!input.chat_id) throw new Error('chat_id es requerido para telegram intents.');
  if (!input.action || !isTelegramIntentAction(input.action)) {
    throw new Error(`action inválida para telegram intents: ${input.action}`);
  }

  const actor = getTelegramActorMappingByActorId(db, input.actor_id);
  if (!actor) throw new Error(`actor_id no encontrado para telegram intents: ${input.actor_id}`);
  if (!actor.allowlisted)
    throw new Error(`actor_id no allowlisted para telegram intents: ${input.actor_id}`);

  const targetRef = input.target_ref || {};
  const idempotencyKey =
    input.idempotency_key ||
    buildTelegramIntentIdempotencyKey({
      update_id: input.update_id || null,
      message_id: input.message_id || null,
      actor_id: input.actor_id,
      action: input.action,
      target_ref: targetRef,
    });
  const existing = getTelegramIntentByIdempotencyKey(db, idempotencyKey);
  if (existing) {
    return {
      ...existing,
      replayed: true,
    };
  }

  const timestamp = input.updated_at || new Date().toISOString();
  const status = input.status || 'accepted';
  if (!isTelegramIntentStatus(status)) {
    throw new Error(`status inválido para telegram intents: ${status}`);
  }

  const row = {
    intent_id: input.intent_id || crypto.randomUUID(),
    idempotency_key: idempotencyKey,
    actor_id: input.actor_id,
    telegram_chat_id: String(input.chat_id),
    message_id: input.message_id ? String(input.message_id) : null,
    update_id: input.update_id ? String(input.update_id) : null,
    action: input.action,
    task_id: targetRef.task_id || null,
    workspace_id: targetRef.workspace_id || null,
    run_id: targetRef.run_id || null,
    approval_id: targetRef.approval_id || null,
    payload: input.payload !== undefined ? JSON.stringify(input.payload) : null,
    status,
    audit_status: input.audit_status || status,
    result_ref: input.result_ref || null,
    created_at: input.created_at || timestamp,
    updated_at: timestamp,
  };
  const keys = Object.keys(row);
  db.prepare(
    `INSERT INTO telegram_intent_envelopes (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`
  ).run(...keys.map((key) => row[key] ?? null));
  return {
    ...getTelegramIntentByIdempotencyKey(db, idempotencyKey),
    replayed: false,
  };
}

// ---------------------------------------------------------------------------
// Delivery receipts
// ---------------------------------------------------------------------------

function buildTelegramDeliveryKey({
  intent_id = null,
  task_id = null,
  workspace_id = null,
  run_id = null,
  telegram_chat_id,
}) {
  return [
    'delivery',
    intent_id || '-',
    task_id || '-',
    workspace_id || '-',
    run_id || '-',
    telegram_chat_id || '-',
  ].join(':');
}

function getLatestTelegramDeliveryReceipt(
  db,
  { task_id = null, workspace_id = null, run_id = null } = {}
) {
  const clauses = [];
  const params = [];
  if (run_id) {
    clauses.push('run_id = ?');
    params.push(run_id);
  } else if (workspace_id) {
    clauses.push('workspace_id = ?');
    params.push(workspace_id);
  } else if (task_id) {
    clauses.push('task_id = ?');
    params.push(task_id);
  }
  const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return normalizeTelegramDeliveryRow(
    db
      .prepare(
        `SELECT * FROM telegram_delivery_receipts ${whereSql} ORDER BY updated_at DESC, rowid DESC LIMIT 1`
      )
      .get(...params) || null
  );
}

function upsertTelegramDeliveryReceipt(dbOrInput, maybeInput) {
  const { db, input } = resolveDbArgs(dbOrInput, maybeInput);
  if (!input.telegram_chat_id) {
    throw new Error('telegram_chat_id es requerido para delivery receipts.');
  }
  if (!input.status || !isTelegramDeliveryStatus(input.status)) {
    throw new Error(`status inválido para delivery receipts: ${input.status}`);
  }

  const deliveryKey =
    input.delivery_key ||
    buildTelegramDeliveryKey({
      intent_id: input.intent_id || null,
      task_id: input.task_id || null,
      workspace_id: input.workspace_id || null,
      run_id: input.run_id || null,
      telegram_chat_id: input.telegram_chat_id,
    });
  const existing = normalizeTelegramDeliveryRow(
    db
      .prepare('SELECT * FROM telegram_delivery_receipts WHERE delivery_key = ? LIMIT 1')
      .get(deliveryKey) || null
  );
  const timestamp = input.updated_at || input.last_attempt_at || new Date().toISOString();
  const row = {
    delivery_key: deliveryKey,
    task_id: input.task_id || existing?.task_id || null,
    workspace_id: input.workspace_id || existing?.workspace_id || null,
    run_id: input.run_id || existing?.run_id || null,
    intent_id: input.intent_id || existing?.intent_id || null,
    telegram_chat_id: String(input.telegram_chat_id),
    status: input.status,
    attempts_count: Number(input.attempts_count || existing?.attempts_count || 1),
    last_error: input.last_error ?? existing?.last_error ?? null,
    last_attempt_at: input.last_attempt_at || timestamp,
    created_at: existing?.created_at || input.created_at || timestamp,
    updated_at: timestamp,
  };
  const keys = Object.keys(row);
  db.prepare(
    `INSERT INTO telegram_delivery_receipts (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})
     ON CONFLICT(delivery_key) DO UPDATE SET ${keys
       .filter((key) => key !== 'delivery_key' && key !== 'created_at')
       .map((key) => `${key} = excluded.${key}`)
       .join(', ')}`
  ).run(...keys.map((key) => row[key] ?? null));
  return getLatestTelegramDeliveryReceipt(db, {
    task_id: row.task_id,
    workspace_id: row.workspace_id,
    run_id: row.run_id,
  });
}

// ---------------------------------------------------------------------------
// Subscriptions
// ---------------------------------------------------------------------------

function buildTelegramSubscriptionKey({
  actor_id = null,
  telegram_chat_id,
  task_id = null,
  workspace_id = null,
  run_id = null,
}) {
  return [
    'subscription',
    actor_id || '-',
    telegram_chat_id || '-',
    task_id || '-',
    workspace_id || '-',
    run_id || '-',
  ].join(':');
}

function upsertTelegramSubscription(dbOrInput, maybeInput) {
  const { db, input } = resolveDbArgs(dbOrInput, maybeInput);
  if (!input.telegram_chat_id) {
    throw new Error('telegram_chat_id es requerido para subscriptions.');
  }
  if (!input.status || !isTelegramSubscriptionStatus(input.status)) {
    throw new Error(`status inválido para subscriptions: ${input.status}`);
  }

  const subscriptionKey =
    input.subscription_key ||
    buildTelegramSubscriptionKey({
      actor_id: input.actor_id || null,
      telegram_chat_id: String(input.telegram_chat_id),
      task_id: input.task_id || null,
      workspace_id: input.workspace_id || null,
      run_id: input.run_id || null,
    });
  const existing = normalizeTelegramSubscriptionRow(
    db
      .prepare('SELECT * FROM telegram_subscriptions WHERE subscription_key = ? LIMIT 1')
      .get(subscriptionKey) || null
  );
  const timestamp = input.updated_at || new Date().toISOString();
  const row = {
    subscription_key: subscriptionKey,
    actor_id: input.actor_id || existing?.actor_id || null,
    telegram_chat_id: String(input.telegram_chat_id),
    task_id: input.task_id || existing?.task_id || null,
    workspace_id: input.workspace_id || existing?.workspace_id || null,
    run_id: input.run_id || existing?.run_id || null,
    status: input.status,
    created_at: existing?.created_at || input.created_at || timestamp,
    updated_at: timestamp,
  };
  const keys = Object.keys(row);
  db.prepare(
    `INSERT INTO telegram_subscriptions (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})
     ON CONFLICT(subscription_key) DO UPDATE SET ${keys
       .filter((key) => key !== 'subscription_key' && key !== 'created_at')
       .map((key) => `${key} = excluded.${key}`)
       .join(', ')}`
  ).run(...keys.map((key) => row[key] ?? null));

  return normalizeTelegramSubscriptionRow(
    db
      .prepare('SELECT * FROM telegram_subscriptions WHERE subscription_key = ? LIMIT 1')
      .get(subscriptionKey) || null
  );
}

// ---------------------------------------------------------------------------
// Channel snapshot (cross-cutting — uses lazy requires for not-yet-extracted modules)
// ---------------------------------------------------------------------------

function getLatestTelegramChannelSnapshot(dbOrFilters, maybeFilters) {
  const { db, input } = resolveDbArgs(dbOrFilters, maybeFilters);
  const filters = input || {};

  // Lazy requires to avoid circular deps before all modules are extracted
  const {
    getSupervisorSnapshot,
    getSupervisorApprovalCheckpoint,
    listSupervisorApprovalCheckpoints,
  } = require('./supervisor');
  const { getLatestAgentRunForWorkspace } = require('./workspaces');

  const snapshot = filters.task_id
    ? getSupervisorSnapshot(db, filters.task_id)
    : db
        .prepare('SELECT * FROM supervisor_snapshots ORDER BY updated_at DESC, rowid DESC LIMIT 1')
        .get();
  const workspace = snapshot?.workspace_id
    ? db.prepare('SELECT * FROM agent_workspaces WHERE id = ? LIMIT 1').get(snapshot.workspace_id)
    : db
        .prepare(
          'SELECT * FROM agent_workspaces WHERE status IS NOT NULL OR evidence_ref IS NOT NULL ORDER BY updated_at DESC, rowid DESC LIMIT 1'
        )
        .get();
  const run = snapshot?.run_id
    ? getAgentRunById(db, snapshot.run_id)
    : workspace?.id
      ? getLatestAgentRunForWorkspace(db, workspace.id)
      : db.prepare('SELECT * FROM agent_runs ORDER BY created_at DESC, rowid DESC LIMIT 1').get();

  if (!snapshot && !workspace && !run) return null;

  const latestArtifact = run?.run_id ? getLatestAgentArtifactForRun(db, run.run_id) : null;
  const artifactCount = run?.run_id
    ? Number(
        db.prepare('SELECT count(*) as cnt FROM agent_artifacts WHERE run_id = ?').get(run.run_id)
          ?.cnt || 0
      )
    : 0;
  const approval = snapshot?.approval_checkpoint_key
    ? getSupervisorApprovalCheckpoint(db, snapshot.approval_checkpoint_key)
    : snapshot?.task_id
      ? listSupervisorApprovalCheckpoints(db, { task_id: snapshot.task_id, limit: 1 })[0] || null
      : null;
  const delivery = getLatestTelegramDeliveryReceipt(db, {
    task_id: snapshot?.task_id || workspace?.current_task_id || run?.task_id || null,
    workspace_id: snapshot?.workspace_id || workspace?.id || null,
    run_id: snapshot?.run_id || run?.run_id || null,
  });

  return {
    task_id: snapshot?.task_id || workspace?.current_task_id || run?.task_id || null,
    supervisor_state: snapshot?.supervisor_state || null,
    outcome: snapshot?.outcome || null,
    reason_class: snapshot?.reason_class || null,
    workspace_id: snapshot?.workspace_id || workspace?.id || run?.workspace_id || null,
    run_id: snapshot?.run_id || run?.run_id || null,
    evidence_ref:
      snapshot?.evidence_ref || latestArtifact?.evidence_ref || workspace?.evidence_ref || null,
    workspace_status: workspace?.status || null,
    run_status: run?.status || null,
    terminal_reason_class: run?.terminal_reason_class || null,
    latest_artifact_kind: latestArtifact?.kind || null,
    latest_artifact_evidence_ref: latestArtifact?.evidence_ref || null,
    artifact_count: artifactCount,
    approval: approval
      ? {
          id: approval.checkpoint_key,
          status: approval.status,
          expires_at: approval.expires_at || null,
        }
      : null,
    delivery: delivery
      ? {
          last_status: delivery.status,
          attempts_count: delivery.attempts_count,
          last_error: delivery.last_error || null,
          last_attempt_at: delivery.last_attempt_at || null,
        }
      : null,
    degraded: false,
  };
}

// ---------------------------------------------------------------------------
// Telegram session helpers (use getDb() singleton — no db injection)
// ---------------------------------------------------------------------------

function getTelegramSession(chatId) {
  const db = getDb();
  return db
    .prepare('SELECT * FROM telegram_session_map WHERE telegram_chat_id = ? AND active = 1')
    .get(chatId);
}

function createTelegramSession(chatId, sessionId, projectId) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO telegram_session_map (telegram_chat_id, session_id, project_id, active)
    VALUES (?, ?, ?, 1)
    ON CONFLICT(telegram_chat_id) DO UPDATE SET
      session_id = excluded.session_id,
      project_id = excluded.project_id,
      active = 1,
      updated_at = datetime('now')
  `);
  return stmt.run(chatId, sessionId, projectId || null);
}

function getSessionsByTelegramChat(chatId, limit = 20) {
  const db = getDb();
  return db
    .prepare(
      `
    SELECT s.* FROM agent_hub_sessions s
    JOIN telegram_session_map tsm ON s.id = tsm.session_id
    WHERE tsm.telegram_chat_id = ?
    ORDER BY s.updated_at DESC
    LIMIT ?
  `
    )
    .all(chatId, limit);
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  // validators
  isTelegramIntentAction,
  isTelegramIntentStatus,
  isTelegramDeliveryStatus,
  isTelegramSubscriptionStatus,
  // normalizers
  parseJsonField,
  normalizeTelegramActorRow,
  normalizeTelegramIntentRow,
  normalizeTelegramDeliveryRow,
  normalizeTelegramSubscriptionRow,
  // actor ID helpers
  buildTelegramActorId,
  buildTelegramIntentIdempotencyKey,
  // actor mapping
  getTelegramActorMappingByTelegramUser,
  getTelegramActorMappingByActorId,
  upsertTelegramActorMapping,
  // intent envelopes
  getTelegramIntentByIdempotencyKey,
  recordTelegramIntentEnvelope,
  // delivery receipts
  buildTelegramDeliveryKey,
  getLatestTelegramDeliveryReceipt,
  upsertTelegramDeliveryReceipt,
  // subscriptions
  buildTelegramSubscriptionKey,
  upsertTelegramSubscription,
  // channel snapshot
  getLatestTelegramChannelSnapshot,
  // session helpers
  getTelegramSession,
  createTelegramSession,
  getSessionsByTelegramChat,
};
