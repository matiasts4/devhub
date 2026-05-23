# CLI Tell Command Specification

## Purpose

Defines the `devhub tell` command — CLI equivalent of `team_tell` MCP. Sends inter-agent directives, status updates, handoffs, decisions, risks, and approval requests via SQLite persist.

## Requirements

### Requirement: Command Signature

The CLI MUST accept `devhub tell <recipient> <message>` with positional args and optional flags `--kind`, `--mission`, `--sender`.

#### Scenario: Minimal valid invocation

- GIVEN a valid recipient and message
- WHEN `devhub tell worker-1 "Start processing" --mission m-1 --sender worker-2` is executed
- THEN the command parses recipient, message, mission, and sender correctly
- AND exits with code 0

#### Scenario: All flags provided

- GIVEN all optional flags are specified
- WHEN `devhub tell worker-1 "Review needed" --kind decision --mission m-1 --sender worker-2` is executed
- THEN the command parses all flags including kind=decision
- AND exits with code 0

### Requirement: Kind Validation

The `--kind` flag MUST accept only: `directive`, `status`, `handoff`, `decision`, `risk`, `approval_request`, `approval_result`. Default is `directive`.

#### Scenario: Default kind is directive

- GIVEN no `--kind` flag is provided
- WHEN `devhub tell worker-1 "msg" --mission m-1 --sender worker-2` is executed
- THEN kind defaults to `directive`
- AND exits with code 0

#### Scenario: All valid kind values

- GIVEN each valid kind value
- WHEN `devhub tell worker-1 "msg" --kind <value> --mission m-1 --sender worker-2` is executed
- THEN the command accepts: directive, status, handoff, decision, risk, approval_request, approval_result
- AND exits with code 0

#### Scenario: Invalid kind value

- GIVEN an invalid kind value (e.g., `urgent`)
- WHEN `devhub tell worker-1 "msg" --kind urgent --mission m-1 --sender worker-2` is executed
- THEN stderr contains an error message about invalid kind
- AND the process exits with code 2

### Requirement: Mission and Sender Required

The `--mission` and `--sender` flags MUST be present. Missing either MUST exit with code 2.

#### Scenario: Missing --mission flag

- GIVEN no `--mission` flag
- WHEN `devhub tell worker-1 "msg" --sender worker-2` is executed
- THEN stderr indicates missing mission flag
- AND the process exits with code 2

#### Scenario: Missing --sender flag

- GIVEN no `--sender` flag
- WHEN `devhub tell worker-1 "msg" --mission m-1` is executed
- THEN stderr indicates missing sender flag
- AND the process exits with code 2

#### Scenario: Both flags missing

- GIVEN neither `--mission` nor `--sender`
- WHEN `devhub tell worker-1 "msg"` is executed
- THEN stderr indicates missing required flags
- AND the process exits with code 2

### Requirement: No Args Exits 2

The command MUST exit with code 2 when invoked with no positional arguments.

#### Scenario: Bare tell command

- GIVEN no arguments
- WHEN `devhub tell` is executed
- THEN stderr shows usage information
- AND the process exits with code 2

### Requirement: SQLite Persist

The command MUST write to `mission_messages` and `message_deliveries` tables using `createMissionMessage` and `upsertMessageDelivery` from the db barrel.

#### Scenario: Successful persist

- GIVEN valid args and an existing mission
- WHEN the command executes
- THEN a row is inserted into `mission_messages` with correct kind, sender, body, and mission_id
- AND a row is inserted into `message_deliveries` with status `pending` for the recipient
- AND the process exits with code 0

#### Scenario: Unknown mission

- GIVEN a mission ID that does not exist
- WHEN the command executes
- THEN stderr indicates the mission was not found
- AND the process exits with code 1

### Requirement: TTY-Aware Output

The command MUST detect `process.stdout.isTTY` and produce human-readable output on TTY, JSON output when piped.

#### Scenario: TTY human-readable output

- GIVEN `process.stdout.isTTY` is true
- WHEN the command succeeds
- THEN stdout contains a human-readable confirmation with message ID, recipient, and kind

#### Scenario: Piped JSON output

- GIVEN `process.stdout.isTTY` is false (piped)
- WHEN the command succeeds
- THEN stdout is valid JSON containing message ID, recipient, kind, mission, and sender

### Requirement: Unit Tests

The command MUST include unit tests covering arg parsing, kind validation, missing args, DB write, and TTY detection.

#### Scenario: All tests pass

- GIVEN `devhub-cli/` with test files for tell command
- WHEN `cd devhub-cli && npm test` is executed
- THEN all tell command tests pass with zero failures

#### Scenario: Strict TDD

- GIVEN strict TDD is enabled
- WHEN implementation begins
- THEN failing tests exist before production code is written
