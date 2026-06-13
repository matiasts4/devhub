# Delta Spec: agent-events

## Type: DELTA

This delta retires the HTTP+HMAC `POST /api/agenthub/events` endpoint and the long-poll `GET /api/agenthub/events` channel that agents used to POST status updates. Lifecycle events now flow through `_devhub_event` into the `team_events` bus (see `agent-comms-bus` and `agent-bus-helpers` specs). The `agent_events` table is retained for auditability but is no longer written to by running agents.

## ADDED Requirements

### Requirement: Audit-Only `agent_events` Writes

The system MUST accept new `agent_events` rows only from internal sources (supervisor daemon, orchestrator) after this change is applied. The HTTP emission endpoint MUST no longer be reachable for agent calls. The `agent_events` table remains queryable for history (audit trail, supervisor dashboards) but is no longer the live event channel.

#### Scenario: EVT-DELTA-S1 — Agent POST returns 410 Gone

- **Given** an authenticated agent calls `POST /api/agenthub/events`
- **When** the request reaches the route handler
- **Then** the response is 410 Gone
- **AND** the response body is `{"error":"retired","replacement":"_devhub_event helper writes to team_events bus"}`
- **AND** no row is inserted into `agent_events`

#### Scenario: EVT-DELTA-S2 — Internal supervisor can still write

- **Given** the supervisor daemon's code path emits an `agent_events` row directly via `localDb`
- **When** the daemon runs
- **Then** the row is inserted
- **AND** `agent_events` is still populated for audit consumers like the orchestrator

## MODIFIED Requirements

### Requirement: Event Type Enum (EVT-4 in main spec)

The event type enum MUST be split into two disjoint sets:

- **Bus events** (written via `_devhub_event` into `team_events`): `task_completed`, `task_failed`, `handoff_ready`, `alert`, `needs_help`, `blocker_resolved`, `report_ready`. These are NEVER written to `agent_events`.
- **Lifecycle events** (still written to `agent_events` by internal sources only): `agent_booted`, `agent_shutdown`, `workspace_orphaned`, `quota_blocked`, `supervisor_action`, `mission_joined`, `mission_left`.

(Previously: a single enum of 12 types was accepted by `POST /api/agenthub/events`; tmux injection was used for the last five types. After this change, the HTTP path is retired and the bus is the live channel.)

#### Scenario: EVT-DELTA-S3 — `task_completed` is bus-only

- **Given** an agent attempts to `POST /api/agenthub/events` with `event_type='task_completed'`
- **When** the route handler validates (before returning 410)
- **Then** it would have rejected the type as no longer accepted via HTTP
- **AND** the recommended replacement (`_devhub_event task_completed '<payload>'`) is in the error body

#### Scenario: EVT-DELTA-S4 — `agent_booted` is still internal

- **Given** the supervisor daemon writes `agent_events.event_type='agent_booted'`
- **When** the internal insert runs
- **Then** the row is accepted
- **AND** `devhub events list --type=agent_booted` still surfaces it

### Requirement: Long Poll Event Query (EVT-6 in main spec)

The long-poll behavior of `GET /api/agenthub/events?since=<ts>` MUST be replaced by `devhub events tail` reading the JSONL projection of `team_events`. Agents MUST consume from the JSONL file, not from the HTTP endpoint. The `GET` endpoint MUST still answer historical queries (returning events after a `since` timestamp, capped at 100, ordered DESC) for backwards compatibility with the supervisor dashboard, but MUST NOT hold a connection open for 30s.

(Previously: `GET /api/agenthub/events?since=<ts>` held the connection open for up to 30s and returned as soon as events arrived. After this change, real-time consumption is JSONL-based and the HTTP endpoint is a one-shot query only.)

#### Scenario: EVT-DELTA-S5 — Historical GET still works

- **Given** rows exist in `agent_events` with `created_at > 2026-05-01`
- **When** an authenticated caller `GET /api/agenthub/events?since=2026-05-01`
- **Then** the response is 200 with the matching rows (no 410)
- **AND** the response is immediate, not a 30s hold

#### Scenario: EVT-DELTA-S6 — Real-time consumer switches to JSONL

- **Given** an agent needs real-time event updates
- **When** the agent runs `devhub events tail`
- **Then** the CLI subscribes to `/tmp/devhub-mission-<id>/events.jsonl` via `tail -F`
- **AND** new events appear within 100ms of insertion
- **AND** no HTTP call is made

## REMOVED Requirements

### Requirement: HTTP API Event Emission (EVT-2 in main spec)

(Reason: Replaced by the bus helpers in `agent-bus-helpers`. The HTTP+HMAC path was the source of the `launch-e743667a` comms failure — auditor calls were lost because the Director was never tailing the log and HMAC retries were timing out.)

#### Scenario: EVT-DELTA-S7 — EVT-2 scenarios are no longer reachable

- **Given** any agent that previously called `POST /api/agenthub/events`
- **When** the agent is updated to call `_devhub_event` instead
- **Then** no regression in agent behavior
- **AND** the agent's events flow through the new bus

### Requirement: HTTP API Long Poll (EVT-6 in main spec)

(Reason: Long polling on the agent HTTP endpoint is incompatible with the new bus model. Real-time consumption is via `tail -F` of the JSONL projection; historical queries are still served by the GET endpoint as a one-shot.)

#### Scenario: EVT-DELTA-S8 — Long-poll behavior removed

- **Given** a client that opens a long-poll GET
- **When** the request reaches the route
- **Then** the response is immediate (or 410 if the route is fully retired in a later change)
- **AND** no 30s hold is performed
