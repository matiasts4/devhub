import { NextResponse } from 'next/server';
import localDb from '@/lib/db/localDb';

export const dynamic = 'force-dynamic';

function tableExists(db, tableName) {
  const row = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`)
    .get(tableName);
  return Boolean(row);
}

function buildDegradedActivity() {
  return {
    items: [],
    has_more: false,
    total: 0,
    degraded: true,
    degraded_reason: 'durable-unavailable',
  };
}

function buildIntentActivityQuery({ includeChatFilter, includeEventFilter }) {
  return `
    SELECT
      intent.intent_id AS id,
      'intent' AS entry_type,
      intent.telegram_chat_id AS chat_id,
      intent.action AS action,
      intent.status AS intent_status,
      intent.audit_status AS audit_status,
      intent.task_id AS task_id,
      intent.workspace_id AS workspace_id,
      intent.run_id AS run_id,
      intent.approval_id AS approval_id,
      checkpoint.status AS approval_status,
      COALESCE(snapshot.evidence_ref, checkpoint.evidence_ref) AS evidence_ref,
      delivery.status AS delivery_status,
      delivery.attempts_count AS delivery_attempts_count,
      delivery.last_error AS delivery_last_error,
      intent.created_at AS created_at
    FROM telegram_intent_envelopes intent
    LEFT JOIN supervisor_approval_checkpoints checkpoint ON checkpoint.checkpoint_key = intent.approval_id
    LEFT JOIN supervisor_snapshots snapshot ON snapshot.task_id = intent.task_id
    LEFT JOIN telegram_delivery_receipts delivery ON delivery.intent_id = intent.intent_id
    WHERE 1 = 1
      ${includeChatFilter ? 'AND intent.telegram_chat_id = ?' : ''}
      ${includeEventFilter ? "AND 'intent' = ?" : ''}
  `;
}

function buildSubscriptionActivityQuery({ includeChatFilter, includeEventFilter }) {
  return `
    SELECT
      subscription.subscription_key AS id,
      'subscription' AS entry_type,
      subscription.telegram_chat_id AS chat_id,
      'subscription.set' AS action,
      subscription.status AS intent_status,
      subscription.status AS audit_status,
      subscription.task_id AS task_id,
      subscription.workspace_id AS workspace_id,
      subscription.run_id AS run_id,
      NULL AS approval_id,
      NULL AS approval_status,
      NULL AS evidence_ref,
      NULL AS delivery_status,
      NULL AS delivery_attempts_count,
      NULL AS delivery_last_error,
      subscription.updated_at AS created_at
    FROM telegram_subscriptions subscription
    WHERE 1 = 1
      ${includeChatFilter ? 'AND subscription.telegram_chat_id = ?' : ''}
      ${includeEventFilter ? "AND 'subscription' = ?" : ''}
  `;
}

function normalizeActivityEventType(eventType) {
  if (!eventType) return null;
  if (eventType === 'subscription') return 'subscription';
  return eventType;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    let limit = parseInt(searchParams.get('limit') ?? '50');
    if (isNaN(limit) || limit < 1) limit = 50;
    if (limit > 200) limit = 200;

    const offset = Math.max(0, parseInt(searchParams.get('offset') ?? '0') || 0);
    const chatId = searchParams.get('chat_id') ?? null;
    const eventType = normalizeActivityEventType(searchParams.get('event_type') ?? null);

    const db = localDb.getDb();

    const queries = [];
    const itemParams = [];
    const countParams = [];

    if (tableExists(db, 'telegram_intent_envelopes')) {
      queries.push(
        buildIntentActivityQuery({ includeChatFilter: Boolean(chatId), includeEventFilter: Boolean(eventType) })
      );
      if (chatId) {
        itemParams.push(chatId);
        countParams.push(chatId);
      }
      if (eventType) {
        itemParams.push(eventType);
        countParams.push(eventType);
      }
    }

    if (tableExists(db, 'telegram_subscriptions')) {
      queries.push(
        buildSubscriptionActivityQuery({ includeChatFilter: Boolean(chatId), includeEventFilter: Boolean(eventType) })
      );
      if (chatId) {
        itemParams.push(chatId);
        countParams.push(chatId);
      }
      if (eventType) {
        itemParams.push(eventType);
        countParams.push(eventType);
      }
    }

    if (queries.length === 0 && tableExists(db, 'telegram_activity')) {
      const whereParts = [];
      const params = [];
      if (chatId) {
        whereParts.push('chat_id = ?');
        params.push(chatId);
      }
      if (eventType) {
        whereParts.push('event_type = ?');
        params.push(eventType);
      }
      const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';
      const items = db
        .prepare(
          `SELECT id, chat_id, event_type AS entry_type, event_type AS action, status AS intent_status,
                  status AS audit_status, NULL AS task_id, NULL AS workspace_id, NULL AS run_id,
                  NULL AS approval_id, NULL AS approval_status, NULL AS evidence_ref, NULL AS delivery_status,
                  NULL AS delivery_attempts_count, NULL AS delivery_last_error, created_at
           FROM telegram_activity
           ${whereClause}
           ORDER BY created_at DESC
           LIMIT ? OFFSET ?`
        )
        .all(...params, limit, offset);
      const total = Number(
        db.prepare(`SELECT count(*) as cnt FROM telegram_activity ${whereClause}`).get(...params)?.cnt ?? 0
      );
      return NextResponse.json({ items, has_more: offset + limit < total, total });
    }

    if (queries.length === 0) {
      return NextResponse.json({ items: [], has_more: false, total: 0 });
    }

    const unionSql = queries.join(' UNION ALL ');
    const items = db
      .prepare(
        `SELECT * FROM (${unionSql}) ORDER BY CASE entry_type WHEN 'intent' THEN 0 ELSE 1 END ASC, created_at DESC LIMIT ? OFFSET ?`
      )
      .all(...itemParams, limit, offset);
    const total = Number(
      db.prepare(`SELECT count(*) as cnt FROM (${unionSql})`).get(...countParams)?.cnt ?? 0
    );
    const hasMore = offset + limit < total;

    return NextResponse.json({ items, has_more: hasMore, total });
  } catch (error) {
    console.error('telegram/activity error:', error.message);
    return NextResponse.json(buildDegradedActivity());
  }
}
