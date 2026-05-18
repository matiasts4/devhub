# Delta for swarm-concurrency-limits

## MODIFIED Requirements

### REQ-4: Visual Feedback in SwarmControl

The system MUST display concurrency status in Workspace Control Room from the shared supervisor queue snapshot, showing active agents relative to the configured limit. When the limit is reached, the UI MUST show queued work without inventing local counts.
(Previously: SwarmControl showed active/max badges and pending agents without requiring shared snapshot authority.)

#### Scenario: Normal operation below limit

- GIVEN the supervisor snapshot reports 3 active agents out of a limit of 5
- WHEN Workspace Control Room renders
- THEN a status badge displays "3/5 agents active"

#### Scenario: All slots occupied

- GIVEN the supervisor snapshot reports 5 active agents out of a limit of 5 and queued work
- WHEN Workspace Control Room renders
- THEN the badge displays "5/5 agents active"
- AND a queue indicator is visible for pending work

#### Scenario: No agents running

- GIVEN the supervisor snapshot reports 0 active agents
- WHEN Workspace Control Room renders
- THEN the badge displays "0/5 agents active"
