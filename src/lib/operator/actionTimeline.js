'use strict';

/**
 * actionTimeline.js — Persistent immutable timeline for action lifecycle events.
 *
 * v2: entries are written to the durable `operator_timeline` SQLite table via
 * timelineStore.js. Entries survive page reloads and process restarts.
 * Entries are append-only — the DB has an append-only trigger that prevents
 * UPDATE/DELETE on existing rows.
 *
 * Server-only: this module never runs in the browser renderer; it is invoked
 * exclusively by server-side Next.js route handlers and server-side React
 * component code that runs in the standalone Node.js process.
 *
 * Schema mapping (actionTimeline fields -> operator_timeline columns):
 *   actionId     -> execution_id
 *   event        -> status  (confirmed->policy_approved, dispatched->invoked pass through)
 *   actor        -> actor.type / actor.id / actor.role  (role always 'operator')
 *   detail       -> params  (verb, params, target, result, or error)
 *   timestamp    -> occurred_at  (ISO 8601)
 *
 * Stage: all lifecycle events use 'action_request'.
 * correlation_id: '' (not tracked at the action level)
 * evidence_refs: []  redaction_level: 'none'
 */

/** Cached reference to timelineStore so it is required at most once. */
let _timelineStore = null;

async function getTimelineStore() {
  if (!_timelineStore) {
    const mod = await import('@/lib/operators/timelineStore.js');
    _timelineStore = mod;
  }
  return _timelineStore;
}

/**
 * Normalise an old-style event string to an operator_timeline status.
 * 'confirmed' maps to 'policy_approved' (human gate = policy approval event).
 */
function mapEventToStatus(event) {
  switch (event) {
    case 'confirmed':
      return 'policy_approved';
    case 'dispatched':
      return 'invoked';
    default:
      return event; // requested, completed, failed, cancelled, deferred pass through
  }
}

/**
 * Write one immutable timeline entry to SQLite.
 *
 * @param {{ id?: string, actionId: string, event: string, timestamp?: number, actor: 'human'|'operator', detail?: object|null }} entry
 */
export async function writeTimelineEntry(entry) {
  const { insertTimelineItem } = await getTimelineStore();

  const executionId = entry.actionId;
  const status = mapEventToStatus(entry.event);
  const occurredAt = new Date(entry.timestamp ? entry.timestamp : Date.now()).toISOString();

  const item = {
    item_id: entry.id || crypto.randomUUID(),
    execution_id: executionId,
    correlation_id: '',
    stage: 'action_request',
    status,
    actor: {
      type: entry.actor === 'human' ? 'human' : 'operator',
      id: entry.actor === 'human' ? 'human' : 'operator',
      role: 'operator',
    },
    tool: null,
    params: entry.detail ?? null,
    evidence_refs: [],
    redaction_level: 'none',
    occurred_at: occurredAt,
  };

  insertTimelineItem(item);
}

/**
 * Read all timeline entries for a given actionId (execution_id).
 *
 * @param {string} actionId  - maps to execution_id in the DB
 * @returns {Promise<Array>}
 */
export async function readTimelineEntries(actionId) {
  const { getTimelineItems } = await getTimelineStore();
  return getTimelineItems({ execution_id: actionId });
}
