# Delta for swarm-observability

## ADDED Requirements

### Requirement: Queue lease recovery state uses the authoritative snapshot

The system MUST project queue lease ownership, stale-lease status, dependency blocking, orphan recovery state, and freshness through the same durable Control Room snapshot path used for supervisor evidence. Control Room consumers MUST NOT merge queue or recovery truth from a separate transient source.

#### Scenario: Control Room shows blocked and recovery state from one snapshot

- GIVEN a task is blocked by dependencies or flagged for stale-orphan recovery in durable state
- WHEN Control Room reads the snapshot
- THEN the task MUST expose those statuses from the authoritative snapshot payload

#### Scenario: Transient queue view disagrees with durable projection

- GIVEN a transient queue read differs from the latest durable recovery projection
- WHEN Control Room renders task state
- THEN the durable snapshot MUST remain authoritative and its freshness MUST stay visible
