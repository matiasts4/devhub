# Delta for swarm-observability

## ADDED Requirements

### Requirement: Canonical Control Room Observability

The system MUST derive Control Room status cards and summaries from the same shared durable snapshot consumed by Telegram and MCP diagnostics. Each summary MUST carry authority, freshness, and evidence metadata, and runtime-local mirrors such as SSE caches, `agent_registry`, `devhub_agent_runs`, or browser storage MUST NOT become observability truth.

#### Scenario: UI, Telegram, and MCP read same status

- GIVEN the same supervisor, workspace, run, and artifact evidence exists
- WHEN each consumer requests observability data
- THEN each resolves the same status semantics from the shared read model
- AND differences are limited to presentation

#### Scenario: Local mirror disagrees with durable snapshot

- GIVEN a runtime-local mirror reports active state that the durable snapshot no longer supports
- WHEN Control Room renders
- THEN the UI shows the durable or degraded status
- AND the mirror is not promoted to canonical truth
