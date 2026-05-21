# Delta for Swarm Observability

## ADDED Requirements

### Requirement: Timeline projections distinguish durable authority from runtime hints

The system MUST distinguish primary durable evidence from secondary runtime hints in Swarm Observability timeline projections. Timeline entries derived from durable snapshot truth SHALL keep authoritative or inferred authority exactly as provided by durable records. Runtime-local `agent_traces` and session SSE MAY appear only as secondary annotations on linked durable items and MUST be labeled non-authoritative. Observability projections MUST NOT let those secondary hints override approval, queue, run, delivery, or ordering truth.

#### Scenario: Durable entry keeps authority when runtime hint disagrees

- GIVEN a durable timeline entry conflicts with a linked runtime hint
- WHEN the timeline projection is normalized
- THEN the durable entry keeps primary authority and ordering
- AND the runtime hint remains secondary only

#### Scenario: Missing runtime hint does not degrade durable truth

- GIVEN a durable timeline entry has no linked runtime hint
- WHEN the timeline projection is rendered
- THEN the durable entry still appears from durable truth alone
- AND observability does not report the item as missing solely because runtime evidence is absent

### Requirement: Observability timeline expansion stays non-mutating

The system MUST keep SW-8.7A observability expansion read-only. It MUST NOT add approval actions, mutate approval checkpoints, mutate queue or dispatch state, or introduce SW-8.8A approvals mutation or SW-9.x hardening behavior through timeline projection work.

#### Scenario: Timeline observability read does not cross into excluded slices

- GIVEN a user reads timeline data from the Control Room snapshot
- WHEN Swarm Observability returns the projection
- THEN the result contains read-only timeline data only
- AND no approval mutation, queue mutation, dispatch mutation, or hardening workflow is triggered
