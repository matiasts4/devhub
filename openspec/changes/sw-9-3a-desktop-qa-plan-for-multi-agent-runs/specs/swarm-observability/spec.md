# Delta for Swarm Observability

## ADDED Requirements

### Requirement: QA Evidence Coverage Reporting

The system MUST expose observability outputs that let QA assert durable evidence coverage for approvals, agent runs, workspaces, and recovery state. QA reporting MUST verify references to those durable outputs without mutating runtime state or copying durable records into the test bundle.

#### Scenario: Complete durable evidence coverage

- GIVEN a deterministic multi-agent QA scenario reaches approval, execution, recovery, and closure checkpoints
- WHEN the QA report is finalized
- THEN the report confirms durable evidence references for approvals, runs, workspaces, and recovery state
- AND each reference is linked to the shared QA run identifier

#### Scenario: Missing durable output is reported explicitly

- GIVEN a QA scenario completes but one durable evidence source is absent or unreadable
- WHEN the QA report evaluates observability coverage
- THEN the report marks the run as incomplete with the missing evidence class identified
- AND previously collected references remain visible for comparison and triage
