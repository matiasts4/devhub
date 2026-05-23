# CLI Queue Command Specification

## Purpose

Defines the `devhub queue` command — shows the prioritized execution queue with priority scores, blocked status, lease info, and project context via direct SQLite reads.

## Requirements

### Requirement: Command Registration

The CLI MUST register `queue` as a recognized command in `cli.js` that invokes `commands/queue.js`.

#### Scenario: Queue command recognized

- GIVEN the CLI is running
- WHEN `devhub queue` is executed
- THEN the queue command handler is invoked
- AND the process exits with code 0

#### Scenario: Queue --help

- GIVEN the CLI is running
- WHEN `devhub queue --help` is executed
- THEN a help message describing `--limit`, `--project`, `--blocked` flags is printed
- AND the process exits with code 0

### Requirement: Default Queue Display

The command MUST display the top 20 tasks from the execution queue ordered by priority score descending, including pending and in-progress tasks.

#### Scenario: Default shows top 20

- GIVEN the database contains 35 pending tasks across projects
- WHEN `devhub queue` is executed
- THEN the output shows 20 tasks ordered by priority score descending
- AND each row displays: priority score, status, task title, project name

#### Scenario: Fewer than 20 tasks

- GIVEN the database contains 5 pending tasks
- WHEN `devhub queue` is executed
- THEN all 5 tasks are displayed
- AND no placeholder or padding rows are added

### Requirement: Project Filter

When `--project <id>` is provided, the command MUST filter the queue to tasks belonging to that project only.

#### Scenario: Single project filter

- GIVEN the database contains tasks across 3 projects
- WHEN `devhub queue --project abc-123` is executed
- THEN only tasks belonging to project `abc-123` are displayed
- AND tasks from other projects are excluded

#### Scenario: Invalid project ID

- GIVEN an invalid UUID is passed to `--project`
- WHEN `devhub queue --project invalid-id` is executed
- THEN the output shows "No tasks in queue"
- AND the process exits with code 0

### Requirement: Blocked Filter

When `--blocked` is provided, the command MUST show only tasks that are blocked, including the blocking reason.

#### Scenario: Blocked tasks shown

- GIVEN the database contains 8 blocked tasks with dependency reasons
- WHEN `devhub queue --blocked` is executed
- THEN only the 8 blocked tasks are displayed
- AND each row includes the blocked reason (e.g., "blocked by: task-xyz")

#### Scenario: Combined with project filter

- GIVEN the database contains blocked tasks across multiple projects
- WHEN `devhub queue --project abc-123 --blocked` is executed
- THEN only blocked tasks belonging to project `abc-123` are displayed

### Requirement: Limit Flag

The `--limit N` flag MUST control the maximum number of rows displayed, defaulting to 20.

#### Scenario: Custom limit

- GIVEN the database contains 50 pending tasks
- WHEN `devhub queue --limit 5` is executed
- THEN exactly 5 tasks are displayed
- AND they are the 5 highest-priority tasks

#### Scenario: Limit zero

- GIVEN the database contains tasks
- WHEN `devhub queue --limit 0` is executed
- THEN the output shows "No tasks in queue"
- AND the process exits with code 0

### Requirement: Cross-Project Merge

When no `--project` flag is given, the command MUST query all active projects, merge results, deduplicate by task ID, and re-sort by priority score.

#### Scenario: Multi-project merge

- GIVEN 3 active projects each with pending tasks
- WHEN `devhub queue` is executed
- THEN tasks from all 3 projects are merged into a single list
- AND the combined list is sorted by priority score descending
- AND no duplicate task IDs appear

#### Scenario: Active projects cap

- GIVEN 15 active projects exist
- WHEN `devhub queue` is executed
- THEN at most 10 projects are queried
- AND the most recently active projects are preferred

### Requirement: Output Columns

Each queue row MUST display: priority score, status (pending/blocked), task title, project name, blocked reason (if blocked), and lease expiry (if claimed).

#### Scenario: Pending task row

- GIVEN a pending task with score 85 in project "DevHub"
- WHEN the queue is displayed
- THEN the row shows: score 85, status "pending", title, project "DevHub"
- AND no blocked reason or lease expiry is shown

#### Scenario: Blocked task row

- GIVEN a blocked task with score 70 blocked by dependency "task-abc"
- WHEN the queue is displayed
- THEN the row shows: score 70, status "blocked", title, project, and blocked reason "blocked by: task-abc"

#### Scenario: Claimed task with lease

- GIVEN a task claimed by an agent with lease expiring at "2026-05-23T18:00:00Z"
- WHEN the queue is displayed
- THEN the row shows the lease expiry as ISO 8601
- AND a relative time indicator (e.g., "in 2h") is shown

### Requirement: TTY-Aware Output

The command MUST use `lib/format.js` `table(headers, rows)` helper for formatted output in TTY mode, and plain machine-readable rows in non-TTY mode.

#### Scenario: TTY mode uses table

- GIVEN `process.stdout.isTTY` is `true`
- WHEN `devhub queue` is executed
- THEN output uses aligned columns via `table()` helper
- AND ANSI color codes may be applied for status indicators

#### Scenario: Non-TTY mode is plain text

- GIVEN `process.stdout.isTTY` is `false` (piped output)
- WHEN `devhub queue | cat` is executed
- THEN output contains no ANSI escape sequences
- AND rows are machine-readable (e.g., tab-separated or one field per line)

#### Scenario: Long title truncation in table

- GIVEN a task title exceeds 40 characters
- WHEN displayed in TTY table mode
- THEN the title is truncated to 40 characters with ellipsis ("...")
- AND the full title is accessible via a detail line or tooltip

### Requirement: Empty Queue

When no tasks match the filter criteria, the command MUST display "No tasks in queue" and exit with code 0.

#### Scenario: Empty database

- GIVEN the database contains no tasks
- WHEN `devhub queue` is executed
- THEN the output shows "No tasks in queue"
- AND the process exits with code 0

#### Scenario: No matching blocked tasks

- GIVEN the database contains tasks but none are blocked
- WHEN `devhub queue --blocked` is executed
- THEN the output shows "No tasks in queue"
- AND the process exits with code 0

### Requirement: Direct SQLite Access

The command MUST read from SQLite directly via `getDb` and `readExecutionQueueSummary` from `lib/db.js` — it MUST NOT use MCP or HTTP calls.

#### Scenario: Direct database query

- GIVEN the queue command is executing
- WHEN it retrieves queue data
- THEN it calls `getDb()` and uses `readExecutionQueueSummary()`
- AND no MCP server or HTTP request is made

### Requirement: Unit Tests

The command MUST include unit tests covering all flags, TTY/non-TTY modes, empty data, cross-project merge, and exit codes. Tests MUST run via Jest.

#### Scenario: Flag parsing tests

- GIVEN the queue command test suite
- WHEN tests run
- THEN `--limit`, `--project`, and `--blocked` flags are each tested for correct parsing and behavior

#### Scenario: Output format tests

- GIVEN the queue command test suite
- WHEN tests run with TTY mocked to true and false
- THEN TTY output uses table format
- AND non-TTY output contains no ANSI codes

#### Scenario: Empty queue test

- GIVEN the queue command test suite
- WHEN tests run against an empty database
- THEN the command outputs "No tasks in queue" and exits 0
