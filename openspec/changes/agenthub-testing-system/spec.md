# AgentHub Testing System — Distributed LOCKS Specification

## Purpose

Define a distributed locking system (LOCKS) and comprehensive test harnesses that provide systematic, isolated test coverage for AgentHub's 18+ API routes, 24+ MCP tools, 15+ Telegram bot commands, and end-to-end agent flows. The system eliminates race conditions in test execution through SQLite-based mutex locks with TTL expiry, and provides CLI-driven test orchestration for individual, suite, and parallel execution.

---

## Section 1: Distributed LOCKS System

### LOCK-001: Lock Table Schema

The system SHALL provide a SQLite table `test_locks` in `data/devhub.db` with the following schema:

| Column        | Type | Constraints                        | Description                                                      |
| ------------- | ---- | ---------------------------------- | ---------------------------------------------------------------- |
| `lock_id`     | TEXT | PRIMARY KEY                        | Unique lock identifier (UUID v4)                                 |
| `lock_type`   | TEXT | NOT NULL, CHECK IN (…)             | One of: `session`, `endpoint`, `resource`, `flow`                |
| `lock_key`    | TEXT | NOT NULL                           | Scoped key (e.g., `api:/api/agenthub/chat`, `resource:task-123`) |
| `owner`       | TEXT | NOT NULL                           | Session/test identifier that owns the lock                       |
| `acquired_at` | TEXT | NOT NULL, DEFAULT(datetime('now')) | ISO 8601 timestamp of acquisition                                |
| `expires_at`  | TEXT | NOT NULL                           | ISO 8601 timestamp when lock auto-expires                        |
| `metadata`    | TEXT | NULL                               | JSON string with optional context                                |

The table SHALL have a unique index on `(lock_type, lock_key)` to enforce mutual exclusion per scoped key.

#### Scenario: Table creation on first use

- **Given** the `test_locks` table does not exist in `data/devhub.db`
- **When** the lock system initializes
- **Then** the table is created with the specified schema
- **AND** the unique index on `(lock_type, lock_key)` is created

#### Scenario: Unique constraint prevents duplicate locks

- **Given** a lock exists with `lock_type='endpoint'` and `lock_key='api:/api/agenthub/chat'`
- **When** another test attempts to acquire a lock with the same type and key
- **Then** the INSERT fails with a constraint violation
- **AND** the second test receives an `acquire_failed` response

### LOCK-002: Lock Types and Scoping

The system SHALL support four lock types with distinct scoping semantics:

| Type       | Scope                                                         | Example Key                   |
| ---------- | ------------------------------------------------------------- | ----------------------------- |
| `session`  | Per-agent session (prevents concurrent ops on same session)   | `session:abc-123`             |
| `endpoint` | Per-API route (prevents concurrent requests to same endpoint) | `endpoint:/api/agenthub/chat` |
| `resource` | Per-DB resource (project, task, milestone)                    | `resource:task-uuid-here`     |
| `flow`     | Per-end-to-end flow (prevents overlapping flow tests)         | `flow:headless-lifecycle`     |

The `lock_key` format SHALL be `{type_prefix}:{identifier}` where the prefix maps to the lock type.

#### Scenario: Session lock isolates agent session tests

- **Given** test A acquires a `session` lock for `session:abc-123`
- **When** test B attempts to acquire a `session` lock for the same session ID
- **Then** test B's acquisition fails
- **AND** test B can retry after the lock is released or expires

#### Scenario: Different lock types can coexist

- **Given** test A holds an `endpoint` lock for `endpoint:/api/agenthub/chat`
- **When** test B attempts to acquire a `session` lock for `session:xyz-789`
- **Then** test B's acquisition succeeds
- **AND** both tests run concurrently without conflict

### LOCK-003: Lock Acquisition via BEGIN IMMEDIATE

The system SHALL acquire locks using `BEGIN IMMEDIATE` transaction mode to prevent SQLite write contention between concurrent test processes. The acquisition SHALL use `INSERT OR IGNORE` with the unique index on `(lock_type, lock_key)`.

The `acquire()` function SHALL:

1. Start a `BEGIN IMMEDIATE` transaction
2. Attempt `INSERT OR IGNORE` into `test_locks`
3. Check `changes()` — if 0, the lock is held by another owner
4. If acquired, commit and return `{ success: true, lock_id, expires_at }`
5. If not acquired, rollback and return `{ success: false, reason: 'lock_held', owner }`

#### Scenario: Lock acquired successfully

- **Given** no lock exists for `endpoint:/api/agenthub/chat`
- **When** `acquire('endpoint', '/api/agenthub/chat', 'test-1')` is called
- **Then** the lock is inserted with `owner='test-1'`
- **AND** the function returns `{ success: true, lock_id, expires_at }`

#### Scenario: Lock acquisition fails when held by another owner

- **Given** a lock exists for `endpoint:/api/agenthub/chat` owned by `test-1`
- **When** `acquire('endpoint', '/api/agenthub/chat', 'test-2')` is called
- **Then** the function returns `{ success: false, reason: 'lock_held', owner: 'test-1' }`
- **AND** no new row is inserted

### LOCK-004: TTL Mechanism

Every lock SHALL have a configurable Time-To-Live (TTL). The default TTL SHALL be 60 seconds. The `expires_at` column SHALL be set to `datetime('now', '+N seconds')` at acquisition time, where N is the TTL value.

The TTL SHALL be configurable via:

- Environment variable `LOCK_TTL_SECONDS` (default: 60)
- Per-acquisition parameter `options.ttl` (overrides default)

#### Scenario: Default TTL of 60 seconds applied

- **Given** `LOCK_TTL_SECONDS` is not set
- **When** a lock is acquired without explicit TTL
- **Then** `expires_at` is set to 60 seconds after `acquired_at`

#### Scenario: Custom TTL overrides default

- **Given** the default TTL is 60 seconds
- **When** a lock is acquired with `{ ttl: 15 }`
- **Then** `expires_at` is set to 15 seconds after `acquired_at`

#### Scenario: TTL prevents deadlocks from killed tests

- **Given** a test acquires a lock with TTL=10s
- **When** the test process is killed (SIGKILL) before releasing
- **Then** after 10 seconds the lock expires
- **AND** another test can acquire the same lock

### LOCK-005: Lock Release

The system SHALL provide a `release(lockId, owner)` function that deletes the lock row only if the requesting owner matches the lock's owner. This prevents one test from releasing another test's lock.

#### Scenario: Owner releases their own lock

- **Given** test A holds lock `lock-abc` with `owner='test-a'`
- **When** `release('lock-abc', 'test-a')` is called
- **Then** the lock row is deleted
- **AND** the function returns `{ success: true }`

#### Scenario: Non-owner cannot release lock

- **Given** test A holds lock `lock-abc` with `owner='test-a'`
- **When** `release('lock-abc', 'test-b')` is called
- **Then** no row is deleted
- **AND** the function returns `{ success: false, reason: 'not_owner' }`

#### Scenario: Release of non-existent lock

- **Given** no lock exists with ID `lock-xyz`
- **When** `release('lock-xyz', 'test-a')` is called
- **Then** the function returns `{ success: false, reason: 'not_found' }`

### LOCK-006: Lock Expiry and Cleanup

The system SHALL provide an `expireStale()` function that deletes all locks where `expires_at < datetime('now')`. This function SHALL be called:

1. Before each test suite starts (in `beforeAll` or `beforeEach`)
2. On lock acquisition failure (to check if the holder expired)
3. Periodically via a cleanup interval (every 30s during parallel runs)

#### Scenario: Expired lock is cleaned up

- **Given** a lock with `expires_at` in the past exists
- **When** `expireStale()` is called
- **Then** the expired lock is deleted
- **AND** the lock key becomes available for new acquisition

#### Scenario: Non-expired lock is preserved

- **Given** a lock with `expires_at` in the future exists
- **When** `expireStale()` is called
- **Then** the lock remains in the table
- **AND** no rows are deleted

### LOCK-007: Deadlock Prevention via Retry with Backoff

The system SHALL implement automatic retry with exponential backoff when lock acquisition fails due to contention. The retry policy SHALL be:

- Maximum retries: 5
- Base delay: 100ms
- Backoff formula: `Math.min(100 * 2^attempt, 5000)` (capped at 5s)
- Jitter: ±50ms random variance

After exhausting retries, the `acquire()` function SHALL return `{ success: false, reason: 'max_retries_exceeded' }`.

#### Scenario: Lock acquired on retry after contention clears

- **Given** test A holds a lock that will be released in 200ms
- **When** test B calls `acquire()` for the same lock
- **Then** the first attempt fails
- **AND** the second retry (after backoff) succeeds once test A releases
- **AND** total wait is under 1 second

#### Scenario: Max retries exceeded

- **Given** a lock is held and will not be released for 30 seconds
- **When** a test calls `acquire()` with default retry policy
- **Then** after 5 retries the function returns `{ success: false, reason: 'max_retries_exceeded' }`

### LOCK-008: Lock Status Query API

The system SHALL provide a `status()` function that returns the current state of all locks:

```js
{
  locks: [
    { lock_id, lock_type, lock_key, owner, acquired_at, expires_at, is_expired: boolean },
    ...
  ],
  total: number,
  expired: number
}
```

The system SHALL also provide `statusByKey(type, key)` to query a specific lock.

#### Scenario: Status returns all active locks

- **Given** 3 locks are currently held (none expired)
- **When** `status()` is called
- **Then** the response contains 3 lock entries
- **AND** `total: 3`, `expired: 0`

#### Scenario: StatusByKey returns specific lock

- **Given** a lock exists for `endpoint:/api/agenthub/chat`
- **When** `statusByKey('endpoint', '/api/agenthub/chat')` is called
- **Then** the response contains that lock's details
- **AND** `is_expired` reflects whether `expires_at` has passed

### LOCK-009: Programmatic Lock API Module

The system SHALL expose a module at `lib/test-locks.js` with the following exported functions:

| Function      | Signature                                             | Description                         |
| ------------- | ----------------------------------------------------- | ----------------------------------- | ----------------- |
| `acquire`     | `(type, key, owner, options?) => Promise<LockResult>` | Acquire a lock                      |
| `release`     | `(lockId, owner) => Promise<ReleaseResult>`           | Release a lock                      |
| `status`      | `() => Promise<LockStatus>`                           | Get all lock states                 |
| `statusByKey` | `(type, key) => Promise<LockEntry                     | null>`                              | Get specific lock |
| `expireStale` | `() => Promise<number>`                               | Delete expired locks, returns count |
| `extend`      | `(lockId, owner, extraSeconds) => Promise<boolean>`   | Extend TTL of existing lock         |

The module SHALL use `better-sqlite3` for synchronous operations within a single process and support async wrapping for cross-process coordination.

#### Scenario: Module exports all required functions

- **Given** the module `lib/test-locks.js` is imported
- **When** checking its exports
- **Then** it exports `acquire`, `release`, `status`, `statusByKey`, `expireStale`, `extend`
- **AND** each export is a function

#### Scenario: Extend TTL of existing lock

- **Given** a lock with 10s remaining TTL owned by `test-a`
- **When** `extend(lockId, 'test-a', 30)` is called
- **Then** the lock's `expires_at` is pushed forward by 30 seconds
- **AND** the function returns `true`

---

## Section 2: API Route Test Harness

### API-001: Test Harness Base Pattern

The system SHALL provide a test harness at `tests/agenthub/harness.js` that implements the acquire → execute → verify → release pattern for API route tests:

```js
async function testApiRoute({ method, path, body, headers, locks, assertions }) {
  // 1. Acquire locks
  // 2. Execute request (via Next.js test server or fetch)
  // 3. Verify response status, body, headers
  // 4. Verify side effects (DB state, file state)
  // 5. Release locks
}
```

Each API test file SHALL use this harness to ensure consistent lock usage and verification.

#### Scenario: Harness acquires lock before test execution

- **Given** an API test for `/api/agenthub/chat`
- **When** the test starts
- **Then** an `endpoint` lock is acquired for the route
- **AND** the lock is held for the duration of the test

#### Scenario: Harness releases lock after test completion

- **Given** an API test completed execution
- **When** the test finishes (success or failure)
- **Then** the endpoint lock is released in `afterEach`
- **AND** the lock is released even if the test threw an error

### API-002: Request Validation Tests

Each API route SHALL have tests that validate:

1. **Required fields**: Missing required request body/query fields return 400
2. **Type validation**: Invalid types (string where number expected) return 400
3. **Authentication**: Missing or invalid auth tokens return 401
4. **Authorization**: Insufficient permissions return 403
5. **Method validation**: Wrong HTTP method returns 405

#### Scenario: Missing required field returns 400

- **Given** the `/api/agenthub/sessions` POST endpoint requires `title`
- **When** a POST request is sent without `title` in the body
- **Then** the response status is 400
- **AND** the body includes a validation error message

#### Scenario: Invalid auth returns 401

- **Given** the `/api/agenthub/chat` endpoint requires authentication
- **When** a request is sent without a valid session token
- **Then** the response status is 401

#### Scenario: Wrong HTTP method returns 405

- **Given** the `/api/agenthub/sessions` endpoint only accepts GET and POST
- **When** a DELETE request is sent to the endpoint
- **Then** the response status is 405

### API-003: Response Validation Tests

Each API route SHALL have tests that validate:

1. **Status code**: Correct HTTP status for success/error paths
2. **Response shape**: Required fields present in response body
3. **Data types**: Field types match expected schema
4. **Response headers**: Content-Type, custom headers present

#### Scenario: Successful response has correct shape

- **Given** a valid GET request to `/api/agenthub/sessions`
- **When** the response is received
- **Then** the status is 200
- **AND** the body contains `sessions` array with `id`, `title`, `status` fields
- **AND** `Content-Type` is `application/json`

#### Scenario: Error response includes error details

- **Given** a request that triggers a server error
- **When** the response is received
- **Then** the status is 500
- **AND** the body contains `error` field with a message

### API-004: Side-Effect Verification

Tests SHALL verify side effects after API route execution:

1. **Database state**: New rows created, existing rows updated/deleted
2. **File system**: Files created/modified (for routes that touch files)
3. **Trace emission**: Traces are persisted for agent operations
4. **Process state**: OpenCode process state changes (for spawn/abort routes)

#### Scenario: POST /api/agenthub/sessions creates DB record

- **Given** a valid POST request to create a session
- **When** the response status is 201
- **Then** a new row exists in `agent_hub_sessions` with the returned ID
- **AND** the `created_at` timestamp is within the last 2 seconds

#### Scenario: Abort route updates session status

- **Given** an active session exists
- **When** POST `/api/agenthub/sessions/{id}/abort` is called
- **Then** the session's `status` changes to `aborted` in the database
- **AND** the OpenCode process receives a termination signal

### API-005: Error Path Tests

Each API route SHALL have tests for all documented error paths:

1. **Not found**: Resource doesn't exist → 404
2. **Conflict**: Duplicate resource → 409
3. **Rate limited**: Concurrency limit reached → 429
4. **Timeout**: Operation exceeds timeout → 504
5. **Internal error**: Unexpected failure → 500

#### Scenario: Non-existent session returns 404

- **Given** no session exists with ID `nonexistent-id`
- **When** GET `/api/agenthub/sessions/nonexistent-id` is called
- **Then** the response status is 404

#### Scenario: Concurrent spawn at limit returns 429

- **Given** the concurrency limit is reached (e.g., 5/5 agents active)
- **When** a new spawn request arrives
- **Then** the response status is 429
- **AND** the body includes `active`, `limit`, and `queued` fields

### API-006: Concurrency Tests with Locks

The system SHALL provide concurrency tests that verify:

1. **No race conditions**: Two simultaneous requests to the same endpoint produce correct results
2. **Lock enforcement**: LOCKS prevent overlapping operations on the same resource
3. **Queue behavior**: Requests beyond concurrency limit are queued or rejected

#### Scenario: Two concurrent requests to same session don't corrupt state

- **Given** an active session exists
- **When** two concurrent PATCH requests update different fields of the same session
- **Then** both requests complete
- **AND** the final session state reflects both updates correctly
- **AND** no data corruption occurs

#### Scenario: Lock prevents overlapping flow operations

- **Given** test A holds a `flow` lock for `flow:headless-lifecycle`
- **When** test B attempts to start the same flow
- **Then** test B waits or fails per retry policy
- **AND** the two flows never execute simultaneously

### API-007: In-Memory Database Isolation

Each API test suite SHALL use an `:memory:` SQLite database for isolation. The test harness SHALL:

1. Create a fresh in-memory DB in `beforeAll`
2. Run schema migrations
3. Seed required test data
4. Tear down in `afterAll`

Tests that require cross-process coordination (LOCKS) SHALL use the persistent `data/devhub.db` for the `test_locks` table only.

#### Scenario: Test suite uses isolated in-memory DB

- **Given** a test suite starts
- **When** the `beforeAll` hook runs
- **Then** a new `:memory:` database is created
- **AND** all tables are created via migration scripts
- **AND** no data from previous tests exists

---

## Section 3: MCP Tool Test Harness

### MCP-001: MCP Tool Test Template

The system SHALL provide a test harness at `tests/agenthub/mcp/harness.js` that tests MCP tools by:

1. Dynamically importing the MCP server module via `import()` (ESM)
2. Simulating tool calls with structured input
3. Validating tool output against expected schema
4. Verifying database and git state changes

Each MCP tool test SHALL follow the pattern:

```js
describe('mcp:tool_name', () => {
  beforeEach(() => {
    /* setup isolated DB, acquire locks */
  });
  afterEach(() => {
    /* cleanup, release locks */
  });

  it('happy path', async () => {
    /* call tool, verify output */
  });
  it('invalid input', async () => {
    /* call with bad input, verify error */
  });
  it('side effects', async () => {
    /* call tool, verify DB/git state */
  });
});
```

#### Scenario: MCP tool test dynamically imports server

- **Given** the MCP server is an ESM module
- **When** the test harness loads
- **Then** it uses dynamic `import()` to load `devhub-mcp/server.js`
- **AND** the import succeeds without CJS/ESM interop errors

#### Scenario: MCP tool test uses isolated context

- **Given** an MCP tool test starts
- **When** the `beforeEach` hook runs
- **Then** an in-memory database is created
- **AND** a `resource` lock is acquired for the test scope

### MCP-002: Tool Call Simulation

The system SHALL simulate MCP tool calls by directly invoking the tool handler functions with structured input matching the tool's Zod schema. The simulation SHALL:

1. Validate input against the tool's Zod schema before calling
2. Capture the tool's return value (text, JSON, or error)
3. Measure execution time
4. Log the call for debugging

#### Scenario: Tool called with valid input

- **Given** the `create_project` MCP tool
- **When** called with `{ name: 'test-project', description: 'A test' }`
- **Then** the tool returns a success response with the created project ID
- **AND** execution completes within expected time

#### Scenario: Tool called with invalid input

- **Given** the `create_project` MCP tool requires `name` field
- **When** called with `{ description: 'missing name' }`
- **Then** the tool returns a validation error
- **AND** no database changes occur

### MCP-003: Response Validation

Each MCP tool test SHALL validate:

1. **Success response**: Correct structure, required fields present
2. **Error response**: Error message is descriptive, no stack traces leaked
3. **Data types**: Returned values match expected types
4. **ID format**: Generated IDs match UUID or legacy format patterns

#### Scenario: create_project returns valid project object

- **Given** a valid `create_project` call
- **When** the tool completes
- **Then** the response contains `id`, `name`, `description`, `created_at`
- **AND** `id` matches UUID or legacy ID format
- **AND** `created_at` is a valid ISO 8601 timestamp

### MCP-004: Database State Verification

Tests for MCP tools that modify the database SHALL verify state after execution:

1. **Row creation**: New rows with correct values
2. **Row updates**: Modified fields match expected changes
3. **Row deletion**: Rows removed from table
4. **Foreign keys**: Referential integrity maintained
5. **Semantic search**: Embedding vectors stored correctly (for semantic tools)

#### Scenario: create_task creates row in tasks table

- **Given** a project exists with ID `proj-123`
- **When** `create_task` is called with `{ project_id: 'proj-123', title: 'New task' }`
- **Then** a new row exists in `tasks` table
- **AND** `project_id` matches `proj-123`
- **AND** `status` defaults to `pending`

#### Scenario: update_task modifies correct fields only

- **Given** a task exists with `status: 'pending'` and `title: 'Old title'`
- **When** `update_task` is called with `{ id: task.id, status: 'in_progress' }`
- **Then** the task's `status` is `in_progress`
- **AND** the task's `title` remains `Old title` (unchanged)

### MCP-005: Git State Verification

Tests for MCP tools that interact with git SHALL verify:

1. **Commit creation**: New commit exists with correct message
2. **Branch operations**: Branch created/switched correctly
3. **File changes**: Expected files modified in working tree
4. **Clean state**: Working tree clean after operations that shouldn't modify

#### Scenario: Git tool creates commit

- **Given** a git repository with uncommitted changes
- **When** a git commit MCP tool is called with message `feat: test commit`
- **Then** a new commit exists in the git log
- **AND** the commit message matches `feat: test commit`
- **AND** the working tree is clean

### MCP-006: MCP Tool Chain Tests

The system SHALL provide integration tests that execute sequences of MCP tools to verify tool chains:

1. **Create project → Create task → Update task → List tasks**
2. **Create milestone → Create task linked to milestone → Verify linkage**
3. **Semantic search → Create memory → Search again → Verify results**

#### Scenario: Full project lifecycle tool chain

- **Given** a clean database state
- **When** `create_project` → `create_task` → `update_task` → `list_tasks` are called in sequence
- **Then** each tool succeeds
- **AND** the final `list_tasks` includes the updated task
- **AND** all intermediate DB states are correct

---

## Section 4: Telegram Bot Test Harness

### TGM-001: Command Handler Simulation Pattern

The system SHALL provide a test harness at `tests/agenthub/telegram/harness.js` that tests Telegram bot commands by:

1. Importing command handler modules directly (CJS `require()`)
2. Creating mock `ctx` (context) objects that match `node-telegram-bot-api` interface
3. Capturing bot responses via mocked `ctx.reply`, `ctx.editMessageText`, etc.
4. Verifying backend state changes after command execution

The mock context SHALL include:

```js
{
  message: { chat: { id: 'test-chat-123' }, text: '/spawn', from: { id: 'user-1' } },
  match: null,
  reply: jest.fn(),
  editMessageText: jest.fn(),
  deleteMessage: jest.fn(),
  answerCallbackQuery: jest.fn(),
}
```

#### Scenario: Mock context captures reply calls

- **Given** a mock context with `reply` as a jest mock function
- **When** a command handler calls `ctx.reply('Hello')`
- **Then** `ctx.reply` was called with `'Hello'`
- **AND** the call arguments can be inspected

#### Scenario: Command handler imported directly

- **Given** the `/spawn` command handler at `telegram-bot/commands/spawn.js`
- **When** the test harness requires the module
- **Then** the handler function is accessible
- **AND** it can be called with a mock context

### TGM-002: Response Verification

Each Telegram command test SHALL verify:

1. **Reply sent**: `ctx.reply` was called
2. **Message content**: Reply text matches expected format (markdown/HTML)
3. **Message count**: Correct number of messages sent (no duplicate replies)
4. **Edit operations**: `ctx.editMessageText` called for progress updates

#### Scenario: /help command returns help text

- **Given** a mock context for `/help` command
- **When** the help handler is executed
- **Then** `ctx.reply` was called exactly once
- **AND** the reply text contains available commands list

#### Scenario: /estado command shows agent status

- **Given** an active agent session exists
- **When** the `/estado` handler is executed with a mock context
- **Then** the reply contains the agent's current status
- **AND** the session ID is included in the response

### TGM-003: Backend State Verification

Tests SHALL verify that Telegram commands produce correct backend state changes:

1. **Database changes**: Sessions created/updated, tasks modified
2. **Process state**: OpenCode process spawned/terminated
3. **File state**: Configuration files written

#### Scenario: /spawn creates new session

- **Given** no active session for the test chat ID
- **When** the `/spawn` handler is executed
- **Then** a new row is created in `agent_hub_sessions`
- **AND** the `telegram_chat_id` matches the test chat ID
- **AND** the session status is `active`

#### Scenario: /pausar updates session status

- **Given** an active session exists for the test chat ID
- **When** the `/pausar` handler is executed
- **Then** the session's `status` changes to `paused` in the database
- **AND** the reply confirms the pause action

### TGM-004: Authentication and Authorization Tests

Tests SHALL verify:

1. **Allowed users**: Commands from allowed user IDs succeed
2. **Blocked users**: Commands from unauthorized users are rejected
3. **Missing auth**: Commands without proper user context are handled

#### Scenario: Command from allowed user succeeds

- **Given** user ID `12345` is in `ALLOWED_USER_IDS`
- **When** a command is executed with `from: { id: '12345' }`
- **Then** the command handler executes normally

#### Scenario: Command from unauthorized user is rejected

- **Given** user ID `99999` is NOT in `ALLOWED_USER_IDS`
- **When** a command is attempted with `from: { id: '99999' }`
- **Then** the command is rejected
- **AND** an error reply is sent or the handler returns early

### TGM-005: Error Handling in Command Handlers

Tests SHALL verify command handlers handle errors gracefully:

1. **DB errors**: Database failures produce user-friendly error messages
2. **Process errors**: OpenCode process failures are reported
3. **Timeout errors**: Long-running operations timeout gracefully

#### Scenario: DB error during /estado produces friendly message

- **Given** the database throws an error during session lookup
- **When** the `/estado` handler is executed
- **Then** the handler catches the error
- **AND** replies with a user-friendly error message
- **AND** the error is logged

---

## Section 5: Flow Verifier

### FLOW-001: End-to-End Flow Definitions

The system SHALL define end-to-end flows as ordered sequences of steps, where each step specifies:

1. **Action**: The operation to perform (API call, MCP tool, Telegram command)
2. **Locks**: Required locks for the step
3. **Assertions**: Expected state after the step
4. **Timeout**: Maximum time for the step to complete
5. **OnFailure**: Action to take on failure (abort, retry, continue)

Flow definitions SHALL be stored as structured objects:

```js
const HEADLESS_LIFECYCLE = {
  name: 'headless-lifecycle',
  lock: { type: 'flow', key: 'flow:headless-lifecycle' },
  steps: [
    { action: 'spawn', timeout: 30000, assert: { sessionCreated: true } },
    { action: 'sendMessage', timeout: 60000, assert: { responseReceived: true } },
    { action: 'verifyTraces', timeout: 10000, assert: { traceCount: { min: 1 } } },
    { action: 'checkUsage', timeout: 5000, assert: { tokensUsed: { min: 1 } } },
    { action: 'abort', timeout: 15000, assert: { sessionStatus: 'aborted' } },
  ],
};
```

#### Scenario: Flow definition has required structure

- **Given** a flow definition object
- **When** the flow verifier validates it
- **Then** it has `name`, `lock`, and `steps` properties
- **AND** each step has `action`, `timeout`, and `assert` properties

### FLOW-002: Step-by-Step Verification

The flow verifier SHALL execute each step sequentially:

1. Acquire the flow lock
2. For each step:
   a. Record step start time
   b. Execute the action
   c. Run assertions against current state
   d. Record step result (pass/fail, duration)
   e. If assertion fails, execute `onFailure` strategy
3. Release the flow lock
4. Return comprehensive flow result

#### Scenario: Flow step passes assertion

- **Given** a flow step with `assert: { sessionCreated: true }`
- **When** the step action creates a session
- **Then** the assertion passes
- **AND** the verifier proceeds to the next step

#### Scenario: Flow step fails assertion

- **Given** a flow step with `assert: { traceCount: { min: 1 } }`
- **When** the step completes but no traces exist
- **Then** the assertion fails
- **AND** the `onFailure` strategy is executed

### FLOW-003: Timeout Handling

Each flow step SHALL have an individual timeout. If a step exceeds its timeout:

1. The step is marked as `timed_out`
2. The step's action is cancelled if possible (abort signal)
3. The `onFailure` strategy is executed
4. The flow result includes the timeout details

The flow itself SHALL have a global timeout (default: 5 minutes). If the total flow execution exceeds this:

1. All remaining steps are skipped
2. The flow is marked as `timed_out`
3. The flow lock is released

#### Scenario: Step timeout triggers cancellation

- **Given** a flow step with `timeout: 5000`
- **When** the step action takes longer than 5 seconds
- **Then** the step is marked as `timed_out`
- **AND** the action is cancelled if it supports AbortController
- **AND** the flow continues to the next step (or aborts per onFailure)

#### Scenario: Global flow timeout

- **Given** a flow with global timeout of 5 minutes
- **When** the total execution exceeds 5 minutes
- **Then** remaining steps are skipped
- **AND** the flow lock is released
- **AND** the result shows `status: 'timed_out'`

### FLOW-004: State Assertions at Each Step

The flow verifier SHALL support assertion types:

| Assertion         | Description                         | Example                                                                  |
| ----------------- | ----------------------------------- | ------------------------------------------------------------------------ |
| `db.rowExists`    | Row exists in table with conditions | `{ table: 'sessions', where: { id: sessionId } }`                        |
| `db.rowCount`     | Row count matches condition         | `{ table: 'traces', where: { session_id }, min: 1 }`                     |
| `db.fieldValue`   | Field value matches expected        | `{ table: 'sessions', where: { id }, field: 'status', value: 'active' }` |
| `http.status`     | HTTP response status code           | `{ status: 200 }`                                                        |
| `http.body`       | HTTP response body matches shape    | `{ has: ['sessionId', 'status'] }`                                       |
| `sse.events`      | SSE event received within timeout   | `{ event: 'trace', min: 1 }`                                             |
| `file.exists`     | File exists on filesystem           | `{ path: '/path/to/file' }`                                              |
| `process.running` | Process is running by PID           | `{ pid: 12345 }`                                                         |

#### Scenario: DB row existence assertion

- **Given** a step with `assert: { db.rowExists: { table: 'sessions', where: { id: 's1' } } }`
- **When** the assertion is evaluated
- **Then** it passes if a row with `id='s1'` exists in `sessions`
- **AND** fails otherwise

#### Scenario: SSE event assertion

- **Given** a step with `assert: { sse.events: { event: 'trace', min: 1, timeout: 30000 } }`
- **When** the SSE consumer receives at least 1 `trace` event within 30s
- **Then** the assertion passes

### FLOW-005: Flow Result Reporting

After flow execution, the verifier SHALL return a structured result:

```js
{
  flow: 'headless-lifecycle',
  status: 'passed' | 'failed' | 'timed_out',
  duration: 45230,
  steps: [
    { name: 'spawn', status: 'passed', duration: 3200, assertions: { passed: 1, failed: 0 } },
    { name: 'sendMessage', status: 'passed', duration: 12500, assertions: { passed: 2, failed: 0 } },
    { name: 'verifyTraces', status: 'failed', duration: 5100, assertions: { passed: 0, failed: 1 }, error: 'Expected min 1 trace, found 0' },
  ],
  lockReleased: true,
}
```

#### Scenario: Flow result includes all step details

- **Given** a 5-step flow that completes with 1 failure
- **When** the flow finishes
- **Then** the result contains status, duration, and per-step details
- **AND** the failed step includes the error message

---

## Section 6: CLI Runner

### CLI-001: Command Syntax

The system SHALL provide a CLI runner at `bin/agenthub-test.js` with the following command structure:

```
agenthub-test <command> [options]

Commands:
  run [target]    Run one or more tests
  lock <action>   Manage locks (status, release, expire)
  list            List available tests
  flow [name]     Run or list flow tests

Options:
  --all           Run all tests
  --parallel      Run tests in parallel (with lock coordination)
  --lock <id>     Use specific lock ID for the test run
  --suite <name>  Run a specific test suite (api, mcp, telegram, flow)
  --timeout <ms>  Global timeout in milliseconds (default: 300000)
  --verbose       Show detailed output
  --json          Output results as JSON
  --help          Show help
```

#### Scenario: Run single API test

- **Given** a test file exists at `tests/agenthub/api/chat.test.js`
- **When** `agenthub-test run api/chat --verbose` is executed
- **Then** only the chat API tests run
- **AND** verbose output shows lock acquisition, request, response, and release

#### Scenario: Run all tests in parallel

- **Given** all test files exist
- **When** `agenthub-test run --all --parallel` is executed
- **Then** all tests run concurrently
- **AND** locks prevent race conditions
- **AND** the process exits with code 0 if all pass

### CLI-002: Lock Management Commands

The CLI SHALL support lock management:

```
agenthub-test lock status       # Show all active locks
agenthub-test lock release <id> # Release a specific lock
agenthub-test lock expire       # Expire all stale locks
agenthub-test lock clear        # Remove all locks (dangerous)
```

#### Scenario: Lock status shows active locks

- **Given** 3 locks are currently held
- **When** `agenthub-test lock status` is executed
- **Then** the output shows 3 lock entries with type, key, owner, and TTL remaining

#### Scenario: Expire stale locks

- **Given** 2 expired locks and 3 active locks exist
- **When** `agenthub-test lock expire` is executed
- **Then** 2 expired locks are removed
- **AND** the output confirms "2 stale locks expired"

### CLI-003: Output Format

The CLI SHALL support two output modes:

**Human-readable (default):**

```
┌─────────────────────────────────────────────┐
│  AgentHub Test Runner                       │
├─────────────────────────────────────────────┤
│  Suite: api                                 │
│  Tests: 18                                  │
│  Locks: 3 active                            │
├─────────────────────────────────────────────┤
│  ✓ POST /api/agenthub/sessions     (234ms)  │
│  ✓ GET  /api/agenthub/sessions     (156ms)  │
│  ✗ POST /api/agenthub/chat         (1.2s)   │
│    └─ Expected status 200, got 500          │
│  ✓ GET  /api/agenthub/config       (89ms)   │
├─────────────────────────────────────────────┤
│  Results: 17 passed, 1 failed, 18 total     │
│  Duration: 4.2s                             │
│  Locks: 0 active (all released)             │
└─────────────────────────────────────────────┘
```

**JSON (`--json`):**

```json
{
  "suite": "api",
  "total": 18,
  "passed": 17,
  "failed": 1,
  "duration": 4200,
  "tests": [
    { "name": "POST /api/agenthub/sessions", "status": "passed", "duration": 234 },
    {
      "name": "POST /api/agenthub/chat",
      "status": "failed",
      "duration": 1200,
      "error": "Expected status 200, got 500"
    }
  ],
  "locks": { "active": 0, "released": 3 }
}
```

#### Scenario: JSON output is valid and parseable

- **Given** tests have been executed
- **When** `agenthub-test run --all --json` is executed
- **Then** the output is valid JSON
- **AND** it can be parsed by `JSON.parse()`
- **AND** it contains `total`, `passed`, `failed`, and `tests` fields

### CLI-004: Parallel Execution with Locks

When `--parallel` is specified, the CLI SHALL:

1. Discover all test files in the target suite(s)
2. Group tests by required lock keys
3. Spawn worker processes (default: number of CPU cores, max 8)
4. Each worker acquires locks before executing its test
5. Workers wait/retry when locks are held by other workers
6. Results are aggregated and displayed in real-time

The parallel runner SHALL use a worker pool pattern:

```
Main Process
  ├── Worker 1 → acquires lock(endpoint:/api/agenthub/chat) → runs test → releases
  ├── Worker 2 → acquires lock(session:abc-123) → runs test → releases
  └── Worker 3 → waits for lock(endpoint:/api/agenthub/chat) → runs test → releases
```

#### Scenario: Parallel tests don't collide on same endpoint

- **Given** two tests require the same `endpoint` lock
- **When** `agenthub-test run --all --parallel` is executed
- **Then** the first test acquires the lock and runs
- **AND** the second test waits until the lock is released
- **AND** both tests complete successfully without collision

#### Scenario: Parallel tests with different locks run simultaneously

- **Given** test A requires `endpoint:/api/agenthub/sessions` and test B requires `endpoint:/api/agenthub/config`
- **When** `agenthub-test run --all --parallel` is executed
- **Then** both tests start simultaneously
- **AND** total duration is approximately the max of individual durations (not the sum)

### CLI-005: Test Discovery and Listing

The `list` command SHALL discover and display all available tests:

```
agenthub-test list              # List all tests
agenthub-test list --suite api  # List API tests only
agenthub-test list --json       # JSON output
```

Output SHALL include: test file path, test name, required locks, estimated duration.

#### Scenario: List command shows all available tests

- **Given** test files exist in `tests/agenthub/`
- **When** `agenthub-test list` is executed
- **Then** the output lists all test files grouped by suite
- **AND** each entry shows the test name and required lock type

---

## Section 7: Integration Scenarios

### SCENARIO-001: Single API Endpoint Test with Lock

**Flow**: Test a single API endpoint with proper lock acquisition and release.

- **Given** the test harness is initialized
- **When** `agenthub-test run api/chat` is executed
- **Then** an `endpoint` lock is acquired for `/api/agenthub/chat`
- **AND** the test sends a POST request with valid payload
- **AND** the response status is validated
- **AND** side effects (session creation, trace persistence) are verified
- **AND** the lock is released
- **AND** the test result is reported

### SCENARIO-002: Concurrent API Tests (No Race Conditions)

**Flow**: Run multiple API tests concurrently and verify no race conditions occur.

- **Given** 5 API tests are queued for parallel execution
- **When** `agenthub-test run --all --parallel` is executed
- **Then** tests with different lock keys run simultaneously
- **AND** tests with the same lock key execute sequentially
- **AND** no test sees corrupted or partial state from another test
- **AND** all 5 tests pass
- **AND** the lock table is empty after completion

### SCENARIO-003: Headless Agent Full Lifecycle

**Flow**: Complete headless agent lifecycle — spawn, interact, verify, abort.

- **Given** a clean database state and OpenCode is available
- **When** the `headless-lifecycle` flow is executed
- **Then** Step 1: A session is created via `/api/agenthub/headless`
- **AND** Step 2: A message is sent and SSE events are received
- **AND** Step 3: Traces are persisted and verifiable via `/api/agenthub/traces/persist`
- **AND** Step 4: Token usage is recorded and queryable
- **AND** Step 5: The session is aborted via `/api/agenthub/sessions/{id}/abort`
- **AND** The flow result shows all steps passed
- **AND** The flow lock is released

### SCENARIO-004: MCP Tool Chain (Create Project → Create Task → Update Task)

**Flow**: Execute a sequence of MCP tools and verify the complete chain.

- **Given** a clean in-memory database
- **When** the MCP tool chain test runs:
  1. `create_project` with `{ name: 'Test Project' }`
  2. `create_task` with `{ project_id: <from step 1>, title: 'First task' }`
  3. `update_task` with `{ id: <from step 2>, status: 'in_progress' }`
  4. `list_tasks` with `{ project_id: <from step 1> }`
- **Then** each tool returns success
- **AND** the final `list_tasks` includes the task with `status: 'in_progress'`
- **AND** the database contains exactly 1 project and 1 task
- **AND** all resource locks are released

### SCENARIO-005: Telegram Command Flow (/spawn → Agent Works → /estado)

**Flow**: Simulate a complete Telegram bot interaction flow.

- **Given** a clean database and mock Telegram context
- **When** the Telegram flow test runs:
  1. Execute `/spawn` handler with mock context
  2. Verify session was created in database
  3. Execute `/estado` handler with same chat ID
  4. Verify status response includes the active session
- **Then** `/spawn` creates a session with `status: 'active'`
- **AND** the reply contains the session ID
- **AND** `/estado` returns the session status correctly
- **AND** the reply format matches the expected template

### SCENARIO-006: Lock Expiry and Deadlock Recovery

**Flow**: Verify that expired locks are cleaned up and deadlocks are prevented.

- **Given** test A acquires a lock with TTL=5s
- **When** test A is killed (simulated crash) before releasing the lock
- **AND** 6 seconds pass
- **AND** test B attempts to acquire the same lock
- **Then** `expireStale()` detects the expired lock
- **AND** the expired lock is deleted
- **AND** test B successfully acquires the lock
- **AND** no deadlock occurs

### SCENARIO-007: Flow Verification with Timeout

**Flow**: Verify that flow timeouts are enforced correctly.

- **Given** a flow with a step timeout of 3 seconds
- **When** the step action takes longer than 3 seconds (simulated with `setTimeout`)
- **Then** the step is marked as `timed_out`
- **AND** the step's action is cancelled
- **AND** the flow continues to the next step (or aborts per `onFailure`)
- **AND** the flow result includes timeout details
- **AND** the flow lock is eventually released

---

## Section 8: Non-Functional Requirements

### NFR-001: Test Execution Performance

The system SHALL ensure:

- Individual API tests complete within 5 seconds (excluding OpenCode-dependent tests)
- MCP tool tests complete within 3 seconds each
- Full parallel test suite completes within 5 minutes
- Lock acquisition overhead is under 50ms per acquisition

### NFR-002: Test Isolation

The system SHALL guarantee:

- No test can affect another test's database state (via `:memory:` DB per suite)
- No test can affect another test's file system state (via temp directories)
- No test can affect another test's process state (via process tracking)
- LOCKS prevent cross-test resource contention

### NFR-003: Deterministic Results

The system SHALL ensure:

- Tests produce the same result when run individually or in parallel
- Random data generation uses seeded random for reproducibility
- Time-dependent assertions use tolerance windows (±1s) rather than exact matches

### NFR-004: Observability

The system SHALL provide:

- Per-test duration tracking
- Lock contention metrics (wait time, retries, failures)
- Flow step timing for bottleneck identification
- JSON output for CI/CD integration

---

## Appendix A: File Structure

```
lib/
  test-locks.js              # Distributed LOCKS module

tests/agenthub/
  harness.js                 # Base test harness (acquire → execute → verify → release)
  api/
    harness.js               # API-specific harness
    chat.test.js
    sessions.test.js
    headless.test.js
    config.test.js
    mcp-status.test.js
    traces.test.js
    opencode-status.test.js
    sessions-stream.test.js
    sessions-health.test.js
    session-traces.test.js
    session-trace-detail.test.js
    session-trace-search.test.js
    session-abort.test.js
    session-permission.test.js
    session-usage.test.js
    session-status.test.js
    agents-launch.test.js
    agents-quotas.test.js
    agents-profiles.test.js
    terminal-session.test.js
    terminal-sessions.test.js
    terminal-processes.test.js
  mcp/
    harness.js               # MCP-specific harness
    project-tools.test.js    # create_project, get_project, list_projects, update_project, delete_project
    task-tools.test.js       # create_task, get_task, list_tasks, update_task, delete_task
    milestone-tools.test.js  # create_milestone, get_milestone, list_milestones, update_milestone, delete_milestone
    memory-tools.test.js     # create_memory, search_memory, list_memories
    semantic-tools.test.js   # semantic_search, semantic_index
    git-tools.test.js        # git_commit, git_status, git_log, git_branch
    search-tools.test.js     # search_code, search_files
    connection-tools.test.js # create_connection, list_connections
  telegram/
    harness.js               # Telegram-specific harness
    query-commands.test.js   # /estado, /tareas, /progreso, /agentes, /help
    action-commands.test.js  # /pausar, /reanudar, /continuar, /spawn, /sesiones
    chat-commands.test.js    # /agente, /reset, /historial, /nueva_sesion
    session-commands.test.js # /session, /project, /status
  flows/
    headless-lifecycle.test.js
    mcp-toolchain.test.js
    telegram-flow.test.js

bin/
  agenthub-test.js           # CLI runner
```

## Appendix B: Lock Key Naming Convention

| Lock Type  | Key Format                 | Example                            |
| ---------- | -------------------------- | ---------------------------------- |
| `session`  | `session:{sessionId}`      | `session:abc-123-def`              |
| `endpoint` | `endpoint:{method}:{path}` | `endpoint:POST:/api/agenthub/chat` |
| `resource` | `resource:{table}:{id}`    | `resource:tasks:uuid-456`          |
| `flow`     | `flow:{flowName}`          | `flow:headless-lifecycle`          |

## Appendix C: Migration — Refactoring Existing Tests

All existing tests SHALL be refactored to use the LOCKS system:

1. `tests/concurrency-test.js` → Add `endpoint` and `session` locks around concurrent spawn operations
2. `tests/headless-test.js` → Add `flow` lock for the full lifecycle test
3. `tests/integration/telegram-opencode.test.js` → Add `session` lock and use the Telegram harness
4. `tests/integration/sse-reconnect.test.js` → Add `endpoint` lock for SSE endpoint tests
5. `tests/unit/*.test.js` → No locks needed (pure unit tests with mocked dependencies)
