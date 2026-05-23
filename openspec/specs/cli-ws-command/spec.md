# CLI Workspace Command Specification

## Purpose

Single-workspace detail lookup by ID, including latest run and artifact summary. TTY: formatted sections; non-TTY: key=value pairs.

## Requirements

### Requirement: Workspace Detail Lookup

The system SHALL query the SQLite database for a workspace by its ID and return: workspace_id, agent_id, status, branch, current task, latest run, and latest artifact.

#### Scenario: Workspace found — TTY output

- GIVEN a workspace exists with ID `ws-001`
- WHEN `devhub ws ws-001` is executed with TTY
- THEN stdout displays formatted sections for each field
- AND the process exits with code 0

#### Scenario: Workspace found — non-TTY output

- GIVEN a workspace exists with ID `ws-001`
- WHEN `devhub ws ws-001` is executed with stdout piped
- THEN stdout contains `workspace_id=...`, `agent_id=...`, `status=...`, `branch=...`, `current_task=...`, `latest_run=...`, `latest_artifact=...`
- AND no ANSI escape sequences are present
- AND the process exits with code 0

#### Scenario: Workspace not found

- GIVEN no workspace exists with ID `missing-ws`
- WHEN `devhub ws missing-ws` is executed
- THEN stderr contains "Workspace not found"
- AND the process exits with code 1

### Requirement: Missing ID Argument

The system SHALL validate that an ID argument is provided.

#### Scenario: No ID provided

- GIVEN the user runs `devhub ws` with no arguments
- WHEN the command is executed
- THEN stderr contains "ID required"
- AND the process exits with code 2

### Requirement: Latest Run and Artifact Summary

When a workspace has associated runs and artifacts, the system SHALL display the latest run status and a summary of the latest artifact.

#### Scenario: Workspace with runs and artifacts

- GIVEN workspace `ws-001` has 3 runs, the latest with status `succeeded` and an artifact of kind `git.commit`
- WHEN `devhub ws ws-001` is executed
- THEN output includes the latest run status (`succeeded`)
- AND output includes the latest artifact kind (`git.commit`)

#### Scenario: Workspace with no runs

- GIVEN workspace `ws-002` exists but has no associated runs
- WHEN `devhub ws ws-002` is executed
- THEN output indicates `latest_run=none` or equivalent
- AND output indicates `latest_artifact=none` or equivalent

### Requirement: Database Read Only

The system MUST NOT mutate any data — only read from the shared compact durable core (`lib/db.js`).

#### Scenario: No side effects on lookup

- GIVEN a valid workspace ID
- WHEN `devhub ws <id>` is executed
- THEN no database writes occur
- AND no files are modified
