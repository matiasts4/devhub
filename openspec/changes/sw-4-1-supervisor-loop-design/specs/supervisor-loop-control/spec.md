# Supervisor Loop Control Specification

## Purpose

Define the durable control-plane contract for one Supervisor Loop that reads task queue, leases, workspace metadata, run headers, artifact evidence, and workspace-preparation acknowledgements to decide safe orchestration outcomes without owning executor-side git, worktree, merge, or filesystem actions.

## Requirements

### Requirement: Supervisor inputs, outputs, and invariants

The system MUST consume `get_execution_queue`, task lease state, `agent_workspaces`, `agent_runs`, latest `evidence_ref`, and workspace preparation acknowledgements without redefining those contracts. The loop MUST emit only normalized outcomes: `wait`, `dispatch`, `retry`, `block`, `recover_orphan`, `request_approval`, or `close`. The supervisor MUST remain control-plane only, and `devhub_agent_runs` SHALL remain UI/runtime-local and SHALL NOT be treated as durable truth.

#### Scenario: Supervisor evaluates one candidate

- GIVEN a queued task with durable lease, workspace, run, and evidence state
- WHEN the loop evaluates the candidate
- THEN it emits exactly one normalized outcome
- AND no executor-internal verb is exposed through the contract

### Requirement: Supervisor state and escalation taxonomy

The system MUST model supervisor-visible states explicitly: `idle`, `dispatch_pending`, `lease_active`, `awaiting_evidence`, `retry_pending`, `blocked`, `awaiting_approval`, `recovering_orphan`, and `closed`. Escalation outcomes MUST distinguish `blocked`, `approval_required`, `approval_rejected`, `stale_lease`, `orphaned_workspace`, `orphaned_run`, and `dirty_excluded_observed`. Terminal supervisor closure MUST preserve the final reason class.

#### Scenario: Risky outcome pauses in approval state

- GIVEN a task reaches a risky or destructive next action
- WHEN the supervisor evaluates the evidence
- THEN the task enters `awaiting_approval`
- AND the reason class is `approval_required`

### Requirement: Queue assignment, retry, and blocked detection

The system MUST read queue order from existing queue primitives and SHALL NOT create a parallel scheduler. `dispatch` MUST require an assignable task, valid lease claim path, and either a ready workspace or acknowledged preparation path. `retry` MUST require prior terminal or recoverable failure evidence and a monotonically increasing retry count. The supervisor MUST classify `blocked` when dependencies, missing approvals, unresolved conflicts, or unchanged repeated failure evidence prevent safe progress.

#### Scenario: Recoverable failure retries

- GIVEN the latest run closed with recoverable failure evidence
- WHEN retry budget remains and no blocker is active
- THEN the supervisor emits `retry`
- AND the next attempt links to prior evidence chronology

#### Scenario: Repeated unchanged failure blocks progress

- GIVEN the same failure class recurs without new recovery evidence
- WHEN the supervisor reevaluates the task
- THEN it emits `block`
- AND records that retry is unsafe until conditions change

### Requirement: Human approval and risky-action gating

The system MUST require explicit human approval before any outcome whose evidence indicates destructive cleanup, merge, branch deletion, irreversible overwrite, or policy-defined risky action. Approval requests MUST reference task, workspace, run, reason class, and current `evidence_ref`. Until approved, the supervisor MUST emit `request_approval` or `wait`, and MUST NOT infer approval from executor progress.

#### Scenario: Approval request stays pending

- GIVEN evidence indicates a destructive cleanup path
- WHEN no human decision exists
- THEN the supervisor emits `request_approval`
- AND the task is not closed or retried automatically

### Requirement: Recovery, stale lease, orphan handling, and evidence

The system MUST model stale leases, orphaned leases, orphaned workspaces, orphaned runs, and `dirty-excluded` observations explicitly. `recover_orphan` MUST require preserved last-known lease/workspace/run metadata plus current `evidence_ref` or explicit absence reason. `close`, `retry`, `block`, and `recover_orphan` MUST each record a reason class and evidence reference suitable for audit. The supervisor SHALL NOT normalize `dirty-excluded` to clean.

#### Scenario: Lease expires while workspace remains active

- GIVEN lease ownership expires and the linked workspace is still non-terminal
- WHEN the supervisor reconciles state
- THEN it emits `recover_orphan` or `block` with stale/orphan reason class
- AND preserves the last observed workspace and run evidence

### Requirement: Downstream consumer boundary

The system MUST expose supervisor outcomes, reason classes, counters, timestamps, and `evidence_ref` as contract-level data usable by SW-5.1 UI, SW-6.1 Telegram, and SW-7.1 MCP control center. Downstream consumers MAY render, notify, or route on those fields, but SHALL NOT be coupled to executor-local logs, filesystem layout, terminal sessions, or `devhub_agent_runs` internals.

#### Scenario: UI reads supervisor state without executor internals

- GIVEN a downstream consumer reads supervisor data
- WHEN it renders status or sends notifications
- THEN it uses normalized states, reasons, counters, and `evidence_ref`
- AND it does not require executor-local implementation details
