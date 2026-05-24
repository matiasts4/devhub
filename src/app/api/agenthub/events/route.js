import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/localDb.js';
import { withDbWriteQueue } from '@/lib/db/writeQueue.js';

/**
 * Valid event types for the agent event feed.
 */
const VALID_EVENT_TYPES = [
  'agent_booted',
  'cwd_verified',
  'task_started',
  'task_progress',
  'needs_help',
  'handoff_ready',
  'task_completed',
  'process_exit',
  'crash_detected',
  'heartbeat_missed',
  'workspace_created',
  'workspace_error',
];

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      mission_id,
      agent_id,
      event_type,
      payload,
      cwd,
      status_summary,
    } = body;

    if (!agent_id) {
      return NextResponse.json(
        { error: 'agent_id is required' },
        { status: 400 }
      );
    }

    if (!event_type) {
      return NextResponse.json(
        { error: 'event_type is required' },
        { status: 400 }
      );
    }

    if (!VALID_EVENT_TYPES.includes(event_type)) {
      return NextResponse.json(
        { error: `Invalid event_type: ${event_type}. Must be one of: ${VALID_EVENT_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const eventId = `event-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Insert into mission_messages as append-only event (via write queue)
    await withDbWriteQueue((writeDb) => {
      writeDb.prepare(
        `INSERT INTO mission_messages (
          message_id, mission_id, sender_agent_id, message_kind,
          body_summary, evidence_ref, created_at, updated_at
        ) VALUES (?, ?, ?, 'status', ?, ?, ?, ?)`
      ).run(
        eventId,
        mission_id || null,
        agent_id,
        `${event_type}${status_summary ? `: ${status_summary}` : ''}`,
        `evidence://event/${eventId}`,
        now,
        now,
      );

      // Also store structured payload if provided
      if (payload) {
        try {
          writeDb.prepare(
            `INSERT INTO agent_traces (
              id, session_id, trace_type, agent_name, tool_name,
              tool_input, content, created_at
            ) VALUES (?, ?, 'agent_event', ?, ?, ?, ?, ?)`
          ).run(
            `trace-${eventId}`,
            mission_id || 'global',
            agent_id,
            event_type,
            JSON.stringify(payload),
            cwd ? JSON.stringify({ cwd }) : null,
            now,
          );
        } catch (traceErr) {
          // Non-fatal — event was already recorded in mission_messages
          console.warn('[EVENTS] Failed to store trace:', traceErr.message);
        }
      }
    }, { label: 'event-append' });

    return NextResponse.json({
      success: true,
      event_id: eventId,
      event_type,
      agent_id,
      created_at: now,
    });
  } catch (error) {
    console.error('[EVENTS] Error:', error.message);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const missionId = searchParams.get('mission_id');
    const agentId = searchParams.get('agent_id');
    const eventType = searchParams.get('event_type');
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    const db = getDb();

    // Query mission_messages for events (message_kind='status')
    let query = `
      SELECT
        message_id as event_id,
        mission_id,
        sender_agent_id as agent_id,
        body_summary,
        created_at
      FROM mission_messages
      WHERE message_kind = 'status'
    `;
    const params = [];

    if (missionId) {
      query += ' AND mission_id = ?';
      params.push(missionId);
    }
    if (agentId) {
      query += ' AND sender_agent_id = ?';
      params.push(agentId);
    }
    if (eventType) {
      query += ' AND body_summary LIKE ?';
      params.push(`${eventType}%`);
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    const events = db.prepare(query).all(...params);

    return NextResponse.json({
      success: true,
      events,
      count: events.length,
    });
  } catch (error) {
    console.error('[EVENTS GET] Error:', error.message);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
