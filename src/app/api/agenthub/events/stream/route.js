/**
 * SSE Stream: GET /api/agenthub/events/stream
 *
 * Server-Sent Events endpoint for live operator observer sidebar updates.
 * Emits typed FeedItem events (feed-item, progress-update, session-end)
 * by polling agent_events + mission_messages for the active mission.
 *
 * Design: SSE primary + 2s polling fallback.
 * FeedItem schema matches the 6-variant union defined in design.md.
 */

import { getDb } from '@/lib/db/localDb.js';

export const dynamic = 'force-dynamic';

const POLL_INTERVAL_MS = 2000;
const HEARTBEAT_INTERVAL_MS = 15_000;

// ──────────────────────────────────────────────────────────────────────────────
// SSE helpers
// ──────────────────────────────────────────────────────────────────────────────

function sseEvent(event, data) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

// ──────────────────────────────────────────────────────────────────────────────
// FeedItem builders
// ──────────────────────────────────────────────────────────────────────────────

function parseEventPayload(payloadJson) {
  if (!payloadJson) return {};
  try {
    const p = JSON.parse(payloadJson);
    return p && typeof p === 'object' ? p : {};
  } catch {
    return {};
  }
}

function buildProgressItem(eventRow) {
  const payload = parseEventPayload(eventRow.payload_json);
  const stepLabel = payload?.summary || payload?.next_action || `Step ?`;

  if (eventRow.event_type === 'task_completed') {
    return {
      id: `progress:${eventRow.id}`,
      type: 'progress-done',
      stepIndex: 1,
      totalSteps: 1,
      stepLabel,
      completedAt: eventRow.created_at || null,
      occurredAt: eventRow.created_at || null,
    };
  }
  if (eventRow.event_type === 'crash_detected' || eventRow.event_type === 'heartbeat_missed') {
    return {
      id: `progress:${eventRow.id}`,
      type: 'progress-failed',
      stepIndex: 1,
      totalSteps: 1,
      stepLabel,
      error: payload?.error || payload?.reason || 'Step failed',
      occurredAt: eventRow.created_at || null,
    };
  }
  return {
    id: `progress:${eventRow.id}`,
    type: 'progress-active',
    stepIndex: 1,
    totalSteps: 1,
    stepLabel,
    occurredAt: eventRow.created_at || null,
  };
}

function buildFeedItemFromEvent(eventRow) {
  if (!eventRow || !eventRow.id) return null;

  const isActionType = [
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
  ].includes(eventRow.event_type);

  if (!isActionType) return null;

  const payload = parseEventPayload(eventRow.payload_json);
  const argsSummary =
    payload?.summary || payload?.next_action || payload?.tool_name || eventRow.event_type;

  let status = 'running';
  let completedAt = null;
  let error = null;

  if (eventRow.event_type === 'task_completed') {
    status = 'done';
    completedAt = eventRow.created_at || null;
  } else if (
    ['crash_detected', 'heartbeat_missed', 'workspace_error'].includes(eventRow.event_type)
  ) {
    status = 'failed';
    completedAt = eventRow.created_at || null;
    error = payload?.error || payload?.reason || 'Execution failed';
  }

  return {
    id: `action:${eventRow.id}`,
    type: 'action-executed',
    tool: eventRow.event_type,
    argsSummary: String(argsSummary).slice(0, 120),
    startedAt: eventRow.created_at || null,
    completedAt,
    status,
    error,
    occurredAt: eventRow.created_at || null,
  };
}

function buildFeedItemFromMessage(messageRow) {
  if (!messageRow || !messageRow.message_id) return null;
  const isOperator = messageRow.message_kind === 'directive';
  const isAgent = messageRow.message_kind === 'status';
  if (!isOperator && !isAgent) return null;

  return {
    id: `msg:${messageRow.message_id}`,
    type: isOperator ? 'operator-prompt' : 'agent-reply',
    role: isOperator ? 'operator' : 'agent',
    text: messageRow.body_summary || '',
    timestamp: messageRow.created_at || null,
    occurredAt: messageRow.created_at || null,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Snapshot building
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Fetch all feed items for a mission newer than `since`.
 * Returns { feedItems, missionStatus }
 */
function buildSidebarSnapshot(missionId, since = null) {
  const db = getDb();
  const feedItems = [];

  // Fetch mission status
  let missionStatus = null;
  if (missionId) {
    const missionRow = db
      .prepare('SELECT status FROM swarm_missions WHERE mission_id = ? LIMIT 1')
      .get(missionId);
    missionStatus = missionRow?.status || null;
  }

  // Fetch messages
  if (missionId) {
    let msgQuery = 'SELECT * FROM mission_messages WHERE mission_id = ?';
    const msgArgs = [missionId];
    if (since) {
      msgQuery += ' AND created_at > ?';
      msgArgs.push(since);
    }
    msgQuery += ' ORDER BY created_at ASC';
    const messages = db.prepare(msgQuery).all(...msgArgs);
    for (const row of messages) {
      const item = buildFeedItemFromMessage(row);
      if (item) feedItems.push(item);
    }
  }

  // Fetch agent events
  let evtQuery = 'SELECT * FROM agent_events WHERE mission_id = ?';
  const evtArgs = [missionId || null];
  if (since) {
    evtQuery += ' AND created_at > ?';
    evtArgs.push(since);
  }
  evtQuery += ' ORDER BY created_at ASC';
  const events = db.prepare(evtQuery).all(...evtArgs);
  for (const row of events) {
    const item = buildFeedItemFromEvent(row);
    if (item) feedItems.push(item);
  }

  // Also fetch progress-step events (task_started / task_progress / task_completed / crash_detected)
  const stepTypes = [
    'task_started',
    'task_progress',
    'task_completed',
    'crash_detected',
    'heartbeat_missed',
  ];
  let stepQuery = 'SELECT * FROM agent_events WHERE mission_id = ? AND event_type IN (';
  const stepArgs = [missionId || null];
  stepQuery += stepTypes.map(() => '?').join(', ') + ')';
  if (since) {
    stepQuery += ' AND created_at > ?';
    stepArgs.push(since);
  }
  stepQuery += ' ORDER BY created_at ASC';
  const stepEvents = db.prepare(stepQuery).all(...stepArgs);
  for (const row of stepEvents) {
    const item = buildProgressItem(row);
    if (item) feedItems.push(item);
  }

  // Sort by occurredAt ascending
  feedItems.sort((a, b) => {
    const ta = a.occurredAt ? Date.parse(a.occurredAt) : 0;
    const tb = b.occurredAt ? Date.parse(b.occurredAt) : 0;
    return ta - tb;
  });

  return { feedItems, missionStatus };
}

// ──────────────────────────────────────────────────────────────────────────────
// GET — SSE stream
// ──────────────────────────────────────────────────────────────────────────────

export async function GET(request) {
  const encoder = new TextEncoder();
  const { searchParams } = new URL(request.url);

  const missionId = searchParams.get('mission_id') || null;
  const since = searchParams.get('since') || null;

  let heartbeatTimer = null;
  let pollTimer = null;
  let closed = false;

  // Initial snapshot
  const initial = buildSidebarSnapshot(missionId, null);
  let lastWatermark =
    initial.feedItems.length > 0
      ? initial.feedItems[initial.feedItems.length - 1].occurredAt
      : since || null;

  const stream = new ReadableStream({
    start(controller) {
      // Emit initial items
      for (const item of initial.feedItems) {
        controller.enqueue(
          encoder.encode(
            sseEvent('feed-item', {
              type: 'feed-item',
              payload: item,
              occurredAt: item.occurredAt,
              sessionId: missionId,
            })
          )
        );
      }

      // Emit session-end if mission is already terminal
      if (initial.missionStatus === 'completed' || initial.missionStatus === 'failed') {
        controller.enqueue(
          encoder.encode(
            sseEvent('session-end', {
              type: 'session-end',
              sessionId: missionId,
              status: initial.missionStatus,
              occurredAt: new Date().toISOString(),
            })
          )
        );
      }

      // Heartbeat
      heartbeatTimer = setInterval(() => {
        if (closed) return;
        controller.enqueue(
          encoder.encode(
            sseEvent('heartbeat', {
              last_watermark: lastWatermark,
              ts: new Date().toISOString(),
            })
          )
        );
      }, HEARTBEAT_INTERVAL_MS);

      // Poll for new items
      pollTimer = setInterval(() => {
        if (closed) return;
        try {
          const snapshot = buildSidebarSnapshot(missionId, lastWatermark);

          if (snapshot.feedItems.length > 0) {
            for (const item of snapshot.feedItems) {
              lastWatermark = item.occurredAt;
              controller.enqueue(
                encoder.encode(
                  sseEvent('feed-item', {
                    type: 'feed-item',
                    payload: item,
                    occurredAt: item.occurredAt,
                    sessionId: missionId,
                  })
                )
              );
            }
          }

          // Emit session-end on terminal status transition
          if (snapshot.missionStatus === 'completed' || snapshot.missionStatus === 'failed') {
            controller.enqueue(
              encoder.encode(
                sseEvent('session-end', {
                  type: 'session-end',
                  sessionId: missionId,
                  status: snapshot.missionStatus,
                  occurredAt: new Date().toISOString(),
                })
              )
            );
          }
        } catch (err) {
          console.warn('[events/stream] poll error:', err.message);
        }
      }, POLL_INTERVAL_MS);
    },

    cancel() {
      closed = true;
      clearInterval(heartbeatTimer);
      clearInterval(pollTimer);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
