# Delta for Swarm Observability

## ADDED Requirements

### Requirement: Checkpoint gate observability

The system MUST expose checkpoint gate outcomes consistently in durable snapshots and operator read models. Accepted handoffs SHALL show the accepted checkpoint summary, and blocked handoffs SHALL show the gate failure plus remediation guidance, including the `commit=none` zero-change rule when relevant.

#### Scenario: Blocked handoff appears in snapshot

- GIVEN a task handoff is rejected by the checkpoint gate
- WHEN the operator reads the current swarm snapshot
- THEN the snapshot shows the gate failure state for that task
- AND the operator can see remediation guidance from durable data

#### Scenario: Accepted handoff appears in snapshot

- GIVEN a task handoff is accepted with valid checkpoint evidence
- WHEN the operator reads the current swarm snapshot
- THEN the snapshot shows the accepted checkpoint summary
- AND the read model stays consistent with server validation outcome
