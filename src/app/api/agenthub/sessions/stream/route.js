/**
 * SSE Stream: /api/agenthub/sessions/stream
 *
 * Streams real-time session updates via Server-Sent Events.
 * Events: session-update, trace-event, usage-update, heartbeat
 *
 * Uses polling under the hood (every 2s) comparing state snapshots,
 * then emits deltas over the SSE connection.
 */

import { getDb } from '@/lib/db/localDb.js';

export const dynamic = 'force-dynamic';

const POLL_INTERVAL_MS = 2000;
const HEARTBEAT_INTERVAL_MS = 15000;

/**
 * Serializes an SSE event string.
 */
function sseEvent(event, data) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * Returns a flat snapshot of all active sessions with their latest trace count and usage.
 * Enhanced to include full trace rows (not just counts) for real-time UI updates.
 */
function buildSnapshot(sinceTimestamp) {
  const db = getDb();

  // All sessions
  const sessions = db
    .prepare(
      `
      SELECT id, project_id, title, agent_model, status, opencode_session_id,
             created_at, updated_at
      FROM agent_hub_sessions
      ORDER BY updated_at DESC
    `
    )
    .all();

  // Trace counts per session (fast count, not full rows)
  const traceCounts = db
    .prepare(
      `
      SELECT session_id, COUNT(*) as count, MAX(created_at) as last_trace
      FROM agent_traces
      GROUP BY session_id
    `
    )
    .all();

  const traceMap = {};
  for (const tc of traceCounts) {
    traceMap[tc.session_id] = { count: tc.count, last_trace: tc.last_trace };
  }

  // Full trace rows per session — for trace-event payloads
  // Optimization: only fetch traces created since the last snapshot to avoid O(n) full table scan
  let allTraces;
  if (sinceTimestamp) {
    allTraces = db
      .prepare(
        `
        SELECT id, session_id, message_id, part_id, trace_type, agent_name,
               tool_name, tool_input, tool_output, tool_status, content,
               duration_ms, time_start, time_end, metadata, created_at
        FROM agent_traces
        WHERE created_at > ?
        ORDER BY created_at ASC
      `
      )
      .all(sinceTimestamp);
  } else {
    allTraces = db
      .prepare(
        `
        SELECT id, session_id, message_id, part_id, trace_type, agent_name,
               tool_name, tool_input, tool_output, tool_status, content,
               duration_ms, time_start, time_end, metadata, created_at
        FROM agent_traces
        ORDER BY created_at ASC
      `
      )
      .all();
  }

  // Safe JSON parse helper — defined once outside the loop
  const safeParse = (str) => {
    if (!str) return null;
    try {
      return JSON.parse(str);
    } catch {
      return null; // Return null to maintain consistent type contract
    }
  };

  // Group traces by session_id
  const tracesBySession = {};
  for (const t of allTraces) {
    if (!tracesBySession[t.session_id]) tracesBySession[t.session_id] = [];
    tracesBySession[t.session_id].push({
      ...t,
      tool_input: safeParse(t.tool_input),
      metadata: safeParse(t.metadata),
    });
  }

  // Usage per session
  const usages = db
    .prepare(
      `
      SELECT session_id, prompt_tokens, completion_tokens, total_tokens,
             context_window_size, context_utilization, tool_calls_count, total_duration_ms
      FROM agent_session_usage
    `
    )
    .all();

  const usageMap = {};
  for (const u of usages) {
    usageMap[u.session_id] = u;
  }

  return {
    sessions: sessions.map((s) => ({
      ...s,
      traceCount: traceMap[s.id]?.count || 0,
      lastTraceAt: traceMap[s.id]?.last_trace || null,
      usage: usageMap[s.id] || null,
    })),
    traceMap,
    tracesBySession,
    usageMap,
  };
}

/**
 * Computes delta between two snapshots.
 * Returns arrays of: newSessions, updatedSessions, newTraces, updatedUsages.
 */
function computeDelta(prev, curr) {
  const prevMap = new Map(prev.sessions.map((s) => [s.id, s]));
  const currMap = new Map(curr.sessions.map((s) => [s.id, s]));

  const newSessions = [];
  const updatedSessions = [];

  for (const [id, s] of currMap) {
    const prevS = prevMap.get(id);
    if (!prevS) {
      newSessions.push(s);
    } else if (
      s.status !== prevS.status ||
      s.updated_at !== prevS.updated_at ||
      s.traceCount !== prevS.traceCount
    ) {
      updatedSessions.push(s);
    }
  }

  // New traces: sessions whose trace count increased — emit full trace data
  const traceEvents = [];
  for (const [id, s] of currMap) {
    const prevS = prevMap.get(id);
    if (prevS && s.traceCount > prevS.traceCount) {
      // Get full trace rows for this session from the current snapshot
      const sessionTraces = curr.tracesBySession?.[id] || [];
      traceEvents.push({
        session_id: id,
        message_id:
          sessionTraces.length > 0 ? sessionTraces[sessionTraces.length - 1].message_id : null,
        newTraceCount: s.traceCount,
        lastTraceAt: s.lastTraceAt,
        traces: sessionTraces,
      });
    }
  }

  // Usage updates
  const usageUpdates = [];
  for (const [id, s] of currMap) {
    const prevS = prevMap.get(id);
    if (prevS && s.usage) {
      if (!prevS.usage || s.usage.total_tokens !== (prevS.usage.total_tokens ?? 0)) {
        usageUpdates.push({ session_id: id, usage: s.usage });
      }
    }
  }

  return { newSessions, updatedSessions, traceEvents, usageUpdates };
}

export async function GET() {
  const encoder = new TextEncoder();
  let prevSnapshot = buildSnapshot();
  prevSnapshot.pollTimestamp = new Date().toISOString();
  let heartbeatTimer = null;
  let pollTimer = null;
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      // Send initial snapshot
      for (const session of prevSnapshot.sessions) {
        controller.enqueue(
          encoder.encode(sseEvent('session-update', { type: 'initial', session }))
        );
      }

      // Heartbeat keep-alive
      heartbeatTimer = setInterval(() => {
        if (!closed) {
          controller.enqueue(encoder.encode(sseEvent('heartbeat', { ts: Date.now() })));
        }
      }, HEARTBEAT_INTERVAL_MS);

      // Poll for changes — incremental: only fetch traces since last poll
      pollTimer = setInterval(() => {
        if (closed) return;

        try {
          // Use the last poll's timestamp to fetch only new traces
          // Convert ISO timestamp to SQLite datetime format for proper comparison
          const lastPollTs = prevSnapshot.pollTimestamp
            ? prevSnapshot.pollTimestamp.replace('T', ' ').replace('Z', '').split('.')[0]
            : null;
          const currSnapshot = buildSnapshot(lastPollTs);
          currSnapshot.pollTimestamp = new Date().toISOString();
          const delta = computeDelta(prevSnapshot, currSnapshot);

          for (const session of delta.newSessions) {
            controller.enqueue(
              encoder.encode(sseEvent('session-update', { type: 'new', session }))
            );
          }

          for (const session of delta.updatedSessions) {
            controller.enqueue(
              encoder.encode(sseEvent('session-update', { type: 'update', session }))
            );
          }

          for (const te of delta.traceEvents) {
            controller.enqueue(encoder.encode(sseEvent('trace-event', te)));
          }

          for (const uu of delta.usageUpdates) {
            controller.enqueue(encoder.encode(sseEvent('usage-update', uu)));
          }

          prevSnapshot = currSnapshot;
        } catch (err) {
          // Silently ignore polling errors — SQLite may be busy
          console.error('[SSE stream] poll error:', err.message);
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
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    },
  });
}
