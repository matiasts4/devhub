# CLI Heartbeat Command Specification

## Purpose

Defines the `devhub heartbeat <agent-id>` command — an idempotent mutation that writes `last_heartbeat` to `agent_registry` in SQLite. Agents use this to self-report liveness without bouncing through the MCP server.

## Requirements

### Requirement: Command Registration

The CLI MUST register `heartbeat` as a recognized command in `cli.js` that invokes `commands/heartbeat.js`.

#### Scenario: Heartbeat command recognized

- GIVEN the CLI is running
- WHEN `devhub heartbeat test-agent-1` is executed
- THEN the heartbeat command handler is invoked
- AND the process exits with code 0

#### Scenario: Heartbeat with --help

- GIVEN the CLI is running
- WHEN `devhub heartbeat --help` is executed
- THEN a brief help message for the heartbeat command is printed
- AND the process exits with code 0

### Requirement: Missing Agent ID

The command MUST exit with code 2 and print a usage error to stderr when `<agent-id>` is not provided.

#### Scenario: No agent-id argument

- GIVEN the CLI is running
- WHEN `devhub heartbeat` is executed with no agent-id
- THEN stderr contains a usage error message
- AND the process exits with code 2

### Requirement: Idempotent Heartbeat Write

The command MUST update `last_heartbeat` to `datetime('now')` in `agent_registry` for the given `agent_id`. The operation MUST be idempotent — safe to call repeatedly.

#### Scenario: Successful heartbeat update

- GIVEN an agent `test-agent-1` exists in `agent_registry`
- WHEN `devhub heartbeat test-agent-1` is executed
- THEN `last_heartbeat` is set to the current timestamp in the row
- AND stdout contains a confirmation message
- AND the process exits with code 0

#### Scenario: Repeated heartbeat is safe

- GIVEN an agent `test-agent-1` already has a `last_heartbeat` value
- WHEN `devhub heartbeat test-agent-1` is executed again
- THEN `last_heartbeat` is updated to the new current timestamp
- AND no error is raised
- AND the process exits with code 0

### Requirement: Agent Not Found

When the `agent_id` does not exist in `agent_registry`, the command MUST print a warning to stderr and exit with code 1.

#### Scenario: Unknown agent-id

- GIVEN no agent with id `nonexistent-agent` exists in `agent_registry`
- WHEN `devhub heartbeat nonexistent-agent` is executed
- THEN stderr contains a warning that the agent was not found
- AND the process exits with code 1

### Requirement: Direct SQLite Access

The command MUST write to SQLite directly via `getDb()` from `lib/db.js` — it MUST NOT use MCP or HTTP calls.

#### Scenario: Direct database write

- GIVEN the heartbeat command is executing
- WHEN it updates the heartbeat timestamp
- THEN it calls `getDb()` and executes an UPDATE statement directly
- AND no MCP server or HTTP request is made

### Requirement: Unit Tests

The command MUST include unit tests covering exit codes, missing args, agent not found, DB write verification, and idempotency. Tests MUST run via Jest.

#### Scenario: Exit code 0 on success

- GIVEN the heartbeat command is implemented
- WHEN its test suite runs with a valid agent-id
- THEN it verifies the command exits with code 0

#### Scenario: Exit code 2 on missing arg

- GIVEN the heartbeat command is implemented
- WHEN its test suite runs with no agent-id
- THEN it verifies the command exits with code 2

#### Scenario: Exit code 1 on unknown agent

- GIVEN the heartbeat command is implemented
- WHEN its test suite runs with a non-existent agent-id
- THEN it verifies the command exits with code 1

#### Scenario: DB write verified

- GIVEN the heartbeat command is implemented
- WHEN its test suite runs
- THEN it verifies `last_heartbeat` was written to the database

#### Scenario: Strict TDD

- GIVEN strict TDD is enabled in `openspec/config.yaml`
- WHEN implementation begins
- THEN failing tests exist before corresponding production code is written
