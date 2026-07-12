/**
 * Agent Event operations — emit, query, dedup for the agent_events table.
 *
 * EVT-2 through EVT-5: structured event logging with idempotency.
 */

const VALID_EVENT_TYPES = [
  'agent_booted',
  'agent_shutdown',
  'workspace_orphaned',
  'quota_blocked',
  'supervisor_action',
  'mission_joined',
  'mission_left',
  'task_completed',
  'handoff_ready',
  'status_update',
];

const DIRECTOR_FEED_EVENT_TYPES = new Set([
  'task_completed',
  'handoff_ready',
  'agent_booted',
  'agent_shutdown',
  'mission_joined',
  'mission_left',
  'supervisor_action',
]);
// Only events that are meaningless outside a mission require mission_id.
// Lifecycle/enforcement events (agent_booted, supervisor_action, ...) can occur
// with no mission (e.g. supervisor daemon enforcing a lease on a personal task);
// they just won't show up in any mission's director feed.
const MISSION_REQUIRED_EVENT_TYPES = new Set([
  'task_completed',
  'handoff_ready',
  'mission_joined',
  'mission_left',
]);
const TASK_CONTEXT_REQUIRED_EVENT_TYPES = new Set(['task_completed', 'handoff_ready']);
const DIRECTOR_FEED_DELIVERY_STATUSES = new Set(['pending', 'sent', 'failed', 'binding_missing']);

function buildValidationError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function normalizeOptionalString(value) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function pickLinkedValue(...values) {
  for (const value of values) {
    const normalized = normalizeOptionalString(value);
    if (normalized) return normalized;
  }
  return null;
}

function normalizeDirectorFeedPayload(event) {
  const payload =
    event.payload && typeof event.payload === 'object' && !Array.isArray(event.payload)
      ? { ...event.payload }
      : {};
  const missionId = normalizeOptionalString(event.mission_id);
  if (!missionId && MISSION_REQUIRED_EVENT_TYPES.has(event.event_type)) {
    throw buildValidationError(
      `${event.event_type} requires mission_id for durable director feed.`
    );
  }

  const relatedTaskId = pickLinkedValue(payload.related_task_id, payload.task_id);
  if (!relatedTaskId && TASK_CONTEXT_REQUIRED_EVENT_TYPES.has(event.event_type)) {
    throw buildValidationError(
      `${event.event_type} requires task context (related_task_id or task_id).`
    );
  }

  const deliveryStatus = normalizeOptionalString(payload.delivery_status);
  if (deliveryStatus && !DIRECTOR_FEED_DELIVERY_STATUSES.has(deliveryStatus)) {
    throw buildValidationError(
      `${event.event_type} has invalid delivery_status: ${deliveryStatus}.`
    );
  }

  return {
    ...payload,
    related_task_id: relatedTaskId,
    related_workspace_id: pickLinkedValue(
      payload.related_workspace_id,
      payload.workspace_id,
      event.workspace_id
    ),
    related_run_id: pickLinkedValue(payload.related_run_id, payload.run_id),
    related_artifact_id: pickLinkedValue(payload.related_artifact_id, payload.artifact_id),
    related_approval_checkpoint_key: pickLinkedValue(
      payload.related_approval_checkpoint_key,
      payload.approval_checkpoint_key
    ),
    delivery_status: deliveryStatus,
    summary: pickLinkedValue(payload.summary, payload.status_summary, payload.body_summary),
    next_action: pickLinkedValue(payload.next_action),
  };
}

function normalizeEventForPersistence(event) {
  const normalized = {
    ...event,
    mission_id: normalizeOptionalString(event.mission_id),
    workspace_id: normalizeOptionalString(event.workspace_id),
  };

  if (DIRECTOR_FEED_EVENT_TYPES.has(event.event_type)) {
    normalized.payload = normalizeDirectorFeedPayload(normalized);
    normalized.workspace_id =
      normalized.workspace_id || normalized.payload.related_workspace_id || null;
    return normalized;
  }

  normalized.payload = event.payload ? event.payload : null;
  return normalized;
}

/**
 * Emit an agent event into the agent_events table.
 *
 * @param {Database} db - better-sqlite3 database handle
 * @param {{ agent_id: string, event_type: string, workspace_id?: string, payload?: object, mission_id?: string, client_event_id?: string }} event
 * @returns {{ id: string, status: number }} New event ID with status 201, or existing ID with status 200 on dedup
 * @throws {Error} With status=400 for unknown event_type
 */
function emitAgentEvent(db, event) {
  if (!db) throw new Error('Database handle requerido para emitAgentEvent.');
  if (!event.agent_id) throw new Error('agent_id es requerido para emitAgentEvent.');
  if (!event.event_type) throw new Error('event_type es requerido para emitAgentEvent.');

  if (!VALID_EVENT_TYPES.includes(event.event_type)) {
    const err = new Error(
      `Invalid event_type: ${event.event_type}. Must be one of: ${VALID_EVENT_TYPES.join(', ')}`
    );
    err.status = 400;
    throw err;
  }

  const normalizedEvent = normalizeEventForPersistence(event);

  // Dedup: if client_event_id provided, check for recent duplicate within 5s window
  if (normalizedEvent.client_event_id) {
    const existing = db
      .prepare(
        `SELECT id FROM agent_events WHERE client_event_id = ? AND created_at > datetime('now', '-5 seconds') LIMIT 1`
      )
      .get(normalizedEvent.client_event_id);

    if (existing) {
      return { id: existing.id, status: 200, payload: normalizedEvent.payload };
    }
  }

  const payloadJson = normalizedEvent.payload ? JSON.stringify(normalizedEvent.payload) : null;

  const result = db
    .prepare(
      `INSERT INTO agent_events (agent_id, workspace_id, event_type, payload_json, mission_id, client_event_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
    )
    .run(
      normalizedEvent.agent_id,
      normalizedEvent.workspace_id ?? null,
      normalizedEvent.event_type,
      payloadJson,
      normalizedEvent.mission_id ?? null,
      normalizedEvent.client_event_id ?? null
    );

  const id = result.lastInsertRowid;
  return { id, status: 201, payload: normalizedEvent.payload };
}

/**
 * Query agent events with optional filters.
 *
 * @param {Database} db - better-sqlite3 database handle
 * @param {{ agent_id?: string, type?: string, since?: string, limit?: number }} filters
 * @returns {Array<object>} Filtered events ordered by created_at DESC, capped at 100
 */
function queryAgentEvents(db, filters = {}) {
  if (!db) throw new Error('Database handle requerido para queryAgentEvents.');

  const clauses = [];
  const params = [];

  if (filters.agent_id) {
    clauses.push('agent_id = ?');
    params.push(filters.agent_id);
  }
  if (filters.type) {
    clauses.push('event_type = ?');
    params.push(filters.type);
  }
  if (filters.since) {
    clauses.push('created_at > ?');
    params.push(filters.since);
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const limit = Math.min(filters.limit ?? 100, 100);

  return db
    .prepare(`SELECT * FROM agent_events ${where} ORDER BY created_at DESC LIMIT ?`)
    .all(...params, limit);
}

export { emitAgentEvent, queryAgentEvents, VALID_EVENT_TYPES, normalizeEventForPersistence };
