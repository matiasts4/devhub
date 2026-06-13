# Spec: bootstrap-injection-lock

## Type: NEW

State machine and rename for the launch-time prompt-injection lock. The current path `/tmp/devhub-bootstrap-<mission>-<role>.lock` leaks the launch-time semantic ("bootstrap"); the new path `/tmp/devhub-injection-<launch>-<role>.lock` reflects what the lock actually prevents — duplicate prompt injection. The lock now carries a visible state so operators can read the launch's progress from the filesystem.

## Purpose

Make the launch-time prompt-injection lock observable, rename it to match its semantic, and define explicit transitions so that the wrapper and the launch coordinator agree on what "done" means. The old path is deprecated but remains readable for one release so in-flight launches do not break.

## Requirements

### REQ-LOCK-1: New Lock Path

**Priority**: P0 | **Status**: approved

The system MUST write the launch-time prompt-injection lock to `/tmp/devhub-injection-<launch>-<role>.lock` (new path), where `<launch>` is the value of `DEVHUB_LAUNCH_ID` and `<role>` is the value of `DEVHUB_ROLE`. The lock file MUST contain a single JSON object on one line with at minimum: `launch_id`, `role`, `mission_id`, `state`, `pid`, `created_at`, and `updated_at`. The system MUST remove any old-format lock at `/tmp/devhub-bootstrap-<mission>-<role>.lock` after the new lock is written.

#### Scenario: LOCK-S1 — New launch creates new-path lock

- **Given** `DEVHUB_LAUNCH_ID=l1`, `DEVHUB_ROLE=worker`, `DEVHUB_MISSION_ID=m1`
- **When** the wrapper starts the launch
- **Then** the file `/tmp/devhub-injection-l1-worker.lock` exists
- **AND** it parses as JSON with the required fields
- **AND** `state` is `pending`
- **AND** `/tmp/devhub-bootstrap-m1-worker.lock` does NOT exist (cleaned up if it did)

#### Scenario: LOCK-S2 — Old-format lock is read with warning

- **Given** `/tmp/devhub-bootstrap-m1-worker.lock` exists from a previous launch version
- **When** the new wrapper starts
- **Then** it reads the old lock (one release window of backward compat)
- **AND** logs a `WARN devhub-launch: deprecated bootstrap lock at <old-path>; expected at <new-path>` line
- **AND** migrates the state to the new path before continuing
- **AND** does NOT fail the launch

### REQ-LOCK-2: State Machine

**Priority**: P0 | **Status**: approved

The lock `state` MUST follow the explicit state machine: `pending → injecting → injected`, and `injected → failed` (failure branch). The system MUST persist each transition by overwriting the lock file atomically (write to a temp file in the same directory, then `rename(2)`). The system MUST NOT skip states (e.g., `pending → injected` is forbidden). The system MUST allow `pending → failed` and `injecting → failed` as failure branches.

| From        | To          | Trigger                                            | Effect                           |
| ----------- | ----------- | -------------------------------------------------- | -------------------------------- |
| (none)      | `pending`   | Wrapper begins launch                              | Initial state, lock file created |
| `pending`   | `injecting` | Wrapper reads previous prompt and begins composing | Prompt read starts               |
| `injecting` | `injected`  | Wrapper confirms the prompt is on the tmux pane    | Prompt delivered                 |
| `injected`  | `failed`    | Wrapper detects downstream error                   | Marked for review                |
| `pending`   | `failed`    | Wrapper aborts before injecting                    | Marked for review                |
| `injecting` | `failed`    | Wrapper times out composing                        | Marked for review                |

#### Scenario: LOCK-S3 — Happy path: pending → injecting → injected

- **Given** the lock is in `state=pending`
- **When** the wrapper begins reading the previous prompt
- **Then** the lock transitions to `state=injecting` (atomic write)
- **AND** `updated_at` advances
- **When** the wrapper finishes pushing the prompt to the tmux pane
- **Then** the lock transitions to `state=injected`
- **AND** the launch proceeds normally

#### Scenario: LOCK-S4 — Failure path: injected → failed

- **Given** the lock is in `state=injected`
- **When** the wrapper detects the launched agent did not respond within the health window
- **Then** the lock transitions to `state=failed`
- **AND** `failed_at` is added to the JSON
- **AND** the wrapper exits with a non-zero code

#### Scenario: LOCK-S5 — Skipping state is rejected

- **Given** the lock is in `state=pending`
- **When** the wrapper attempts a transition `pending → injected` directly
- **Then** the wrapper MUST reject the transition
- **AND** exit with a clear error: `lock state machine violation: pending → injected is not allowed`

### REQ-LOCK-3: Staleness and Recovery

**Priority**: P1 | **Status**: approved

A lock MUST be considered stale if its `pid` no longer refers to a live process. On the next launch, the wrapper MUST detect a stale lock, log a warning, remove the stale lock, and start fresh. A lock MUST also be considered stale if `updated_at` is older than 1 hour and `state` is not `injected` or `failed`.

#### Scenario: LOCK-S6 — Stale lock from a dead launch

- **Given** a previous launch wrote `/tmp/devhub-injection-l0-worker.lock` with `pid=99999` and the process is gone
- **When** a new launch with `DEVHUB_LAUNCH_ID=l1` starts
- **Then** the wrapper detects `pid=99999` is not running
- **AND** removes the stale lock
- **AND** starts fresh at `state=pending`
- **AND** logs `WARN devhub-launch: removed stale lock from launch l0`

#### Scenario: LOCK-S7 — Hour-old stuck lock

- **Given** a lock at `state=injecting` with `updated_at` 2 hours ago
- **When** a new launch starts
- **Then** the wrapper marks the lock as stale and removes it
- **AND** logs the staleness reason

### REQ-LOCK-4: One Release Backward Compatibility

**Priority**: P1 | **Status**: approved

For one release after this change is merged, the system MUST read old-format locks (`/tmp/devhub-bootstrap-*-*.lock`) and migrate them to the new path on the next launch. After that release, old-format locks MUST be ignored and the launch MUST proceed as if no lock existed.

#### Scenario: LOCK-S8 — In-flight launch on old format

- **Given** an in-flight launch has a lock at `/tmp/devhub-bootstrap-m1-worker.lock`
- **When** the new wrapper starts a new launch with the same `mission_id` and `role`
- **Then** the old lock is read (warning logged)
- **AND** a new lock is created at `/tmp/devhub-injection-<new_launch_id>-worker.lock`
- **AND** the old lock is removed once the new one is in `state=injected`

## Scenarios Index

| ID      | Description                      | Covers   |
| ------- | -------------------------------- | -------- |
| LOCK-S1 | New launch creates new-path lock | (c)      |
| LOCK-S2 | Old format read with warning     | (c)      |
| LOCK-S3 | Happy path state machine         | (c)      |
| LOCK-S4 | Failure transition               | (c)      |
| LOCK-S5 | Skipping state rejected          | (c)      |
| LOCK-S6 | Stale lock from dead process     | recovery |
| LOCK-S7 | Hour-old stuck lock              | recovery |
| LOCK-S8 | In-flight old-format compat      | (c)      |
