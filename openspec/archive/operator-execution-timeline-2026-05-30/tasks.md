# tasks: operator-execution-timeline

## type: tasks
## change: operator-execution-timeline
## generated: 2026-05-30
## status: open

---

## Phase 1: Database Foundation

No dependencies. These tasks establish the schema and types that all other layers depend on.

---

### T1 — Add `operator_timeline` DDL and append-only trigger to schema.js

**File**: `src/lib/db/schema.js`

**Description**:
Add the `operator_timeline` table DDL and the append-only BEFORE UPDATE trigger. Follow the exact schema from D-2. Indexes must be added via `CREATE INDEX` statements after the table. The trigger must use `RAISE(ABORT, 'operator_timeline_append_only')` to prevent any UPDATE.

**Acceptance criteria**:
- Table has all columns listed in D-2 schema with correct CHECK constraints and DEFAULT values
- `UNIQUE(execution_id, sequence)` constraint present
- All four indexes (`idx_ot_execution`, `idx_ot_occurred`, `idx_ot_actor`, `idx_ot_item_id`) are created
- Append-only trigger aborts any UPDATE attempt
- No BEFORE DELETE trigger is added (retention is handled by purge job)

---

### T2 — Add vocabulary constants to constants.js

**File**: `src/lib/db/constants.js`

**Description**:
Add `STAGE_VOCABULARY` and `STATUS_VOCABULARY` arrays (for validation) and `VALID_STAGES` / `VALID_STATUSES` Sets. These are used by the POST route for 400 validation.

**Acceptance criteria**:
- `STAGE_VOCABULARY` = `['action_request','policy_evaluation','tool_invocation','execution_progress','rollback','deferred','audit_recorded']`
- `STATUS_VOCABULARY` = `['requested','policy_approved','policy_denied','invoked','running','completed','failed','rolled_back','deferred']`
- Sets are exported alongside arrays for O(1) lookup in validation

---

### T3 — Create timelineTypes.js with JSDoc type aliases

**File**: `src/lib/operators/timelineTypes.js`

**Description**:
Create JSDoc type aliases for `OperatorTimelineItem`, `ExecutionSummary`, and `TimelineSSEEvent`. These are documentation-only — no runtime type checking. Follow the exact field names and types from OET-1, OET-7, and D-5.

**Acceptance criteria**:
- `OperatorTimelineItem` matches OET-1 exactly (all required/optional fields, union types for `actor.type`, `redaction_level`, `authority`, and `error`)
- `ExecutionSummary` matches OET-7 exactly
- `TimelineSSEEvent` matches D-5 SSE envelope exactly
- File is `.js` (not `.ts`) — this codebase uses JSDoc
- Types are exported as JSDoc comments above `/** @typedef {...} */` declarations or inline `/** @type {...} */` exports

---

## Phase 2: Backend Store Layer

Depends on: T1, T2, T3. These files implement all DB interactions.

---

### T4 — Create timelineStore.js

**File**: `src/lib/operators/timelineStore.js`

**Description**:
Implement all database operations for `operator_timeline`. This is the only module that issues SQL against the table. Must export:
- `insertTimelineItem(item)` — idempotent INSERT with 5-second dedup window, server-assigned `sequence`, `authority`, `occurred_at`. Returns `{ row, isDuplicate, statusCode }`.
- `getTimelineItems(filters)` — SELECT with all filter params from D-3. Returns `OperatorTimelineItem[]` ordered `occurred_at ASC, sequence ASC`.
- `getExecutionRollup(filters)` — rollup aggregation query from D-3. Returns `ExecutionSummary[]` ordered `last_item_at DESC`.
- `getLastDurableSequence(executionId)` — returns highest confirmed `sequence` for an execution.

**Idempotency logic** (from D-4):
1. `SELECT * FROM operator_timeline WHERE item_id = ? AND datetime(occurred_at) > datetime('now', '-5 seconds')`
2. If found → return existing row, `isDuplicate: true`, `statusCode: 200`
3. If not found → insert with server-assigned fields, `statusCode: 201`

**Sequence assignment**: `SELECT COALESCE(MAX(sequence), 0) + 1 FROM operator_timeline WHERE execution_id = ?`

**Redaction**: params processing is delegated to `timelineRedaction.js`.

**Acceptance criteria**:
- `insertTimelineItem` never accepts `authority` or `occurred_at` from the caller
- `getTimelineItems` applies all filters (execution_id, actor_id, stage IN, status IN, since, limit)
- `getExecutionRollup` uses the exact SQL from D-3 with MAX aggregations and GROUP BY
- `getLastDurableSequence` filters by `execution_id` and `authority = 'primary'`
- All functions use the `db` singleton from the codebase (do not open new connections)

---

### T5 — Create timelineRedaction.js

**File**: `src/lib/operators/timelineRedaction.js`

**Description**:
Implement redaction level processing from D-2 (Redaction Processing at Insert) and spec OET-5. Export `applyRedactionLevel(params, redactionLevel)` → returns processed value to store.

**Acceptance criteria**:
- `redaction_level = 'none'` → returns original params JSON string
- `redaction_level = 'params_only'` → returns `'{"__redacted__": true}'`
- `redaction_level = 'full'` → returns `null`
- `clearNextStepHintOnFull` utility: `next_step_hint` → `null` when `redaction_level = 'full'`
- All redaction logic is isolated here — no redaction in timelineStore.js

---

### T6 — Create timelineRetention.js

**File**: `src/lib/operators/timelineRetention.js`

**Description**:
Implement the 90-day rolling window purge job from D-4. Export:
- `purgeOldEntries()` — runs `DELETE FROM operator_timeline WHERE datetime(occurred_at) < datetime('now', '-90 days')`. Returns count of deleted rows.
- `schedulePurge()` — sets up a daily interval (24h) calling `purgeOldEntries()`.

Also register `purgeOldEntries()` to run lazily on every successful POST (called from the POST route).

**Acceptance criteria**:
- Purge uses `'now', '-90 days'` — exact string from D-4
- `purgeOldEntries()` is safe to call multiple times (idempotent DELETE)
- Daily schedule survives process restart via `setInterval` (Node.js)
- Returns deleted count for logging/metrics

---

## Phase 3: API Routes

Depends on: T2, T4, T5, T6. These are the HTTP endpoints.

---

### T7 — Create GET + POST route for timeline

**File**: `src/app/api/agenthub/operators/timeline/route.js`

**Description**:
Implement the REST endpoint for `GET` and `POST` against `/api/agenthub/operators/timeline`. Authentication: operator session cookie or `X-Operator-Id` header (reuse existing pattern from other operator routes in the codebase).

**GET handler**:
- Parse query params: `execution_id`, `actor_id`, `stage` (comma-split), `status` (comma-split), `since`, `limit` (default 50, max 200), `rollup`
- If `rollup=true` → call `getExecutionRollup(filters)` → return `ExecutionSummary[]`
- Else → call `getTimelineItems(filters)` → return `OperatorTimelineItem[]`
- Always return `200 OK` with empty array if no results
- Apply `limit` clamping: if `limit > 200`, use 200

**POST handler**:
- Parse body: accept all fields from `OperatorTimelineItem` except `authority` and `id` (server-generated)
- Validate required fields: `execution_id`, `stage`, `status`, `actor_type`, `actor_id`, `actor_role` → `400` if missing
- Validate `stage` ∈ `VALID_STAGES` and `status` ∈ `VALID_STATUSES` → `400` with `{ error: "Unknown stage: X" }`
- Generate `item_id` (UUID v4) if not supplied
- Call `applyRedactionLevel()` before storage
- Call `insertTimelineItem()` (which handles idempotency, sequence, occurred_at, authority)
- After successful insert, call `purgeOldEntries()` lazily (fire-and-forget, non-blocking)
- Return `201` with persisted item or `200` with existing item on duplicate

**Acceptance criteria**:
- GET returns correct shape for both item and rollup modes
- POST assigns `item_id` (if absent), `sequence`, `authority='primary'`, `occurred_at` server-side — never from client
- POST returns `201` on new insert, `200` on idempotent duplicate
- POST returns `400` with specific error message for invalid/missing fields
- No UPDATE or DELETE operations are reachable via this route

---

### T8 — Create SSE stream route

**File**: `src/app/api/agenthub/operators/timeline/stream/route.js`

**Description**:
Implement `GET /api/agenthub/operators/timeline/stream` using the SSE pattern established in `buildMissionEvidenceTimeline` (health route). Reuse that module's SSE helper if possible.

**SSE implementation**:
- Authenticate same as GET route
- Parse same filter params as GET (execution_id, actor_id, stage, status)
- On connect: emit current `last_durable_sequence` for the scope as first event
- Every 15 seconds: emit `heartbeat` event with current `last_durable_sequence`
- Subscribe to the in-process event bus (or poll with short interval) for new `operator_timeline` inserts within the filter scope
- For each new item: emit `timeline_item` event with `authority: 'primary'` (since items in the table are always primary) and `last_durable_sequence: current_sequence`
- If a `secondary_hint` path exists (async emitter before durability): emit with `authority: 'secondary_hint'` and current confirmed `last_durable_sequence`
- Stream stays open until client disconnects (use `ReadableStream` with `cancel()` cleanup)

**Envelope** (from D-5):
```js
{ type: 'timeline_item' | 'execution_rollup' | 'heartbeat', execution_id, item?, rollup?, authority, last_durable_sequence, occurred_at }
```

**Acceptance criteria**:
- Stream sends `Content-Type: text/event-stream`
- Heartbeat fires every 15 seconds
- `last_durable_sequence` is always the highest confirmed sequence from SQLite (never fabricated)
- `authority` on SSE events reflects whether the item exists in SQLite (primary) or is pre-durability (secondary_hint)
- Connection cleanup on client disconnect (no orphaned intervals)

---

## Phase 4: React UI Components

Depends on: T7, T8 (API must be functional). Components consume the GET API and SSE stream.

---

### T9 — Create AuthorityBadge component

**File**: `src/components/OperatorTimeline/AuthorityBadge.jsx`

**Description**:
Renders a small colored dot indicator for authority state.

**Props**: `authority: 'primary' | 'secondary_hint'`

**Visual**:
- `primary` → green dot, tooltip "confirmed"
- `secondary_hint` → amber dot, tooltip "live — not yet confirmed"

**Acceptance criteria**:
- Only renders when `authority === 'secondary_hint'` (never shown for primary items in feed — noise)
- Accessible: uses `title` or `aria-label` for tooltip
- Uses existing design system colors (check existing components for palette)

---

### T10 — Create StageTag component

**File**: `src/components/OperatorTimeline/StageTag.jsx`

**Description**:
Renders a colored pill/badge for the stage key.

**Props**: `stage: string`

**Color coding** (from D-7):
- `action_request` → blue
- `policy_evaluation` → amber
- `tool_invocation` → purple
- `execution_progress` → green (completed) / red (failed) — status-aware (accept `status` prop too)
- `rollback` → orange
- `deferred` → yellow
- `audit_recorded` → gray

**Acceptance criteria**:
- Displays the human-readable stage label (e.g. "Policy Evaluation" not "policy_evaluation")
- Uses color mapping from D-7
- Consistent with existing tag/badge patterns in the codebase

---

### T11 — Create StatusIcon component

**File**: `src/components/OperatorTimeline/StatusIcon.jsx`

**Description**:
Renders an icon for each status value.

**Props**: `status: string`

**Icon mapping**:
- `requested` → clock icon
- `policy_approved` → check icon (green)
- `policy_denied` → X icon (red)
- `invoked` → play/arrow icon (blue)
- `running` → spinner/loading icon
- `completed` → double-check / success icon (green)
- `failed` → X icon (red)
- `rolled_back` → undo icon (orange)
- `deferred` → pause / hourglass icon (yellow)

**Acceptance criteria**:
- Each status has a distinct, semantically appropriate icon
- Uses existing icon library already in the codebase (check `lucide-react` or similar)
- Consistent with existing icon usage patterns

---

### T12 — Create OperatorTimelineItem component

**File**: `src/components/OperatorTimeline/OperatorTimelineItem.jsx`

**Description**:
Renders a single timeline row in the feed.

**Props**: `item: OperatorTimelineItem`

**Layout** (from D-7):
- Left gutter: `StageTag` + `StatusIcon` stacked
- Center: actor badge (e.g. "human:op-42"), tool name if `stage === 'tool_invocation'`, `next_step_hint` if present
- Right: relative `occurred_at` timestamp, `AuthorityBadge` if `authority === 'secondary_hint'`
- Bottom: error callout (red) if `error` is non-null
- Far right: `evidence_refs` links (rendered as small text or icon links)

**Error callout**:
- Shows `error.code`, `error.message`, and `recoverable` badge
- Styled as a red/alert callout

**Acceptance criteria**:
- All fields from the item are rendered with appropriate visual treatment
- `params` is never rendered directly — component shows redaction indicator if `redaction_level !== 'none'`
- `evidence_refs` renders as clickable links or tooltips referencing the actual record IDs
- Empty/null fields are handled gracefully (no broken renders)

---

### T13 — Create ExecutionRollupCard component

**File**: `src/components/OperatorTimeline/ExecutionRollupCard.jsx`

**Description**:
Renders a summary card for an execution in rollup/dashboard mode.

**Props**: `summary: ExecutionSummary`

**Layout** (from D-7):
- Header: `execution_id` (truncated to 8 chars + ellipsis), actor badge, `terminal_status` chip
- Body: item count, `last_item_at` as relative time
- Footer: if `pending_confirmation === true`, show "Awaiting confirmation" banner

**Acceptance criteria**:
- Shows `terminal_status` chip with color (green=completed, red=failed, orange=rolled_back, gray=null)
- `execution_id` links or copies to clipboard on click
- "Awaiting confirmation" banner uses appropriate amber/yellow alert style

---

### T14 — Create OperatorTimelineFeed container component

**File**: `src/components/OperatorTimeline/OperatorTimelineFeed.jsx`

**Description**:
Main container that fetches timeline data and renders the feed or rollup view.

**Props**: `executionId?`, `actorId?`, `rollup?`, `limit?`

**Behavior** (from D-7):
1. On mount: call `GET /api/agenthub/operators/timeline` with specified params
2. Maintain `items` array in local state
3. On mount: open SSE stream (`GET /api/agenthub/operators/timeline/stream`)
4. Merge incoming `timeline_item` SSE events into local state (prepend or append based on `occurred_at`)
5. When `authority: 'secondary_hint'` event arrives:
   - Render with amber indicator
   - Start 2-second timer
   - If no `primary` confirmation arrives within 2 seconds → call GET to re-sync
6. Polling fallback: re-fetch via GET every 10 seconds (configurable via `pollInterval` prop)
7. If `rollup=true`: render `ExecutionRollupCard[]` instead of `OperatorTimelineItem[]`
8. Empty state: show message when no items exist

**SSE re-sync logic**:
- On receiving `secondary_hint` for sequence `N`: if `last_durable_sequence >= N` after 2s → discard unconfirmed hint
- On SSE disconnect: call GET to fully re-sync

**Acceptance criteria**:
- `items` state is the single source of truth for rendered items (SSE events update it, not bypass it)
- `secondary_hint` visual treatment is clearly distinguishable from `primary`
- Polling is non-blocking (uses `setInterval`, cleaned up on unmount)
- SSE stream is cleaned up on unmount (no memory leaks)
- Empty state is rendered when `items.length === 0` after initial fetch
- Loading state shown during initial fetch

---

### T15 — Update SwarmControl.jsx to consume timeline feed

**File**: `src/components/SwarmControl.jsx`

**Description**:
Integrate `OperatorTimelineFeed` into the existing `SwarmControl` component. Where the existing control room shows live agent status, add the timeline feed as a secondary panel or replace the existing evidence timeline with the new feed.

**Acceptance criteria**:
- `OperatorTimelineFeed` is imported and rendered in an appropriate location within `SwarmControl`
- Passes `executionId` or `actorId` from the current swarm/operator context
- Does not break existing SwarmControl functionality
- Timeline feed is accessible within the same control room view without navigation

---

## Phase 5: Integration and Verification

Depends on: T7, T8, T14 (API functional, feed component complete).

---

### T16 — End-to-end integration smoke test

**Description**:
Run a manual end-to-end verification:

1. Start the Next.js dev server
2. Authenticate as an operator
3. `POST /api/agenthub/operators/timeline` with a valid item → expect `201`
4. `POST` same `item_id` within 5 seconds → expect `200` with existing row
5. `GET /api/agenthub/operators/timeline` with that `execution_id` → expect 2 items (sequence 1 and 2)
6. `GET /api/agenthub/operators/timeline?rollup=true` → expect `ExecutionSummary`
7. Open SSE stream → expect heartbeat within 15 seconds
8. POST a new item → expect `timeline_item` SSE event within 1 second

**Acceptance criteria**: All 7 steps pass without errors.

---

### T17 — Verify append-only enforcement

**Description**:
Attempt to UPDATE or DELETE a row in `operator_timeline` via a direct SQLite query (outside the API). Verify the append-only trigger raises an error on UPDATE. DELETE is allowed by the trigger design (only UPDATE is blocked).

**Acceptance criteria**:
- UPDATE attempt raises `RAISE(ABORT, 'operator_timeline_append_only')`
- No UPDATE route exists in `route.js` (verified by code review of T7)

---

## Task Summary

| # | Task | Phase | Files | Key constraint |
|---|---|---|---|---|
| T1 | Schema + append-only trigger | 1 | `lib/db/schema.js` | No UPDATE/DELETE trigger; 4 indexes |
| T2 | Vocabulary constants | 1 | `lib/db/constants.js` | Sets for O(1) validation |
| T3 | JSDoc type aliases | 1 | `lib/operators/timelineTypes.js` | JSDoc, not TypeScript |
| T4 | DB store (CRUD + idempotency) | 2 | `lib/operators/timelineStore.js` | Idempotency window = 5s; authority never from client |
| T5 | Redaction processor | 2 | `lib/operators/timelineRedaction.js` | Params never stored raw for `params_only`/`full` |
| T6 | Retention purge job | 2 | `lib/operators/timelineRetention.js` | 90-day rolling window |
| T7 | GET + POST REST route | 3 | `api/agenthub/operators/timeline/route.js` | 201/200 idempotency; 400 validation |
| T8 | SSE stream route | 3 | `api/agenthub/operators/timeline/stream/route.js` | Heartbeat 15s; durable watermark |
| T9 | AuthorityBadge | 4 | `components/OperatorTimeline/AuthorityBadge.jsx` | Amber dot only for `secondary_hint` |
| T10 | StageTag | 4 | `components/OperatorTimeline/StageTag.jsx` | Color coding from D-7 |
| T11 | StatusIcon | 4 | `components/OperatorTimeline/StatusIcon.jsx` | Semantic icon per status |
| T12 | OperatorTimelineItem | 4 | `components/OperatorTimeline/OperatorTimelineItem.jsx` | Params never rendered directly |
| T13 | ExecutionRollupCard | 4 | `components/OperatorTimeline/ExecutionRollupCard.jsx` | Rollup dashboard mode |
| T14 | OperatorTimelineFeed | 4 | `components/OperatorTimeline/OperatorTimelineFeed.jsx` | SSE + GET + polling merge |
| T15 | SwarmControl integration | 4 | `components/SwarmControl.jsx` | Existing functionality preserved |
| T16 | E2E smoke test | 5 | — | All 7 API and SSE steps pass |
| T17 | Append-only enforcement | 5 | — | UPDATE blocked by trigger |
