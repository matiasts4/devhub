# CLI Swarm Command Specification

## Purpose

Defines the `devhub swarm` composite command that provides a single overview of the entire swarm — projects, execution queue, registered agents, and upcoming milestones — replacing the need to run `devhub status`, `devhub queue`, and `devhub agents` separately.

## Requirements

### Requirement: Swarm Command Handler

The system MUST provide a `swarm` command handler in `commands/swarm.js` that composes four sections: Projects summary, Queue summary, Agent summary, and Upcoming milestones.

#### Scenario: Full swarm output with data

- GIVEN the database contains projects, queued tasks, registered agents, and milestones
- WHEN `devhub swarm` is executed
- THEN stdout contains four labeled sections: Projects, Queue, Agents, Milestones
- AND each section displays up to 5 items
- AND the process exits with code 0

#### Scenario: Section ordering

- GIVEN the swarm command is executed
- WHEN output is rendered
- THEN sections appear in order: Projects → Queue → Agents → Milestones
- AND sections are separated by divider lines

### Requirement: Compact Mode

The system MUST support a `--compact` flag that collapses all sections into single-line summaries, producing output under 30 lines.

#### Scenario: Compact flag reduces output

- GIVEN the database contains multiple projects, tasks, agents, and milestones
- WHEN `devhub swarm --compact` is executed
- THEN each section renders as a single summary line
- AND total output is under 30 lines
- AND the process exits with code 0

#### Scenario: Compact flag with empty data

- GIVEN the database is empty
- WHEN `devhub swarm --compact` is executed
- THEN output shows empty-state messages for each section
- AND total output is under 30 lines

### Requirement: Direct SQLite Reads

The system MUST read swarm data directly from SQLite using existing compact durable read functions from `lib/db.js`: `readProjectSummary()`, `readExecutionQueueSummary()`, `readAgentRegistrySummary()`, and milestone queries.

#### Scenario: No new database queries

- GIVEN the swarm handler is implemented
- WHEN reviewed for database access
- THEN no new SQL queries are introduced
- AND all reads use existing functions from `lib/db.js`

#### Scenario: Read-only access

- GIVEN the swarm command is executed
- WHEN database operations occur
- THEN no write operations or locks are acquired
- AND concurrent commands are not blocked

### Requirement: TTY-Aware Output

The system MUST detect TTY mode and format output accordingly: TTY uses formatted sections with color; non-TTY produces machine-readable key=value pairs with no ANSI codes.

#### Scenario: TTY formatted output

- GIVEN `process.stdout.isTTY` is `true`
- WHEN `devhub swarm` is executed
- THEN output uses formatted sections via `lib/format.js` helpers (`section()`, `row()`, `divider()`, `table()`)
- AND ANSI color codes are present

#### Scenario: Non-TTY machine-readable output

- GIVEN `process.stdout.isTTY` is `false`
- WHEN `devhub swarm` is piped (e.g., `devhub swarm | cat`)
- THEN output contains no ANSI escape sequences
- AND each data item is rendered as `key=value` pairs
- AND section headers are plain text labels

### Requirement: Empty State Handling

The system MUST display "No swarm data available" when the database is empty or no data exists for a section, and exit with code 0.

#### Scenario: Completely empty database

- GIVEN no projects, tasks, agents, or milestones exist
- WHEN `devhub swarm` is executed
- THEN each section displays "No swarm data available"
- AND the process exits with code 0

#### Scenario: Partial data (some sections empty)

- GIVEN projects exist but no agents are registered
- WHEN `devhub swarm` is executed
- THEN Projects section shows data
- AND Agents section displays "No swarm data available"
- AND the process exits with code 0

### Requirement: Command Registration

The system MUST register the `swarm` command in `cli.js` and remove `swarm` from the stub commands list.

#### Scenario: Swarm command is recognized

- GIVEN `swarm` is registered in `cli.js` command map
- WHEN `devhub swarm` is executed
- THEN the swarm handler in `commands/swarm.js` is invoked

#### Scenario: Swarm appears in help

- GIVEN `swarm` is registered
- WHEN `devhub --help` is executed
- THEN the help output includes `swarm` in the command list

#### Scenario: Swarm is not a stub

- GIVEN `cli.js` has a stub commands list
- WHEN `cli.js` is loaded
- THEN `swarm` is NOT in the stub commands list

### Requirement: Unit Tests

The system MUST include unit tests in `commands/swarm.test.js` covering full output, compact mode, TTY detection, empty states, and command registration. Tests MUST run via Jest.

#### Scenario: All swarm tests pass

- GIVEN `commands/swarm.test.js` exists
- WHEN `cd devhub-cli && npm test` is executed
- THEN all swarm-related tests pass with zero failures

#### Scenario: Strict TDD — tests before implementation

- GIVEN strict TDD is enabled in `openspec/config.yaml`
- WHEN implementation of swarm command begins
- THEN failing tests exist before corresponding production code is written
