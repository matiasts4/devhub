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
];

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

  // Dedup: if client_event_id provided, check for recent duplicate within 5s window
  if (event.client_event_id) {
    const existing = db
      .prepare(
        `SELECT id FROM agent_events WHERE client_event_id = ? AND created_at > datetime('now', '-5 seconds') LIMIT 1`
      )
      .get(event.client_event_id);

    if (existing) {
      return { id: existing.id, status: 200 };
    }
  }

  const payloadJson = event.payload ? JSON.stringify(event.payload) : null;

  const result = db
    .prepare(
      `INSERT INTO agent_events (agent_id, workspace_id, event_type, payload_json, mission_id, client_event_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
    )
    .run(
      event.agent_id,
      event.workspace_id ?? null,
      event.event_type,
      payloadJson,
      event.mission_id ?? null,
      event.client_event_id ?? null
    );

  const id = result.lastInsertRowid;
  return { id, status: 201 };
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

export { emitAgentEvent, queryAgentEvents, VALID_EVENT_TYPES };
