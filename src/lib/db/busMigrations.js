/**
 * T-001 (GREEN) — busMigrations module: applies migration 002 (agent comms bus).
 *
 * Public API:
 *   - ensureAgentCommsBusSchema(db): idempotent. Creates team_chat, team_events,
 *     team_inbox; adds presence_context column to agent_presence; creates 8 indexes.
 *   - applyPragmasForBus(db): sets journal_mode=WAL and busy_timeout=5000 on the
 *     given connection (per REQ-BUS-1: same connection that performs the writes).
 *
 * The migration SQL mirrors data/migrations/002_agent_comms_bus.sql. Tests do not
 * need to load the file — the SQL is embedded so test environments without
 * data/migrations/ can still execute it.
 */

'use strict';

const MIGRATION_002_SQL = `
  CREATE TABLE IF NOT EXISTS team_chat (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mission_id TEXT NOT NULL,
    from_role TEXT NOT NULL,
    to_role TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('chat', 'report', 'alert', 'ack')),
    body TEXT NOT NULL,
    body_hash TEXT NOT NULL,
    ts TEXT NOT NULL DEFAULT (datetime('now')),
    client_event_id TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_team_chat_mission_ts ON team_chat(mission_id, ts);
  CREATE INDEX IF NOT EXISTS idx_team_chat_to_role_ts ON team_chat(to_role, ts);
  CREATE UNIQUE INDEX IF NOT EXISTS uq_team_chat_client_event
    ON team_chat(mission_id, client_event_id)
    WHERE client_event_id IS NOT NULL;

  CREATE TABLE IF NOT EXISTS team_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mission_id TEXT NOT NULL,
    source_role TEXT NOT NULL,
    kind TEXT NOT NULL,
    dedupe_key TEXT NOT NULL,
    payload_json TEXT,
    ts TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(mission_id, dedupe_key)
  );
  CREATE INDEX IF NOT EXISTS idx_team_events_mission_ts ON team_events(mission_id, ts);
  CREATE INDEX IF NOT EXISTS idx_team_events_source_role_ts ON team_events(source_role, ts);

  CREATE TABLE IF NOT EXISTS team_inbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mission_id TEXT NOT NULL,
    to_role TEXT NOT NULL,
    from_role TEXT NOT NULL,
    body TEXT NOT NULL,
    body_hash TEXT NOT NULL,
    client_event_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    consumed_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_team_inbox_mission_to_consumed
    ON team_inbox(mission_id, to_role, consumed_at);
  CREATE INDEX IF NOT EXISTS idx_team_inbox_mission_ts
    ON team_inbox(mission_id, created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_agent_presence_context
    ON agent_presence(presence_context);
`;

/**
 * Idempotent migration applier. Safe to call on every boot.
 * @param {import('better-sqlite3').Database} db
 */
function ensureAgentCommsBusSchema(db) {
  // Add presence_context column to existing agent_presence (idempotent).
  // ALTER TABLE raises "duplicate column name" if already present — catch and ignore.
  try {
    db.exec('ALTER TABLE agent_presence ADD COLUMN presence_context TEXT');
  } catch (e) {
    if (!String(e.message).includes('duplicate column name')) {
      throw e;
    }
  }
  // Create tables + indexes (all IF NOT EXISTS / IF NOT EXISTS).
  db.exec(MIGRATION_002_SQL);
}

/**
 * Apply PRAGMAs on the same connection that will perform writes.
 * Per REQ-BUS-1, journal_mode=WAL and busy_timeout=5000 MUST be set on the writer
 * connection to avoid SQLITE_BUSY under multi-worker contention.
 * @param {import('better-sqlite3').Database} db
 */
function applyPragmasForBus(db) {
  if (typeof db.pragma === 'function') {
    db.pragma('journal_mode = WAL');
    db.pragma('busy_timeout = 5000');
  }
}

module.exports = {
  ensureAgentCommsBusSchema,
  applyPragmasForBus,
  MIGRATION_002_SQL,
};
