import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/localDb.js';
import { withDbWriteQueue } from '@/lib/db/writeQueue.js';
import {
  emitAgentEvent,
  queryAgentEvents,
  normalizeEventForPersistence,
  VALID_EVENT_TYPES as AGENT_EVENT_TYPES,
} from '@/lib/swarm/agentEvents.js';
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

function buildMissionMessageSummary(eventType, normalizedPayload, fallbackStatusSummary) {
  const canonicalSummary = normalizedPayload?.summary || normalizedPayload?.next_action || null;
  if (canonicalSummary) return canonicalSummary;
  if (fallbackStatusSummary) return `${eventType}: ${fallbackStatusSummary}`;
  return eventType;
}

// T-007 — POST /api/agenthub/events is RETIRED. Agents now write to team_events
// via the devhub-bus binary (`_devhub_event ...`) which is durable, atomic, and
// doesn't require HMAC plumbing. Real-time consumers should use `devhub events tail`
// to read the JSONL projection. The GET handler below is preserved unchanged for
// historical / one-shot queries.
export const POST = withAuth(async function POST() {
  return NextResponse.json(
    {
      error: 'gone',
      message:
        'POST /api/agenthub/events is retired (agent-comms-redesign). ' +
        'Write to team_events via the devhub-bus binary: ' +
        '`devhub-bus event-write --mission <id> --source <role> --kind <kind> --payload <json>`. ' +
        'For real-time consumers, use `devhub events tail --mission <id>` to read the JSONL projection.',
      replaced_by: 'devhub-bus event-write / devhub events tail',
    },
    { status: 410 }
  );
});

// Keep the original POST body below for reference; it is now unreachable.
// The original handler from before T-007 is preserved as legacy code for
// the internal supervisor adapter (which calls emitAgentEvent directly, not via HTTP).
// Keep the original POST body below for reference; it is now unreachable.
// The original handler from before T-007 is preserved as legacy code for
// the internal supervisor adapter (which calls emitAgentEvent directly, not via HTTP).
// eslint-disable-next-line no-unused-vars
async function _legacyPOST_REMOVED(request) {
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
    const resolvedAgentId = authAgentId || agent_id || null;

    if (!resolvedAgentId) {
      return NextResponse.json({ error: 'agent_id is required' }, { status: 400 });
    }

    if (!VALID_EVENT_TYPES.includes(event_type)) {
      return NextResponse.json(
        {
          error: `Invalid event_type: ${event_type}. Must be one of: ${VALID_EVENT_TYPES.join(', ')}`,
        },
        { status: 400 }
      );
    }

    const normalizedEvent = AGENT_EVENT_TYPES.includes(event_type)
      ? normalizeEventForPersistence({
          agent_id: resolvedAgentId,
          event_type,
          workspace_id: workspace_id || null,
          payload: payload || undefined,
          mission_id: mission_id || null,
          client_event_id: client_event_id || null,
        })
      : null;

    const now = new Date().toISOString();
    const eventId = `event-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Dual-write: Insert into agent_events (structured) AND mission_messages (backward compat)
    await withDbWriteQueue(
      (writeDb) => {
        // Primary write: agent_events table
        if (AGENT_EVENT_TYPES.includes(event_type)) {
          emitAgentEvent(writeDb, normalizedEvent);
        }

        // Backward-compat write: mission_messages table
        const normalizedPayload = normalizedEvent?.payload || null;
        writeDb
          .prepare(
            `INSERT INTO mission_messages (
          message_id, mission_id, sender_agent_id, message_kind,
          body_summary, evidence_ref, related_task_id, related_workspace_id,
          related_run_id, related_artifact_id, related_approval_checkpoint_key,
          created_at, updated_at
        ) VALUES (?, ?, ?, 'status', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            eventId,
            mission_id || null,
            resolvedAgentId,
            buildMissionMessageSummary(event_type, normalizedPayload, status_summary),
            `evidence://event/${eventId}`,
            normalizedPayload?.related_task_id || null,
            normalizedPayload?.related_workspace_id || normalizedEvent?.workspace_id || null,
            normalizedPayload?.related_run_id || null,
            normalizedPayload?.related_artifact_id || null,
            normalizedPayload?.related_approval_checkpoint_key || null,
            now,
            now
          );

        // Also store structured payload if provided (legacy trace)
        if (payload) {
          try {
            writeDb
              .prepare(
                `INSERT INTO agent_traces (
              id, session_id, trace_type, agent_name, tool_name,
              tool_input, content, created_at
            ) VALUES (?, ?, 'agent_event', ?, ?, ?, ?, ?)`
              )
              .run(
                `trace-${eventId}`,
                mission_id || 'global',
                resolvedAgentId,
                event_type,
                JSON.stringify(payload),
                cwd ? JSON.stringify({ cwd }) : null,
                now
              );
          } catch (traceErr) {
            // Non-fatatal — event was already recorded in mission_messages
            console.warn('[EVENTS] Failed to store trace:', traceErr.message);
          }
        }
      },
      { label: 'event-append' }
    );

    return NextResponse.json(
      {
        success: true,
        event_id: eventId,
        event_type,
        agent_id: resolvedAgentId,
        created_at: now,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('[EVENTS] Error:', error.message);
    return NextResponse.json(
      {
        error: error.status && error.status < 500 ? error.message : 'Internal server error',
        details: error.message,
      },
      { status: error.status && error.status < 500 ? error.status : 500 }
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
    const longPoll = searchParams.get('long_poll') === 'true';
    const timeoutSec = parseInt(searchParams.get('timeout') || '30', 10);

    const db = getDb();

    // Long-poll: wait up to timeoutSec for new events after `since`
    if (longPoll && since) {
      const deadline = Date.now() + Math.min(Math.max(timeoutSec, 1), 30) * 1000;
      let events = [];
      let source = '';

      while (Date.now() < deadline) {
        // Primary query: agent_events table
        if (AGENT_EVENT_TYPES.includes(eventType) || !eventType) {
          const candidate = queryAgentEvents(db, {
            agent_id: agentId || undefined,
            type: eventType && AGENT_EVENT_TYPES.includes(eventType) ? eventType : undefined,
            since: since || undefined,
            limit: Math.min(limit, 100),
          });
          let filtered = missionId
            ? candidate.filter((e) => e.mission_id === missionId)
            : candidate;
          if (filtered.length > 0) {
            events = filtered;
            source = 'agent_events';
            break;
          }
        }

        // Also check mission_messages for legacy events after since
        const legacyParams = [since];
        let legacyQuery = `
          SELECT
            message_id as event_id,
            mission_id,
            sender_agent_id as agent_id,
            body_summary,
            created_at
          FROM mission_messages
          WHERE message_kind = 'status' AND created_at >= ?
        `;
        if (missionId) {
          legacyQuery += ' AND mission_id = ?';
          legacyParams.push(missionId);
        }
        if (agentId) {
          legacyQuery += ' AND sender_agent_id = ?';
          legacyParams.push(agentId);
        }
        legacyQuery += ' ORDER BY created_at DESC LIMIT ?';
        legacyParams.push(Math.min(limit, 100));

        const legacyEvents = db.prepare(legacyQuery).all(...legacyParams);
        if (legacyEvents.length > 0) {
          events = legacyEvents;
          source = 'mission_messages';
          break;
        }

        // Sleep briefly before next poll attempt (avoid tight loop)
        const sleepMs = Math.min(2000, deadline - Date.now() - 500);
        if (sleepMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, sleepMs));
        }
      }

      return NextResponse.json({
        success: true,
        source,
        events,
        count: events.length,
        timed_out: events.length === 0,
      });
    }

    // Standard GET without long-poll (original behavior)
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
    if (since) {
      query += ' AND created_at >= ?';
      params.push(since);
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
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
