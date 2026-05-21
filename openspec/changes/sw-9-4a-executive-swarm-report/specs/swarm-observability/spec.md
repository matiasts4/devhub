# Delta for Swarm Observability

## ADDED Requirements

### Requirement: Executive Swarm Report Read Model

The system MUST expose one executive swarm report derived only from the current Control Room snapshot. The report MUST summarize progress, active blockers, pending approvals, evidence coverage, risk summary, and one next-action recommendation from existing snapshot slices. The report MUST surface missing or partial evidence explicitly and MUST NOT infer hidden healthy state.

#### Scenario: Report summarizes current snapshot state

- GIVEN the Control Room snapshot contains header, queue, runs, approvals, evidence, diagnostics, and mission slices
- WHEN the executive swarm report is composed
- THEN the report includes progress, blockers, pending approvals, evidence coverage, risk summary, and next action
- AND every field is derived from those existing slices only

#### Scenario: Report handles incomplete evidence transparently

- GIVEN the snapshot lacks commit evidence or has partial evidence coverage
- WHEN the executive swarm report is composed
- THEN the report marks evidence coverage as partial or missing
- AND it does not present commit coverage as complete by implication

#### Scenario: Report handles quiet state without inventing blockers

- GIVEN the snapshot shows no blocked work, no pending approvals, and no queue backlog
- WHEN the executive swarm report is composed
- THEN the report shows a clear no-blockers state
- AND the next action remains derived from current snapshot truth

### Requirement: Executive Report Export Mirrors Snapshot Truth

The system MUST provide an exportable executive report payload that serializes the same derived report shown in the Control Room. The export payload SHALL remain read-only, SHALL share the same formulas and source slices as the on-screen report, and MUST NOT create mutation behavior, new persistence, or a second reporting authority.

#### Scenario: Export matches on-screen executive report

- GIVEN an executive swarm report has been derived from the current snapshot
- WHEN an export payload is requested
- THEN the payload contains the same summary fields and values shown in the Control Room
- AND consumers can trace the payload to the same snapshot-derived report object

#### Scenario: Export remains unavailable-safe and non-mutating

- GIVEN one or more snapshot slices are unavailable or degraded
- WHEN the export payload is generated
- THEN the payload preserves degraded or unavailable status explicitly
- AND no queue, approval, dispatch, or persistence mutation is triggered
