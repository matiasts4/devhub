# Delta for swarm-observability

## MODIFIED Requirements

### Requirement: Durable Diagnostic Read Model

The system MUST expose one diagnostic read model for MCP Control Center, SW-5.1 consumers, Telegram, UI surfaces, and Director queue handoff surfaces. That read model MUST derive durable truth from DevHub queue, task, workspace, run, artifact, and supervisor evidence. Queue order and blocked visibility MUST come from `get_execution_queue`; next-task handoff results MUST come from the existing durable claim primitives (`get_next_task` and `claim_next_task`) plus the resulting `agent_workspaces`, `agent_runs`, and `supervisor_snapshots` truth. The read model MAY enrich with bounded live MCP probes, and MUST report `authority`, `freshness`, `evidence`, and degraded status explicitly. Runtime-local mirrors such as `devhub_agent_runs` MUST NOT become durable truth.
(Previously: The read model covered durable task/workspace/run/artifact/supervisor truth, but did not define Director queue projection and handoff reflection semantics.)

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

#### Scenario: Queue projection reflects durable blocked and empty states

- GIVEN `get_execution_queue` returns ordered entries, blocked entries, or no entries
- WHEN Director queue data is projected into Control Room
- THEN ordering, blocked state, and empty state match the durable queue response
- AND the UI does not create a second queue authority

#### Scenario: Claim handoff reflects durable records only

- GIVEN Director triggers next-task handoff and the durable claim primitive returns a result
- WHEN the read model refreshes
- THEN task, workspace, run, and supervisor state come from durable records tied to that claim result
- AND no optimistic local record overrides the durable state
