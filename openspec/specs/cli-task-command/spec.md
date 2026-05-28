# CLI Task Command Specification

## Purpose

Single-task detail lookup by ID via direct SQLite. Displays formatted output in TTY mode; key=value pairs when piped.

## Requirements

### Requirement: Task Detail Lookup

The system SHALL query the SQLite database for a task by its ID and return all available fields: title, status, priority, project, assigned agent, due date, and description.

#### Scenario: Task found — TTY output

- GIVEN a task exists with ID `abc-123`
- WHEN `devhub task abc-123` is executed with TTY
- THEN stdout displays formatted sections for each field
- AND the process exits with code 0

#### Scenario: Task found — non-TTY output

- GIVEN a task exists with ID `abc-123`
- WHEN `devhub task abc-123` is executed with stdout piped
- THEN stdout contains `title=...`, `status=...`, `priority=...`, `project=...`, `assigned_to=...`, `due_date=...`, `description=...`
- AND no ANSI escape sequences are present
- AND the process exits with code 0

#### Scenario: Task not found

- GIVEN no task exists with ID `missing-id`
- WHEN `devhub task missing-id` is executed
- THEN stderr contains "Task not found"
- AND the process exits with code 1

### Requirement: Missing ID Argument

The system SHALL validate that an ID argument is provided.

#### Scenario: No ID provided

- GIVEN the user runs `devhub task` with no arguments
- WHEN the command is executed
- THEN stderr contains "ID required"
- AND the process exits with code 2

### Requirement: Description Truncation

The system SHOULD truncate long descriptions in TTY mode to prevent overflow, with full text available via `--verbose`.

#### Scenario: Long description truncated in TTY

- GIVEN a task with a description longer than 120 characters
- WHEN `devhub task <id>` is executed with TTY
- THEN the description is truncated with an ellipsis (`...`)
- AND the full description is NOT shown

#### Scenario: Full description with --verbose

- GIVEN a task with a description longer than 120 characters
- WHEN `devhub task <id> --verbose` is executed
- THEN the full description is displayed without truncation

### Requirement: Database Read Only

The system MUST NOT mutate any data — only read from the shared compact durable core (`lib/db.js`).

#### Scenario: No side effects on lookup

- GIVEN a valid task ID
- WHEN `devhub task <id>` is executed
- THEN no database writes occur
- AND no files are modified
