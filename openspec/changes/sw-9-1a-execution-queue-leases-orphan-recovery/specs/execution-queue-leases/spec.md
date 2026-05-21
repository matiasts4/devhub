# execution-queue-leases Specification

## Purpose

Define durable queue lease behavior for claims, heartbeats, stale recovery, dependency blocking, and orphan reconciliation.

## Requirements

### Requirement: Single-owner lease lifecycle

The system MUST grant at most one active lease per task. A claim SHALL return a durable claim token and expiry bound to one agent-task pair. Renew and release operations MUST succeed only for the matching active token.

#### Scenario: Agent claims an available task

- GIVEN a task is unclaimed and eligible for dispatch
- WHEN an agent claims it
- THEN the task MUST persist one owner, one claim token, and one lease expiry

#### Scenario: Non-owner or stale token mutates a lease

- GIVEN a task already has an active or expired lease token
- WHEN another token attempts renew or release
- THEN the task MUST reject the mutation and preserve durable truth

### Requirement: Stale lease recovery

The system MUST treat an expired lease as stale during queue reads and subsequent claims. Stale recovery SHALL clear the prior lease before the task becomes claimable again, and MUST NOT clear a lease whose expiry is still valid.

#### Scenario: Expired lease is reclaimed

- GIVEN a task lease expiry is in the past
- WHEN the queue evaluates or a later claim is attempted
- THEN the stale lease MUST be cleared before the task is offered again

#### Scenario: Valid lease remains owned

- GIVEN a task lease expiry is still in the future
- WHEN the queue evaluates the task
- THEN the existing owner MUST remain authoritative

### Requirement: Dependency blocking gates dispatch

The system MUST NOT expose a task as dispatchable while any declared dependency remains incomplete or blocked. Queue reads MAY include blocked tasks for visibility, but blocked tasks SHALL NOT be claimable.

#### Scenario: Incomplete dependency blocks claim

- GIVEN a task depends on another task that is not completed
- WHEN the queue is read or a claim is attempted
- THEN the task MUST remain blocked and unavailable for lease acquisition

#### Scenario: Dependencies clear

- GIVEN all declared dependencies are completed
- WHEN the queue evaluates the task
- THEN the task MAY become dispatchable if no other lease guard blocks it

### Requirement: Orphan recovery stays on durable authority

The system MUST reconcile task lease status with the latest durable workspace, run, and supervisor records. When an active lease is linked to an orphaned workspace or run, the task SHALL surface recovery-required state until durable recovery closes or re-links that orphan, and the queue MUST NOT create a second recovery authority.

#### Scenario: Orphaned workspace or run requires recovery

- GIVEN the leased task points to a workspace or run marked orphaned in durable records
- WHEN supervisor state is evaluated
- THEN the task MUST surface recovery-required status from that durable linkage

#### Scenario: Healthy linkage stays recoverable-free

- GIVEN the leased task links to the latest non-orphaned workspace and run
- WHEN supervisor state is evaluated
- THEN the task MUST remain free of orphan recovery status
