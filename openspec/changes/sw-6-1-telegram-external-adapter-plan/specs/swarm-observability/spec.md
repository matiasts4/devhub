# Delta for swarm-observability

## ADDED Requirements

### Requirement: Durable Channel Snapshot Contract

The system MUST expose a durable channel/supervisor snapshot consumable by Telegram, UI, SW-5.1, and SW-7.1 from the same source of truth. The snapshot MUST summarize task, workspace, run, artifact evidence, approval, supervisor, and delivery status without depending on runtime-local mirrors or `devhub_agent_runs`.

#### Scenario: Telegram and UI read same snapshot

- GIVEN a supervisor state with task, run, approval, and artifact evidence
- WHEN Telegram and UI request status
- THEN both resolve from the same durable snapshot contract
- AND neither path reads a channel-local mirror

#### Scenario: Snapshot marks degraded reads

- GIVEN a downstream consumer requests status during a storage failure
- WHEN the snapshot cannot be assembled durably
- THEN the contract reports degraded-unavailable state
- AND consumers do not infer success from partial runtime memory
