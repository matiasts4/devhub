# Tasks: AgentHub Testing System with Distributed LOCKS

> **Dependency graph**: Phases are sequential. Tasks within a phase are numbered in dependency order. Tasks marked `‖` can run in parallel with siblings in the same phase.

---

## Phase 1: LOCKS Foundation

### Task 1: SQL migration for test_locks table

- **File(s):** `data/migrations/001_test_locks.sql`
- **Depends on:** —
- **Description:** Create the SQL migration file that defines the `test_locks` table with all columns from LOCK-001 spec: `lock_id` (TEXT PK), `lock_type` (TEXT, CHECK IN session/endpoint/resource/flow), `lock_key` (TEXT NOT NULL), `owner` (TEXT NOT NULL), `acquired_at` (TEXT DEFAULT datetime('now')), `expires_at` (TEXT NOT NULL), `metadata` (TEXT). Include the unique index on `(lock_type, lock_key)`.
- **Acceptance:** Running the migration against `data/devhub.db` creates the table and index without errors. `PRAGMA table_info(test_locks)` shows all 7 columns.

### Task 2: LockManager class (acquire, release, heartbeat, cleanup)

- **File(s):** `lib/test-locks.js`
- **Depends on:** Task 1
- **Description:** Implement the `LockManager` class with all methods from LOCK-009: `acquire(type, key, owner, options)`, `release(lockId, owner)`, `extend(lockId, owner, extraSeconds)`, `expireStale()`, `status()`, `statusByKey(type, key)`. Use `better-sqlite3` with `BEGIN IMMEDIATE` transactions. Implement retry with exponential backoff per LOCK-007 (max 5 retries, base 100ms, cap 5s, ±50ms jitter). Default TTL 60s, configurable via `LOCK_TTL_SECONDS` env var. Auto-create the table on first access if migration hasn't run.
- **Acceptance:** Module exports all 6 functions. `acquire()` returns `{ success: true, lockId, expiresAt }` on success and `{ success: false, reason }` on failure. `release()` enforces owner check. `expireStale()` removes expired rows. `status()` returns lock list with `isExpired` flag.

### Task 3: Lock CLI commands

- **File(s):** `bin/agenthub-test.js` (lock subcommand only)
- **Depends on:** Task 2
- **Description:** Implement the `agenthub-test lock <action>` CLI subcommand with actions: `status` (show all active locks), `release <id>` (force-release a lock), `expire` (run expireStale), `clear` (remove all locks — with confirmation prompt). Use `commander` for argument parsing. Output formatted table in human-readable mode.
- **Acceptance:** `agenthub-test lock status` shows lock table contents. `agenthub-test lock expire` removes stale locks and prints count. `agenthub-test lock clear` warns before clearing. `--json` flag outputs JSON.

### Task 4: Unit tests for LockManager

- **File(s):** `tests/unit/test-locks.test.js`
- **Depends on:** Task 2
- **Description:** ‖ Write Jest unit tests for each LockManager method. Test happy paths, edge cases, and error conditions: acquire/release cycle, owner enforcement, TTL expiry, retry backoff, concurrent acquisition simulation, extend TTL, status queries. Use `:memory:` SQLite for isolation.
- **Acceptance:** All tests pass. Coverage includes: LOCK-003 (acquire with BEGIN IMMEDIATE), LOCK-004 (TTL), LOCK-005 (owner release), LOCK-006 (expireStale), LOCK-007 (retry backoff), LOCK-008 (status), LOCK-009 (module exports).

---

## Phase 2: Test Harness Infrastructure

### Task 5: Base test harness with lock integration

- **File(s):** `tests/agenthub/harness.js`
- **Depends on:** Task 2
- **Description:** Implement `TestHarness` class from the design doc: constructor with `{ dbPath, lockOwner }`, `setupDb()` creates fresh `:memory:` DB with full schema (reuse `ensureRuntimeSchema` from `src/lib/db/localDb.js`), `teardownDb()`, `acquireLocks(locks[])` returns lockIds, `releaseLocks(lockIds[])`, `cleanupStale()`, `query(sql, params?)`, `verifyDb(table, conditions, expected)`. Enforce acquire → execute → verify → release pattern.
- **Acceptance:** Harness can be instantiated, creates isolated in-memory DB, acquires/releases locks, and provides query helpers. `afterEach` releases locks even on test failure.

### Task 6: Schema migration helper for :memory: test databases

- **File(s):** `lib/test-schema.js`
- **Depends on:** Task 5
- **Description:** ‖ Create a helper that applies the full schema (from `ensureRuntimeSchema`) to any `better-sqlite3` database instance (including `:memory:`). Extract and export the schema DDL so it can be applied without depending on `localDb.js` singleton. Also include the `test_locks` table creation for test DBs that need it.
- **Acceptance:** `applyTestSchema(db)` creates all tables on a fresh `:memory:` DB. All tables from `localDb.js` are present plus `test_locks`.

### Task 7: Mock utilities (DB, OpenCode, LLM, Telegram context)

- **File(s):** `tests/agenthub/mocks.js`
- **Depends on:** Task 5
- **Description:** ‖ Create shared mock utilities: `createMockDb()` returns in-memory DB with seeded data, `mockOpenCodeSpawn()` mocks child_process.spawn for OpenCode, `mockLlmFetch()` intercepts fetch for LLM API calls, `createMockTelegramCtx()` creates mock ctx with `jest.fn()` for reply/editMessageText/deleteMessage/answerCallbackQuery. All mocks should be configurable and trackable.
- **Acceptance:** Each mock utility can be imported and used independently. Mock Telegram ctx captures all reply calls. Mock OpenCode returns controllable responses. Mock LLM fetch returns configurable responses.

### Task 8: Assertion utilities (DB state, traces, git state)

- **File(s):** `tests/agenthub/assertions.js`
- **Depends on:** Task 5
- **Description:** ‖ Create assertion helpers: `assertDbRow(db, table, where, expected)`, `assertDbRowCount(db, table, where, min, max)`, `assertDbFieldValue(db, table, where, field, value)`, `assertHttpStatus(response, expected)`, `assertBodyShape(body, requiredFields)`, `assertTraceExists(db, sessionId, options)`, `assertFileExists(path)`, `assertProcessRunning(pid)`. All throw descriptive errors on failure.
- **Acceptance:** Each assertion passes with valid data and throws with clear error messages on failure. Compatible with Jest `expect()` and standalone use.

### Task 9: Test fixtures and seed data utilities

- **File(s):** `tests/agenthub/fixtures.js`
- **Depends on:** Task 6, Task 8
- **Description:** Create fixture helpers for common test data: `seedProject(db)`, `seedTask(db, projectId)`, `seedMilestone(db, projectId)`, `seedSession(db, options)`, `seedSwarmProcess(db)`, `seedSwarmConfig(db, key, value)`. Use deterministic IDs (seeded or prefixed) for reproducibility. Include cleanup helpers.
- **Acceptance:** Each fixture creates valid rows with proper foreign keys. Seeded data can be queried and verified with assertion utilities.

---

## Phase 3: API Route Tests

### Task 10: API-specific harness

- **File(s):** `tests/agenthub/api/harness.js`
- **Depends on:** Task 5, Task 8
- **Description:** Extend `TestHarness` with `ApiTestHarness`: constructor with `baseUrl`, `request(method, path, options)`, `assertStatus(actual, expected)`, `assertBodyShape(body, requiredFields)`, `assertError(body, expectedMessage?)`, `verifySideEffect(table, where, expected)`. Use `fetch` against running Next.js dev server (per design decision).
- **Acceptance:** Can make HTTP requests, validate responses, and verify DB side effects. Integrates with base harness lock lifecycle.

### Task 11: Test `/api/agenthub/headless` — launch, response, traces

- **File(s):** `tests/agenthub/api/headless.test.js`
- **Depends on:** Task 10, Task 9
- **Description:** ‖ Test POST `/api/agenthub/headless`: session creation, response shape, trace persistence. Test validation errors (missing fields → 400). Test with mocked OpenCode spawn. Verify session row created in `agent_hub_sessions`.
- **Acceptance:** Happy path creates session and returns `{ sessionId, status }`. Missing fields return 400. Session row exists in DB after request.

### Task 12: Test `/api/agenthub/chat` — streaming, retry, errors

- **File(s):** `tests/agenthub/api/chat.test.js`
- **Depends on:** Task 10, Task 9
- **Description:** ‖ Test POST `/api/agenthub/chat`: message sending, response shape, auth validation (401 without token), validation errors (400). Mock LLM fetch responses. Test with existing session.
- **Acceptance:** Valid request returns response with message content. Missing auth returns 401. Missing session returns 404.

### Task 13: Test `/api/agenthub/sessions` — CRUD, status, usage

- **File(s):** `tests/agenthub/api/sessions.test.js`
- **Depends on:** Task 10, Task 9
- **Description:** ‖ Test GET `/api/agenthub/sessions` (list with filters), POST `/api/agenthub/sessions` (create with validation), GET `/api/agenthub/sessions/:id` (single session). Test method validation (DELETE → 405).
- **Acceptance:** GET returns sessions array with correct shape. POST creates session and returns 201. Validation errors return 400. Wrong method returns 405.

### Task 14: Test `/api/agenthub/sessions/stream` — SSE deltas, reconnect

- **File(s):** `tests/agenthub/api/sessions-stream.test.js`
- **Depends on:** Task 10, Task 9
- **Description:** ‖ Test GET `/api/agenthub/sessions/:id/stream`: SSE connection, event reception, reconnect behavior. Use polling pattern per design doc — poll DB for traces with timeout. Test with mocked SSE events.
- **Acceptance:** SSE endpoint accepts connection. Events are received within timeout. Reconnect after disconnect works. Polling finds traces in DB.

### Task 15: Test `/api/agenthub/config` — swarm config read/write

- **File(s):** `tests/agenthub/api/config.test.js`
- **Depends on:** Task 10, Task 9
- **Description:** ‖ Test GET `/api/agenthub/config` (read swarm config), PUT/PATCH `/api/agenthub/config` (update config). Test auth validation. Verify `swarm_config` table changes.
- **Acceptance:** GET returns config object. PUT updates config and returns 200. DB reflects changes. Auth required.

### Task 16: Test `/api/agenthub/opencode/status` — process health, queue

- **File(s):** `tests/agenthub/api/opencode-status.test.js`
- **Depends on:** Task 10, Task 9
- **Description:** ‖ Test GET `/api/agenthub/opencode/status`: process health check, active count, queue status. Mock `getActiveSwarmCount()` and `getActiveAgentCount()`.
- **Acceptance:** Returns `{ active, limit, queued }` shape. Values match mocked DB state.

### Task 16b: Test `/api/agenthub/mcp/status` — MCP server health

- **File(s):** `tests/agenthub/api/mcp-status.test.js`
- **Depends on:** Task 10, Task 9
- **Description:** ‖ Test GET `/api/agenthub/mcp/status`: MCP server health, tool count, connection status. Mock MCP server connection.
- **Acceptance:** Returns `{ healthy, toolCount, connected }` shape. Unhealthy state returns appropriate error.

### Task 16b: Test `/api/agenthub/mcp/status` — MCP server health

- **File(s):** `tests/agenthub/api/mcp-status.test.js`
- **Depends on:** Task 10, Task 9
- **Description:** ‖ Test GET `/api/agenthub/mcp/status`: MCP server health, tool count, connection status. Mock MCP server connection.
- **Acceptance:** Returns `{ healthy, toolCount, connected }` shape. Unhealthy state returns appropriate error.

### Task 17: Test `/api/agents/launch`, `/api/agents/profiles`, and `/api/agents/quotas`

- **File(s):** `tests/agenthub/api/agents-launch.test.js`, `tests/agenthub/api/agents-profiles.test.js`, `tests/agenthub/api/agents-quotas.test.js`
- **Depends on:** Task 10, Task 9
- **Description:** ‖ Test POST `/api/agents/launch` (agent launch with validation), GET `/api/agents/profiles` (list profiles), GET `/api/agents/quotas` (quota status, limit enforcement). Test validation, auth, and error paths. Verify 429 when quota limit reached.
- **Acceptance:** Launch creates session and returns session ID. Profiles returns list. Quotas returns `{ used, limit, remaining }`. Validation errors return 400. Quota exceeded returns 429.

### Task 18: Test session sub-routes (abort, traces, usage, status, permissions)

- **File(s):** `tests/agenthub/api/session-abort.test.js`, `tests/agenthub/api/session-traces.test.js`, `tests/agenthub/api/session-usage.test.js`, `tests/agenthub/api/session-status.test.js`, `tests/agenthub/api/session-permission.test.js`
- **Depends on:** Task 10, Task 9
- **Description:** ‖ Test session-specific endpoints: POST `/api/agenthub/sessions/:id/abort` (status change to aborted), GET `/api/agenthub/sessions/:id/traces` (trace list), GET `/api/agenthub/sessions/:id/usage` (token usage), GET `/api/agenthub/sessions/:id/status` (session status), GET/POST `/api/agenthub/sessions/:id/permissions/:permId` (permission management). Test 404 for non-existent sessions.
- **Acceptance:** Each endpoint returns correct response shape. Abort changes DB status. Traces returns list. Non-existent session returns 404.

### Task 19: Test trace sub-routes (persist, detail, search)

- **File(s):** `tests/agenthub/api/traces-persist.test.js`, `tests/agenthub/api/session-trace-detail.test.js`, `tests/agenthub/api/session-trace-search.test.js`
- **Depends on:** Task 10, Task 9
- **Description:** ‖ Test POST `/api/agenthub/traces/persist` (trace persistence), GET `/api/agenthub/sessions/:id/traces/:traceId` (single trace detail), GET `/api/agenthub/sessions/:id/traces/search?q=...` (FTS5 search). Test with seeded trace data.
- **Acceptance:** Persist creates trace row. Detail returns single trace. Search returns matching traces via FTS5.

### Task 20: Test terminal routes

- **File(s):** `tests/agenthub/api/terminal-session.test.js`, `tests/agenthub/api/terminal-sessions.test.js`, `tests/agenthub/api/terminal-processes.test.js`
- **Depends on:** Task 10, Task 9
- **Description:** ‖ Test terminal-related API routes: session management, session list, process list. Mock `node-pty` and `ttyServer`.
- **Acceptance:** Each endpoint returns correct response. Mocked terminal state is reflected in responses.

### Task 21: Refactor existing `tests/concurrency-test.js` to use LOCKS

- **File(s):** `tests/concurrency-test.js` (modify)
- **Depends on:** Task 2, Task 10
- **Description:** Add `endpoint` and `session` locks around concurrent spawn operations. Use the test harness pattern. Verify no race conditions with `--parallel` execution.
- **Acceptance:** Test runs with lock acquisition before each concurrent operation. No lock collisions reported. Results are deterministic.

### Task 22: Refactor existing `tests/headless-test.js` to use LOCKS

- **File(s):** `tests/headless-test.js` (modify)
- **Depends on:** Task 2, Task 10
- **Description:** Add `flow` lock for the full lifecycle test. Use the test harness pattern for acquire → execute → verify → release.
- **Acceptance:** Test acquires flow lock before execution. Lock is released after completion (even on failure).

### Task 23: Refactor existing integration tests to use LOCKS

- **File(s):** `tests/integration/telegram-opencode.test.js` (modify), `tests/integration/sse-reconnect.test.js` (modify)
- **Depends on:** Task 2, Task 10
- **Description:** Add `session` lock and Telegram harness to `telegram-opencode.test.js`. Add `endpoint` lock to `sse-reconnect.test.js`.
- **Acceptance:** Both tests use lock acquisition. No race conditions when run in parallel with other tests.

---

## Phase 4: MCP Tool Tests

### Task 24: MCP-specific harness

- **File(s):** `tests/agenthub/mcp/harness.js`
- **Depends on:** Task 5, Task 6
- **Description:** Implement `McpTestHarness` extending `TestHarness`: `loadMcpServer()` uses dynamic `import()` for ESM server, `invokeTool(toolName, input)` calls tool handler directly, `assertToolResponse(result, requiredFields)`, `verifyDbState(table, where, expected)`. Handle ESM/CJS interop per design doc.
- **Acceptance:** Can dynamically import `devhub-mcp/server.js`. Tools can be invoked with structured input. Response validation works. DB state verification works.

### Task 25: Test MCP project tools

- **File(s):** `tests/agenthub/mcp/project-tools.test.js`
- **Depends on:** Task 24, Task 9
- **Description:** ‖ Test: `create_project`, `get_project`, `list_projects`, `update_project`, `delete_project`. Happy path, invalid input, side effects (DB row creation/update/deletion).
- **Acceptance:** Each tool returns correct response shape. DB state changes verified. Invalid input returns validation error.

### Task 26: Test MCP task tools

- **File(s):** `tests/agenthub/mcp/task-tools.test.js`
- **Depends on:** Task 24, Task 9
- **Description:** ‖ Test: `create_task`, `get_task`, `list_tasks`, `update_task`, `delete_task`, `add_comment`. Include tool chain test: create → update → list verifies chain. Test milestone linkage.
- **Acceptance:** Each tool returns correct response. Tool chain (create → update → list) produces correct final state. Invalid input handled.

### Task 27: Test MCP milestone tools

- **File(s):** `tests/agenthub/mcp/milestone-tools.test.js`
- **Depends on:** Task 24, Task 9
- **Description:** ‖ Test: `create_milestone`, `get_milestone`, `list_milestones`, `update_milestone`, `delete_milestone`. Test project linkage, task linkage.
- **Acceptance:** Each tool returns correct response. DB state verified. Invalid input handled.

### Task 28: Test MCP connection, memory, semantic, git, search tools

- **File(s):** `tests/agenthub/mcp/connection-tools.test.js`, `tests/agenthub/mcp/memory-tools.test.js`, `tests/agenthub/mcp/semantic-tools.test.js`, `tests/agenthub/mcp/git-tools.test.js`, `tests/agenthub/mcp/search-tools.test.js`
- **Depends on:** Task 24, Task 9
- **Description:** ‖ Test remaining MCP tool categories. For git tools, use temp directory with init'd repo. For memory/semantic, test embedding storage. For search, test code/file search. For connection, test CRUD.
- **Acceptance:** Each tool category has happy path, error path, and side effect tests. Git tools verify commit/branch state. Memory tools verify embedding storage.

### Task 29: Test MCP swarm v2 tools

- **File(s):** `tests/agenthub/mcp/swarm-tools.test.js`
- **Depends on:** Task 24, Task 9
- **Description:** ‖ Test: `register_agent`, `heartbeat`, `unregister_agent`, `swarm_status`. Verify `swarm_processes` and `swarm_config` table changes. Test concurrency limits.
- **Acceptance:** Register creates process row. Heartbeat updates `last_heartbeat`. Unregister removes/updates process. Status returns correct active count.

### Task 30: Test MCP DocOps tools

- **File(s):** `tests/agenthub/mcp/docops-tools.test.js`
- **Depends on:** Task 24, Task 9
- **Description:** ‖ Test: `validate_topic_key`, `build_context_pack`. Validate against existing DocOps system (`src/lib/docopsPrompts.js`, `src/lib/docopsPolicy.js`).
- **Acceptance:** `validate_topic_key` returns valid/invalid for known/unknown keys. `build_context_pack` returns structured context with prompts and policies.

---

## Phase 5: Telegram Bot Tests

### Task 31: Telegram-specific harness

- **File(s):** `tests/agenthub/telegram/harness.js`
- **Depends on:** Task 5, Task 7
- **Description:** Implement `TelegramTestHarness` extending `TestHarness`: `createMockCtx(options)` creates mock Telegram context, `loadCommand(name)` imports command handler (CJS `require()`), `executeCommand(commandName, ctx)` calls handler, `getReplies(ctx)` captures all replies, `assertReply(ctx, expectedText)`, `verifyBackendState(table, where, expected)`.
- **Acceptance:** Mock ctx captures all reply/editMessageText calls. Command handlers can be loaded and executed. Backend state verified after command execution.

### Task 32: Test basic Telegram commands

- **File(s):** `tests/agenthub/telegram/basic-commands.test.js`
- **Depends on:** Task 31, Task 9
- **Description:** ‖ Test: `/start`, `/help`, `/estado`, `/reset`. Verify reply content, message count, auth checks (ALLOWED_USER_IDS). Test `/estado` with and without active session.
- **Acceptance:** `/help` returns command list. `/estado` shows session status or "no active session". `/reset` clears session state. Unauthorized users are rejected.

### Task 33: Test task Telegram commands

- **File(s):** `tests/agenthub/telegram/task-commands.test.js`
- **Depends on:** Task 31, Task 9
- **Description:** ‖ Test: `/tareas`, `/progreso`, `/agentes`. Verify reply content matches task/project data from DB. Test with seeded data.
- **Acceptance:** `/tareas` returns task list. `/progreso` shows progress stats. `/agentes` returns agent list. All formatted correctly.

### Task 34: Test agent control Telegram commands

- **File(s):** `tests/agenthub/telegram/agent-control.test.js`
- **Depends on:** Task 31, Task 9
- **Description:** ‖ Test: `/pausar`, `/reanudar`, `/spawn`, `/continuar`. Verify DB state changes (session status updates). Test `/spawn` creates new session. Mock OpenCode spawn for `/spawn`.
- **Acceptance:** `/pausar` changes session status to `paused`. `/reanudar` changes to `active`. `/spawn` creates session row. `/continuar` resumes paused session.

### Task 35: Test session Telegram commands

- **File(s):** `tests/agenthub/telegram/session-commands.test.js`
- **Depends on:** Task 31, Task 9
- **Description:** ‖ Test: `/sesiones`, `/nueva_sesion`, `/session`, `/project`, `/status`, `/agente`, `/historial`. Verify session creation, listing, and switching. Test `telegram_session_map` updates.
- **Acceptance:** `/sesiones` lists sessions for chat. `/nueva_sesion` creates new session. `/session` switches active session. `telegram_session_map` updated correctly.

---

## Phase 6: Flow Verifier

### Task 36: Flow definition parser and step executor

- **File(s):** `tests/agenthub/flow-verifier.js` (FlowVerifier class)
- **Depends on:** Task 5, Task 10, Task 24, Task 31
- **Description:** Implement `FlowVerifier` class: constructor with `TestHarness`, `execute(flow)` runs flow definition step-by-step. Each step: acquire flow lock, record start time, execute action (API call, MCP tool, or Telegram command), run assertions, record result, handle `onFailure` strategy. Support step timeout with AbortController. Support global flow timeout (default 5min).
- **Acceptance:** Can execute a flow definition with sequential steps. Step timeouts trigger cancellation. `onFailure` strategies (abort/retry/continue) work. Flow lock released after execution.

### Task 37: State assertion engine

- **File(s):** `tests/agenthub/flow-verifier.js` (assertions object — same file as Task 36)
- **Depends on:** Task 8, Task 36
- **Description:** Implement built-in assertion evaluators per FLOW-004: `db.rowExists`, `db.rowCount`, `db.fieldValue`, `http.status`, `http.body`, `sse.events`, `file.exists`, `process.running`. Each returns boolean and descriptive error message. SSE assertion uses polling pattern with timeout.
- **Acceptance:** Each assertion type passes with valid state and fails with clear error. SSE assertion polls DB for events within timeout.

### Task 38: Define and test 3 core flows

- **File(s):** `tests/agenthub/flows/headless-lifecycle.test.js`, `tests/agenthub/flows/mcp-toolchain.test.js`, `tests/agenthub/flows/telegram-flow.test.js`
- **Depends on:** Task 36, Task 37
- **Description:** ‖ Define and implement 3 flow tests:
  1. **headless-lifecycle**: spawn → sendMessage → verifyTraces → checkUsage → abort
  2. **mcp-toolchain**: create_project → create_task → update_task → list_tasks
  3. **telegram-flow**: /spawn → verify session → /estado → verify status
     Each flow uses FlowVerifier with step definitions, assertions, and timeouts.
- **Acceptance:** All 3 flows execute and pass. Flow results include per-step status, duration, and assertion counts. Flow lock released after each flow.

---

## Phase 7: CLI Runner

### Task 39: CLI command structure with commander

- **File(s):** `bin/agenthub-test.js` (expand from Task 3)
- **Depends on:** Task 3
- **Description:** Implement full CLI with commands: `run [target]`, `lock <action>` (already done in Task 3), `list`, `flow [name]`. Options: `--all`, `--parallel`, `--lock <id>`, `--suite <name>`, `--timeout <ms>`, `--verbose`, `--json`, `--workers <n>`. Test discovery via glob `tests/agenthub/**/*.test.js`.
- **Acceptance:** `agenthub-test run api/chat` runs single test. `agenthub-test list` shows all tests grouped by suite. `agenthub-test flow headless-lifecycle` runs flow test. Help text displays correctly.

### Task 40: Parallel execution with worker pool and lock coordination

- **File(s):** `bin/agenthub-test.js` (parallel runner), `lib/test-worker.js`
- **Depends on:** Task 39, Task 2
- **Description:** Implement parallel execution using `child_process.fork()`: discover test files, group by lock key, spawn N workers (default CPU count, max 8). Each worker: creates `:memory:` DB, acquires locks via shared `test_locks` table, runs Jest on single file, releases locks, sends results via IPC. Main process aggregates results. Implement lock-based coordination so tests needing same lock execute sequentially.
- **Acceptance:** `agenthub-test run --all --parallel` runs all tests concurrently. Tests with same lock key execute sequentially. Tests with different locks run simultaneously. Results aggregated correctly. Zero lock collisions.

### Task 41: Output formatting and reporting

- **File(s):** `bin/agenthub-test.js` (formatters), `lib/test-reporter.js`
- **Depends on:** Task 39
- **Description:** Implement human-readable output (box-drawing table format from CLI-003 spec) and JSON output (`--json` flag). Include: suite name, test count, per-test status/duration, lock status, total duration, pass/fail counts. Real-time progress updates during parallel execution. Exit code 0 if all pass, 1 if any fail.
- **Acceptance:** Human-readable output shows formatted table with ✓/✗ marks. JSON output is valid and parseable with `total`, `passed`, `failed`, `tests`, `locks` fields. Exit codes correct.

### Task 42: Add npm script and commander dependency

- **File(s):** `package.json` (modify)
- **Depends on:** Task 39
- **Description:** Add `commander` as devDependency. Add `agenthub-test` script to `package.json`: `"agenthub-test": "node bin/agenthub-test.js"`.
- **Acceptance:** `npm run agenthub-test -- --help` works. `npm install` installs commander.

---

## Parallel Execution Map

| Phase   | Tasks that can run in parallel                                                    |
| ------- | --------------------------------------------------------------------------------- |
| Phase 1 | Task 4 (after Task 2 completes)                                                   |
| Phase 2 | Tasks 6, 7, 8 (after Task 5 completes); Task 9 (after 6+8)                        |
| Phase 3 | Tasks 11–20 (all API tests, after Task 10+9); Tasks 21–23 (refactors, after 2+10) |
| Phase 4 | Tasks 25–30 (all MCP test files, after Task 24+9)                                 |
| Phase 5 | Tasks 32–35 (all Telegram test files, after Task 31+9)                            |
| Phase 6 | Task 38 flows (after 36+37)                                                       |
| Phase 7 | Task 41 (after 39); Task 42 (after 39)                                            |

## Implementation Order (Recommended)

```
1 → 2 → 5 → 6 → 7 → 8 → 9 → 10 → 24 → 31 → 36 → 37 → 38
                    ↘ 4                              ↗
                    ↘ 3 → 39 → 40 → 41 → 42         ↗
         ↘ 11-20 (parallel) ↗
         ↘ 21-23 (parallel) ↗
         ↘ 25-30 (parallel) ↗
         ↘ 32-35 (parallel) ↗
```

The critical path is: **1 → 2 → 5 → 10 → API tests** and **5 → 24 → MCP tests** and **5 → 31 → Telegram tests**, converging at **36 → 37 → 38** (flows), then **39 → 40 → 41** (CLI).
