# Tasks: SW-9.1A execution queue leases and orphan recovery

## Phase 1: Lease lifecycle

- [x] 1.1 RED: Extend `tests/agenthub/mcp/task-leases.test.js` for single-owner claim success and stale/non-owner renew/release rejection in `claim_next_task`, `renew_task_lease`, `release_task`.
- [x] 1.2 GREEN: Tighten claim-token and owner checks in `devhub-mcp/server.js`; reuse current `tasks` lease fields only.
- [x] 1.3 REFACTOR: Consolidate lease helper sequencing in `devhub-mcp/server.js` so cleanup/claim/renew/release stay deterministic under repeated reads.

## Phase 2: Stale detection

- [x] 2.1 RED: Add expiry coverage in `tests/agenthub/mcp/task-leases.test.js` proving `cleanupExpiredLeases()` clears expired leases but preserves valid ones during queue reads and later claims.
- [x] 2.2 GREEN: Update stale-lease cleanup/read flow in `devhub-mcp/server.js` so expired leases reset before dispatch and valid leases remain authoritative.
- [x] 2.3 REFACTOR: Reuse `src/lib/db/localDb.js` linkage helpers so stale cleanup reads latest durable task/workspace/run facts without new storage.

## Phase 3: Orphan recovery

- [x] 3.1 RED: Extend `devhub-mcp/tests/integration/supervisor-loop.test.js` for orphaned workspace/run recovery-required state and healthy linkage no-op behavior.
- [x] 3.2 GREEN: Make `src/lib/swarm/supervisorLoop.js` derive stale/orphan outcomes only from durable task/workspace/run/checkpoint facts.
- [x] 3.3 REFACTOR: Ensure `devhub-mcp/server.js` attaches supervisor state idempotently to leased queue entries without creating second recovery authority.

## Phase 4: Dependency blocking

- [x] 4.1 RED: Add blocked-dependency visibility and non-claimability cases in `tests/agenthub/mcp/task-leases.test.js` for `get_execution_queue(includeBlocked)` and `claim_next_task`.
- [x] 4.2 GREEN: Update queue building in `devhub-mcp/server.js` so incomplete/blocked dependencies stay visible but never dispatchable.
- [x] 4.3 REFACTOR: Normalize blocked reason precedence in `src/lib/swarm/supervisorLoop.js` so dependency and recovery states stay deterministic.

## Phase 5: Observability / Control Room consistency

- [x] 5.1 RED: Extend `tests/agenthub/api/operations-health.test.js` and `src/lib/operations/__tests__/swarmControl.test.js` for authoritative snapshot projection, freshness, blocked state, and orphan-recovery payloads.
- [x] 5.2 GREEN: Keep `src/app/api/agenthub/operations/health/route.js` read-only and project `director_queue` from `get_execution_queue(includeBlocked: true)`.
- [x] 5.3 REFACTOR: Update `src/lib/operations/swarmControl.js` to normalize queue/supervisor fields from durable snapshot data only.

## Phase 6: Verification / checkpoint

- [x] 6.1 Run focused Jest suites for `tests/agenthub/mcp/task-leases.test.js`, `devhub-mcp/tests/integration/supervisor-loop.test.js`, `tests/agenthub/api/operations-health.test.js`, and `src/lib/operations/__tests__/swarmControl.test.js` until GREEN.
- [x] 6.2 Re-read `openspec/changes/sw-9-1a-execution-queue-leases-orphan-recovery/specs/execution-queue-leases/spec.md` and `specs/swarm-observability/spec.md`; confirm every scenario maps to passing coverage and note checkpoint in this file.

## Checkpoint

- 2026-05-21: Verified execution-queue lease lifecycle, stale cleanup, dependency blocking, orphan recovery, and authoritative Control Room projection against passing focused suites in root and `devhub-mcp` package scopes.
