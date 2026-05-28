# Delta for agent-events

## MODIFIED Requirements

### EVT-2: Event Emission API

**Priority**: P0 | **Status**: approved

The system SHALL expose `POST /api/agenthub/events` requiring agent authentication. The request body MUST include `event_type` and MAY include `mission_id`, `workspace_id`, `payload`, `client_event_id`, `cwd`, and `status_summary`. For `task_completed` and `handoff_ready`, the route MUST persist a durable mission-linked status record that the director feed can consume even when live delivery or verified binding is missing.
(Previously: the API described only generic emission and did not require durable completion or handoff feed semantics.)

#### Scenario: EVT-S2 — Successful event emission

- GIVEN an authenticated agent sends `POST /api/agenthub/events`
- WHEN the body includes `event_type='agent_booted'`
- THEN the event is accepted and durably recorded

#### Scenario: Completion persists mission-linked status

- GIVEN an authenticated agent posts `task_completed` with mission and task context
- WHEN the request is accepted
- THEN a durable mission-linked status record is written
- AND the director feed can read it without chat delivery
