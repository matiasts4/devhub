# Delta: cli-swarm-command — verify/evidence/logs CLI surface for launch hardening

## ADDED Requirements

### REQ-CLI-VERIFY-1: swarm-verify Command

**Priority**: P0 | **Status**: delta

The system MUST provide a `devhub swarm-verify` command that runs preflight checks (worktree race, prompt-leak regex, watchdog respawn budget, capability probe) and exits with a deterministic code. The verify command is the contract surface for the swarm-launch-hardening preflight.

#### Scenario: LH-CV-1 — preflight passes, exit 0

- **GIVEN** a fresh launch with all checks passing
- **WHEN** `devhub swarm-verify` is executed
- **THEN** each check prints `PASS <check-name>`
- **AND** the process exits with code 0
- **AND** the summary line reads `verify: ok (N/N checks passed)`

#### Scenario: LH-CV-2 — failed preflight, exit 1

- **GIVEN** at least one check fails (e.g. prompt-leak regex matched a chunk)
- **WHEN** `devhub swarm-verify` is executed
- **THEN** the failing check prints `FAIL <check-name>: <reason>`
- **AND** the process exits with code 1
- **AND** the summary line reads `verify: failed (M/N checks passed)`

#### Scenario: LH-CV-3 — missing logs, exit 2

- **GIVEN** the launch logs directory is absent or unreadable
- **WHEN** `devhub swarm-verify` is executed
- **THEN** the command prints `ERROR: launch logs not found at <path>`
- **AND** the process exits with code 2
- **AND** no check is run

### REQ-CLI-VERIFY-2: swarm-evidence Command

**Priority**: P0 | **Status**: delta

The system MUST provide a `devhub swarm-evidence` command that produces a tarball containing the artifacts required to reproduce a launch verdict. The output schema is fixed.

#### Scenario: LH-CE-1 — evidence tarball schema

- **GIVEN** a launch with launchId `<id>` has completed (or aborted)
- **WHEN** `devhub swarm-evidence --launch <id>` is executed
- **THEN** a tarball is written to `./evidence/<id>.tar.gz`
- **AND** the tarball contains, at these paths:
  - `launch.json` — the launch record including `renderer_demotions` array
  - `roles/<role>.log` — one file per role (director, architect, implementer, reviewer, devops)
  - `crashes/*.dump` — one file per unexpected PTY exit, if any
  - `capabilities.json` — the capability probe result for the launch
- **AND** the process exits with code 0

#### Scenario: LH-CE-2 — missing launch, exit 3

- **GIVEN** the launchId has no record
- **WHEN** `devhub swarm-evidence --launch <id>` is executed
- **THEN** the command prints `ERROR: launch <id> not found`
- **AND** the process exits with code 3
- **AND** no tarball is written

### REQ-CLI-VERIFY-3: swarm-logs List Mode

**Priority**: P1 | **Status**: delta

The system MUST provide a `devhub swarm-logs list` command that enumerates launch log directories and their state. The list mode is the canonical way to discover launchIds for `swarm-evidence`.

#### Scenario: LH-CL-1 — list mode enumerates launches

- **GIVEN** the launches log directory contains 3 launch records
- **WHEN** `devhub swarm-logs list` is executed
- **THEN** stdout contains 3 lines, one per launch
- **AND** each line has the format `<launchId> <status> <started-at> <role-count>`
- **AND** the process exits with code 0

#### Scenario: LH-CL-2 — empty launches dir

- **GIVEN** the launches log directory is empty
- **WHEN** `devhub swarm-logs list` is executed
- **THEN** stdout contains the literal `No launches found`
- **AND** the process exits with code 0
