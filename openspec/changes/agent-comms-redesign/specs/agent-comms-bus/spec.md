# Spec: agent-comms-bus

## Type: NEW

Durable SQLite bus for inter-agent communication with JSONL projection consumed by director tmux, workers, and CLI from a single source of truth.

## Purpose

Replace the broken inter-agent comms path (HTTP+HMAC `_devhub_tell_director` + worker `echo` to a shared log the Director never reads) with a durable bus where writes are atomic, reads are consistent, and consumers never disagree on what was said. The bus stores chat messages, lifecycle events, durable director-to-worker inbox rows, and presence state. SQLite `AFTER INSERT` triggers project new rows into JSONL files under `/tmp/devhub-mission-<mission_id>/` so the Director's `tail -F` consumer sees writes in real time without polling.

## Requirements

### REQ-BUS-1: Four Tables in Migration 002

**Priority**: P0 | **Status**: approved

The system MUST create migration `data/migrations/002_agent_comms_bus.sql` that defines the bus schema. The migration MUST be idempotent (`CREATE TABLE IF NOT EXISTS`, `CREATE TRIGGER IF NOT EXISTS`) and additive only — no `DROP TABLE` or `ALTER TABLE DROP COLUMN` statements. The migration MUST enable SQLite `journal_mode=WAL` and set `busy_timeout=5000` via `PRAGMA` statements on the same connection that performs the writes.

#### Scenario: BUS-S1 — Migration runs cleanly on a fresh database

- **Given** `data/devhub.db` does not exist
- **When** the application starts and the migration runner executes
- **Then** migration `002_agent_comms_bus.sql` creates `team_chat`, `team_events`, `team_inbox` tables
- **AND** adds the `presence_context` column to the existing `agent_presence` table
- **AND** creates all required indexes and triggers
- **AND** the SQLite journal mode is `wal` and `busy_timeout` is `5000`

#### Scenario: BUS-S2 — Re-running the migration is a no-op

- **Given** migration 002 has already been applied
- **When** the migration runner executes again
- **Then** no `table already exists` errors are raised
- **AND** no rows are duplicated
- **AND** all triggers remain functional

### REQ-BUS-2: `team_chat` Table

**Priority**: P0 | **Status**: approved

The system MUST provide a `team_chat` table with columns: `id INTEGER PRIMARY KEY AUTOINCREMENT`, `mission_id TEXT NOT NULL`, `from_role TEXT NOT NULL`, `to_role TEXT NOT NULL CHECK (to_role IN ('director','worker','auditor','all') OR to_role LIKE 'role:%')`, `kind TEXT NOT NULL CHECK (kind IN ('chat','report','alert','ack'))`, `body TEXT NOT NULL`, `body_hash TEXT NOT NULL`, `ts TEXT NOT NULL DEFAULT (datetime('now'))`, `client_event_id TEXT`. The system MUST create indexes on `(mission_id, ts)`, `(to_role, ts)`, and a UNIQUE index on `(mission_id, client_event_id) WHERE client_event_id IS NOT NULL`.

#### Scenario: BUS-S3 — A chat row is inserted

- **Given** the wrapper runs `_devhub_chat "hello" --to director`
- **When** the helper executes the INSERT
- **Then** a row exists in `team_chat` with `from_role` from `DEVHUB_ROLE`, `to_role='director'`, `kind='chat'`, a SHA-256 `body_hash`, and a `client_event_id` of the form `chat-<uuid>` (when not provided)
- **AND** the row's `ts` is the current UTC timestamp in ISO 8601

#### Scenario: BUS-S4 — Duplicate `client_event_id` is rejected

- **Given** a row already exists with `mission_id='m1'`, `client_event_id='chat-abc'`
- **When** the wrapper retries the same write after a transient SQLite lock
- **Then** the UNIQUE index raises a constraint error
- **AND** the helper treats this as a successful no-op (idempotent retry)

### REQ-BUS-3: `team_events` Table

**Priority**: P0 | **Status**: approved

The system MUST provide a `team_events` table with columns: `id INTEGER PRIMARY KEY AUTOINCREMENT`, `mission_id TEXT NOT NULL`, `source_role TEXT NOT NULL`, `kind TEXT NOT NULL`, `payload_json TEXT`, `ts TEXT NOT NULL DEFAULT (datetime('now'))`, `dedupe_key TEXT NOT NULL`. The system MUST create a UNIQUE index on `(ts, source_role, dedupe_key)` and a non-unique index on `(mission_id, ts)`.

#### Scenario: BUS-S5 — Event dedupe on restart

- **Given** `_devhub_event task_completed '{"task":"X"}'` is called and the row is inserted
- **When** the same helper is called again after restart with the same `ts`, `source_role`, and `dedupe_key`
- **Then** no new row is inserted
- **AND** the helper exits with code 0 (idempotent)

### REQ-BUS-4: `team_inbox` Table (Director → Worker)

**Priority**: P0 | **Status**: approved

The system MUST provide a `team_inbox` table with columns: `id INTEGER PRIMARY KEY AUTOINCREMENT`, `mission_id TEXT NOT NULL`, `from_role TEXT NOT NULL`, `to_role TEXT NOT NULL`, `body TEXT NOT NULL`, `kind TEXT NOT NULL`, `created_at TEXT NOT NULL DEFAULT (datetime('now'))`, `delivered_at TEXT`, `consumed_at TEXT`. The system MUST create indexes on `(to_role, consumed_at)` and `(mission_id, created_at)`.

#### Scenario: BUS-S6 — Worker consumes inbox on bootstrap

- **Given** a row in `team_inbox` with `to_role='worker'`, `consumed_at IS NULL`
- **When** the worker bootstrap runs `_devhub_inbox_check`
- **Then** all undelivered rows for that `to_role` and `mission_id` are returned in `created_at` order
- **AND** each row's `consumed_at` is set to the current timestamp
- **AND** a second `_devhub_inbox_check` returns an empty result (consumed rows are excluded)

### REQ-BUS-5: `agent_presence` Extension (Adopted Table)

**Priority**: P0 | **Status**: approved

The system MUST adopt the existing `agent_presence` table (defined in `src/lib/db/schema.js`) without renaming columns. The migration MUST add a nullable `presence_context TEXT` column via `ALTER TABLE ADD COLUMN`. The system MUST accept a 5-state enum for the existing presence column: `idle`, `busy`, `waiting`, `done`, `failed` (mapped to the existing 7-state underlying enum: `online|busy|idle|waiting|offline|booting|crashed`).

#### Scenario: BUS-S7 — Presence context is stored

- **Given** a worker calls `_devhub_presence busy "writing report"`
- **When** the helper UPSERTs the row
- **Then** `agent_presence` for `(mission_id, role)` has `presence_context='writing report'`
- **AND** the mapped underlying state is `busy`
- **AND** the `last_heartbeat_at` is updated to the current timestamp

### REQ-BUS-6: JSONL Projection via Triggers

**Priority**: P0 | **Status**: approved

The system MUST create SQLite `AFTER INSERT` triggers that append one JSON line per new row to mission-scoped JSONL files. The path convention MUST be `/tmp/devhub-mission-<mission_id>/{chat,events,presence,inbox}.jsonl`. The directory MUST be created on first write if it does not exist. The trigger MUST serialize the row as compact JSON with at minimum: `id`, `ts`, `from_role` (or `source_role`), `to_role` (where applicable), `kind`, `body` (or `payload_json`), and `body_hash` (for chat).

#### Scenario: BUS-S8 — Insert projects to JSONL within 100ms

- **Given** `/tmp/devhub-mission-m1/` does not exist
- **When** `_devhub_chat "hi" --to director` is called
- **Then** within 100ms a line is appended to `/tmp/devhub-mission-m1/chat.jsonl`
- **AND** the line parses as JSON with `from_role`, `to_role='director'`, `kind='chat'`, `body='hi'`, and `ts`
- **AND** a `tail -F /tmp/devhub-mission-m1/chat.jsonl` consumer receives the line on the next read

#### Scenario: BUS-S9 — JSONL rotation on mission end

- **Given** mission `m1` has produced chat/events/presence JSONL files
- **When** a mission-end hook runs (CLI `devhub mission close m1` or a director-side completion)
- **Then** the four JSONL files are moved to `/tmp/devhub-mission-m1/archive/<UTC-timestamp>/{chat,events,presence,inbox}.jsonl`
- **AND** the live JSONL files are removed
- **AND** no trigger ever appends to the archived paths again

### REQ-BUS-7: Path Safety and Idempotency

**Priority**: P1 | **Status**: approved

The migration MUST validate that `mission_id` values used in path construction match `^[a-zA-Z0-9_-]{1,64}$` and reject any value containing `..`, `/`, or NUL. Trigger functions MUST use `INSERT OR IGNORE INTO <journal>(...)` so that re-firing on already-rotated files is a no-op.

#### Scenario: BUS-S10 — Path traversal in mission_id is rejected

- **Given** an attempt to insert with `mission_id='../etc'`
- **When** the trigger fires
- **Then** no file is written outside `/tmp/devhub-mission-*/`
- **AND** the row is still inserted in the source table (the trigger's `INSERT OR IGNORE` swallows the error)

## Scenarios Index

| ID      | Description              | Covers   |
| ------- | ------------------------ | -------- |
| BUS-S1  | Fresh database migration | (a), (b) |
| BUS-S2  | Idempotent re-migration  | rollback |
| BUS-S3  | Chat insert              | (a)      |
| BUS-S4  | Chat dedupe              | (a)      |
| BUS-S5  | Event dedupe             | (b), (e) |
| BUS-S6  | Inbox bootstrap consume  | (h)      |
| BUS-S7  | Presence context         | (g)      |
| BUS-S8  | JSONL projection latency | (a), (b) |
| BUS-S9  | JSONL rotation           | (i)      |
| BUS-S10 | Path traversal safety    | security |

## Out of Scope

- Multi-mission concurrent on the same `mission_id` (single-mission lock for now).
- `mission_messages` / `message_deliveries` migration (supervisor API path; coexisting).
- Renaming existing `agent_presence` columns.
