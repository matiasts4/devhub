# Agent Workspace Lifecycle Specification

## Purpose

Define the control-plane contract for durable `agent_workspaces`. Safe shared baseline remains `f814998dd05cb491caf8637bf570dbd74b539090`; current tree MAY be reported as `dirty-excluded` and SHALL NOT be normalized away by DevHub.

## Requirements

### Requirement: Workspace Identity And Metadata

The system MUST maintain a dedicated `agent_workspaces` record with: `id`, `project_id`, `agent_id`, `current_task_id`, `run_id_or_session_id`, `repo_root`, `workspace_path`, `worktree_path`, `base_branch`, `base_commit`, `branch_name`, `status`, `observed_branch`, `observed_head`, `observed_dirty`, `last_error`, `recovery_reason`, `evidence_ref`, `claimed_at`, `started_at`, `updated_at`, and `completed_at`. `id` MUST be stable and unique. `base_commit` MUST capture the safe baseline at creation. `workspace_path` MUST remain a logical control-plane path even when `worktree_path` changes.

#### Scenario: Planned workspace is recorded before executor action

- GIVEN an agent is assigned work requiring an isolated workspace
- WHEN DevHub creates the workspace record
- THEN the record status is `planned` with stable identity, base branch, and base commit metadata

#### Scenario: Dirty baseline is preserved as observed state

- GIVEN executor reports the current tree as `dirty-excluded`
- WHEN DevHub updates observed fields
- THEN `observed_dirty` stores `dirty-excluded`
- AND DevHub does not infer `clean`

### Requirement: Lifecycle States And Invariants

The system MUST support `planned`, `provisioning`, `ready`, `active`, `paused`, `conflicted`, `cleanup_pending`, `completed`, `failed`, and `orphaned`. Non-terminal states MUST keep mutable observed fields. `ready` and `active` MUST include `branch_name`, `worktree_path`, `observed_branch`, and `observed_head`. Terminal states MUST preserve the last observed values and MUST NOT be silently reused.

#### Scenario: Executor advances a workspace to active

- GIVEN a workspace in `planned`
- WHEN executor provisions the branch/worktree and reports success
- THEN DevHub transitions through `provisioning` to `ready` or `active`
- AND required observed fields are present

#### Scenario: Paused workspace retains recovery context

- GIVEN a workspace in `active`
- WHEN execution is intentionally suspended
- THEN DevHub sets status to `paused`
- AND keeps recovery metadata and observed git state intact

### Requirement: Collision And Conflict Handling

The system MUST detect collisions on `id`, `branch_name`, `worktree_path`, or concurrent non-terminal ownership for the same agent-task pair. The system MUST transition the record to `conflicted` when executor-reported branch/head/path does not match reserved identity. While `conflicted`, DevHub SHALL NOT issue further provisioning intent for that workspace until reconciliation is recorded.

#### Scenario: Deterministic naming collides with existing reservation

- GIVEN a second workspace requests an already reserved branch name or worktree path
- WHEN DevHub validates the reservation
- THEN the second workspace is marked `conflicted`
- AND the original reservation remains unchanged

#### Scenario: Executor reports drift from reserved branch

- GIVEN a workspace reserved for one branch and path
- WHEN executor reports a different observed branch or path
- THEN DevHub marks the workspace `conflicted`
- AND records the mismatch in `last_error` and `evidence_ref`

### Requirement: Cleanup And Recovery Semantics

DevHub MUST model cleanup as intent, not execution. `cleanup_pending` MUST mean teardown was requested from the executor. `orphaned` MUST mean executor/session ownership was lost before a terminal outcome. Recovery MUST require `recovery_reason` and SHOULD create a new evidence reference while preserving prior evidence links.

#### Scenario: Executor lease is lost during active work

- GIVEN a workspace in `active`
- WHEN DevHub detects lost executor or session ownership
- THEN the workspace becomes `orphaned`
- AND the last observed state is preserved for recovery or cleanup

#### Scenario: Cleanup completes after request

- GIVEN a workspace in `cleanup_pending`
- WHEN executor reports teardown completion
- THEN DevHub transitions the workspace to `completed` or `failed`
- AND stores outcome evidence without deleting historical metadata

### Requirement: Control-Plane Boundary And Dependencies

DevHub MUST store desired state and observed results only, and MUST NOT execute git, branch, checkout, merge, or worktree commands. Executors MUST own those actions and MUST report results back through metadata updates. `evidence_ref` MUST be an opaque durable reference reserved for SW-3.1 evidence modeling. SW-2.2 MUST remain blocked until this contract is frozen, including lifecycle states, invariants, and `evidence_ref` semantics.

#### Scenario: Executor reports provisioning results

- GIVEN DevHub requested workspace provisioning
- WHEN executor finishes branch/worktree operations
- THEN only executor performs filesystem or git mutations
- AND DevHub records returned state, timestamps, and evidence

#### Scenario: Downstream work checks the dependency gate

- GIVEN SW-2.2 planning depends on workspace execution behavior
- WHEN the workspace contract is not yet frozen
- THEN SW-2.2 remains blocked
- AND SW-3.1 may rely only on the defined `evidence_ref` hook, not a new lifecycle model
