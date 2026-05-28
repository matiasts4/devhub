# Tasks: Swarm Reliability Phase 1

## Review Workload Forecast

| Field                   | Value                            |
| ----------------------- | -------------------------------- |
| Estimated changed lines | 350–450                          |
| 400-line budget risk    | Medium                           |
| Chained PRs recommended | No                               |
| Suggested split         | Single PR with 4 logical commits |
| Delivery strategy       | single-pr-default                |
| Chain strategy          | size-exception                   |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal                         | Commit   | Notes                               |
| ---- | ---------------------------- | -------- | ----------------------------------- |
| 1    | Schema + DB merge foundation | Commit 1 | Phase 1 tasks; base branch          |
| 2    | Durable queue operations     | Commit 2 | Phase 2 tasks; depends on schema    |
| 3    | Agent CWD enforcement        | Commit 3 | Phase 3 tasks; independent of queue |
| 4    | Integration tests + cleanup  | Commit 4 | Phase 4 tasks; final commit         |

## Phase 1: Infrastructure (Schema + DB Merge)

- [ ] 1.1 RED: Write test for `swarm_queue_items` table creation in `src/lib/db/localDb.test.js` — verify table, columns, CHECK constraint appear after `ensureRuntimeSchema` (spec: REQ-DQ-1 Scenario: Table created on fresh DB)
- [ ] 1.2 GREEN: Add `swarm_queue_items` CREATE TABLE + indexes to `ensureRuntimeSchema` in `src/lib/db/localDb.js` — columns: id TEXT PK, body TEXT, status TEXT CHECK, enqueued_at TEXT, started_at TEXT nullable, completed_at TEXT nullable
- [ ] 1.3 RED: Write test verifying `require('./core')` returns same references as `require('./localDb')` for getDb, ensureRuntimeSchema, buildSelectQuery (spec: REQ-DB-1, REQ-DB-2, REQ-DB-3)
- [ ] 1.4 GREEN: Replace `src/lib/db/core.js` content with thin re-export shim: `module.exports = { ...require('./localDb') };` plus `getDb`/`ensureRuntimeSchema` direct aliases — under 20 lines, no Database/require/better-sqlite3
- [ ] 1.5 REFACTOR: Run full existing test suite to confirm zero regressions from core.js → shim (spec: REQ-DB-4)

## Phase 2: Durable Queue Operations

- [ ] 2.1 RED: Write tests for `enqueue` persisting to `swarm_queue_items` with status=pending via `withDbWriteQueue` (spec: REQ-DQ-2 Scenarios: Enqueue persists, Enqueue survives restart)
- [ ] 2.2 GREEN: Add `enqueueToDb` to `src/lib/swarm/queue.js` — persist via `withDbWriteQueue`, then resolve in-memory Promise. Add `recoverFromDb` call on SwarmQueue init to load pending rows
- [ ] 2.3 RED: Write tests for atomic dequeue: status pending→processing, no double-acquire (spec: REQ-DQ-3)
- [ ] 2.4 GREEN: Modify dequeue logic in `src/lib/swarm/queue.js` — SET status='processing', started_at=now via `withDbWriteQueue`. Resolve consumer with item body
- [ ] 2.5 RED: Write test for acknowledgment: processing→completed with completed_at (spec: REQ-DQ-4)
- [ ] 2.6 GREEN: Add `ackInDb` to `src/lib/swarm/queue.js` — SET status='completed', completed_at=now via `withDbWriteQueue` on consumer resolve
- [ ] 2.7 RED: Write tests for startup recovery: load pending, re-enqueue stale processing >5min, leave recent processing alone (spec: REQ-DQ-5)
- [ ] 2.8 GREEN: Add `recoverStaleItems` to `src/lib/swarm/queue.js` — SELECT processing WHERE started_at < (now-5min), UPDATE to pending; call from init after `recoverFromDb`
- [ ] 2.9 RED: Write test for cancellation: status→cancelled, remove from memory, reject with cancelled flag (spec: REQ-DQ-6)
- [ ] 2.10 GREEN: Modify `remove` in `src/lib/swarm/queue.js` — UPDATE status='cancelled' via `withDbWriteQueue`, reject Promise with `error.cancelled=true`
- [ ] 2.11 RED: Write test for staleness cleanup: purge completed/cancelled >1hr (spec: REQ-DQ-7)
- [ ] 2.12 GREEN: Add `purgeOldItems` to `src/lib/swarm/queue.js` — DELETE WHERE status IN ('completed','cancelled') AND completed_at < (now-1hr) via `withDbWriteQueue`; schedule periodic interval

## Phase 3: Agent CWD Enforcement

- [ ] 3.1 RED: Write test for `buildAgentLaunchWrapper` including `cd "${workspacePath}"` as first executable command, before env exports (spec: REQ-CWD-1 Scenario: Wrapper includes cd)
- [ ] 3.2 GREEN: Modify `buildAgentLaunchWrapper` in `src/lib/agentLaunchWrapper.js` — insert `cd "${workspacePath}"` line before environment exports, add fail-fast `|| exit 1` guard
- [ ] 3.3 RED: Write test for `buildTmuxWrappedCommand` accepting `cwd` param and including `-c` flag on `tmux new-session` (spec: REQ-CWD-2)
- [ ] 3.4 GREEN: Modify `buildTmuxWrappedCommand` in `src/lib/agentLaunchCommand.js` — add `cwd` param, inject `-c '${cwd}'` into tmux command when provided
- [ ] 3.5 RED: Write test for fail-fast on missing worktree path (spec: REQ-CWD-3 Scenario: Launch aborted for missing worktree)
- [ ] 3.6 GREEN: Add path existence validation in agent launch flow — `fs.existsSync(worktreePath)` check before `buildAgentLaunchCommand`, throw descriptive error if missing

## Phase 4: Integration + Cleanup

- [ ] 4.1 Run full test suite — all existing + new tests green
- [ ] 4.2 Verify `src/lib/db/index.js` spread re-export still works (no change needed — shim propagates automatically)
- [ ] 4.3 Remove any dead code from `core.js` (should already be minimal after 1.4)
- [ ] 4.4 Verify imports in `src/lib/swarm/processes/route.js` resolve correctly after merge
