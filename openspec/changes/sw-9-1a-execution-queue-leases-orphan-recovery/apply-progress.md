# Apply Progress: SW-9.1A execution queue leases and orphan recovery

## Mode

Strict TDD

## Completed Tasks

- [x] 1.1 RED: Lease lifecycle coverage for claim/renew/release ownership and stale-token rejection.
- [x] 1.2 GREEN: Token/owner enforcement kept on existing `tasks` lease fields.
- [x] 1.3 REFACTOR: Lease cleanup/read sequencing stays deterministic under repeated reads.
- [x] 2.1 RED: Expired-vs-valid lease queue coverage added.
- [x] 2.2 GREEN: Queue reads reclaim expired leases before dispatch while preserving valid owners.
- [x] 2.3 REFACTOR: Durable linkage reuse kept in existing DB/server helpers only.
- [x] 3.1 RED: Orphaned workspace/run and healthy relink integration coverage extended.
- [x] 3.2 GREEN: Recovery decisions remain derived from durable task/workspace/run/checkpoint facts.
- [x] 3.3 REFACTOR: Supervisor attachment stays idempotent and single-authority.
- [x] 4.1 RED: Blocked dependency visibility and non-claimability coverage added.
- [x] 4.2 GREEN: Queue exposes blocked entries for visibility but never dispatches them.
- [x] 4.3 REFACTOR: Blocked reason stays deterministic through normalized queue payloads.
- [x] 5.1 RED: Control Room health + selector coverage extended for authoritative approval/queue projection.
- [x] 5.2 GREEN: Health route keeps `director_queue` read-only and sourced from durable queue truth.
- [x] 5.3 REFACTOR: Swarm Control normalization consumes durable queue/supervisor payload only.
- [x] 6.1 Verification suites passed in root and `devhub-mcp` scopes.
- [x] 6.2 Spec scenarios re-read and mapped to passing coverage.

## Files Changed

| File                                                                       | Action   | Notes                                                                                                                          |
| -------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `devhub-mcp/server.js`                                                     | Modified | Chose latest durable workspace/checkpoint records, exposed blocked reason, and enforced cleanup before local release renewals. |
| `devhub-mcp/tests/integration/supervisor-loop.test.js`                     | Modified | Added orphan precedence + healthy relink regression coverage and fixed ownership collisions in fixtures.                       |
| `tests/agenthub/mcp/harness.js`                                            | Modified | Mirrored blocked reason + stale release cleanup in MCP harness.                                                                |
| `tests/agenthub/mcp/task-leases.test.js`                                   | Modified | Added RED coverage for stale/non-owner release and blocked queue visibility.                                                   |
| `src/lib/db/localDb.js`                                                    | Modified | Included supervisor snapshots/checkpoints in mission snapshot projection.                                                      |
| `src/app/api/agenthub/operations/health/route.js`                          | Modified | Projected approvals from authoritative mission snapshot data only.                                                             |
| `src/lib/operations/swarmControl.js`                                       | Modified | Normalized enriched approval identity/gating fields from durable snapshot input.                                               |
| `src/lib/operations/__tests__/swarmControl.test.js`                        | Modified | Locked approval normalization behavior.                                                                                        |
| `src/lib/operations/__tests__/fixtures/controlRoomSnapshot.js`             | Modified | Enriched approval fixture payloads.                                                                                            |
| `tests/agenthub/api/operations-health.test.js`                             | Modified | Added authoritative pending/closed approval projection coverage.                                                               |
| `openspec/changes/sw-9-1a-execution-queue-leases-orphan-recovery/tasks.md` | Modified | Marked completed tasks and added verification checkpoint.                                                                      |

## TDD Cycle Evidence

| Task    | Test File                                                                                           | Layer              | Safety Net                                            | RED                                                                   | GREEN                                                                                                           | TRIANGULATE                                                      | REFACTOR                                                                |
| ------- | --------------------------------------------------------------------------------------------------- | ------------------ | ----------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 1.1-1.3 | `tests/agenthub/mcp/task-leases.test.js`                                                            | Integration        | ✅ 7/7 root Jest                                      | ✅ Added stale/non-owner release assertions first                     | ✅ `npm test -- tests/agenthub/mcp/task-leases.test.js`                                                         | ✅ Claim, stale release, blocked queue paths                     | ✅ Cleanup sequencing mirrored in harness/server                        |
| 2.1-2.3 | `tests/agenthub/mcp/task-leases.test.js`                                                            | Integration        | ✅ 7/7 root Jest                                      | ✅ Expired lease queue coverage in place before server/harness tweaks | ✅ `npm test -- tests/agenthub/mcp/task-leases.test.js`                                                         | ✅ Expired vs blocked vs reusable paths                          | ✅ Reused existing lease/db helpers only                                |
| 3.1-3.3 | `devhub-mcp/tests/integration/supervisor-loop.test.js`                                              | Integration        | ⚠️ Baseline exposed 2 failing orphan precedence tests | ✅ Added/latest-orphan + healthy-relink assertions first              | ✅ `npm test -- tests/integration/supervisor-loop.test.js` (in `devhub-mcp`)                                    | ✅ Orphaned workspace, healthy relink, orphaned run, stale lease | ✅ Fixed fixture collision so durable precedence is exercised correctly |
| 4.1-4.3 | `tests/agenthub/mcp/task-leases.test.js`                                                            | Integration        | ✅ 7/7 root Jest                                      | ✅ Blocked queue visibility asserted before payload normalization     | ✅ `npm test -- tests/agenthub/mcp/task-leases.test.js`                                                         | ✅ includeBlocked + claim skip                                   | ✅ Stable `blocked_reason` propagated end-to-end                        |
| 5.1-5.3 | `tests/agenthub/api/operations-health.test.js`, `src/lib/operations/__tests__/swarmControl.test.js` | Integration + Unit | ✅ 38/38 root Jest                                    | ✅ Approval projection + selector normalization assertions first      | ✅ `npm test -- tests/agenthub/api/operations-health.test.js src/lib/operations/__tests__/swarmControl.test.js` | ✅ Pending vs approved checkpoints, enriched approval payloads   | ✅ Projection stays read-only and snapshot-authoritative                |
| 6.1-6.2 | Same focused suites                                                                                 | Verification       | N/A                                                   | ✅ Scenario/spec reread before final checkpoint                       | ✅ Root + `devhub-mcp` focused suites all passing                                                               | ➖ Spec mapping, no extra logic branch                           | ➖ None needed                                                          |

## Test Summary

- Total tests written/extended: 8 targeted assertions/scenarios across 4 suites.
- Total focused tests passing: 59 (`7 + 14 + 16 + 22`).
- Layers used: Unit (selector normalization inside root Jest), Integration (MCP + route + supervisor loop).
- Approval tests: None — behavior change covered directly by new RED cases.
- Pure functions created: 0.

## Verification Commands

- `npm test -- tests/agenthub/mcp/task-leases.test.js`
- `npm test -- tests/agenthub/api/operations-health.test.js src/lib/operations/__tests__/swarmControl.test.js`
- `npm test -- tests/integration/supervisor-loop.test.js` (workdir: `devhub-mcp`)

## Deviations

None — implementation stays within existing durable queue/recovery authority. The only extra fix was adjusting orphan-recovery test fixtures to avoid workspace reservation collisions so the intended durable precedence path actually runs.

## Remaining Tasks

- None for SW-9.1A apply scope.
