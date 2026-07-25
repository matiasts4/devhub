import { NextResponse } from 'next/server';
import localDb from '@/lib/db/localDb';

export const dynamic = 'force-dynamic';

function tableExists(db, tableName) {
  const row = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`)
    .get(tableName);
  return Boolean(row);
}

function getCount(db, sql, params = []) {
  return Number(db.prepare(sql).get(...params)?.cnt ?? 0);
}

function parseTimestamp(value) {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

function getLatestDurableTelegramEvent(db) {
  const statements = [];

  if (tableExists(db, 'telegram_intent_envelopes')) {
    statements.push(`
      SELECT created_at, telegram_chat_id AS chat_id, action AS event_type
      FROM telegram_intent_envelopes
    `);
  }
  if (tableExists(db, 'telegram_delivery_receipts')) {
    statements.push(`
      SELECT updated_at AS created_at, telegram_chat_id AS chat_id, 'notification.delivery' AS event_type
      FROM telegram_delivery_receipts
    `);
  }
  if (tableExists(db, 'telegram_subscriptions')) {
    statements.push(`
      SELECT updated_at AS created_at, telegram_chat_id AS chat_id, 'subscription.set' AS event_type
      FROM telegram_subscriptions
    `);
  }
  if (tableExists(db, 'telegram_activity')) {
    statements.push(`
      SELECT created_at, chat_id, event_type
      FROM telegram_activity
    `);
  }

  if (statements.length === 0) {
    return null;
  }

  return db.prepare(`${statements.join(' UNION ALL ')} ORDER BY created_at DESC LIMIT 1`).get();
}

function getDurableChatTotals(db) {
  const counts = {
    active_chats: 0,
    total_sessions: 0,
  };

  if (tableExists(db, 'telegram_sessions')) {
    counts.active_chats = getCount(
      db,
      `SELECT count(DISTINCT chat_id) as cnt FROM telegram_sessions WHERE status = 'active'`
    );
    counts.total_sessions = getCount(db, `SELECT count(*) as cnt FROM telegram_sessions`);
  }

  if (counts.active_chats > 0 || counts.total_sessions > 0) {
    return counts;
  }

  const statements = [];
  if (tableExists(db, 'telegram_intent_envelopes')) {
    statements.push(`SELECT telegram_chat_id AS chat_id FROM telegram_intent_envelopes`);
  }

  if (statements.length === 0) {
    return counts;
  }

  const unionSql = statements.join(' UNION ALL ');
  const row = db
    .prepare(
      `SELECT count(DISTINCT chat_id) AS active_chats, count(DISTINCT chat_id) AS total_sessions FROM (${unionSql})`
    )
    .get();

  return {
    active_chats: Number(row?.active_chats ?? 0),
    total_sessions: Number(row?.total_sessions ?? 0),
  };
}

function getRecentDurableErrorCount(db) {
  const statements = [];

  if (tableExists(db, 'telegram_activity')) {
    statements.push(`
      SELECT created_at
      FROM telegram_activity
      WHERE status = 'error' AND created_at >= datetime('now', '-5 minutes')
    `);
  }
  if (tableExists(db, 'telegram_delivery_receipts')) {
    statements.push(`
      SELECT updated_at AS created_at
      FROM telegram_delivery_receipts
      WHERE status = 'failed' AND updated_at >= datetime('now', '-5 minutes')
    `);
  }

  if (statements.length === 0) {
    return 0;
  }

  return getCount(db, `SELECT count(*) as cnt FROM (${statements.join(' UNION ALL ')})`);
}

function buildDegradedStatus() {
  return {
    bot_connected: false,
    active_chats: 0,
    total_sessions: 0,
    last_activity: null,
    last_event_type: null,
    recent_errors: 0,
    is_busy: false,
    current_tool: null,
    workspace_status: null,
    run_status: null,
    terminal_reason_class: null,
    evidence_ref: null,
    latest_artifact_kind: null,
    latest_artifact_evidence_ref: null,
    artifact_count: 0,
    snapshot: {
      degraded: true,
      degraded_reason: 'durable-unavailable',
    },
  };
}

export async function GET() {
  try {
    const db = localDb.getDb();
    const counts = getDurableChatTotals(db);
    const lastActivity = getLatestDurableTelegramEvent(db);
    const recentErrors = getRecentDurableErrorCount(db);

    const snapshot = localDb.getLatestTelegramChannelSnapshot(db);

    // Derive bot_connected from recency of last activity
    let botConnected = false;
    if (lastActivity?.created_at) {
      const lastMs = parseTimestamp(lastActivity.created_at);
      // Consider "connected" if something happened in the last 10 minutes
      botConnected = lastMs !== null && Date.now() - lastMs < 10 * 60 * 1000;
    }

    return NextResponse.json({
      bot_connected: botConnected,
      active_chats: counts.active_chats,
      total_sessions: counts.total_sessions,
      last_activity: lastActivity?.created_at ?? null,
      last_event_type: lastActivity?.event_type ?? null,
      recent_errors: recentErrors,
      is_busy: Boolean(snapshot?.supervisor_state && snapshot.supervisor_state !== 'idle'),
      current_tool: null,
      workspace_status: snapshot?.workspace_status ?? null,
      run_status: snapshot?.run_status ?? null,
      terminal_reason_class: snapshot?.terminal_reason_class ?? null,
      evidence_ref: snapshot?.evidence_ref ?? null,
      latest_artifact_kind: snapshot?.latest_artifact_kind ?? null,
      latest_artifact_evidence_ref: snapshot?.latest_artifact_evidence_ref ?? null,
      artifact_count: Number(snapshot?.artifact_count ?? 0),
      snapshot,
    });
  } catch (error) {
    console.error('telegram/status error:', error.message);
    return NextResponse.json(buildDegradedStatus());
  }
}
