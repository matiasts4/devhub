-- Migration 002: agent_comms_bus
-- Adds 3 new tables (team_chat, team_events, team_inbox) and 1 column (presence_context)
-- to the existing agent_presence table. 8 net-new indexes. Idempotent.
--
-- The producer of this migration is src/lib/db/busMigrations.js, which embeds the
-- equivalent of this SQL (so test environments without data/migrations/ can still
-- run the schema). The file is the audit record and is what the rollback plan
-- references.

-- === team_chat: thin direct-write store for inter-agent chat/report/alert/ack ===
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

-- === team_events: lifecycle event log with content-addressed dedupe ===
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

-- === team_inbox: durable director-to-worker delivery (consume-once via consumed_at) ===
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

-- === agent_presence: ADOPTED — only add presence_context column + 1 index ===
-- Idempotent ALTER is handled in busMigrations.js (try/catch on duplicate column).
