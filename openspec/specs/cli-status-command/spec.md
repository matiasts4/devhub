# CLI Status Command Specification

## Purpose

Defines the `devhub status` command — a compact TTY dashboard showing projects, tasks, milestones, and swarm state via direct SQLite reads.

## Requirements

### Requirement: Command Registration

The CLI MUST register `status` as a recognized command in `cli.js` that invokes `commands/status.js`.

#### Scenario: Status command recognized

- GIVEN the CLI is running
- WHEN `devhub status` is executed
- THEN the status command handler is invoked
- AND the process exits with code 0

#### Scenario: Status with --help

- GIVEN the CLI is running
- WHEN `devhub status --help` is executed
- THEN a brief help message for the status command is printed
- AND the process exits with code 0

### Requirement: Projects Section

The status command MUST display a "Projects" section with total project count and up to 5 projects ordered by progress descending.

#### Scenario: Projects with data

- GIVEN the database contains 8 projects
- WHEN `devhub status` is executed
- THEN the output contains a "Projects" section header
- AND the total count "8" is displayed
- AND up to 5 projects are listed ordered by progress descending
- AND each listed project shows name and progress percentage

#### Scenario: Empty projects

- GIVEN the database contains zero projects
- WHEN `devhub status` is executed
- THEN the "Projects" section shows count 0
- AND no project rows are listed

### Requirement: Tasks Section

The status command MUST display a "Tasks" section with aggregate counts grouped by status: pending, in_progress, completed, blocked.

#### Scenario: Tasks with mixed statuses

- GIVEN the database contains tasks across all four statuses
- WHEN `devhub status` is executed
- THEN the output contains a "Tasks" section header
- AND counts for pending, in_progress, completed, and blocked are displayed

#### Scenario: No tasks

- GIVEN the database contains zero tasks
- WHEN `devhub status` is executed
- THEN the "Tasks" section shows all counts as 0

### Requirement: Milestones Section

The status command MUST display a "Milestones" section showing up to 5 upcoming (non-completed) milestones ordered by due_date ascending.

#### Scenario: Upcoming milestones

- GIVEN the database contains 10 non-completed milestones
- WHEN `devhub status` is executed
- THEN the output contains a "Milestones" section header
- AND up to 5 milestones are listed ordered by due_date ascending
- AND each listed milestone shows title, due_date, and status

#### Scenario: All milestones completed

- GIVEN all milestones in the database have status "completed"
- WHEN `devhub status` is executed
- THEN the "Milestones" section shows no upcoming milestones

### Requirement: Swarm Section

The status command MUST display a "Swarm" section showing count of active agents (status in 'active' or 'running') and count of claimed tasks (current_task_id IS NOT NULL).

#### Scenario: Active swarm

- GIVEN the database contains 3 active agent workspaces with 2 having claimed tasks
- WHEN `devhub status` is executed
- THEN the output contains a "Swarm" section header
- AND active agent count is 3
- AND claimed task count is 2

#### Scenario: No active agents

- GIVEN no agent workspaces have active or running status
- WHEN `devhub status` is executed
- THEN the "Swarm" section shows 0 active agents and 0 claimed tasks

### Requirement: TTY-Aware Output

The command MUST use `lib/format.js` helpers (`section()`, `row()`, `divider()`) and conditionally apply ANSI colors based on `process.stdout.isTTY`.

#### Scenario: TTY mode applies color

- GIVEN `process.stdout.isTTY` is `true`
- WHEN `devhub status` is executed
- THEN section headers include ANSI color codes
- AND output uses compact layout with dividers

#### Scenario: Non-TTY mode is plain text

- GIVEN `process.stdout.isTTY` is `false` (piped output)
- WHEN `devhub status | cat` is executed
- THEN output contains no ANSI escape sequences
- AND all four sections are still present and readable

### Requirement: Output Size Limit

The command output MUST not exceed 40 lines in TTY mode under normal data conditions.

#### Scenario: Output within limit

- GIVEN the database contains typical data (up to 5 projects, 4 task counts, 5 milestones, swarm summary)
- WHEN `devhub status` is executed in TTY mode
- THEN the total line count is 40 or fewer

### Requirement: Direct SQLite Access

The command MUST read from SQLite directly via `getDb` from `lib/db.js` — it MUST NOT use MCP or HTTP calls.

#### Scenario: Direct database query

- GIVEN the status command is executing
- WHEN it retrieves project data
- THEN it calls `getDb()` and executes a SQL query directly
- AND no MCP server or HTTP request is made

### Requirement: Unit Tests

The command MUST include unit tests covering exit code, output sections, TTY/non-TTY modes, and empty database scenarios. Tests MUST run via Jest.

#### Scenario: Exit code 0

- GIVEN the status command is implemented
- WHEN its test suite runs
- THEN it verifies the command exits with code 0

#### Scenario: All sections present

- GIVEN the status command is implemented
- WHEN its test suite runs
- THEN it verifies all four sections (Projects, Tasks, Milestones, Swarm) appear in output

#### Scenario: Non-TTY mode test

- GIVEN the status command is implemented
- WHEN its test suite runs with TTY mocked to false
- THEN output contains no ANSI escape sequences
