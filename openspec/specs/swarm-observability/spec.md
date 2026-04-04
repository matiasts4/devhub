# Delta for Swarm Observability

## ADDED Requirements

### Requirement: Concurrency Status Display

The system MUST display concurrency limit status in SwarmControl alongside existing execution cards. The display MUST include an active/max badge (e.g., "3/5 agents active") and a queue indicator when the limit is reached.

#### Scenario: Active agents below limit

- GIVEN the concurrency limit is 5 and 3 agents are running
- WHEN SwarmControl renders
- THEN a badge shows "3/5 agents active"
- AND no queue indicator is shown

#### Scenario: All slots occupied with queued agents

- GIVEN the concurrency limit is 5 and 5 agents are running with 2 pending
- WHEN SwarmControl renders
- THEN the badge shows "5/5 agents active"
- AND a queue indicator shows "2 agents queued"

#### Scenario: No agents running

- GIVEN no agents are active
- WHEN SwarmControl renders
- THEN the badge shows "0/5 agents active"
- AND no queue indicator is shown
