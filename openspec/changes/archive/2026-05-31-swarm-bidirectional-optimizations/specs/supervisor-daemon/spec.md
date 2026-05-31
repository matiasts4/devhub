# Delta: supervisor-daemon — stale/offline tracking integration

## ADDED Requirements

### SVD-7: Stale Agent Detection

**Priority**: P1 | **Status**: delta

The system SHALL detect agents with 2 consecutive missed heartbeats and mark them as `stale`. A `stale` agent SHALL be flagged in the `agent_presence` table and MAY be excluded from broadcast fan-out recipients until it resumes heartbeat.

#### Scenario: SVD-S9 — Agent promoted to stale

- **Given** an agent has missed 2 consecutive heartbeat windows
- **When** the supervisor daemon evaluates presence
- **Then** the agent's presence status is updated to `stale`
- **AND** a `supervisor_action` event is emitted with `action='agent_stale'`

### SVD-8: Offline Agent Detection

**Priority**: P0 | **Status**: delta

The system SHALL detect agents with 3 consecutive missed heartbeats and mark them as `offline`. An `offline` agent SHALL be excluded from broadcast fan-out and its active tasks SHALL be eligible for lease reaping.

#### Scenario: SVD-S10 — Agent promoted to offline

- **Given** an agent has missed 3 consecutive heartbeat windows
- **When** the supervisor daemon evaluates presence
- **Then** the agent's presence status is updated to `offline`
- **AND** a `supervisor_action` event is emitted with `action='agent_offline'`
- **AND** the agent is excluded from `recipient_agent_ids: ['*']` fan-out

#### Scenario: SVD-S11 — Offline agent's tasks reaped

- **Given** an agent is marked `offline`
- **When** the agent has tasks with `status='in_progress'`
- **Then** those tasks are released back to `pending` via lease reaping
- **AND** a `supervisor_action` event is emitted with `action='lease_released'`

## MODIFIED Requirements

None.

## REMOVED Requirements

None.