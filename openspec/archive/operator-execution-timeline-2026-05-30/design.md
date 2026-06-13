# design: operator-execution-timeline

## type: architecture
## change: operator-execution-timeline
## status: approved
## generated: 2026-05-30

---

## D-1: Design Principles

Five principles derived directly from the spec and the durable-projection pattern already established in `buildMissionEvidenceTimeline` (health route):

1. **Durable storage is authoritative.** Every timeline item must be persisted to SQLite before the API response returns. No SSE push, WebSocket hint, or in-memory state ever overrides a durable row.

2. **Transport is always secondary.** Live updates (SSE, WebSocket) inform the UI that new items exist but cannot be used as authoritative evidence. The UI must always verify via the GET API before rendering status.

3. **Sequence is server-assigned, client-supplied accepted.** The server assigns the next monotonic sequence for an `execution_id` on insert. If the client supplies `sequence`, it is accepted and stored — but the server never reassigns a client-supplied value. This allows idempotent emission from any tier.

4. **item_id is idempotent within a 5-second window.** The `item_id` is the idempotency key. On duplicate `item_id`, the server returns the existing row with HTTP 200 instead of inserting a new one.

5. **Authority label is always server-assigned.** The `authority` field is set to `'primary'` by the server at insert time. The server never accepts a client-supplied `authority` value.

---

## D-2: Storage — New `operator_timeline` Table

### Decision: New dedicated table (not extending `agent_events`)

Rationale:
- `operator_timeline` has a fundamentally different access pattern than agent lifecycle events (ordered by execution_id+sequence, not by agent_id+created_at).
- Operator actions need operator-specific correlation IDs (`correlation_id`, `execution_id`) that have no meaning in the `agent_events` schema.
- Redaction levels and stage/status vocabulary are operator-specific and would pollute the `agent_events` CHECK constraints.
- A dedicated table allows append-only enforcement via trigger without impacting agent-side insert performance.
- The spec explicitly lists this as a design decision (Open Question #1).

### Schema

```sql
CREATE TABLE operator_timeline (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id         TEXT NOT NULL,          -- UUID v4, idempotency key
  execution_id    TEXT NOT NULL,
  correlation_id  TEXT NOT NULL,
  sequence        INTEGER NOT NULL,
  actor_type      TEXT NOT NULL CHECK(actor_type IN ('human','operator','director','system')),
  actor_id        TEXT NOT NULL,
  actor_role      TEXT NOT NULL,
  stage           TEXT NOT NULL CHECK(stage IN (
    'action_request','policy_evaluation','tool_invocation','execution_progress',
    'rollback','deferred','audit_recorded'
  )),
  status          TEXT NOT NULL CHECK(status IN (
    'requested','policy_approved','policy_denied','invoked','running',
    'completed','failed','rolled_back','deferred'
  )),
  tool_name        TEXT,
  params          TEXT,                   -- JSON; never stored raw — always redaction-processed
  evidence_refs   TEXT NOT NULL DEFAULT '[]',  -- JSON array
  redaction_level TEXT NOT NULL DEFAULT 'none' CHECK(redaction_level IN ('none','params_only','full')),
  occurred_at     TEXT NOT NULL,          -- ISO 8601 UTC, server clock
  authority       TEXT NOT NULL DEFAULT 'primary' CHECK(authority IN ('primary','secondary_hint')),
  next_step_hint  TEXT,
  error_code       TEXT,
  error_message    TEXT,
  error_recoverable INTEGER,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(execution_id, sequence)
);
CREATE INDEX idx_ot_execution ON operator_timeline(execution_id, sequence ASC);
CREATE INDEX idx_ot_occurred  ON operator_timeline(occurred_at DESC);
CREATE INDEX idx_ot_actor      ON operator_timeline(actor_id, occurred_at DESC);
CREATE INDEX idx_ot_item_id    ON operator_timeline(item_id);
```

### Indexes

- `(execution_id, sequence ASC)` — covers all per-execution ordered queries (primary access pattern).
- `(occurred_at DESC)` — covers time-range queries (`since`) without scanning execution_id.
- `(actor_id, occurred_at DESC)` — covers actor-scoped queries.
- `(item_id)` — covers idempotency dedup on POST.

### Append-Only Trigger

```sql
CREATE TRIGGER operator_timeline_append_only
BEFORE UPDATE ON operator_timeline
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'operator_timeline_append_only');
END;
```

There is no BEFORE DELETE trigger — the spec does not require hard deletion, and retention is handled via a time-based purge job (see D-6).

### Redaction Processing at Insert

When a row is inserted, `params` must be processed before storage:

| Client `redaction_level` | Stored `params` |
|---|---|
| `'none'` | Stored as-is (JSON string) |
| `'params_only'` | Stored as `'{"__redacted__": true}'` |
| `'full'` | Stored as `null` |

`next_step_hint` is also cleared to `null` when `redaction_level = 'full'`.

---

## D-3: API Surface

### `GET /api/agenthub/operators/timeline`

**Authentication**: operator session cookie or `X-Operator-Id` header (same as other operator-facing routes).

**Query Parameters**:
| Param | Type | Default | Notes |
|---|---|---|---|
| `execution_id` | string | — | Exact match |
| `actor_id` | string | — | Exact match |
| `stage` | string | — | Comma-separated; matched with `IN` |
| `status` | string | — | Comma-separated; matched with `IN` |
| `since` | ISO 8601 | — | `occurred_at > ?` |
| `limit` | integer | 50 | Max 200 |
| `rollup` | boolean | false | If true, return ExecutionSummary[] instead |

**Rollup mode** (`rollup=true`) returns `ExecutionSummary[]` ordered by `last_item_at DESC`. Rollup is computed with a single aggregation query:

```sql
SELECT
  execution_id,
  MAX(correlation_id)                           AS correlation_id,
  MAX(actor_type || ':' || actor_id)           AS actor,
  MAX(status)                                   AS current_status,   -- highest sequence row's status
  MAX(CASE WHEN status IN ('completed','failed','rolled_back')
           THEN status END)                    AS terminal_status,
  COUNT(*)                                      AS item_count,
  MAX(occurred_at)                             AS last_item_at,
  MAX(CASE WHEN stage = 'deferred' THEN 1 END)  AS pending_confirmation
FROM operator_timeline
WHERE [filters]
GROUP BY execution_id
ORDER BY last_item_at DESC
LIMIT ?
```

**Item mode** (`rollup=false` or omitted) returns `OperatorTimelineItem[]` ordered `occurred_at ASC, sequence ASC`.

**Response**: Always `200 OK`. Empty array if no results.

### `POST /api/agenthub/operators/timeline`

**Authentication**: same as GET.

**Request body**: `OperatorTimelineItem` minus `authority` and `id` (server-generated fields).

**Server-side assignments (never accepted from client)**:
- `item_id`: UUID v4 generated if not supplied.
- `sequence`: Next sequence for `execution_id` (server-assigned, unless client supplies it — in which case the client value is stored as-is and the dedup check uses `item_id` only).
- `authority`: Always `'primary'`.
- `occurred_at`: Server clock (`new Date().toISOString()`), never from client.

**Idempotency logic**:
1. Check for existing row with same `item_id`.
2. If found and row was created within 5 seconds, return `200` with existing row.
3. If not found, insert with server-assigned fields.
4. Return `201` with persisted item.

**Error cases**:
- Missing required field (`execution_id`, `stage`, `status`, `actor_type`, `actor_id`, `actor_role`) → `400`.
- Unknown stage or status value → `400`.
- Sequence gap is not enforced (spec does not require it; late-arriving items are accepted as-is).

---

## D-4: Server-Side State and Logic

### Durable Projection (Read Model)

The GET API reads directly from `operator_timeline`. There is no separate in-memory cache or materialized view. If performance requires a cache in the future, it must be labeled with `authority: 'secondary_hint'` and invalidated when the durable row changes.

### ExecutionSummary Computation

`ExecutionSummary` is derived at read time (see rollup SQL above), not stored as a separate row. The derived fields:

- `current_status`: status of the highest-sequence item for that execution.
- `terminal_status`: status of the highest-sequence item where status ∈ {completed, failed, rolled_back}. `null` if no terminal item exists.
- `pending_confirmation`: `true` if any item has `stage = 'deferred'`.

### Idempotency Window

The 5-second window is implemented as:

```sql
SELECT * FROM operator_timeline
WHERE item_id = ? AND datetime(occurred_at) > datetime('now', '-5 seconds')
LIMIT 1
```

This is checked before every insert. The window is intentionally wide to handle clock skew across distributed clients.

### Retention Policy

Timeline entries are retained for 90 days, then purged. Purge is a background SQLite `DELETE` job:

```sql
DELETE FROM operator_timeline
WHERE datetime(occurred_at) < datetime('now', '-90 days')
```

This runs on every successful POST (lazy) and on a scheduled interval (daily). Entries are not hard-deleted on mission archival — the 90-day rolling window applies regardless of mission state.

**Open question #4 resolved**: 90-day rolling window with background purge. Mission archival does not trigger immediate deletion.

---

## D-5: Live Transport — SSE with Durable Watermark

### Decision: SSE with durable watermark, not WebSocket or raw MCP pull

Rationale:
- DevHub already uses SSE in the health route (`buildMissionEvidenceTimeline` emits live timeline for the control room). SSE is the established transport for operator-facing live updates.
- Adding a durable watermark field (`last_durable_sequence`) to the SSE event envelope lets clients distinguish "this event is live but not yet durable" from "this event is confirmed".
- WebSocket would require a separate connection management layer not yet in the codebase.
- MCP pull (polling) is already covered by the GET API; SSE augments it with push.

### SSE Contract

The endpoint `GET /api/agenthub/operators/timeline/stream` (new route) emits Server-Sent Events with the following envelope:

```ts
interface TimelineSSEEvent {
  type: 'timeline_item' | 'execution_rollup' | 'heartbeat';
  execution_id: string;
  item?: OperatorTimelineItem;
  rollup?: ExecutionSummary;
  authority: 'primary' | 'secondary_hint';
  last_durable_sequence: number;   // highest sequence confirmed in SQLite
  occurred_at: string;             // ISO 8601, server clock
}
```

**Authority assignment in SSE**:
- If the item's row exists in `operator_timeline` with `authority = 'primary'`, the SSE event carries `authority: 'primary'`.
- If the event is emitted before the row is persisted (fire-and-forget from an async emitter), the event carries `authority: 'secondary_hint'`.
- `last_durable_sequence` tells the client which items are confirmed durable up to which sequence — the client can use this to determine whether to trust a `secondary_hint` event.

**SSE stream filters**: The stream accepts the same filter parameters as GET (`execution_id`, `actor_id`, `stage`, `status`). The stream is scoped to the authenticated operator's visible executions.

**Heartbeat**: Every 15 seconds, the server emits a `heartbeat` event with the current `last_durable_sequence` so clients can detect connection gaps and re-sync via GET.

### Client Behavior (Authority Rules from OET-6)

1. On receiving an SSE event with `authority: 'primary'` → render immediately.
2. On receiving an SSE event with `authority: 'secondary_hint'` → render with visual indicator (amber dot + "live" label) but do not use as audit evidence.
3. On re-connect or gap detection → call GET API to re-sync from durable store, discarding any unconfirmed `secondary_hint` events for sequences already confirmed durable.

---

## D-6: File Layout

```
src/
  app/api/agenthub/operators/timeline/
    route.js                    # GET + POST, auth, idempotency, rollup logic
    stream/route.js             # SSE endpoint, durable watermark, heartbeat

  lib/operators/
    timelineStore.js            # INSERT, SELECT, rollup query, sequence assignment
    timelineRedaction.js        # Redaction level processing
    timelineRetention.js        # 90-day purge job
    timelineTypes.js            # JSDoc type aliases (OperatorTimelineItem, ExecutionSummary)

  components/
    OperatorTimeline/
      OperatorTimelineFeed.jsx    # Container: accepts execution_id or rollup mode
      OperatorTimelineItem.jsx    # Single row: renders stage, status, actor, evidence
      ExecutionRollupCard.jsx     # Rollup card for dashboard mode
      AuthorityBadge.jsx          # 'primary' / 'secondary_hint' visual indicator
      StageTag.jsx                # Stage pill with color coding
      StatusIcon.jsx              # Status icon (checkmark, X, clock, etc.)
    SwarmControl.jsx             # Existing; updated to consume timeline feed

  lib/db/
    schema.js                    # ADD: operator_timeline table DDL + trigger
    constants.js                  # ADD: STAGE_VOCABULARY, STATUS_VOCABULARY
```

---

## D-7: UI Components

### `OperatorTimelineFeed`

**Props**: `executionId?`, `actorId?`, `rollup?`, `limit?`

**Behavior**:
- Fetches via GET on mount with specified params.
- Maintains `items` array in local state.
- Opens SSE stream on mount, merges incoming `timeline_item` events into local state (prepend or append based on `occurred_at`).
- When `authority: 'secondary_hint'` event arrives, shows amber indicator and falls back to GET re-sync after 2 seconds of no `primary` confirmation.
- Polling fallback: re-fetches via GET every 10 seconds as a safety net (configurable).
- Shows empty state when no items exist.

### `OperatorTimelineItem`

**Props**: `item: OperatorTimelineItem`

**Layout**: Single row in a vertical feed.

| Segment | Content |
|---|---|
| Left gutter | `StageTag` + `StatusIcon` stacked |
| Center | `actor` badge, `tool` name if present, `next_step_hint` if present |
| Right | `occurred_at` relative timestamp, `AuthorityBadge` if `secondary_hint` |
| Bottom | `error` object if `error` is non-null (red callout) |
| Far right | `evidence_refs` links (mission_message ids, etc.) |

**Stage color coding**:
- `action_request`: blue
- `policy_evaluation`: amber
- `tool_invocation`: purple
- `execution_progress`: green (completed) / red (failed)
- `rollback`: orange
- `deferred`: yellow
- `audit_recorded`: gray

### `AuthorityBadge`

Renders a small colored dot:
- `primary`: green dot with "confirmed" tooltip
- `secondary_hint`: amber dot with "live — not yet confirmed" tooltip

Never shown on primary items in the feed (it's noise); only rendered when `authority === 'secondary_hint'`.

### `ExecutionRollupCard`

**Props**: `summary: ExecutionSummary`

**Layout**: Card with execution summary.
- Header: execution_id (truncated), actor badge, `terminal_status` chip
- Body: item count, last_item_at relative
- Footer: `pending_confirmation` shows a "Awaiting confirmation" banner

---

## D-8: Edge Cases and Error Handling

### Duplicate item_id within 5-second window
→ `200` with existing row. No new row inserted.

### Duplicate item_id after 5 seconds
→ Treated as new item. Server assigns new sequence. (This is intentional — after the window, the client is expected to use a fresh item_id.)

### Sequence gap on insert
→ Accepted as-is. Server does not reject late-arriving items out of sequence order. (Spec does not require sequence enforcement.)

### Unknown stage or status on POST
→ `400 Bad Request` with `{ error: "Unknown stage: X" }` listing valid values.

### Missing required field on POST
→ `400 Bad Request` with `{ error: "Missing required field: X" }`.

### Server clock skew (occurred_at from client)
→ Ignored. Server always overwrites with its own clock.

### Client supplies `authority`
→ Ignored. Server always sets to `'primary'`.

### SSE connection drops
→ Client re-connects and calls GET to re-sync from durable store. Any unconfirmed `secondary_hint` events for already-confirmed sequences are discarded.

### Timeline item for a deleted/corrupted execution
→ The GET API still returns items; there is no cascade delete. Items may outlive their execution context.

### Retention purge runs on an active execution
→ Purge is time-based (90 days), not execution-based. An active execution's items are only purged if they are older than 90 days.

---

## D-9: Resolved Open Questions

| # | Question | Decision |
|---|---|---|
| 1 | Which store is authoritative? | New `operator_timeline` table — clean separation from `agent_events` |
| 2 | Is `sequence` server-assigned or client-supplied? | Server-assigned; client-supplied accepted and stored as-is |
| 3 | Which live transport? | SSE with durable watermark envelope; `last_durable_sequence` field tells clients what is confirmed |
| 4 | Retention policy? | 90-day rolling window; background purge on POST and daily |

---

## D-10: Dependency Graph

```
operator_timeline (table)
  ↑ created by: POST /api/agenthub/operators/timeline
  ↑ read by:    GET /api/agenthub/operators/timeline
               SSE stream route
  ↓ consumed by: OperatorTimelineFeed (React component)
               ExecutionRollupCard (React component)

OperatorTimelineItem (emitted by)
  → policy layer (policy_evaluation items)
  → agent runtime (tool_invocation, execution_progress items)
  → chat UX (action_request items — read only, never emit)

operator_timeline table
  ↔ cross-references: agent_events.id via evidence_refs
                   mission_messages.message_id via evidence_refs
                   agent_runs.run_id via correlation_id link

swarmMissions.js
  ↔ shared pattern: buildMissionEvidenceTimeline (existing) informs SSE envelope design

schema.js
  ↑ extended with: operator_timeline DDL + append-only trigger

health/route.js
  ↑ unchanged: timeline is a separate read surface, not part of the health snapshot
```

---

## D-11: Rollback Plan

If the `operator_timeline` table or timeline API causes issues:
- The table can be made invisible by removing the route files; existing rows remain in SQLite but are unreachable.
- All operator-facing UI components fall back to existing `buildMissionEvidenceTimeline` as a secondary read surface (which was the pre-timeline state).
- No `agent_events` rows are modified or removed.
- SSE stream can be disabled by removing `stream/route.js`; GET/POST API can remain active for headless consumers.

---

*Design decisions in this file are authoritative. Implementation must not contradict D-1 through D-11 without a formal spec amendment.*