# CLI Update Status Command Specification

## Purpose

Defines the `devhub update-status <agent-id> <status>` command — a mutation that writes `status` and optional `task_description` to `agent_registry` in SQLite, with enum validation on the status value.

## Requirements

### Requirement: Command Registration

The CLI MUST register `update-status` as a recognized command in `cli.js` that invokes `commands/updateStatus.js`.

#### Scenario: Update-status command recognized

- GIVEN the CLI is running
- WHEN `devhub update-status test-agent-1 active` is executed
- THEN the update-status command handler is invoked
- AND the process exits with code 0

#### Scenario: Update-status with --help

- GIVEN the CLI is running
- WHEN `devhub update-status --help` is executed
- THEN a brief help message for the update-status command is printed
- AND the process exits with code 0

### Requirement: Missing Arguments

The command MUST exit with code 2 and print a usage error to stderr when `<agent-id>` or `<status>` is not provided.

#### Scenario: No arguments

- GIVEN the CLI is running
- WHEN `devhub update-status` is executed with no arguments
- THEN stderr contains a usage error message
- AND the process exits with code 2

#### Scenario: Missing status argument

- GIVEN the CLI is running
- WHEN `devhub update-status test-agent-1` is executed with no status
- THEN stderr contains a usage error message
- AND the process exits with code 2

### Requirement: Status Enum Validation

The command MUST validate `<status>` against the allowed enum values: `active`, `idle`, `working`, `running`, `thinking`, `asking_questions`, `completed`, `failed`, `error`, `offline`. Invalid values MUST cause exit code 1 with an error message to stderr.

#### Scenario: Valid status — active

- GIVEN an agent `test-agent-1` exists in `agent_registry`
- WHEN `devhub update-status test-agent-1 active` is executed
- THEN `status` is set to `active` in the database
- AND the process exits with code 0

#### Scenario: Valid status — all enum values

- GIVEN an agent `test-agent-1` exists in `agent_registry`
- WHEN `devhub update-status test-agent-1 <value>` is executed for each valid enum value
- THEN the status is accepted and written
- AND the process exits with code 0

#### Scenario: Invalid status value

- GIVEN the CLI is running
- WHEN `devhub update-status test-agent-1 invalid-status` is executed
- THEN stderr contains an error listing valid status values
- AND the process exits with code 1

### Requirement: Status Write

The command MUST update `status` and optionally `task_description` in `agent_registry` for the given `agent_id`.

#### Scenario: Successful status update

- GIVEN an agent `test-agent-1` exists with status `idle`
- WHEN `devhub update-status test-agent-1 working` is executed
- THEN `status` is set to `working` in the row
- AND stdout contains a confirmation message
- AND the process exits with code 0

#### Scenario: Status update with task description

- GIVEN an agent `test-agent-1` exists
- WHEN `devhub update-status test-agent-1 working "processing queue"` is executed
- THEN `status` is set to `working` and `task_description` to `processing queue`
- AND the process exits with code 0

### Requirement: Agent Not Found

When the `agent_id` does not exist in `agent_registry`, the command MUST print a warning to stderr and exit with code 1.

#### Scenario: Unknown agent-id

- GIVEN no agent with id `nonexistent-agent` exists in `agent_registry`
- WHEN `devhub update-status nonexistent-agent active` is executed
- THEN stderr contains a warning that the agent was not found
- AND the process exits with code 1

### Requirement: Direct SQLite Access

The command MUST write to SQLite directly via `getDb()` from `lib/db.js` — it MUST NOT use MCP or HTTP calls.

#### Scenario: Direct database write

- GIVEN the update-status command is executing
- WHEN it updates the status
- THEN it calls `getDb()` and executes an UPDATE statement directly
- AND no MCP server or HTTP request is made

### Requirement: Unit Tests

The command MUST include unit tests covering exit codes, missing args, enum validation, agent not found, and DB write verification. Tests MUST run via Jest.

#### Scenario: Exit code 0 on success

- GIVEN the update-status command is implemented
- WHEN its test suite runs with valid args
- THEN it verifies the command exits with code 0

#### Scenario: Exit code 2 on missing args

- GIVEN the update-status command is implemented
- WHEN its test suite runs with no args or missing status
- THEN it verifies the command exits with code 2

#### Scenario: Exit code 1 on invalid status

- GIVEN the update-status command is implemented
- WHEN its test suite runs with an invalid status value
- THEN it verifies the command exits with code 1

#### Scenario: Exit code 1 on unknown agent

- GIVEN the update-status command is implemented
- WHEN its test suite runs with a non-existent agent-id
- THEN it verifies the command exits with code 1

#### Scenario: DB write verified

- GIVEN the update-status command is implemented
- WHEN its test suite runs
- THEN it verifies `status` was written to the database

#### Scenario: Strict TDD

- GIVEN strict TDD is enabled in `openspec/config.yaml`
- WHEN implementation begins
- THEN failing tests exist before corresponding production code is written
