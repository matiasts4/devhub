/**
 * timelineStore.js — database operations for operator_timeline
 *
 * All SQL against the operator_timeline table is centralized here.
 * Exported functions follow the authority rules from D-1:
 *   - sequence is server-assigned (or accepted as-is)
 *   - authority is always 'primary' (server-set)
 *   - occurred_at is always server clock
 *   - idempotency key is item_id within a 5-second dedup window (D-4 / OET-4)
 */

const { getDb } = require('@/lib/db/localDb.js');
const { applyRedactionLevel } = require('./timelineRedaction.js');

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

/** Return the next sequence number for an execution_id (D-2: server-assigned). */
function _nextSequence(db, executionId) {
  const row = db
    .prepare('SELECT COALESCE(MAX(sequence), 0) + 1 AS seq FROM operator_timeline WHERE execution_id = ?')
    .get(executionId);
  return row.seq;
}

/**
 * Normalise a raw row to OperatorTimelineItem shape (OET-1).
 * Also computes `authority` — always 'primary' since rows only exist in SQLite.
 */
function _rowToItem(row) {
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
    actor: {
      type: row.actor_type,
      id: row.actor_id,
      role: row.actor_role,
    },
    stage: row.stage,
    status: row.status,
    tool: row.tool_name || null,
    params: row.params ? JSON.parse(row.params) : null,
    evidence_refs: row.evidence_refs ? JSON.parse(row.evidence_refs) : [],
    redaction_level: row.redaction_level,
    occurred_at: row.occurred_at,
    authority: row.authority, // always 'primary' in practice
    next_step_hint: row.next_step_hint || null,
    error,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Insert a new timeline item.
 *
 * Server-side assignments (D-1, D-3):
 *   - item_id: UUID v4 generated if not supplied
 *   - sequence: server-assigned (or accepted as client-supplied)
 *   - authority: always 'primary'
 *   - occurred_at: server clock (never from client)
 *
 * Idempotency (D-4 / OET-4): dedup by item_id within 5-second window.
 *
 * @param {object} item - Timeline item fields from the client
 * @returns {{ row: OperatorTimelineItem, isDuplicate: boolean, statusCode: 200|201 }}
 */
function insertTimelineItem(item) {
  const db = getDb();

  const itemId = item.item_id || crypto.randomUUID();
  const occurredAt = new Date().toISOString();

  // 1. Idempotency check — 5-second window (D-4)
  const existing = db
    .prepare(
      `SELECT * FROM operator_timeline
       WHERE item_id = ? AND datetime(occurred_at) > datetime('now', '-5 seconds')
       LIMIT 1`
    )
    .get(itemId);

  if (existing) {
    return { row: _rowToItem(existing), isDuplicate: true, statusCode: 200 };
  }

  // 2. Server-assign sequence (D-2)
  const sequence =
    item.sequence != null ? item.sequence : _nextSequence(db, item.execution_id);

  // 3. Process params through redaction layer (D-2, OET-5)
  const storedParams = applyRedactionLevel(item.params, item.redaction_level || 'none');
  const storedNextStepHint =
    item.redaction_level === 'full' ? null : (item.next_step_hint || null);

  // 4. Clear next_step_hint when redaction_level === 'full' (D-2)
  const nextStepHint =
    item.redaction_level === 'full' ? null : (item.next_step_hint || null);

  // 5. Build error fields
  const errorCode = item.error?.code || null;
  const errorMessage = item.error?.message || null;
  const errorRecoverable = item.error?.recoverable != null ? (item.error.recoverable ? 1 : 0) : null;

  // 6. Insert
  db.prepare(
    `INSERT INTO operator_timeline (
       item_id, execution_id, correlation_id, sequence,
       actor_type, actor_id, actor_role,
       stage, status,
       tool_name, params, evidence_refs, redaction_level,
       occurred_at, authority, next_step_hint,
       error_code, error_message, error_recoverable
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    itemId,
    item.execution_id,
    item.correlation_id || '',
    sequence,
    item.actor.type,
    item.actor.id,
    item.actor.role,
    item.stage,
    item.status,
    item.tool || null,
    storedParams,
    JSON.stringify(Array.isArray(item.evidence_refs) ? item.evidence_refs : []),
    item.redaction_level || 'none',
    occurredAt,
    'primary', // D-1: authority is always server-assigned
    storedNextStepHint,
    errorCode,
    errorMessage,
    errorRecoverable
  );

  const row = db.prepare('SELECT * FROM operator_timeline WHERE item_id = ? LIMIT 1').get(itemId);
  return { row: _rowToItem(row), isDuplicate: false, statusCode: 201 };
}

/**
 * Fetch timeline items with filters.
 *
 * @param {{ execution_id?: string, actor_id?: string, stage?: string[], status?: string[], since?: string, limit?: number }} filters
 * @returns {OperatorTimelineItem[]} ordered occurred_at ASC, sequence ASC (D-3)
 */
function getTimelineItems(filters = {}) {
  const db = getDb();
  const conditions = ['1=1'];
  const args = [];

  if (filters.execution_id) {
    conditions.push('execution_id = ?');
    args.push(filters.execution_id);
  }
  if (filters.actor_id) {
    conditions.push('actor_id = ?');
    args.push(filters.actor_id);
  }
  if (filters.stage && filters.stage.length > 0) {
    conditions.push(`stage IN (${filters.stage.map(() => '?').join(', ')})`);
    args.push(...filters.stage);
  }
  if (filters.status && filters.status.length > 0) {
    conditions.push(`status IN (${filters.status.map(() => '?').join(', ')})`);
    args.push(...filters.status);
  }
  if (filters.since) {
    conditions.push('occurred_at > ?');
    args.push(filters.since);
  }

  const limit = Math.min(Number(filters.limit) || 50, 200);
  conditions.push('1=1'); // no-op placeholder for clean interpolation
  conditions.pop(); // remove the no-op

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = db
    .prepare(
      `SELECT * FROM operator_timeline ${where} ORDER BY occurred_at ASC, sequence ASC LIMIT ?`
    )
    .all(...args, limit);

  return rows.map(_rowToItem);
}

/**
 * Compute ExecutionSummary[] for one or many execution_ids.
 * Derived at read time — not stored (D-3).
 *
 * @param {{ execution_id?: string, actor_id?: string, since?: string, limit?: number }} filters
 * @returns {ExecutionSummary[]} ordered last_item_at DESC
 */
function getExecutionRollup(filters = {}) {
  const db = getDb();
  const conditions = ['1=1'];
  const args = [];

  if (filters.execution_id) {
    conditions.push('execution_id = ?');
    args.push(filters.execution_id);
  }
  if (filters.actor_id) {
    conditions.push('actor_id = ?');
    args.push(filters.actor_id);
  }
  if (filters.since) {
    conditions.push('occurred_at > ?');
    args.push(filters.since);
  }

  const limit = Math.min(Number(filters.limit) || 50, 200);

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = db
    .prepare(
      `SELECT
         execution_id,
         MAX(correlation_id)                                                    AS correlation_id,
         MAX(actor_type || ':' || actor_id || ':' || COALESCE(actor_role, '')) AS actor,
         MAX(status)                                                            AS current_status,
         MAX(CASE WHEN status IN ('completed','failed','rolled_back')
                  THEN status END)                                             AS terminal_status,
         COUNT(*)                                                               AS item_count,
         MAX(occurred_at)                                                      AS last_item_at,
         MAX(CASE WHEN stage = 'deferred' THEN 1 END)                          AS pending_confirmation
       FROM operator_timeline
       ${where}
       GROUP BY execution_id
       ORDER BY last_item_at DESC
       LIMIT ?`
    )
    .all(...args, limit);

  return rows.map((row) => {
    const parts = (row.actor || '').split(':');
    const [actor_type, actor_id, actor_role] = parts;
    return {
      execution_id: row.execution_id,
      correlation_id: row.correlation_id || '',
      actor: { type: actor_type || 'operator', id: actor_id || '', role: actor_role || '' },
      current_status: row.current_status || 'requested',
      terminal_status: row.terminal_status || null,
      item_count: row.item_count || 0,
      last_item_at: row.last_item_at || null,
      pending_confirmation: row.pending_confirmation === 1,
    };
  });
}

/**
 * Return the highest confirmed (authority = 'primary') sequence for an execution_id.
 * Used as the durable watermark in SSE (D-5).
 *
 * @param {string} executionId
 * @returns {number}
 */
function getLastDurableSequence(executionId) {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT MAX(sequence) AS seq FROM operator_timeline
       WHERE execution_id = ? AND authority = 'primary'`
    )
    .get(executionId);
  return row?.seq || 0;
}

module.exports = {
  insertTimelineItem,
  getTimelineItems,
  getExecutionRollup,
  getLastDurableSequence,
};