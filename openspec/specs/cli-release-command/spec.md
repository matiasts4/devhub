# cli-release-command Specification

## Purpose

Defines the `devhub release <task-id> <claim-token> [--outcome completed|paused|failed|abandoned]` command: validates the claim token against the stored value, clears lease fields, and updates task status based on the outcome flag.

## Requirements

### Requirement: Release with Valid Token

The system MUST validate that the provided `claim-token` matches the stored `claim_token` for the given `task-id`, clear `claim_token` and `lease_expires_at`, update task status based on `--outcome` (default: `completed`), and exit with code 0.

#### Scenario: Successful release with default outcome

- GIVEN a task with status `in_progress` and a valid `claim_token`
- WHEN `devhub release task-123 <matching-token>` is executed
- THEN task status is updated to `completed`
- AND `claim_token` is set to NULL
- AND `lease_expires_at` is set to NULL
- AND stdout displays "Task task-123 released (completed)"
- AND the process exits with code 0

#### Scenario: Release with explicit outcome

- GIVEN a task with status `in_progress` and a valid `claim_token`
- WHEN `devhub release task-123 <matching-token> --outcome paused` is executed
- THEN task status is updated to `paused`
- AND `claim_token` is set to NULL
- AND `lease_expires_at` is set to NULL
- AND the process exits with code 0

#### Scenario: Release with failed outcome

- GIVEN a task with status `in_progress` and a valid `claim_token`
- WHEN `devhub release task-123 <matching-token> --outcome failed` is executed
- THEN task status is updated to `failed`
- AND lease fields are cleared
- AND the process exits with code 0

#### Scenario: Release with abandoned outcome

- GIVEN a task with status `in_progress` and a valid `claim_token`
- WHEN `devhub release task-123 <matching-token> --outcome abandoned` is executed
- THEN task status is updated to `blocked`
- AND lease fields are cleared
- AND the process exits with code 0

### Requirement: Invalid Token

The system MUST exit with code 1 when the provided `claim-token` does not match the stored `claim_token` for the task.

#### Scenario: Token mismatch

- GIVEN a task with `claim_token` = "abc123"
- WHEN `devhub release task-123 wrong-token` is executed
- THEN stderr displays "Invalid claim token"
- AND no database writes occur
- AND the process exits with code 1

### Requirement: Task Not Found

The system MUST exit with code 1 when the specified `task-id` does not exist in the database.

#### Scenario: Non-existent task

- GIVEN no task exists with id "nonexistent"
- WHEN `devhub release nonexistent any-token` is executed
- THEN stderr displays "Task not found: nonexistent"
- AND the process exits with code 1

### Requirement: Missing Arguments

The system MUST exit with code 2 when required arguments `task-id` or `claim-token` are not provided.

#### Scenario: No task-id provided

- GIVEN the CLI is running
- WHEN `devhub release` is executed without arguments
- THEN stderr displays "Missing required arguments: task-id, claim-token"
- AND the process exits with code 2

#### Scenario: Only task-id provided

- GIVEN the CLI is running
- WHEN `devhub release task-123` is executed without claim-token
- THEN stderr displays "Missing required argument: claim-token"
- AND the process exits with code 2

### Requirement: Invalid Outcome Value

The system MUST exit with code 2 when `--outcome` is provided with a value other than `completed`, `paused`, `failed`, or `abandoned`.

#### Scenario: Invalid outcome string

- GIVEN the CLI is running
- WHEN `devhub release task-123 <token> --outcome invalid` is executed
- THEN stderr displays "Invalid outcome: invalid. Must be one of: completed, paused, failed, abandoned"
- AND the process exits with code 2

### Requirement: Expired Lease Warning

The system MUST detect when `lease_expires_at` is in the past, display a warning, but still proceed with the release.

#### Scenario: Release after lease expiry

- GIVEN a task with `lease_expires_at` set to a time in the past
- WHEN `devhub release task-123 <matching-token>` is executed
- THEN stdout displays a warning "Lease expired at <time>"
- AND the release proceeds normally (status updated, lease cleared)
- AND the process exits with code 0

### Requirement: Already Released Task

The system MUST exit with code 1 when the task has no stored `claim_token` (already released or never claimed).

#### Scenario: Task not claimed

- GIVEN a task with status `pending` and `claim_token` = NULL
- WHEN `devhub release task-123 any-token` is executed
- THEN stderr displays "Task task-123 is not currently claimed"
- AND the process exits with code 1

### Requirement: Database Write

The system MUST use `getDb()` from `lib/db.js` to perform a single SQLite UPDATE that clears lease fields and sets the new status.

#### Scenario: Atomic release update

- WHEN release writes to the database
- THEN a single UPDATE statement sets `status`, `claim_token = NULL`, `lease_expires_at = NULL`
- AND the WHERE clause includes both `id` and `claim_token` match for safety
