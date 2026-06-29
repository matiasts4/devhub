/**
 * Centralized server-side telemetry for Zed.
 *
 * Persists events to the local SQLite DB (devhub.db) so metrics survive
 * page refreshes and are queryable across users/sessions.
 */

import crypto from 'node:crypto';
import { getDb } from '@/lib/db/shared.js';

/**
 * @typedef {object} TelemetryEvent
 * @property {string} eventType
 * @property {string} [userId]
 * @property {string} [sessionId]
 * @property {string} [messageId]
 * @property {object} [payload]
 * @property {string} [source]
 */

/**
 * Persist a Zed telemetry event.
 *
 * @param {TelemetryEvent} params
 * @returns {{ id: string }}
 */
export function recordZedTelemetryEvent(dbOrEvent, maybeEvent) {
  const hasDb = dbOrEvent && typeof dbOrEvent.prepare === 'function';
  const db = hasDb ? dbOrEvent : getDb();
  const {
    eventType,
    userId,
    sessionId,
    messageId,
    payload,
    source = 'web',
  } = hasDb ? maybeEvent : dbOrEvent;

  if (!eventType || typeof eventType !== 'string') {
    throw new Error('eventType is required');
  }

  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO zed_telemetry_events
      (id, event_type, user_id, session_id, message_id, payload_json, source)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    eventType,
    userId || null,
    sessionId || null,
    messageId || null,
    payload ? JSON.stringify(payload) : null,
    source || 'web'
  );

  return { id };
}

/**
 * Return an aggregated summary of telemetry events.
 *
 * @param {object} [options]
 * @param {string} [options.userId]
 * @param {string} [options.since] ISO timestamp
 * @param {number} [options.limit]
 * @returns {{ total: number, byType: Record<string, number>, recent: Array<object> }}
 */
export function getZedTelemetrySummary(dbOrOptions, maybeOptions) {
  const hasDb = dbOrOptions && typeof dbOrOptions.prepare === 'function';
  const db = hasDb ? dbOrOptions : getDb();
  const { userId, since, limit = 100 } = hasDb ? maybeOptions || {} : dbOrOptions || {};

  const conditions = [];
  const params = [];

  if (userId) {
    conditions.push('user_id = ?');
    params.push(userId);
  }
  if (since) {
    conditions.push('created_at >= ?');
    params.push(since);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const totalRow = db
    .prepare(`SELECT COUNT(*) as count FROM zed_telemetry_events ${whereClause}`)
    .get(...params);

  const typeRows = db
    .prepare(
      `SELECT event_type, COUNT(*) as count FROM zed_telemetry_events ${whereClause} GROUP BY event_type`
    )
    .all(...params);

  const recentRows = db
    .prepare(`SELECT * FROM zed_telemetry_events ${whereClause} ORDER BY created_at DESC LIMIT ?`)
    .all(...params, limit);

  const byType = {};
  for (const row of typeRows) {
    byType[row.event_type] = row.count;
  }

  return {
    total: totalRow.count,
    byType,
    recent: recentRows.map((row) => ({
      ...row,
      payload: row.payload_json ? JSON.parse(row.payload_json) : null,
    })),
  };
}

/**
 * Delete telemetry events older than a given cutoff.
 *
 * @param {string} before ISO timestamp
 * @returns {{ deleted: number }}
 */
export function pruneZedTelemetry(dbOrBefore, maybeBefore) {
  const hasDb = dbOrBefore && typeof dbOrBefore.prepare === 'function';
  const db = hasDb ? dbOrBefore : getDb();
  const before = hasDb ? maybeBefore : dbOrBefore;
  const result = db.prepare('DELETE FROM zed_telemetry_events WHERE created_at < ?').run(before);
  return { deleted: result.changes };
}
