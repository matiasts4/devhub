# cli-claim-command Specification

## Purpose

Defines the `devhub claim <agent-id>` command: queries the execution queue for the next pending task, generates a lease token, sets lease expiry, and updates task status to `in_progress`.

## Requirements

### Requirement: Claim Next Task

The system MUST accept an `agent-id` argument, query the execution queue for the next available pending task, generate a `claim_token`, set `lease_expires_at` to now + 5 minutes, update task status to `in_progress`, and return task details.

#### Scenario: Successful claim

- GIVEN a pending task exists in the execution queue
- WHEN `devhub claim agent-1` is executed
- THEN the task status is updated to `in_progress`
- AND `claim_token` is set to a 32-character hex string
- AND `lease_expires_at` is set to current time + 5 minutes
- AND stdout displays task id, title, and project
- AND the process exits with code 0

#### Scenario: Piped output is machine-readable

- GIVEN `process.stdout.isTTY` is false
- WHEN `devhub claim agent-1 | jq .` is executed
- THEN stdout contains valid JSON with task id, title, claim_token, and lease_expires_at
- AND the process exits with code 0

### Requirement: No Available Tasks

The system MUST exit with code 1 when no pending tasks are available in the execution queue.

#### Scenario: Empty queue

- GIVEN no tasks have status `pending` in the execution queue
- WHEN `devhub claim agent-1` is executed
- THEN stdout displays "No pending tasks available"
- AND no database writes occur
- AND the process exits with code 1

### Requirement: Missing Arguments

The system MUST exit with code 2 when the `agent-id` argument is not provided.

#### Scenario: No agent-id provided

- GIVEN the CLI is running
- WHEN `devhub claim` is executed without arguments
- THEN stderr displays "Missing required argument: agent-id"
- AND the process exits with code 2

### Requirement: Token Generation

The system MUST generate a unique `claim_token` using `crypto.randomBytes(16).toString('hex')` to ensure 256-bit entropy and prevent collisions.

#### Scenario: Token is unique hex string

- WHEN a claim is executed
- THEN `claim_token` is a 32-character lowercase hex string
- AND the token is generated via `crypto.randomBytes(16)`

### Requirement: Lease Duration

The system MUST set `lease_expires_at` to exactly 5 minutes (300 seconds) from the current time at claim execution.

#### Scenario: Lease expiry is 5 minutes ahead

- WHEN `devhub claim agent-1` succeeds at time T
- THEN `lease_expires_at` equals T + 300 seconds (±1 second tolerance)

### Requirement: Database Write

The system MUST use `getDb()` from `lib/db.js` to perform a single SQLite UPDATE that atomically sets `status`, `claim_token`, and `lease_expires_at` with a WHERE clause filtering by `status = 'pending'`.

#### Scenario: Atomic claim update

- WHEN claim writes to the database
- THEN a single UPDATE statement sets all three fields
- AND the WHERE clause includes `status = 'pending'` to prevent double-claim
