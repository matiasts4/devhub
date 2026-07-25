import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/localDb.js';

/**
 * POST /api/audit/events
 * Appends audit events to the audit_events table.
 */
export async function POST(request) {
  let events;
  try {
    events = await request.json();
  } catch (_) {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!Array.isArray(events) || events.length === 0) {
    return NextResponse.json({ error: 'Expected non-empty array of events' }, { status: 400 });
  }

  // Validate required fields for all events
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (!e.event_id) {
      return NextResponse.json({ error: `events[${i}]: event_id is required` }, { status: 400 });
    }
    if (!e.action_id) {
      return NextResponse.json({ error: `events[${i}]: action_id is required` }, { status: 400 });
    }
  }

  const db = getDb();
  const now = new Date().toISOString();
  let inserted = 0;

  const insertStmt = db.prepare(`
    INSERT INTO audit_events (
      id, event_id, action_id, action_class, actor_role, actor_session_id,
      target_type, target_id, target_label, params, risk_tier,
      confirmed, confirmed_at, rationale, outcome, error_detail, devhub_version, received_at
    ) VALUES (
      @id, @event_id, @action_id, @action_class, @actor_role, @actor_session_id,
      @target_type, @target_id, @target_label, @params, @risk_tier,
      @confirmed, @confirmed_at, @rationale, @outcome, @error_detail, @devhub_version, @received_at
    )
  `);

  const insertMany = db.transaction((eventList) => {
    for (const e of eventList) {
      try {
        insertStmt.run({
          id: crypto.randomUUID(),
          event_id: e.event_id,
          action_id: e.action_id,
          action_class: e.action_class || null,
          actor_role: e.actor_role || null,
          actor_session_id: e.actor_session_id || null,
          target_type: e.target?.type || null,
          target_id: e.target?.id || null,
          target_label: e.target?.label || null,
          params: e.params ? JSON.stringify(e.params) : null,
          risk_tier: e.risk_tier != null ? Number(e.risk_tier) : null,
          confirmed: e.confirmation?.confirmed != null ? (e.confirmation.confirmed ? 1 : 0) : null,
          confirmed_at: e.confirmation?.confirmed_at || null,
          rationale: e.confirmation?.rationale || null,
          outcome: e.outcome || 'success',
          error_detail: e.error_detail || null,
          devhub_version: e.devhub_version || null,
          received_at: now,
        });
        inserted++;
      } catch (err) {
        // Duplicate event_id — skip (idempotent)
        if (!err.message.includes('UNIQUE constraint failed')) {
          throw err;
        }
      }
    }
  });

  try {
    insertMany(events);
  } catch (err) {
    console.error('[audit/events] insert failed:', err);
    return NextResponse.json({ error: 'Database insert failed' }, { status: 500 });
  }

  return NextResponse.json({ inserted }, { status: 201 });
}
