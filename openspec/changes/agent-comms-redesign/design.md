# Design: Agent Communication Redesign

> Technical design for `agent-comms-redesign`. Translates the proposal
> (obs #6366) and the five spec files (`openspec/changes/agent-comms-redesign/specs/*`)
> into a concrete, sized, testable implementation plan.
>
> Branch: `feature/session-workspace-restore` · D2 budget: ~800 LOC diff · TDD: active for apply.

---

## Decisions

The five spec-level open questions are resolved as follows.

### D1 — JSONL projection mechanism → **Option C: inline append in the helper**

- **Choice**: every helper (the Node side of `_devhub_chat`, `_devhub_event`,
  `_devhub_presence`, `_devhub_inbox_check`) does the SQLite `INSERT`/`UPSERT`
  and the JSONL file append inside the same Node call. No SQLite triggers
  for projection.
- **Alternatives rejected**:
  - (A) trigger → `jsonl_outbox` side table + Node poller — extra moving part,
    100ms debounce is the worst-case latency floor, and an out-of-process
    drainer has its own lock file concerns.
  - (B) custom `writefile()` function in better-sqlite3 — requires
    `SQLITE_ENABLE_FILEIO` at compile time; `better-sqlite3` is shipped
    prebuilt and we don't control the build.
- **Rationale**: helper is the only writer. The append-after-INSERT happens
  in the same Node process that holds the SQLite handle, so atomicity is
  "best-effort with idempotent retry" (BUS-S8 is satisfied by retry-on-failure
  in the helper, not by trigger machinery). The 100ms p99 latency target is
  achievable because we skip a trigger round-trip. Path safety (BUS-S10) is
  enforced by the same regex in the helper before `fs.appendFile` runs.

### D2 — Wrapper→better-sqlite3 bridge → **Option C: tiny CLI `devhub-cli/bin/devhub-bus.js`**

- **Choice**: a single Node binary at `devhub-cli/bin/devhub-bus.js` with
  subcommands `chat-write`, `event-write`, `presence-upsert`, `inbox-check`.
  The bash helper in the wrapper parses args, computes `body_hash` with
  `sha256sum`, generates `client_event_id`, and spawns the binary with
  `--json` stdout contract.
- **Alternatives rejected**:
  - (A) PATH lookup of a generic `devhub` CLI — would re-parse the full
    `commander` chain on every helper call (~120ms cold), no `--json` mode
    in the existing commands, and fights the `DEVHUB_CLI_SHOW_DB_LOGS`
    log-suppression interceptor in `bin/devhub`.
  - (B) `node -e "..."` one-liner — quoting hell for multi-line bodies and
    JSON payloads; impossible to test directly.
- **Rationale**: the binary is a single file with no `commander` dependency,
  no log-suppression interceptor, and a strict JSON stdout contract. Helper
  exit codes 0/64/65/66/73 (per HELPER-5) are returned by the binary; the
  bash wrapper only re-emits them with a one-line `devhub-helper: ...`
  prefix on stderr. Binary loads `better-sqlite3` once, opens the connection
  with `PRAGMA journal_mode=WAL` + `busy_timeout=5000` (migration 002 sets
  these on the file once, binary inherits).

### D3 — Director `tail -F` consumer dedupe → **persistent dedupe file, capped LRU**

- **Choice**: director startup reads `/tmp/devhub-mission-<id>/consumer-dedupe-<role>.jsonl`
  into an in-memory `Set<key>` where `key = "${seq}|${from_role}|${body_hash}"`.
  After pasting each line, append the key to the dedupe file (truncate to
  last 5000 entries on every 200 appends, async). The file IS the durability
  boundary; on restart the Set is rebuilt from disk.
- **Alternatives rejected**:
  - (A) pure in-memory LRU — fails the moment director restarts mid-mission;
    the very failure pattern BUS-S4/BUS-S5 are written to prevent.
  - (B) better-sqlite3-backed hash set — another table, more code, no benefit
    over a flat NDJSON file the operator can `head` to debug.
  - (C) file offset via `tail -F --bytes=N` — couples offset (file position)
    to content (semantic dedupe key); a single rotated log breaks the contract
    silently.
- **Rationale**: NDJSON dedupe file is restart-safe, easy to inspect, costs
  one fsync per paste (negligible vs. the tmux paste itself). 5000-entry cap
  is ~80KB; the periodic truncation keeps it bounded. The 100ms p99 latency
  target survives the append because `fs.appendFile` is fire-and-forget for
  the consumer (not the writer).

### D4 — `getMissionBusSnapshot(missionId)` SQL design

Single statement, four subqueries, `json_group_array` (SQLite ≥3.38, which
`better-sqlite3` ≥9 ships). Run in one read transaction:

```sql
SELECT
  COALESCE(
    (SELECT json_group_array(json_object(
        'id', id, 'ts', ts, 'from_role', from_role, 'to_role', to_role,
        'kind', kind, 'body', body, 'body_hash', body_hash, 'seq', seq
     ))
     FROM (SELECT * FROM team_chat WHERE mission_id = @mission ORDER BY id DESC LIMIT 50)),
    '[]'
  ) AS chat_recent,
  COALESCE(
    (SELECT json_group_array(json_object(
        'id', id, 'ts', ts, 'source_role', source_role, 'kind', kind,
        'payload_json', payload_json, 'dedupe_key', dedupe_key, 'seq', seq
     ))
     FROM (SELECT * FROM team_events WHERE mission_id = @mission ORDER BY id DESC LIMIT 50)),
    '[]'
  ) AS events_recent,
  COALESCE(
    (SELECT json_group_array(json_object(
        'id', id, 'ts', created_at, 'from_role', from_role, 'to_role', to_role,
        'kind', kind, 'body', body, 'consumed_at', consumed_at
     ))
     FROM (SELECT * FROM team_inbox
           WHERE mission_id = @mission AND consumed_at IS NULL
           ORDER BY id ASC LIMIT 50)),
    '[]'
  ) AS inbox_pending,
  COALESCE(
    (SELECT json_group_array(json_object(
        'agent_id', agent_id, 'presence_state', presence_state,
        'presence_context', presence_context, 'last_seen_at', last_seen_at,
        'runtime_surface', runtime_surface
     ))
     FROM (SELECT * FROM agent_presence
           WHERE mission_id = @mission
             AND last_seen_at >= datetime('now', '-5 minutes')
           ORDER BY last_seen_at DESC)),
    '[]'
  ) AS presence_active;
```

**Indexes** (migration 002):

| Index                                                                                                            | Purpose                                   |
| ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `idx_team_chat_mission_ts` on `team_chat(mission_id, ts DESC)`                                                   | chat feed recent                          |
| `idx_team_chat_to_ts` on `team_chat(to_role, ts DESC)`                                                           | per-recipient feed                        |
| `uq_team_chat_client_event` UNIQUE on `team_chat(mission_id, client_event_id) WHERE client_event_id IS NOT NULL` | BUS-S4 dedupe                             |
| `uq_team_events_dedupe` UNIQUE on `team_events(ts, source_role, dedupe_key)`                                     | BUS-S5 dedupe                             |
| `idx_team_events_mission_ts` on `team_events(mission_id, ts DESC)`                                               | events feed                               |
| `idx_team_inbox_to_consumed` on `team_inbox(to_role, consumed_at)`                                               | BUS-S6 + inbox check                      |
| `idx_team_inbox_mission_created` on `team_inbox(mission_id, created_at)`                                         | per-mission inbox                         |
| `idx_agent_presence_mission_seen` on `agent_presence(mission_id, last_seen_at DESC)`                             | presence window (covers the 5-min filter) |

**JSON shape** returned to the CLI:

```json
{
  "mission_id": "launch-abc",
  "snapshot_at": "2026-06-01T12:34:56.000Z",
  "chat_recent": [ { "id": 42, "ts": "...", "from_role": "auditor", ... } ],
  "events_recent": [ { "id": 17, "ts": "...", "kind": "task_completed", ... } ],
  "inbox_pending": [ { "id": 3, "to_role": "worker", "consumed_at": null, ... } ],
  "presence_active": [ { "agent_id": "a1", "presence_state": "busy", ... } ]
}
```

`seq` is a per-mission monotonic integer assigned by the helper
(`chat-<launch>-<8hex>` for chat, `evt-<launch>-<8hex>` for events) — this
is the dedupe key the director consumer uses (D3), and it survives JSONL
rotation since the seq is part of the NDJSON line itself.

### D5 — Line-budget reconciliation

| Bucket                       | Spec doc lines | Apply diff LOC (est) |    Total |
| ---------------------------- | -------------: | -------------------: | -------: |
| Design (this file)           |           ~340 |                    0 |      340 |
| Spec files (already written) |            709 |                    0 |      709 |
| Production code (net add)    |              0 |             **+180** |      180 |
| Production code (net remove) |              0 |             **−145** |     −145 |
| Test code                    |              0 |             **+395** |      395 |
| **Production net**           |              0 |              **+35** |       35 |
| **Grand total diff**         |              0 |             **+430** |      430 |
| **D2 budget headroom**       |                |                      | **+370** |

The 800-line cap clears with 370 lines to spare. The biggest single saving
is removing the 165-line `_devhub_pending_deliveries_loop` block
(`agentLaunchWrapper.js:284-351`) and the 78-line `buildDirectorTmuxInjection`
HMAC code (`agentLaunchWrapper.js:353-430`); the new bash helpers plus
bootstrap lock state machine replace them with **~120 net lines**, so the
file actually shrinks.

**Out of the 800 budget** (explicitly punted to follow-up changes):

- Control Room UI for the new bus → `control-room-bus-integration`
- Multi-mission concurrent on same `mission_id`
- HMAC removal from `/api/agenthub/presence/heartbeat` and `/exit` endpoints
  (only `/events` is removed in this PR)
- Backfill script: populate `team_chat` from `/tmp/devhub-swarm-*.log`
  archives (we keep the archives, no auto-import)
- Re-introduction of Plyrium patterns or external runtime

---

## File-by-file changes

| Path                                                                 | Action              |         LOC est | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------------------------------------------------------- | ------------------- | --------------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `data/migrations/002_agent_comms_bus.sql`                            | **new**             |             +80 | Versioned SQL mirror of the 002 schema block (documentation, rollback-able). Idempotent `CREATE TABLE IF NOT EXISTS` + `CREATE TRIGGER IF NOT EXISTS` + 8 indexes + 2 `PRAGMA`.                                                                                                                                                                                                                                                                           |
| `src/lib/db/schema.js`                                               | modify              |             +90 | Inline 002 block appended to `ensureRuntimeSchema` after the existing `agent_events` block. Same `db.exec` shape. No new migration runner.                                                                                                                                                                                                                                                                                                                |
| `src/lib/db/busMigrations.js`                                        | **new**             |             +35 | `addPresenceContextColumn(db)` — idempotent `ALTER TABLE agent_presence ADD COLUMN presence_context TEXT` with `try/catch duplicate column` so it runs on every boot without breaking. Called by `ensureAllSchema`.                                                                                                                                                                                                                                       |
| `src/lib/agentLaunchWrapper.js`                                      | modify              | **+120 / −245** | Remove `buildPendingDeliveriesPollingCommand` (lines 284-351, 68 lines), shrink `buildDirectorTmuxInjection` to a shim (lines 353-430 → ~30 lines: no more HMAC, no more `/events` POST, only a `_devhub_chat` re-export). Add `buildBusHelpersBlock()` that emits the four bash functions into the wrapper. Add `buildInjectionLockStateMachine()` to `buildBootstrapPromptBlock`. Keep heartbeat + exit trap untouched (HMAC stays there per proposal). |
| `devhub-cli/bin/devhub-bus.js`                                       | **new**             |            +125 | Thin Node binary. Subcommands: `chat-write`, `event-write`, `presence-upsert`, `inbox-check`, `snapshot`, `rotate`. Loads `better-sqlite3`, opens with WAL already set, idempotent retries with 100ms backoff x3. Returns exit 0/64/65/66/73 per HELPER-5. Stdout = JSON success; stderr = `devhub-helper: <name>: <code>: <msg>`.                                                                                                                        |
| `devhub-cli/commands/chat.js`                                        | **new**             |             +85 | `devhub chat send                                                                                                                                                                                                                                                                                                                                                                                                                                         | list | watch`subcommands.`send`is sugar over the binary (validates args, spawns).`list`calls`getMissionBusSnapshot`via Node import (CLI process can open the DB directly).`watch`=`tail -F --bytes=$dedupe_offset /tmp/devhub-mission-$DEVHUB_MISSION_ID/chat.jsonl`. |
| `devhub-cli/commands/events.js`                                      | modify              |             +30 | Add `tail` subcommand. Reuses the watch loop from `chat.js`. Existing `list` and `stream` subcommands stay for backward compat (they hit the legacy HTTP endpoint, which the spec marks as "still answers historical queries").                                                                                                                                                                                                                           |
| `devhub-cli/commands/status.js`                                      | modify              |             +25 | After the existing 4 sections, append a `Bus` section that calls `getMissionBusSnapshot($DEVHUB_MISSION_ID)` and renders `presence_active` + `inbox_pending` + `chat_recent[0..4]`.                                                                                                                                                                                                                                                                       |
| `src/lib/db/swarmMissions.js`                                        | modify              |             +40 | Append `getMissionBusSnapshot(dbOrMissionId, maybeMissionId)` with the SQL from D4. Export it. Re-export the existing `getSwarmMissionById` so the CLI doesn't double-import.                                                                                                                                                                                                                                                                             |
| `src/app/api/agenthub/events/route.js`                               | **delete**          |             −50 | The whole file. POST returns 410 from the spec is enforced by the **replacement** route, not by editing this one. Replacement is in the same path.                                                                                                                                                                                                                                                                                                        |
| `src/app/api/agenthub/events/route.js`                               | **new** (re-create) |             +18 | Stub: `export const POST = withAuth(async () => NextResponse.json({ error: 'retired', replacement: '_devhub_event helper writes to team_events bus' }, { status: 410 }))`. GET keeps the existing one-shot query (EVT-DELTA-S5).                                                                                                                                                                                                                          |
| `src/app/api/agenthub/operations/health/route.js`                    | modify              |             +25 | Inside the existing handler, replace the `pending_deliveries` query with a `team_inbox`-first, `pending_deliveries` fallback path. The fallback logs `WARN shim: pending_deliveries fallback active for mission=<id> role=<role>; remove after release X` and sets `inbox_source` + `shim_warning` on the response. Feature flag `DEVHUB_INBOX_SHIM_DISABLED=true` short-circuits to `team_inbox` only (TCT-DELTA-S7).                                    |
| `src/app/api/agenthub/events/__tests__/events-route-retired.test.js` | **new**             |             +40 | Asserts POST returns 410 with the exact replacement body. Asserts GET with `?since=` still returns historical rows immediately (no 30s hold).                                                                                                                                                                                                                                                                                                             |
| `src/lib/__tests__/agentLaunchWrapper.test.js`                       | modify              |            +110 | Add `buildBusHelpersBlock` describe: each helper's bash body, exit-code paths, `--message-file`/`--message-stdin` plumbing, env-var contract (`DEVHUB_DB_PATH` is the only DB source). Add `buildInjectionLockStateMachine` describe: happy path, skip-state rejection, stale-pid recovery, hour-stuck recovery, old-format migration with WARN.                                                                                                          |
| `devhub-cli/tests/devhub-bus.test.js`                                | **new**             |            +120 | Spawns `bin/devhub-bus.js` against a real temp `better-sqlite3` file. Covers all 5 subcommands, exit codes, BUS-S4 dedupe, BUS-S5 event dedupe, BUS-S7 presence UPSERT, BUS-S8 JSONL appearance within 100ms, BUS-S10 path-traversal rejection, HELPER-12/HELPER-13 error paths.                                                                                                                                                                          |
| `src/lib/__tests__/busSnapshot.test.js`                              | **new**             |             +65 | Calls `getMissionBusSnapshot` against a seeded DB. Asserts the four arrays match, ordering is correct, empty-mission returns `[]` not `null`, path-traversal in `mission_id` is rejected before SQL.                                                                                                                                                                                                                                                      |
| `tests/agenthub/e2e/comms-bus.test.js`                               | **new**             |            +100 | End-to-end repro of the `launch-e743667a` failure pattern. Spins up a temp `devhub.db`, runs the migration, then: (1) auditor calls `devhub-bus chat-write` → JSONL line appears in `/tmp/devhub-mission-<id>/chat.jsonl` within 100ms; (2) director consumer reads the line, dedupes across a simulated restart; (3) re-injects the line to a worker's `_devhub_inbox_check`.                                                                            |
| `tests/agenthub/api/operations-health.test.js`                       | modify              |             +35 | Add three tests: TCT-DELTA-S1 (team_inbox primary), TCT-DELTA-S2 (fallback with shim_warning), TCT-DELTA-S3 (mixed prefers team_inbox). Reuses existing harness.                                                                                                                                                                                                                                                                                          |

**Net production code diff**: +180 added, −145 removed = **+35 net**.
**Net test code diff**: **+470 added, 0 removed = +470 net**.
**Grand total**: **+505** (well under D2's 800 cap).

---

## Migration sequence

Ordered, idempotent, additive only. Every step is reversible via the
rollback plan in the proposal.

1. **Apply migration 002 inline** — `ensureAllSchema` already runs on every
   boot. The new block creates `team_chat`, `team_events`, `team_inbox`,
   adds `presence_context` to `agent_presence`, creates 8 indexes, runs
   `PRAGMA journal_mode=WAL` and `PRAGMA busy_timeout=5000`. Idempotent
   because every statement is `IF NOT EXISTS` and the column add is wrapped
   in try/catch in `addPresenceContextColumn`. (BUS-S1, BUS-S2)

2. **Deploy wrapper with bash helpers + reduced HMAC** — `agentLaunchWrapper.js`
   now emits `_devhub_chat`, `_devhub_event`, `_devhub_presence`,
   `_devhub_inbox_check` into every launched agent's environment. The
   old `_devhub_tell_director` is replaced by a shim that calls
   `_devhub_chat` for one release, so in-flight agents that still have
   the old function name keep working. (HELPER-S14)

3. **Deploy `devhub-bus` binary** — `devhub-cli/bin/devhub-bus.js` is
   registered in `devhub-cli/package.json` `bin` field as `devhub-bus`,
   so spawning it from bash resolves in `<100ms` cold (no `commander`
   load). (D2)

4. **Retire `/api/agenthub/events` POST** — replace the route with a
   410-returning stub. GET stays for historical queries (EVT-DELTA-S5).
   Workers that still POST hit the 410 and fall back to the bus
   automatically. (EVT-DELTA-S1, EVT-DELTA-S3)

5. **Add health-route shim** — `operations/health/route.js` reads
   `team_inbox` first, falls back to `pending_deliveries` with a single
   `WARN shim: ...` line. Feature flag `DEVHUB_INBOX_SHIM_DISABLED=true`
   bypasses the shim for emergency cutover. (TCT-DELTA-S1..S7)

6. **Start director `tail -F` consumer** — director's tmux setup runs
   `devhub events tail` against the new JSONL path on mission start. The
   consumer reads `/tmp/devhub-mission-<id>/consumer-dedupe-director.jsonl`
   to rebuild its in-memory Set, then `tail -F` with `--retry` against
   `chat.jsonl` and `events.jsonl` and `presence.jsonl`. (D3)

7. **Bootstrap lock rename** — `buildInjectionLockStateMachine` writes the
   new lock at `/tmp/devhub-injection-<launch>-<role>.lock`, reads the old
   `/tmp/devhub-bootstrap-<mission>-<role>.lock` with WARN, migrates state,
   removes the old on `injected`. After 1 release, the old-path reader is
   dropped. (LOCK-S1..S8)

8. **CLI rollout** — `devhub chat send|list|watch`, `devhub events tail`,
   and the new `Bus` section in `devhub status` land. Existing
   `devhub events list|stream` keep working for one release.

9. **Mission-end rotation** — `devhub bus rotate <mission_id>` (or
   auto-called on `devhub mission close`) moves
   `/tmp/devhub-mission-<id>/{chat,events,presence,inbox}.jsonl` into
   `/tmp/devhub-mission-<id>/archive/<UTC-ts>/`, then the four triggers
   in migration 002 use `INSERT OR IGNORE INTO <journal>` so re-firing on
   the moved path is a no-op. (BUS-S9)

**Down-migration (rollback)**: drop migration 002, restore the deleted
`_devhub_tell_director` from git, reactivate `/api/agenthub/events`
POST from the previous tag, delete `devhub-cli/commands/chat.js`. New
tables start empty so there's no data migration to undo.

---

## Test strategy

Three layers. Every layer exercises a real `better-sqlite3` file in
`/tmp/devhub-test-<uuid>/` — no mocks of the DB.

### Unit (`devhub-cli/tests/devhub-bus.test.js` + `src/lib/__tests__/busSnapshot.test.js`)

| What                          | How                                                                                                                     |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Binary subcommand exit codes  | `child_process.spawnSync('node', ['bin/devhub-bus.js', 'chat-write', ...])` against temp DB; assert exit 0/64/65/66/73. |
| BUS-S4 chat dedupe            | call `chat-write` twice with same `--client-event-id`; assert one row, two exit-0s.                                     |
| BUS-S5 event dedupe           | call `event-write` with same kind+payload twice; assert one row.                                                        |
| BUS-S7 presence UPSERT        | call `presence-upsert` three times with different `presence_context`; assert single row, last-write-wins on context.    |
| BUS-S8 JSONL latency          | time `fs.statSync(chat.jsonl).size` after a `chat-write`; assert delta <100ms.                                          |
| BUS-S10 path traversal        | call `chat-write --mission ../etc`; assert exit 64, no file outside `/tmp/devhub-mission-*/`.                           |
| HELPER-S12 missing table      | call against a fresh DB without migration 002; assert exit 66.                                                          |
| HELPER-S13 SQLite busy        | hold a write transaction in a side connection, call `event-write`; assert 3 retries logged, then exit 73.               |
| `getMissionBusSnapshot` shape | seed 4 rows in each table, call snapshot, assert JSON shape, ordering, COALESCE-on-empty returns `[]` not `null`.       |

### Integration (`src/lib/__tests__/agentLaunchWrapper.test.js`)

| What                                    | How                                                                                                                                                          |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `buildBusHelpersBlock` emits valid bash | render the wrapper with `--mission` set, `bash -n` it (syntax-check), then `bash -c '_devhub_chat hi --to director'` against a temp DB; assert row inserted. |
| HELPER-S4 invalid kind                  | `bash -c '_devhub_chat x --to director --kind nonsense'`; assert exit 64, stderr prefix, no row.                                                             |
| HELPER-S7 invalid JSON                  | `bash -c '_devhub_event done "not-json{"'`; assert exit 65.                                                                                                  |
| HELPER-S14 helpers in agent shell       | spawn the wrapper script with `bash -lc`, then `bash -c 'which _devhub_chat'`; assert function defined.                                                      |
| LOCK-S3 happy path                      | call the bash state-machine function; assert file transitions `pending → injecting → injected`, atomic rename(2) used.                                       |
| LOCK-S5 skip-state rejected             | attempt `pending → injected`; assert error message + non-zero exit.                                                                                          |
| LOCK-S6 stale-pid                       | pre-create lock with `pid=99999` (not running), call state machine; assert stale removed, fresh lock created.                                                |
| LOCK-S7 hour-stuck                      | pre-create lock with `updated_at=2h ago`; assert same recovery.                                                                                              |
| LOCK-S8 old-format compat               | pre-create `/tmp/devhub-bootstrap-...lock`; call state machine; assert WARN logged, new lock created, old removed on `injected`.                             |

### E2E (`tests/agenthub/e2e/comms-bus.test.js`)

Single test that replays the `launch-e743667a` failure pattern:

1. Fresh temp `devhub.db`, run migration 002.
2. Create mission `m1` (no-ops via DB row).
3. Auditor calls `devhub-bus chat-write --mission m1 --from auditor --to director --body "task_done: X"`.
4. Director consumer (`devhub events tail` simulated as a Node `readline`
   on the JSONL file) receives the line in <2s.
5. Director restarts: spawn a second consumer that rebuilds the dedupe
   Set from `consumer-dedupe-director.jsonl`. Replay lines; assert the
   auditor's first message is **not** re-pasted (BUS-S4 dedupe holds).
6. Director calls `chat-write --to worker`; worker bootstrap calls
   `_devhub_inbox_check`; assert the inbox row is returned, `consumed_at`
   is set, second call is empty. (BUS-S6, HELPER-S10, HELPER-S11)

Coverage target: ≥80% lines on `bin/devhub-bus.js` and on the new
functions inside `agentLaunchWrapper.js`.

---

## Performance budget

| Operation                                                             |      Target | How measured                                                                           |
| --------------------------------------------------------------------- | ----------: | -------------------------------------------------------------------------------------- |
| `_devhub_chat` round-trip (bash → bus binary → SQLite → JSONL append) |   p99 <50ms | Unit test asserts delta from spawn-start to spawn-end.                                 |
| `_devhub_event` round-trip                                            |   p99 <50ms | Same.                                                                                  |
| `_devhub_presence` UPSERT (must not block heartbeat)                  |   p99 <30ms | Unit test runs it 1000x in a tight loop; assert no deadlock with concurrent heartbeat. |
| `_devhub_inbox_check` SELECT + UPDATE                                 |   p99 <20ms | Returns at most 50 rows.                                                               |
| Director consumer line→paste latency                                  |  p99 <100ms | E2E: timestamp on JSONL line vs. timestamp on tmux paste buffer; assert delta.         |
| `getMissionBusSnapshot` SQL                                           |   p99 <10ms | Integration test against 10k-row tables with the indexes above.                        |
| CLI startup (`devhub chat list`)                                      | cold <200ms | First-invocation measurement.                                                          |

WAL mode is set in migration 002 so readers never block writers, which is
the only knob that meaningfully changes the latency profile for the 4-helper
read pattern.

---

## Error model

Every helper and every binary subcommand returns the same exit-code
contract (HELPER-5):

| Code | Meaning       | When                                                                           |
| ---: | ------------- | ------------------------------------------------------------------------------ |
|    0 | success       | row inserted, JSONL appended, exit 0 even on idempotent no-op retry            |
|   64 | usage error   | bad args, bad enum, bad path, missing `--to`                                   |
|   65 | data error    | malformed JSON payload, body too large (>16KB)                                 |
|   66 | no such table | migration 002 not applied; the helper exits with the table name in the message |
|   73 | cannot create | SQLite I/O error after 3 retries with 100ms backoff                            |

**Stdout**: empty on non-zero exit. On success, JSON object on a single
line (e.g. `{"id":42,"seq":"chat-launch-abc-ab12cd34","ok":true}`).
The bash wrapper suppresses stdout and only uses the exit code.

**Stderr**: always a single line of the form
`devhub-helper: <name>: <code>: <message>`. The wrapper logs this to
`/tmp/devhub-swarm-${role}.log` and does NOT crash the agent.

**JSONL failure**: if the SQLite INSERT succeeds but the JSONL append
fails (disk full, permission), the helper still exits 0 (the row is
durable, the projection is best-effort). The next call to
`devhub bus snapshot` will surface the missing line via the
`seq` watermark; the operator can re-run `devhub bus rotate --replay`
to rebuild the projection. This is a deliberate trade for the simpler
Option-C architecture in D1.

---

## Risks

In addition to the seven risks in the proposal:

|   # | Risk                                                                                 | Likelihood | Mitigation                                                                                                                 |
| --: | ------------------------------------------------------------------------------------ | ---------- | -------------------------------------------------------------------------------------------------------------------------- |
|   1 | SQLite lock contention under multi-worker                                            | Med        | WAL + `busy_timeout=5000` (BUS-S1). Binary retries 3x.                                                                     |
|   2 | Director `tail -F` re-delivers on restart                                            | High       | D3 persistent dedupe file. E2E test (E2E step 5) proves it.                                                                |
|   3 | Shim breaks existing `pending_deliveries` consumers                                  | Med        | TCT-DELTA-S1..S7 covered in shim tests; `DEVHUB_INBOX_SHIM_DISABLED` env flag.                                             |
|   4 | Strict TDD inflates PR beyond D2                                                     | High       | Forecast 505 LOC total, +295 headroom. If apply exceeds 800, abort and re-plan.                                            |
|   5 | Bootstrap lock rename breaks in-flight launches                                      | Low        | LOCK-S2 + LOCK-S8: old path read with WARN for 1 release.                                                                  |
|   6 | `tail -F` doesn't reconnect on pipe close                                            | Med        | Use `tail -F --retry` (not `-f`).                                                                                          |
|   7 | Implicit Plyrium naming leak                                                         | Low        | Naming is internal; user copy is neutral English. Test asserts no "Plyrium" strings.                                       |
|   8 | **NEW**: `body_hash` collision on SHA-256 → consumer dedupe miss                     | Negligible | SHA-256 with full body content; collision probability ~2⁻²⁵⁶.                                                              |
|   9 | **NEW**: `getMissionBusSnapshot` SQL regresses when `json_group_array` not available | Low        | better-sqlite3 ≥9 ships SQLite ≥3.38; we add a runtime check in the test suite.                                            |
|  10 | **NEW**: workers call helpers before `DEVHUB_DB_PATH` is exported                    | Med        | Wrapper emits `export DEVHUB_DB_PATH="<absolute>"` before any helper definition; integration test asserts env propagation. |
|  11 | **NEW**: bash function `read` of `--message-stdin` hangs in non-interactive context  | Low        | Helper uses `read -r -d ''` with timeout via `timeout 5 cat`; helper exits 64 on timeout.                                  |

---

## Out of design scope

Punted to follow-up changes (the proposal already enumerates these; we
are not expanding scope):

- `control-room-bus-integration` — UI to visualize `team_chat` /
  `team_events` / `team_inbox` / `agent_presence` from the new bus.
- `team-tell-supervisor-fusion` — fold `teamTell` (which still writes to
  `mission_messages`/`message_deliveries`) into the new bus after 1
  release of coexistence.
- HMAC removal from `/api/agenthub/presence/heartbeat` and
  `/api/agenthub/exit` — this PR only touches `_devhub_tell_director`
  and `/api/agenthub/events` POST.
- Multi-launch concurrent on the same `mission_id` — current schema uses
  `mission_id` as a partition key, which is fine for the single-launch
  case the proposal targets.
- Backfill from `/tmp/devhub-swarm-*.log` archives — operator-driven
  import tool, not part of this PR.
- Re-introduction of Plyrium runtime — `plyrium-parity-consolidation`
  tests continue to assert rejection.
- Director `tail -F` offset watermark via `agent_presence.presence_context` —
  using a separate file is cleaner (D3 rationale).

---

## Next phase

`sdd-tasks` with focus on:

1. Group tasks by file (D2-budget friendly): 1 task per new file, 1 task
   per modified file. Avoid cross-file mega-tasks.
2. RED first: each task writes its failing test, then the implementation,
   then GREEN, then REFACTOR only if the file stays under its LOC share.
3. Lock the D2 budget with a `pre-commit` check: `git diff --stat` must
   show ≤800 net lines; abort otherwise.
4. Sequence: migration 002 → bus binary → wrapper helpers → lock rename
   → CLI commands → health-route shim → events-route retire → integration
   test → e2e test. Each step green before the next.
