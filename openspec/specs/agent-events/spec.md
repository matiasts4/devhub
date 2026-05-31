# spec: agent-events

## type: new

Cross-mission lifecycle event table and poll-based API for agent event tracking.

### EVT-1: Agent Events Table

**Priority**: P0 | **Status**: approved

The system SHALL provide an `agent_events` table with columns: `id INTEGER PRIMARY KEY AUTOINCREMENT`, `agent_id TEXT NOT NULL`, `workspace_id TEXT`, `event_type TEXT NOT NULL`, `payload_json TEXT`, `mission_id TEXT`, `created_at TEXT NOT NULL DEFAULT (datetime('now'))`.

#### Scenario: EVT-S1 — Emit agent_booted event

- **Given** an agent has been launched and authenticated
- **When** the agent boot process completes
- **Then** a row is inserted into `agent_events` with `event_type='agent_booted'`, the agent's `agent_id`, and `workspace_id`

### EVT-2: Event Emission API

**Priority**: P0 | **Status**: approved

The system SHALL expose `POST /api/agenthub/events` requiring agent authentication. The request body MUST include `event_type` and MAY include `payload_json` (object) and `mission_id` (string). On success, the response SHALL be 201 with the created event.

#### Scenario: EVT-S2 — Successful event emission

- **Given** an authenticated agent sends `POST /api/agenthub/events`
- **When** the body includes `event_type='agent_booted'` and optional `payload_json`
- **Then** the event is inserted and the response is 201 with the event row

### EVT-3: Event Query API

**Priority**: P1 | **Status**: approved

The system SHALL expose `GET /api/agenthub/events` with optional query params: `type` (event_type filter), `agent_id` (agent filter), `since` (ISO 8601 timestamp). The endpoint SHALL require agent authentication. Results SHALL be ordered `created_at DESC`, capped at 100 per request.

#### Scenario: EVT-S3 — Query events by agent

- **Given** events exist for multiple agents
- **When** `GET /api/agenthub/events?agent_id=agent-1` is sent
- **Then** only events for `agent-1` are returned, ordered by `created_at DESC`

#### Scenario: EVT-S4 — Query by type since timestamp

- **Given** `workspace_orphaned` events exist across multiple dates
- **When** `GET /api/agenthub/events?type=workspace_orphaned&since=2026-05-01T00:00:00Z` is sent
- **Then** only `workspace_orphaned` events after the given timestamp are returned

### EVT-4: Event Type Enum

**Priority**: P0 | **Status**: approved

The system SHALL define valid event types: `agent_booted`, `agent_shutdown`, `workspace_orphaned`, `quota_blocked`, `supervisor_action`, `mission_joined`, `mission_left`, `task_start`, `found_issue`, `task_complete`, `needs_help`, `blocked`. The emission API SHALL reject unknown types with 400 listing valid types. The first seven are emitted via HTTP API; the last five (`task_start`, `found_issue`, `task_complete`, `needs_help`, `blocked`) are emitted via tmux injection to Director's tmux pane.

#### Scenario: EVT-S5 — Reject unknown event type

- **Given** an authenticated agent sends an event emission request
- **When** `event_type` is `'invalid_type'`
- **Then** the response is 400 with a message listing valid event types

#### Scenario: EVT-S6 — Task-scoped events accepted via tmux injection

- **Given** an agent sends a status update via tmux injection to Director
- **When** the tmux message contains `task_start`, `found_issue`, `task_complete`, `needs_help`, or `blocked`
- **Then** the status is logged by Director without requiring HTTP API calls

### EVT-5: Idempotent Emission

**Priority**: P1 | **Status**: approved

The system SHALL deduplicate events with the same `client_event_id` within a 5-second window. If a duplicate `client_event_id` arrives within 5s of the original, the API SHALL return 200 with the existing event's ID instead of creating a new row.

#### Scenario: EVT-S6 — Deduplicate rapid re-emission

- **Given** an event with `client_event_id='evt-123'` was emitted 2 seconds ago
- **When** the same `client_event_id='evt-123'` is submitted again
- **Then** no new row is inserted
- **AND** the response is 200 with the original event's `id`

### EVT-6: Long Poll Event Query

**Priority**: P1 | **Status**: approved

The system SHALL support `GET /api/agenthub/events?since=<timestamp>` with a server-side timeout of 30 seconds. If no events exist after the given timestamp, the server SHALL hold the connection open for up to 30s before returning an empty array. If events arrive before timeout, the server SHALL return immediately with matching events.

#### Scenario: EVT-S7 — Immediate return when events exist

- **Given** events exist with `created_at` after the `since` timestamp
- **WHEN** `GET /api/agenthub/events?since=2026-05-01T00:00:00Z` is sent
- **THEN** the response returns immediately with all matching events
- **AND** the response includes no older than the `since` timestamp

#### Scenario: EVT-S8 — Long poll waits up to 30s when no events

- **Given** no events exist after the `since` timestamp
- **WHEN** `GET /api/agenthub/events?since=<future_timestamp>` is sent
- **THEN** the server holds the connection open
- **AND** returns an empty array after up to 30s if no events arrive
- **AND** if an event arrives within 30s, the server returns immediately with that event

#### Scenario: EVT-S9 — Long poll with multiple agents

- **Given** two agents poll the same `since` timestamp simultaneously
- **WHEN** an event is emitted by one agent
- **THEN** only the agent that has not yet received events returns the new event
- **AND** the other agent continues waiting until timeout or its own event arrives