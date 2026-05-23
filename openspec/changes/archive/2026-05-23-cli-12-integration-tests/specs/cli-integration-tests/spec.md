# CLI Integration Tests Specification

## Purpose

End-to-end CLI test harness against real SQLite with seeded data. Validates multi-command workflows, agent lifecycle, queue ordering, swarm state transitions, and error recovery — scenarios unit tests with mocked DB cannot cover.

## Requirements

### Requirement: Test Harness Isolation

The system MUST provide an isolated temp SQLite database per test with deterministic seed data.

#### Scenario: Fresh DB per test

- GIVEN a test starts
- WHEN the harness initializes
- THEN a unique temp SQLite DB is created via `os.tmpdir()` + UUID
- AND `DEVHUB_DB_PATH` env var points to it
- AND no other test shares this DB path

#### Scenario: DB cleanup after test

- GIVEN a test completes (pass or fail)
- WHEN the harness teardown runs
- THEN the temp DB file is deleted
- AND no leftover `.db` files remain in `os.tmpdir()`

### Requirement: Seed Data Factory

The system MUST provide deterministic seed scripts that create reproducible test fixtures.

#### Scenario: Seed creates baseline data

- GIVEN a fresh temp DB
- WHEN the seed factory runs
- THEN it creates at least 2 projects, 5 tasks, 2 agents, 1 milestone
- AND all records have known IDs for assertion

#### Scenario: Seed fails on schema drift

- GIVEN a schema change removes a required column
- WHEN the seed factory runs
- THEN it fails fast with a descriptive error
- AND does not produce partial data

### Requirement: Claim-Release Cycle

The system MUST validate the complete claim → lease verify → release workflow end-to-end.

#### Scenario: Happy path claim and release

- GIVEN a pending task exists in a project
- WHEN an agent registers and claims the task
- THEN the task status becomes `in_progress`
- AND the agent holds a valid claim token
- WHEN the agent releases with outcome `completed`
- THEN the task status becomes `completed`
- AND the claim token is invalidated

#### Scenario: Release with failed outcome

- GIVEN an agent holds a claimed task
- WHEN the agent releases with outcome `failed`
- THEN the task status becomes `blocked` or `pending`
- AND the claim token is invalidated

#### Scenario: Release with paused outcome

- GIVEN an agent holds a claimed task
- WHEN the agent releases with outcome `paused`
- THEN the task status becomes `pending`
- AND the agent can re-claim the same task

### Requirement: Queue Ordering

The system MUST validate task queue ordering across multiple projects with priority scores and blocked dependencies.

#### Scenario: Priority score ordering

- GIVEN 3 pending tasks with different priority scores across 2 projects
- WHEN the execution queue is requested
- THEN tasks are returned in descending score order
- AND the highest-score task is first

#### Scenario: Blocked tasks excluded

- GIVEN a task has an unmet dependency
- WHEN the queue is requested with `include_blocked=false`
- THEN the blocked task is NOT in the result
- AND the queue explanation lists the blocking dependency

#### Scenario: Blocked tasks included

- GIVEN a task has an unmet dependency
- WHEN the queue is requested with `include_blocked=true`
- THEN the blocked task IS in the result
- AND its blocking reason is present in the response

### Requirement: Agent Lifecycle

The system MUST validate the full agent lifecycle: register → heartbeat → claim → release → unregister.

#### Scenario: Full lifecycle

- GIVEN a fresh DB with projects and tasks
- WHEN an agent registers
- THEN the agent appears in the registry
- WHEN the agent sends a heartbeat
- THEN the heartbeat timestamp updates
- WHEN the agent claims a task
- THEN the task is assigned to the agent
- WHEN the agent releases the task
- THEN the task is freed
- WHEN the agent unregisters
- THEN the agent is removed from the registry

#### Scenario: Heartbeat prevents cleanup

- GIVEN a registered agent
- WHEN heartbeats are sent within the timeout window
- THEN the agent is NOT marked as orphaned
- AND the agent's task lease remains valid

### Requirement: Swarm State Transitions

The system MUST validate workspace and agent state transitions across commands.

#### Scenario: Workspace transitions

- GIVEN a workspace in `planned` status
- WHEN the workspace is prepared
- THEN status transitions to `ready`
- WHEN a task is claimed against it
- THEN status transitions to `active`
- WHEN the task is completed
- THEN status transitions to `completed`

#### Scenario: Agent status transitions

- GIVEN a registered agent
- WHEN the agent claims a task
- THEN agent status becomes `working`
- WHEN the agent completes the task
- THEN agent status becomes `idle`
- WHEN the agent encounters an error
- THEN agent status becomes `error`

### Requirement: Error Recovery

The system MUST validate error recovery paths: expired leases, failed tasks, token mismatch, double-claim.

#### Scenario: Expired lease renewal fails

- GIVEN an agent holds a claim token past the TTL
- WHEN the agent attempts to renew the lease
- THEN the renewal is rejected
- AND the task returns to `pending` status

#### Scenario: Token mismatch on release

- GIVEN agent A holds a valid claim token
- WHEN agent B attempts to release the task with a different token
- THEN the release is rejected
- AND the task remains assigned to agent A

#### Scenario: Double-claim prevention

- GIVEN agent A has claimed a task
- WHEN agent B attempts to claim the same task
- THEN the claim is rejected
- AND the task remains assigned to agent A

#### Scenario: Unregistered agent cannot claim

- GIVEN an agent that has been unregistered
- WHEN the agent attempts to claim a task
- THEN the claim is rejected
- AND the task remains `pending`
