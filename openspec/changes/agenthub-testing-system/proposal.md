# Proposal: AgentHub Testing System with Distributed LOCKS

## Intent

AgentHub has 18+ API routes, 24+ MCP tools, 15+ Telegram commands, and async flows — but no systematic test coverage with isolation. Existing tests run ad-hoc without locks, causing race conditions. This introduces a distributed locking system (LOCKS) and test harnesses to verify every command/endpoint in isolation.

## Scope

### In Scope

- Distributed LOCKS: SQLite-based mutex with per-session, per-endpoint, per-resource locks, TTL expiry
- Test harnesses for API routes, MCP tools, and Telegram bot commands
- Flow Verifier: End-to-end workflow tests (spawn → task → QA → merge)
- CLI Runner: `agenthub-test run --command=headless --lock=test-1`, `--all --parallel`
- Migration: Refactor existing tests to use LOCKS

### Out of Scope

- UI testing (covered by Playwright E2E), performance testing, production lock deployment

## Capabilities

### New Capabilities

- `distributed-locks`: SQLite-based distributed mutex for test isolation with TTL, acquire/release
- `test-harness-api`: Systematic test framework for all AgentHub API routes
- `test-harness-mcp`: Test framework for MCP tools with isolated context
- `test-harness-telegram`: Programmatic Telegram bot testing with message simulation
- `flow-verifier`: End-to-end workflow verification for complete agent lifecycles
- `test-cli`: CLI runner for individual tests, suites, parallel runs with lock status

### Modified Capabilities

- `swarm-concurrency-limits`: Add LOCKS-based isolation to concurrency tests

## Approach

Three-tier lock granularity (per-session, per-endpoint, per-resource). New `test_locks` table in `data/devhub.db` via `better-sqlite3`. `:memory:` SQLite per suite for isolation; LOCKS use persistent DB for cross-process coordination. Import Telegram handlers directly, mock `ctx`. SSE waiting via polling + event buffer.

Phases: (1) LOCKS: `lib/test-locks.js` — `acquire()` via INSERT ON CONFLICT with `BEGIN IMMEDIATE`, TTL 30s. (2) Harness: `tests/agenthub/harness.js` — `acquire → execute → verify → release`. (3) API Tests: `tests/agenthub/api/*.test.js`. (4) MCP Tests: `tests/agenthub/mcp/*.test.js` — dynamic `import()` for ESM. (5) Telegram Tests: `tests/agenthub/telegram/*.test.js`. (6) Flows + CLI: `tests/agenthub/flows/*.test.js` + `bin/agenthub-test.js`.

## Affected Areas

New: `lib/test-locks.js`, `tests/agenthub/` (api, mcp, telegram, flows, harness.js), `bin/agenthub-test.js`, 6 new spec files. Modified: `data/devhub.db` (new table), `package.json` (new script), `tests/concurrency-test.js`, `tests/headless-test.js`, `tests/integration/`.

## Risks

| Risk                   | Likelihood | Mitigation                                     |
| ---------------------- | ---------- | ---------------------------------------------- |
| SQLite lock contention | Medium     | `BEGIN IMMEDIATE` + short TTL + retry backoff  |
| OpenCode flakiness     | High       | Mock for unit tests; real only for integration |
| DB state leaks         | Medium     | `:memory:` per suite; cleanup in `afterEach`   |
| SSE timing unreliable  | High       | Polling + timeout (proven pattern)             |
| MCP ESM/CJS interop    | Medium     | Dynamic `import()`                             |

## Rollback Plan

1. `git revert` — all new files additive
2. `DROP TABLE IF EXISTS test_locks;`
3. Remove `agenthub-test` script from `package.json`
4. No production impact — test-only system

## Dependencies

`better-sqlite3` (already in project), `commander` or `cac` for CLI, Jest, Playwright

## Success Criteria

- [ ] All 18+ API routes have at least one passing test
- [ ] All 24+ MCP tools have at least one passing test
- [ ] All 15+ Telegram commands have at least one passing test
- [ ] At least 3 end-to-end flow tests pass
- [ ] `agenthub-test run --all --parallel` completes with zero lock collisions
- [ ] Lock TTL prevents deadlocks (verified by killing test mid-execution)
- [ ] CLI shows real-time progress with lock status
- [ ] Existing tests refactored to use LOCKS
