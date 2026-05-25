import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/localDb.js';
import { withDbWriteQueue } from '@/lib/db/writeQueue.js';
import { emitAgentEvent, queryAgentEvents, VALID_EVENT_TYPES as AGENT_EVENT_TYPES } from '@/lib/swarm/agentEvents.js';
import { withAuth } from '@/lib/swarm/withAuth.js';

/**
 * Valid event types for the legacy mission_messages event feed.
 * These are the original event types that map to mission_messages.body_summary.
 */
const LEGACY_EVENT_TYPES = [
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

/**
 * Combined valid event types: both the new agent_events types and legacy types.
 */
const VALID_EVENT_TYPES = [...new Set([...AGENT_EVENT_TYPES, ...LEGACY_EVENT_TYPES])];

export const POST = withAuth(async function POST(request) {
  try {
    const body = await request.json();
    const {
      mission_id,
      agent_id,
      event_type,
      payload,
      cwd,
      status_summary,
      client_event_id,
      workspace_id,
    } = body;

    // Extract agent ID from auth context if available
    const authAgentId = request.agentId || null;

    if (!agent_id && !authAgentId) {
      return NextResponse.json(
        { error: 'agent_id is required' },
        { status: 400 }
    );
  }
});

    if (!VALID_EVENT_TYPES.includes(event_type)) {
      return NextResponse.json(
        { error: `Invalid event_type: ${event_type}. Must be one of: ${VALID_EVENT_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const eventId = `event-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Dual-write: Insert into agent_events (structured) AND mission_messages (backward compat)
    await withDbWriteQueue((writeDb) => {
      // Primary write: agent_events table
      if (AGENT_EVENT_TYPES.includes(event_type)) {
        try {
          emitAgentEvent(writeDb, {
            agent_id: resolvedAgentId,
            event_type,
            workspace_id: workspace_id || null,
            payload: payload || undefined,
            mission_id: mission_id || null,
            client_event_id: client_event_id || null,
          });
        } catch (evtErr) {
          // Dedup (200) is not an error — anything else is non-fatal since we also write to mission_messages
          if (!evtErr.message?.includes('Invalid')) {
            console.warn('[EVENTS] Failed to write to agent_events:', evtErr.message);
          } else {
            throw evtErr; // Re-throw validation errors
          }
        }
      }

      // Backward-compat write: mission_messages table
      writeDb.prepare(
        `INSERT INTO mission_messages (
          message_id, mission_id, sender_agent_id, message_kind,
          body_summary, evidence_ref, created_at, updated_at
        ) VALUES (?, ?, ?, 'status', ?, ?, ?, ?)`
      ).run(
        eventId,
        mission_id || null,
        resolvedAgentId,
        `${event_type}${status_summary ? `: ${status_summary}` : ''}`,
        `evidence://event/${eventId}`,
        now,
        now,
      );

      // Also store structured payload if provided (legacy trace)
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
            resolvedAgentId,
            event_type,
            JSON.stringify(payload),
            cwd ? JSON.stringify({ cwd }) : null,
            now,
          );
        } catch (traceErr) {
          // Non-fatatal — event was already recorded in mission_messages
          console.warn('[EVENTS] Failed to store trace:', traceErr.message);
        }
      }
    }, { label: 'event-append' });

    return NextResponse.json({
      success: true,
      event_id: eventId,
      event_type,
      agent_id: resolvedAgentId,
      created_at: now,
    }, { status: 201 });
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
    const since = searchParams.get('since');
    const limit = parseInt(searchParams.get('limit') || '100', 10);

    const db = getDb();

    // Primary query: agent_events table
    if (AGENT_EVENT_TYPES.includes(eventType) || !eventType) {
      const events = queryAgentEvents(db, {
        agent_id: agentId || undefined,
        type: eventType && AGENT_EVENT_TYPES.includes(eventType) ? eventType : undefined,
        since: since || undefined,
        limit: Math.min(limit, 100),
      });

      // If mission_id filter is requested, also filter agent_events results
      let filtered = events;
      if (missionId) {
        filtered = filtered.filter((e) => e.mission_id === missionId);
      }

      return NextResponse.json({
        success: true,
        source: 'agent_events',
        events: filtered,
        count: filtered.length,
      });
    }

    // Legacy fallback: query mission_messages for old event types
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
    params.push(Math.min(limit, 100));

    const events = db.prepare(query).all(...params);

    return NextResponse.json({
      success: true,
      source: 'mission_messages',
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