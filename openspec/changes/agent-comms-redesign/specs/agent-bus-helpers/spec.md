# Spec: agent-bus-helpers

## Type: NEW

Shell-level helper contract for agent processes to write to the agent-comms-bus directly via `better-sqlite3` (no HTTP, no HMAC). Helpers are inlined into `agentLaunchWrapper.js` and exposed as bash functions to every launched agent.

## Purpose

Eliminate the brittle HTTP+HMAC + `echo`-to-shared-log path that caused the `launch-e743667a` comms failure. The four helpers — `_devhub_chat`, `_devhub_event`, `_devhub_presence`, `_devhub_inbox_check` — read environment context (`DEVHUB_MISSION_ID`, `DEVHUB_ROLE`, `DEVHUB_LAUNCH_ID`, `DEVHUB_DB_PATH`) and write directly to the bus. Every helper MUST be idempotent under retry, return a documented exit code, and never block on a network call.

## Requirements

### REQ-HELPER-1: `_devhub_chat` — Chat Insert

**Priority**: P0 | **Status**: approved

The system MUST provide `_devhub_chat <body> --to <role>|all [--kind <kind>] [--message-file <path>] [--message-stdin]` that inserts a row into `team_chat`. The helper MUST read `DEVHUB_MISSION_ID`, `DEVHUB_ROLE`, and `DEVHUB_DB_PATH` from the environment. The `--to` argument MUST default to `all` if omitted. The `--kind` argument MUST default to `chat` and accept only `chat|report|alert|ack`. The body MUST be read from the first positional argument, or from `--message-file <path>`, or from stdin (`--message-stdin`), in that priority. The helper MUST compute a SHA-256 of the body and store it in `body_hash`. The helper MUST generate a `client_event_id` of the form `chat-<launch_id>-<8-hex>` when one is not supplied via `--client-event-id`.

#### Scenario: HELPER-S1 — Basic chat send reaches director

- **Given** worker with `DEVHUB_ROLE=worker`, `DEVHUB_MISSION_ID=m1`, `DEVHUB_LAUNCH_ID=l1`
- **When** it calls `_devhub_chat "task_done: X" --to director`
- **Then** a row exists in `team_chat` with `from_role='worker'`, `to_role='director'`, `kind='chat'`, `body='task_done: X'`
- **AND** within 100ms a line appears in `/tmp/devhub-mission-m1/chat.jsonl`
- **AND** the director's `tail -F` consumer receives the line within 2s total
- **AND** the helper exits with code 0

#### Scenario: HELPER-S2 — Body from file (multi-line)

- **Given** a file `/tmp/msg.txt` with a 4-line body
- **When** `_devhub_chat --to all --message-file /tmp/msg.txt` is called
- **Then** the full file contents (including newlines) become the `body` value
- **AND** the `body_hash` matches `sha256(contents of /tmp/msg.txt)`

#### Scenario: HELPER-S3 — Body from stdin

- **Given** `_devhub_chat --to director --message-stdin` is called
- **And** stdin is a heredoc of `report content`
- **When** the helper reads stdin
- **Then** `body='report content'` and the helper exits 0
- **AND** no trailing newline is appended

#### Scenario: HELPER-S4 — Invalid kind rejected

- **Given** `_devhub_chat "x" --to director --kind nonsense`
- **When** the helper validates the kind
- **Then** the helper exits with code 64 (usage error)
- **AND** stderr receives a one-line error listing valid kinds
- **AND** no row is inserted

### REQ-HELPER-2: `_devhub_event` — Lifecycle Event Insert

**Priority**: P0 | **Status**: approved

The system MUST provide `_devhub_event <kind> <payload>` that inserts a row into `team_events`. The `kind` MUST be a non-empty string. The `payload` MUST be a JSON object (or `{}` if the caller omits it). The helper MUST compute a `dedupe_key` as `sha256(kind || '\n' || canonical_json(payload))`.

#### Scenario: HELPER-S5 — Event insert with payload

- **Given** `_devhub_event task_completed '{"task":"X"}'`
- **When** the helper executes
- **Then** a row exists in `team_events` with `source_role=DEVHUB_ROLE`, `kind='task_completed'`, `payload_json='{"task":"X"}'`, and `dedupe_key=sha256("task_completed\n{\"task\":\"X\"}")`
- **AND** `/tmp/devhub-mission-<id>/events.jsonl` receives the JSON line

#### Scenario: HELPER-S6 — Dedupe on retry after restart

- **Given** a previous launch inserted event `E1` with `dedupe_key=K1` at `ts=T1`
- **When** the worker restarts and calls `_devhub_event` with the same kind and payload within the same second
- **Then** no new row is inserted (UNIQUE constraint on `(ts, source_role, dedupe_key)` blocks the duplicate)
- **AND** the helper exits 0 (treated as a successful retry, not an error)

#### Scenario: HELPER-S7 — Invalid JSON payload rejected

- **Given** `_devhub_event task_done "not-json{"`
- **When** the helper parses the payload
- **Then** the helper exits 65 (data error) with a stderr message
- **AND** no row is inserted

### REQ-HELPER-3: `_devhub_presence` — Presence UPSERT

**Priority**: P0 | **Status**: approved

The system MUST provide `_devhub_presence <state> [<context>]` that UPSERTs the worker's row in `agent_presence`. The `state` MUST be one of `idle|busy|waiting|done|failed` and MUST NOT block on heartbeat. The `context` (optional) MUST be stored in `presence_context`. The helper MUST update `last_heartbeat_at` to the current timestamp. The helper MUST be safe to call from any code path — including inside the heartbeat loop, since it must not deadlock with concurrent heartbeats.

#### Scenario: HELPER-S8 — Presence update does not block heartbeat

- **Given** the heartbeat loop is sending a request to the supervisor
- **When** a separate code path calls `_devhub_presence busy "writing"`
- **Then** the UPSERT completes within 50ms
- **AND** the heartbeat request that was in flight is not delayed
- **AND** the helper exits 0

#### Scenario: HELPER-S9 — Invalid state rejected

- **Given** `_devhub_presence zooming`
- **When** the helper validates
- **Then** exit code 64 with a one-line error
- **AND** no UPSERT is performed

### REQ-HELPER-4: `_devhub_inbox_check` — Bootstrap Re-Injection

**Priority**: P0 | **Status**: approved

The system MUST provide `_devhub_inbox_check` that returns all undelivered rows from `team_inbox` for the current `(mission_id, role)`. The helper MUST set `consumed_at` for each returned row in a single transaction. The output MUST be NDJSON (one JSON object per line) on stdout, suitable for the wrapper to re-inject into the agent's prompt.

#### Scenario: HELPER-S10 — Inbox check returns pending rows

- **Given** two rows in `team_inbox` with `to_role=DEVHUB_ROLE`, `consumed_at IS NULL`
- **When** the worker bootstrap calls `_devhub_inbox_check`
- **Then** stdout receives two NDJSON lines, one per row
- **AND** both rows now have `consumed_at` set
- **AND** the helper exits 0

#### Scenario: HELPER-S11 — Second call returns empty

- **Given** `_devhub_inbox_check` was called and consumed all rows
- **When** it is called again (e.g., on a retry)
- **Then** stdout is empty
- **AND** the helper exits 0
- **AND** no rows are re-marked as consumed (idempotent)

### REQ-HELPER-5: Return Codes and Error Handling

**Priority**: P0 | **Status**: approved

All helpers MUST exit with the following codes: `0` success, `64` usage error (bad args), `65` data error (bad JSON, bad enum), `66` no such table (migration not run), `73` cannot create (SQLite I/O error). On any non-zero exit, stderr MUST contain a single line of the form `devhub-helper: <helper>: <code>: <message>`. The wrapper MUST log these errors but MUST NOT crash the agent.

#### Scenario: HELPER-S12 — Migration not run

- **Given** migration 002 has not been applied (no `team_chat` table)
- **When** `_devhub_chat "x" --to director` is called
- **Then** the helper exits 66
- **AND** stderr contains `devhub-helper: chat: 66: no such table: team_chat`
- **AND** the agent process continues running

#### Scenario: HELPER-S13 — SQLite busy

- **Given** the database is locked by another writer for > 5s (busy_timeout)
- **When** `_devhub_event` is called
- **Then** the helper retries up to 3 times with 100ms backoff
- **AND** on final failure, exits 73
- **AND** stderr reports the busy timeout

### REQ-HELPER-6: Wrapper Integration

**Priority**: P0 | **Status**: approved

The four helpers MUST be defined inside the bash function `_devhub_setup_agent_env` in `src/lib/agentLaunchWrapper.js` (replacing the current `_devhub_tell_director` injection at lines 353-430 and the pending-deliveries loop at lines 284-351). Each helper MUST be available to every bash command the wrapper executes, including ones the launched agent runs. The helpers MUST source `DEVHUB_DB_PATH` from a single source — the wrapper computes it once at launch and exports it.

#### Scenario: HELPER-S14 — Helpers available in launched agent shell

- **Given** a worker process launched by the wrapper
- **When** the worker runs `bash -c '_devhub_chat hello --to director'`
- **Then** the helper resolves and the row is inserted
- **AND** `which _devhub_chat` returns the wrapper-defined function

## Scenarios Index

| ID         | Description                       | Covers       |
| ---------- | --------------------------------- | ------------ |
| HELPER-S1  | Basic chat send to director       | (a), (f)     |
| HELPER-S2  | Body from file                    | (a)          |
| HELPER-S3  | Body from stdin                   | (a)          |
| HELPER-S4  | Invalid kind                      | error states |
| HELPER-S5  | Event insert with payload         | (b)          |
| HELPER-S6  | Event dedupe on restart           | (b), (e)     |
| HELPER-S7  | Invalid JSON payload              | error states |
| HELPER-S8  | Presence does not block heartbeat | (g)          |
| HELPER-S9  | Invalid presence state            | error states |
| HELPER-S10 | Inbox check returns pending       | (h)          |
| HELPER-S11 | Second inbox call empty           | (h)          |
| HELPER-S12 | Migration missing                 | error states |
| HELPER-S13 | SQLite busy retry                 | error states |
| HELPER-S14 | Helpers available in agent shell  | integration  |
