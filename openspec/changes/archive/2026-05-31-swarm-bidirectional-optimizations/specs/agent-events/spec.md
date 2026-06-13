# Delta: agent-events — event-long-poll

## ADDED Requirements

### EVT-6: Long Poll Event Query

**Priority**: P1 | **Status**: delta

The system SHALL support `GET /api/agenthub/events?since=<timestamp>` with a server-side timeout of 30 seconds. If no events exist after the given timestamp, the server SHALL hold the connection open for up to 30s before returning an empty array. If events arrive before timeout, the server SHALL return immediately with matching events.

#### Scenario: EVT-S7 — Immediate return when events exist

- GIVEN events exist with `created_at` after the `since` timestamp
- WHEN `GET /api/agenthub/events?since=2026-05-01T00:00:00Z` is sent
- THEN the response returns immediately with all matching events
- AND the response includes no older than the `since` timestamp

#### Scenario: EVT-S8 — Long poll waits up to 30s when no events

- GIVEN no events exist after the `since` timestamp
- WHEN `GET /api/agenthub/events?since=<future_timestamp>` is sent
- THEN the server holds the connection open
- AND returns an empty array after up to 30s if no events arrive
- AND if an event arrives within 30s, the server returns immediately with that event

#### Scenario: EVT-S9 — Long poll with multiple agents

- GIVEN two agents poll the same `since` timestamp simultaneously
- WHEN an event is emitted by one agent
- THEN only the agent that has not yet received events returns the new event
- AND the other agent continues waiting until timeout or its own event arrives

## MODIFIED Requirements

None.

## REMOVED Requirements

None.