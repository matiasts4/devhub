# Delta for swarm-observability

## ADDED Requirements

### Requirement: Durable Diagnostic Read Model

The system MUST expose one diagnostic read model for MCP Control Center, SW-5.1 consumers, Telegram, and UI surfaces. That read model MUST derive durable truth from DevHub task, workspace, run, artifact, and supervisor evidence, MAY enrich with bounded live MCP probes, and MUST report `authority`, `freshness`, `evidence`, and degraded status explicitly. Runtime-local mirrors such as `devhub_agent_runs` MUST NOT become durable truth.

#### Scenario: Multiple consumers read same diagnostic snapshot

- GIVEN MCP Control Center, Telegram, and UI request observability data for the same run
- WHEN the snapshot is assembled
- THEN all consumers receive the same durable diagnostic fields and evidence references
- AND none of them maintain a parallel truth model

#### Scenario: Live probe enriches but does not override durable truth

- GIVEN durable supervisor evidence exists and a live MCP probe returns newer inventory metadata
- WHEN the snapshot is emitted
- THEN durable workflow truth remains sourced from DevHub evidence
- AND the live inventory is attached as bounded probe evidence with its own authority and freshness

#### Scenario: Durable reads fail

- GIVEN task, workspace, run, or artifact evidence cannot be assembled
- WHEN a consumer requests the diagnostic snapshot
- THEN the contract reports degraded or unavailable state explicitly
- AND Telegram, SW-5.1, and UI do not infer success from runtime-local memory
