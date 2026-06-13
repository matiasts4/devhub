# spec: operator-execution-timeline

## type: new

Canonical ordered timeline for operator execution events. Defines the event model, status vocabulary, correlation semantics, authority rules, and audit payload shape that all operator-facing surfaces (chat UX, action controls, Observer/Operator UI) MUST consume — never replace.

---

## OET-1: Timeline Event Schema

**Priority**: P0 | **Status**: approved

Every timeline entry MUST be a JSON object with the following shape:

```ts
interface OperatorTimelineItem {
  item_id: string;          // UUID v4 — primary key, stable across retries
  execution_id: string;     // Links all items in one operator action
  correlation_id: string;   // Links operator intent to downstream tool/action spans
  sequence: number;         // Monotonic integer, 1-indexed, per execution_id

  actor: {
    type: 'human' | 'operator' | 'director' | 'system';
    id: string;             // agent_id or operator session id
    role: string;           // e.g. 'observer' | 'operator' | 'director'
  };

  stage: string;            // See OET-2 Stage Vocabulary
  status: string;           // See OET-3 Status Vocabulary

  tool: string | null;      // MCP tool name when stage === 'tool_invocation'
  params: object | null;     // Tool params (redacted — see OET-5)

  evidence_refs: string[];   // Durable record ids (mission_message id, run id, etc.)
  redaction_level: 'none' | 'params_only' | 'full';

  occurred_at: string;       // ISO 8601 — UTC, from durable source of truth
  authority: 'primary' | 'secondary_hint';

  next_step_hint: string | null; // Human-readable next expected stage or null
  error: {
    code: string;
    message: string;
    recoverable: boolean;
  } | null;
}
```

#### Scenario: OET-S1 — Full timeline item emitted

- **Given** an operator requests a terminal action
- **When** the request is persisted
- **Then** an item exists with `stage='action_request'`, `status='requested'`, `actor.type='human'`, `authority='primary'`, and a unique `item_id`

#### Scenario: OET-S2 — Tool invocation item

- **Given** the policy layer approved a terminal command
- **When** the tool is invoked
- **Then** an item exists with `stage='tool_invocation'`, `status='invoked'`, `tool='terminal.exec'`, `params` redacted at `params_only`, and `sequence` incremented

---

## OET-2: Stage Vocabulary

**Priority**: P0 | **Status**: approved

The system MUST support the following ordered stages. Each stage is exclusive — a timeline item belongs to exactly one stage.

| Stage key | Description |
|---|---|
| `action_request` | Operator intent received; not yet evaluated by policy |
| `policy_evaluation` | Policy layer is deciding whether to allow the action |
| `tool_invocation` | Tool has been called with resolved params |
| `execution_progress` | Tool is running; status may be `running`, `completed`, or `failed` |
| `rollback` | Explicit rollback triggered (manual or automated) |
| `deferred` | Action deferred pending external confirmation or dependency |
| `audit_recorded` | Outcome written to audit trail; timeline slice closed |

The pipeline flows in order but is not strictly sequential — `deferred` may follow `policy_evaluation`, and `rollback` may follow any post-approval stage. Stages are not linear: multiple `execution_progress` items may appear with `status='running'` for multi-step tools.

#### Scenario: OET-S3 — Stage progression for denied action

- **Given** an operator requests a high-risk terminal command
- **When** the policy layer denies it
- **Then** an item with `stage='policy_evaluation'` and `status='policy_denied'` is appended
- **AND** no `tool_invocation` item follows

#### Scenario: OET-S4 — Deferred action

- **Given** an operator requests an action requiring human confirmation
- **When** the policy layer defers it
- **Then** an item with `stage='deferred'`, `status='deferred'`, and a `next_step_hint` is appended
- **AND** a later item with `stage='policy_evaluation'` and `status='policy_approved'` may follow upon confirmation

---

## OET-3: Status Vocabulary

**Priority**: P0 | **Status**: approved

The system MUST support the following statuses per timeline item. A status is always scoped to its item — the overall execution uses `execution_id` to aggregate.

| Status | Valid stages | Description |
|---|---|---|
| `requested` | `action_request` | Intent received, awaiting policy decision |
| `policy_approved` | `policy_evaluation` | Policy granted the action |
| `policy_denied` | `policy_evaluation` | Policy blocked the action; no tool invoked |
| `invoked` | `tool_invocation` | Tool called, params resolved |
| `running` | `execution_progress` | Tool executing; result pending |
| `completed` | `execution_progress` | Tool finished without error |
| `failed` | `execution_progress` | Tool returned an error |
| `rolled_back` | `rollback` | Execution reversed or undone |
| `deferred` | `deferred` | Awaiting external signal before continuing |

#### Scenario: OET-S5 — Status for successful execution

- **Given** a policy-approved terminal command completes
- **When** the tool returns without error
- **Then** an item exists with `stage='execution_progress'`, `status='completed'`, and `error: null`

#### Scenario: OET-S6 — Status for failed execution

- **Given** a policy-approved tool throws an error
- **When** the error is captured
- **Then** an item exists with `stage='execution_progress'`, `status='failed'`, and a non-null `error` object with `code`, `message`, and `recoverable`

---

## OET-4: Correlation and Idempotency Semantics

**Priority**: P0 | **Status**: approved

The system MUST enforce the following guarantees for timeline entries:

1. **`execution_id`** — Groups all items belonging to one operator action. It is stable: the same action retried MUST reuse the same `execution_id`. Implementations MUST accept a client-supplied `execution_id` and MUST NOT reassign it.

2. **`item_id`** — Globally unique per item. Clients MAY supply a stable `item_id` for idempotent emission. The API MUST deduplicate by `item_id` within a 5-second window, returning the existing row instead of inserting.

3. **`correlation_id`** — Links the operator action to downstream spans (tool call, swarm mission, etc.). The same `correlation_id` may appear across multiple executions. It is NOT unique per row — it is a many-to-many link.

4. **`sequence`** — Monotonic per `execution_id`. The first item for an execution has `sequence=1`. Subsequent items within the same execution MUST increment by 1. The system MUST NOT assign `sequence` client-side if the server assigns it; client-supplied `sequence` MUST be accepted and stored.

#### Scenario: OET-S7 — Execution ID reuse on retry

- **Given** an operator action with `execution_id='exec-abc'` was partially recorded
- **When** the operator retries the action
- **Then** the same `execution_id='exec-abc'` is used
- **AND** a new item with incremented `sequence` is appended

#### Scenario: OET-S8 — Idempotent item emission

- **Given** a client emits a timeline item with `item_id='item-xyz'`
- **When** the same `item_id='item-xyz'` is emitted again within 5 seconds
- **Then** no duplicate row is inserted
- **AND** the API returns 200 with the original `item_id`

---

## OET-5: Redaction and Evidence Reference Policy

**Priority**: P1 | **Status**: approved

The system MUST redact sensitive data in timeline items according to the following rules:

| `redaction_level` | Params visible | Reason |
|---|---|---|
| `none` | Full `params` object | Observers reading logs; no sensitive data |
| `params_only` | Params hidden; shape and count preserved as `{__redacted__: true}` | Terminal commands with file paths or arguments |
| `full` | Entire item params cleared; `next_step_hint` cleared | Credential-impacting or cross-workspace actions |

Evidence refs (`evidence_refs`) are NEVER redacted — they always point to durable records. The redaction level is set by the policy layer at `policy_evaluation` time and MUST NOT change after the item is persisted.

#### Scenario: OET-S9 — Params redacted for terminal exec

- **Given** an operator invokes `terminal.exec` with a command containing a local file path
- **When** the item is recorded
- **Then** `redaction_level='params_only'` and `params` is `{__redacted__: true}`

#### Scenario: OET-S10 — Full redaction for credential action

- **Given** an operator action impacts credentials or crosses workspace boundaries
- **When** the item is recorded
- **Then** `redaction_level='full'`, `params` is `null`, and `next_step_hint` is `null`

---

## OET-6: Authority and Durable-First Rules

**Priority**: P0 | **Status**: approved

The system MUST enforce the following authority hierarchy for operator timeline data:

1. **Durable records are always authoritative.** Timeline entries written to persistent storage (SQLite, `agent_events`, mission-linked tables) take precedence over any in-memory or transport-layer hint.

2. **Read models are derived, not authoritative.** Any projection, cache, or materialized view of the timeline is derived and MUST be labeled with `authority: 'secondary_hint'` when it includes non-durable data.

3. **Transport hints are never authoritative.** SSE, WebSocket push events, or polling results that have not been persisted are secondary hints only. They MUST NOT appear in audit reports as primary evidence.

4. **UI/chat surfaces consume, not create.** Chat UX and operator action controls READ from the canonical timeline projection. They MUST NOT write directly to the timeline or introduce competing status values.

#### Scenario: OET-S11 — Chat UX reads primary timeline

- **Given** an operator action is in progress
- **When** the chat UX polls for status
- **Then** it reads from the primary timeline projection sourced from durable records
- **AND** no SSE push or WebSocket hint is used as the authoritative status

#### Scenario: OET-S12 — Secondary hint clearly labeled

- **Given** the UI receives a live SSE event about an execution
- **When** the event has not yet been persisted to the timeline store
- **Then** it is rendered with `authority: 'secondary_hint'` and a visual indicator
- **AND** it does not overwrite or contradict durable entries

---

## OET-7: Execution Aggregate and Status Rollup

**Priority**: P1 | **Status**: approved

The system MUST provide an execution-level status rollup accessible by `execution_id`:

```ts
interface ExecutionSummary {
  execution_id: string;
  correlation_id: string;
  actor: { type: string; id: string; role: string };
  current_status: string;    // Latest non-deferred status across all items
  terminal_status: string | null; // 'completed' | 'failed' | 'rolled_back' | null
  item_count: number;        // Total timeline items for this execution
  last_item_at: string;      // ISO 8601 — occurred_at of most recent item
  pending_confirmation: boolean; // true if any item is stage=deferred
}
```

The `terminal_status` is derived: it is the `status` of the highest-sequence item where `status` is one of `completed`, `failed`, or `rolled_back`. If no such item exists, `terminal_status` is `null`.

#### Scenario: OET-S13 — Rollup for completed execution

- **Given** an execution has 3 timeline items with statuses `requested`, `policy_approved`, `completed`
- **When** the ExecutionSummary is computed
- **Then** `current_status='completed'`, `terminal_status='completed'`, `item_count=3`, `pending_confirmation=false`

#### Scenario: OET-S14 — Rollup for deferred execution

- **Given** an execution has 2 timeline items with statuses `requested` and `deferred`
- **When** the ExecutionSummary is computed
- **Then** `current_status='deferred'`, `terminal_status=null`, `pending_confirmation=true`

---

## OET-8: Timeline Query API

**Priority**: P0 | **Status**: approved

The system MUST expose `GET /api/agenthub/operators/timeline` with the following query parameters:

| Parameter | Type | Description |
|---|---|---|
| `execution_id` | string | Filter to a single execution |
| `actor_id` | string | Filter by operator id |
| `stage` | string | Filter by stage (comma-separated for multiple) |
| `status` | string | Filter by status (comma-separated for multiple) |
| `since` | ISO 8601 | Return items after this timestamp |
| `limit` | number | Max results, default 50, max 200 |
| `rollup` | boolean | If `true`, return `ExecutionSummary` objects instead of items |

The API MUST require operator authentication. Results for item queries MUST be ordered `occurred_at ASC, sequence ASC`. Results for rollup queries MUST be ordered `last_item_at DESC`.

#### Scenario: OET-S15 — Query by execution_id

- **Given** timeline items exist for `execution_id='exec-abc'`
- **When** `GET /api/agenthub/operators/timeline?execution_id=exec-abc` is called
- **Then** all items for `exec-abc` are returned, ordered by sequence

#### Scenario: OET-S16 — Rollup query for dashboard

- **Given** timeline items exist across multiple executions
- **When** `GET /api/agenthub/operators/timeline?rollup=true&limit=20` is called
- **Then** up to 20 `ExecutionSummary` objects are returned ordered by last_item_at DESC

---

## OET-9: Emit API

**Priority**: P0 | **Status**: approved

The system MUST expose `POST /api/agenthub/operators/timeline` accepting a JSON body matching `OperatorTimelineItem` (minus `authority`, which the server sets to `'primary'`). The server MUST assign `item_id` if not supplied, assign `sequence` if not supplied (next sequence for the given `execution_id`), set `authority='primary'`, and persist before returning.

On success, the response MUST be 201 with the persisted item. On duplicate `item_id` within 5 seconds, return 200 with the existing item.

#### Scenario: OET-S17 — Emit new item

- **Given** an authenticated operator emits a timeline item for `execution_id='exec-abc'`
- **When** the body has `stage='tool_invocation'`, `status='invoked'`, and no `item_id`
- **Then** the server assigns `item_id` and `sequence=3`, persists the item, and returns 201

#### Scenario: OET-S18 — Idempotent re-emission

- **Given** an item with `item_id='item-xyz'` was already persisted
- **When** the same `item_id` is submitted again
- **Then** the response is 200 with the existing item and no new row is created

---

## OET-10: Storage Integration

**Priority**: P0 | **Status**: approved

The system MUST store timeline entries in one of the following stores, chosen at implementation time based on the durable-first principle:

| Option | When to use |
|---|---|
| Extend `agent_events` table | Minimal schema change; operator events coexist with agent events |
| New `operator_timeline` table | Clean separation; operator-specific indexes needed |
| Append to mission-linked tables | When timeline is session-scoped and must survive mission archival |

Regardless of chosen store, the following rules apply:
- Entries MUST be append-only after initial write. Updates are prohibited except for `item_id` deduplication resolution.
- `occurrence_at` MUST come from the server clock, not the client.
- All fields required in OET-1 MUST be present. Optional fields (`params`, `error`, `next_step_hint`) MAY be null.
- Indexes MUST include `(execution_id, sequence)` as a composite unique index and `(occurred_at)` for time-range queries.

#### Scenario: OET-S19 — Timeline survives process restart

- **Given** timeline items are persisted for `execution_id='exec-abc'`
- **WHEN** the process restarts
- **THEN** all items for `exec-abc` are recoverable via the GET API

---

## OET-11: Relationship to Other Contracts

**Priority**: P0 | **Status**: approved

The `operator-execution-timeline` spec forms the audit backbone for the `operator-action-contract` spec. Every action defined in `operator-action-contract` MUST emit timeline items per OET-1 through OET-3. The timeline does not replace the `agent_events` table — it extends it with operator-specific correlation, stage, and redaction semantics.

Timeline entries reference `agent_events` rows via `evidence_refs` when the same fact is recorded in both stores. Where they overlap, `operator_timeline` entries are authoritative for operator-side status and `agent_events` remains authoritative for agent-side lifecycle events.

#### Scenario: OET-S20 — Tool invocation cross-references agent_events

- **Given** a tool invocation item is recorded
- **When** the tool call also emits an `agent_events` row
- **Then** the timeline item's `evidence_refs` includes the `agent_events.id`
- **AND** both records agree on `occurred_at` within 1 second

---

## Open Questions

| # | Question | Decision needed by |
|---|---|---|
| 1 | Which store is authoritative: extend `agent_events`, new `operator_timeline`, or mission-linked append? | design phase |
| 2 | Is `sequence` server-assigned or client-supplied? | design phase |
| 3 | Which live transport is used for push updates: SSE, WebSocket, MCP pull, or mixed with durable watermark? | design phase |
| 4 | What is the retention policy for timeline entries? (e.g., delete after 30 days or archive on mission close?) | design phase |

---

## Dependency Notes

- **SW-8.7A** (durable evidence timeline) is the reference implementation for the durable-first authority pattern. This spec extends that pattern for operator executions.
- **agent-events** spec defines the base event table; `operator_timeline` reuses the idempotency semantics (5-second dedup window) from `agent_events` EVT-5.
- **operator-action-contract** defines the action taxonomy that maps to timeline stages and redaction levels.