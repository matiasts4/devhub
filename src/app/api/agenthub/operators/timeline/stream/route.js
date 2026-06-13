/**
 * SSE Stream: GET /api/agenthub/operators/timeline/stream
 *
 * Server-Sent Events endpoint for live operator timeline updates.
 * Design: D-5 (SSE with durable watermark), OET-6 (authority rules).
 *
 * Events emitted:
 *   - heartbeat        — every 15s, includes last_durable_sequence
 *   - timeline_item    — new durable item (authority: 'primary')
 *   - execution_rollup — rollup snapshot (when rollup mode is active)
 *
 * Authority rules (OET-6):
 *   - Items persisted to SQLite are always authority: 'primary'
 *   - last_durable_sequence = highest confirmed sequence from SQLite
 *   - Client uses last_durable_sequence to distinguish durable vs hint items
 */

import { getDb } from '@/lib/db/localDb.js';
import { getLastDurableSequence } from '@/lib/operators/timelineStore.js';

export const dynamic = 'force-dynamic';

const POLL_INTERVAL_MS = 2000;
const HEARTBEAT_INTERVAL_MS = 15_000;

// ──────────────────────────────────────────────────────────────────────────────
// SSE helpers
// ──────────────────────────────────────────────────────────────────────────────

/** Serialise a named SSE event. */
function sseEvent(event, data) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

// ──────────────────────────────────────────────────────────────────────────────
// Snapshot building
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Build the current timeline snapshot from SQLite.
 * Called on initial connect and on every poll.
 *
 * @param {{ execution_id?: string, actor_id?: string, stage?: string[], status?: string[] }} scope
 * @param {number} sinceSequence - only emit items with sequence > this value
 * @returns {{ items: object[], lastDurableSequence: number }}
 */
function buildTimelineSnapshot(scope, sinceSequence = 0) {
  const db = getDb();
  const conditions = ['sequence > ?'];
  const args = [sinceSequence];

  if (scope.execution_id) {
    conditions.push('execution_id = ?');
    args.push(scope.execution_id);
  }
  if (scope.actor_id) {
    conditions.push('actor_id = ?');
    args.push(scope.actor_id);
  }
  if (scope.stage && scope.stage.length > 0) {
    conditions.push(`stage IN (${scope.stage.map(() => '?').join(', ')})`);
    args.push(...scope.stage);
  }
  if (scope.status && scope.status.length > 0) {
    conditions.push(`status IN (${scope.status.map(() => '?').join(', ')})`);
    args.push(...scope.status);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;
  const rows = db
    .prepare(
      `SELECT * FROM operator_timeline ${where} ORDER BY occurred_at ASC, sequence ASC`
    )
    .all(...args);

  const items = rows.map((row) => {
    const error =
      row.error_code || row.error_message || row.error_recoverable !== null
        ? {
            code: row.error_code || null,
            message: row.error_message || null,
            recoverable: row.error_recoverable === 1,
          }
        : null;
    return {
      item_id: row.item_id,
      execution_id: row.execution_id,
      correlation_id: row.correlation_id,
      sequence: row.sequence,
      actor: { type: row.actor_type, id: row.actor_id, role: row.actor_role },
      stage: row.stage,
      status: row.status,
      tool: row.tool_name || null,
      params: row.params ? JSON.parse(row.params) : null,
      evidence_refs: row.evidence_refs ? JSON.parse(row.evidence_refs) : [],
      redaction_level: row.redaction_level,
      occurred_at: row.occurred_at,
      authority: row.authority,
      next_step_hint: row.next_step_hint || null,
      error,
    };
  });

  // Global durable watermark — highest confirmed sequence across ALL executions
  // (used even when scoped to a specific execution_id for consistency)
  const globalSeq = db
    .prepare(`SELECT MAX(sequence) AS seq FROM operator_timeline WHERE authority = 'primary'`)
    .get();
  const lastDurableSequence = globalSeq?.seq || 0;

  return { items, lastDurableSequence };
}

// ──────────────────────────────────────────────────────────────────────────────
// GET — SSE stream
// ──────────────────────────────────────────────────────────────────────────────

export async function GET(request) {
  const encoder = new TextEncoder();
  const { searchParams } = new URL(request.url);

  const scope = {
    execution_id: searchParams.get('execution_id') || undefined,
    actor_id: searchParams.get('actor_id') || undefined,
    stage: searchParams.get('stage')
      ? searchParams.get('stage').split(',').map((s) => s.trim())
      : undefined,
    status: searchParams.get('status')
      ? searchParams.get('status').split(',').map((s) => s.trim())
      : undefined,
  };

  let heartbeatTimer = null;
  let pollTimer = null;
  let closed = false;

  // ── Initial snapshot: send current items and watermark
  const initial = buildTimelineSnapshot(scope, 0);
  let lastSeenSeq = initial.lastDurableSequence;

  const stream = new ReadableStream({
    start(controller) {
      // Emit initial items
      for (const item of initial.items) {
        controller.enqueue(
          encoder.encode(
            sseEvent('timeline_item', {
              type: 'timeline_item',
              execution_id: item.execution_id,
              item,
              authority: 'primary',
              last_durable_sequence: initial.lastDurableSequence,
              occurred_at: item.occurred_at,
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
              last_durable_sequence: lastSeenSeq,
              ts: new Date().toISOString(),
            })
          )
        );
      }, HEARTBEAT_INTERVAL_MS);

      // Poll for new items
      pollTimer = setInterval(() => {
        if (closed) return;
        try {
          const snapshot = buildTimelineSnapshot(scope, lastSeenSeq);

          if (snapshot.items.length > 0) {
            for (const item of snapshot.items) {
              lastSeenSeq = Math.max(lastSeenSeq, item.sequence);
              controller.enqueue(
                encoder.encode(
                  sseEvent('timeline_item', {
                    type: 'timeline_item',
                    execution_id: item.execution_id,
                    item,
                    authority: 'primary',
                    last_durable_sequence: snapshot.lastDurableSequence,
                    occurred_at: item.occurred_at,
                  })
                )
              );
            }
          } else {
            // Update watermark even when no new items arrived
            lastSeenSeq = snapshot.lastDurableSequence;
          }
        } catch (err) {
          // Non-critical — SQLite may be busy; heartbeat continues
          console.warn('[timeline/stream] poll error:', err.message);
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