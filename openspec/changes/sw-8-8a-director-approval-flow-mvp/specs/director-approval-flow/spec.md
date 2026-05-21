# director-approval-flow Specification

## Purpose

Define Director-only approval decisions from Control Room while keeping durable supervisor records as the only write authority.

## Requirements

### Requirement: Control Room snapshot MUST project pending approval authority

The system MUST expose pending supervisor approval checkpoints and their linked supervisor state in the Control Room snapshot returned from the health projection. Each projected approval MUST carry durable identity and authority fields sufficient for a later revalidation.

#### Scenario: Pending checkpoint appears in snapshot

- GIVEN a supervisor snapshot is `awaiting_approval` and its linked approval checkpoint is `pending`
- WHEN Control Room reads the health snapshot
- THEN the snapshot MUST include the pending approval with task, workspace, run, checkpoint, reason, status, authority, freshness, and evidence references
- AND the linked supervisor approval state MUST remain visible in the same authoritative snapshot payload

#### Scenario: Closed approval is not projected as pending

- GIVEN the latest durable checkpoint is not `pending`
- WHEN Control Room reads the health snapshot
- THEN the snapshot MUST NOT project that checkpoint as a pending Director action

### Requirement: Director approval action SHALL use a bounded contract

The system SHALL expose a dedicated Director approval write route separate from the health GET route and separate from QA approval endpoints. The route MUST accept `approve` and `reject` decisions plus the durable identifiers needed to target one checkpoint.

#### Scenario: Director submits approve decision

- GIVEN a pending approval rendered in Control Room
- WHEN Director POSTs `approve` with task and checkpoint linkage
- THEN the route MUST evaluate only that checkpoint
- AND the response MUST include refreshed authoritative snapshot input for Control Room re-rendering

#### Scenario: Unsupported decision is rejected

- GIVEN a Director request uses a decision other than `approve` or `reject`
- WHEN the write route validates the payload
- THEN the route MUST reject the request without mutating durable approval state

### Requirement: Durable revalidation MUST happen before mutation

Before mutating any approval row or supervisor snapshot, the system MUST re-read the current durable checkpoint and linked supervisor snapshot. The mutation MUST proceed only if the checkpoint is still `pending`, the supervisor is still awaiting approval, and the linkage still matches the requested task/checkpoint context.

#### Scenario: Stale checkpoint is rejected

- GIVEN Control Room shows a pending approval from an older snapshot
- WHEN Director submits a decision after the durable checkpoint is already decided or relinked
- THEN the route MUST return a conflict response
- AND it MUST NOT mutate approval or supervisor rows

### Requirement: Post-decision state MUST refresh from durable truth

After a valid decision, the system MUST persist the checkpoint decision, re-evaluate the resulting supervisor state from durable evidence, and return refreshed snapshot data. The resulting supervisor outcome MUST follow durable semantics: `wait`, `dispatch`, `block`, or `retry`.

#### Scenario: Approval returns wait outcome

- GIVEN the approval is accepted and durable evidence still requires human follow-up or evidence wait
- WHEN the refreshed supervisor snapshot is computed
- THEN the returned snapshot MUST show a `wait` outcome and its matching supervisor state

#### Scenario: Approval returns dispatch outcome

- GIVEN the approval is accepted and the task is now dispatchable
- WHEN the refreshed supervisor snapshot is computed
- THEN the returned snapshot MUST show `dispatch` with the corresponding dispatch-pending supervisor state

#### Scenario: Reject returns block outcome

- GIVEN the Director rejects the checkpoint
- WHEN the refreshed supervisor snapshot is computed
- THEN the returned snapshot MUST show `block` with the corresponding blocked supervisor state

#### Scenario: Approval returns retry outcome

- GIVEN the approval is accepted and durable retry conditions still apply
- WHEN the refreshed supervisor snapshot is computed
- THEN the returned snapshot MUST show `retry` with the corresponding retry-pending supervisor state

### Requirement: Director approval MVP MUST keep scope boundaries

This change MUST NOT redefine unrelated write paths, MUST NOT rewrite Director queue claim semantics, and MUST NOT absorb non-Director approval domains such as QA result submission.

#### Scenario: QA path remains separate

- GIVEN a human approval outside the Director Control Room domain
- WHEN that approval is processed
- THEN the system MUST continue using its existing domain-specific route
- AND Director approval behavior MUST NOT become the shared write path for unrelated approval domains
