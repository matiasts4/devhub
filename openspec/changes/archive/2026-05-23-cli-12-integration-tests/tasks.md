# Tasks: CLI Integration Tests

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 800–1200 (6 new files + 2 modified) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1: seed factory → PR 2: claim-release + queue → PR 3: agent lifecycle + swarm + error recovery |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Seed factory module + DB setup utilities | PR 1 | main branch; foundation for all other tests |
| 2 | Claim-release + queue ordering tests | PR 2 | PR 1 branch; core workflow validation |
| 3 | Agent lifecycle + swarm state + error recovery tests | PR 3 | PR 2 branch; complex state transitions |

## Phase 1: Seed Factory Module (Foundation)

- [x] 1.1 Create `devhub-cli/tests/fixtures/seed-factory.js` with `createTempDb()` using `os.tmpdir()` + `crypto.randomUUID()` + `.db`
- [x] 1.2 Implement `cleanupDb(dbPath)` to delete `.db`, `.db-wal`, `.db-shm` files
- [x] 1.3 Implement `readDb(dbPath, sql, params)` using `better-sqlite3` for direct assertions
- [x] 1.4 Implement `seedBaseline(dbPath)` creating `proj-alpha`, `proj-beta`, `milestone-1`, tasks 1–5, agents 1–2 with PRAGMA table_info validation
- [x] 1.5 Implement individual seeders: `seedProject()`, `seedTask()`, `seedAgent()`, `seedWorkspace()`, `seedDependency()` with schema drift detection
- [x] 1.6 Write unit test for seed factory: `seed-factory.test.js` verifying temp DB creation, baseline seed, cleanup, and schema drift error

## Phase 2: Claim-Release Integration Tests

- [x] 2.1 Create `devhub-cli/tests/integration/claim-release.test.js` with beforeAll/beforeEach/afterAll DB lifecycle
- [x] 2.2 TDD RED: Write failing test for happy path (claim → release completed → task status = completed)
- [x] 2.3 TDD GREEN: Verify CLI claim/release commands produce correct exit code, stdout, and DB state
- [x] 2.4 TDD RED: Write failing test for release paused → task returns to pending → re-claim succeeds
- [x] 2.5 TDD GREEN: Verify paused outcome and re-claim workflow
- [x] 2.6 TDD RED: Write failing test for release failed → task status = blocked
- [x] 2.7 TDD GREEN: Verify failed outcome handling
- [x] 2.8 TDD RED: Write failing test for release abandoned → task status = blocked
- [x] 2.9 TDD GREEN: Verify abandoned outcome handling
- [x] 2.10 TDD RED: Write failing test for release with invalid token → rejected, task unchanged
- [x] 2.11 TDD GREEN: Verify token validation on release
- [x] 2.12 TDD RED: Write failing test for release unclaimed task → rejected
- [x] 2.13 TDD GREEN: Verify unclaimed task release rejection

## Phase 3: Queue Ordering Integration Tests

- [x] 3.1 Create `devhub-cli/tests/integration/queue-ordering.test.js` with shared DB setup
- [x] 3.2 TDD RED: Write failing test for 3 tasks with different priorities → returned in descending score order
- [x] 3.3 TDD GREEN: Verify queue endpoint returns correct priority ordering
- [x] 3.4 TDD RED: Write failing test for blocked task excluded with `include_blocked=false`
- [x] 3.5 TDD GREEN: Verify blocked task filtering and blocking reason in explanation
- [x] 3.6 TDD RED: Write failing test for blocked task included with `include_blocked=true`
- [x] 3.7 TDD GREEN: Verify blocked task inclusion with reason
- [x] 3.8 TDD RED: Write failing test for empty queue → no tasks returned
- [x] 3.9 TDD GREEN: Verify empty queue handling
- [x] 3.10 TDD RED: Write failing test for single project filter → only that project's tasks
- [x] 3.11 TDD GREEN: Verify project filtering in queue

## Phase 4: Agent Lifecycle Integration Tests

- [x] 4.1 Create `devhub-cli/tests/integration/agent-lifecycle.test.js` with per-test-file DB setup
- [x] 4.2 TDD RED: Write failing test for full lifecycle (register via DB insert → heartbeat → claim → release → unregister via DB delete)
- [x] 4.3 TDD GREEN: Verify lifecycle commands update DB state correctly
- [x] 4.4 TDD RED: Write failing test for heartbeat updates timestamp within timeout window
- [x] 4.5 TDD GREEN: Verify heartbeat timestamp persistence
- [x] 4.6 TDD RED: Write failing test for agent appears in `devhub agents` output after registration
- [x] 4.7 TDD GREEN: Verify agent list output includes registered agent
- [x] 4.8 TDD RED: Write failing test for agent removed from output after unregister
- [x] 4.9 TDD GREEN: Verify agent removal from registry

## Phase 5: Swarm State + Error Recovery Integration Tests

- [x] 5.1 Create `devhub-cli/tests/integration/swarm-state-transitions.test.js` with DB setup
- [x] 5.2 TDD RED: Write failing test for workspace transitions (planned → ready → active → completed)
- [x] 5.3 TDD GREEN: Verify workspace status update commands
- [x] 5.4 TDD RED: Write failing test for agent status transitions (idle → working via claim → idle via release)
- [x] 5.5 TDD GREEN: Verify agent status changes through lifecycle
- [x] 5.6 TDD RED: Write failing test for agent status working → error via update-status command
- [x] 5.7 TDD GREEN: Verify error status transition
- [x] 5.8 Create `devhub-cli/tests/integration/error-recovery.test.js` with per-test DB creation (isolated for lease tests)
- [x] 5.9 TDD RED: Write failing test for expired lease renewal → rejected, task returns to pending
- [x] 5.10 TDD GREEN: Verify lease expiration by manipulating `lease_expires_at` directly in DB
- [x] 5.11 TDD RED: Write failing test for token mismatch (agent A claims, agent B releases) → rejected
- [x] 5.12 TDD GREEN: Verify token ownership validation
- [x] 5.13 TDD RED: Write failing test for double-claim prevention (agent A claims, agent B claims same) → rejected
- [x] 5.14 TDD GREEN: Verify double-claim rejection
- [x] 5.15 TDD RED: Write failing test for unregistered agent claim → rejected, task remains pending
- [x] 5.16 TDD GREEN: Verify unregistered agent rejection

## Phase 6: Config Updates + Verify Full Suite

- [x] 6.1 Modify `devhub-cli/jest.config.js` to include integration test pattern if not already covered
- [x] 6.2 Add `test:integration` script to `devhub-cli/package.json`: `jest tests/integration/*.test.js --runInBand`
- [x] 6.3 Run full integration suite: `npm run test:integration` — verify all 24+ tests pass
- [x] 6.4 Run unit + integration together: `npm test && npm run test:integration` — verify no conflicts
- [x] 6.5 Verify no leftover `.db` files in `os.tmpdir()` after suite completes
- [x] 6.6 Add integration test documentation to `devhub-cli/README.md` or contributing guide
