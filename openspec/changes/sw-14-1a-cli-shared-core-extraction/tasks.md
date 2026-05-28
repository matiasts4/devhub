# Tasks: SW-14.1A Shared core extraction for compact durable reads

## Review Workload Forecast

| Field                   | Value                                                                          |
| ----------------------- | ------------------------------------------------------------------------------ |
| Estimated changed lines | 850–1,150 across ~10–12 files                                                  |
| 400-line budget risk    | High                                                                           |
| Chained PRs recommended | Yes                                                                            |
| Suggested split         | PR 1 core+unit tests → PR 2 route/SQLite parity → PR 3 Supabase parity+cleanup |
| Delivery strategy       | auto-forecast                                                                  |
| Chain strategy          | pending                                                                        |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

High forecast: do not force single-slice apply; slice by work unit.

### Suggested Work Units

| Unit | Goal                                         | Likely PR | Notes                                 |
| ---- | -------------------------------------------- | --------- | ------------------------------------- |
| 1    | Shared durable core + barrel + unit tests    | PR 1      | Smallest independent seam             |
| 2    | Health route + SQLite MCP parity             | PR 2      | Same durable fixtures, same semantics |
| 3    | Supabase presenters + cleanup + final verify | PR 3      | Preserve wrappers/tool args           |

Likely touched files: `src/lib/db/compactReads.js`, `src/lib/db/index.js`, `src/lib/runtime/operationalHealthSources.js`, `devhub-mcp/server.js`, `src/app/api/agenthub/operations/health/route.js`, `src/lib/db/{workspaces.js,agentRuns.js,artifacts.js,supervisor.js,swarmMissions.js}`, `src/lib/db/compactReads.test.js`, `tests/agenthub/api/operations-health.test.js`, `tests/agenthub/mcp/task-leases.test.js`, `devhub-mcp/tests/integration/{tasks.test.js,agent-runs-artifacts.test.js}`.

## Phase 1: Infrastructure

- [x] 1.1 RED — Add failing `src/lib/db/compactReads.test.js` for deterministic queue order, blocked semantics, latest run/artifact, empty state, and durable-truth-over-runtime-hints behavior.
- [x] 1.2 GREEN — Create `src/lib/db/compactReads.js` with `readExecutionQueueSummary`, `readWorkspaceEvidenceSummary`, `presentExecutionQueue`, `presentWorkspaceEvidence`, and `createDirectorQueueContract`; re-export via `src/lib/db/index.js`.
- [x] 1.3 REFACTOR — Reuse/minimize helper reads in `src/lib/db/{workspaces.js,agentRuns.js,artifacts.js,supervisor.js,swarmMissions.js}` only where extraction needs it; no schema or tool-argument drift.

Accepted deviation for work unit 1: no extra domain-module edits were required for 1.3 because the extraction could reuse the existing `workspaces`, `artifacts`, and `supervisor` helpers without schema, contract, or tool drift.

## Phase 2: Implementation

- [x] 2.1 RED — Extend `tests/agenthub/api/operations-health.test.js`, `devhub-mcp/tests/integration/tasks.test.js`, and `devhub-mcp/tests/integration/agent-runs-artifacts.test.js` for MCP/route parity, stable degraded states, and unchanged wrappers.
- [x] 2.2 GREEN — Update `src/app/api/agenthub/operations/health/route.js` plus new `src/lib/runtime/operationalHealthSources.js` so route reads shared core directly, keeps runtime diagnostics local, and preserves `control_room_snapshot_input` assembly.
- [x] 2.3 GREEN — Update `devhub-mcp/server.js` to replace inline SQLite/Supabase queue/evidence shaping with shared `read*`/`present*` helpers while keeping schemas, `ok/err`, and transport fields intact.
- [x] 2.4 REFACTOR — Remove dead inline queue/evidence mappers only after parity stays green; do not add CLI commands or MCP pruning.

## Phase 3: Testing

- [x] 3.1 RED — Extend `tests/agenthub/mcp/task-leases.test.js` only for adapter-facing blocked/lease fields that shared queue presentation must preserve.
- [x] 3.2 GREEN — Fix parity regressions until every spec scenario is covered without making runtime-only inputs required by shared core.
- [x] 3.3 VERIFY — Run `npm test -- src/lib/db/compactReads.test.js tests/agenthub/api/operations-health.test.js tests/agenthub/mcp/task-leases.test.js` and `(cd devhub-mcp && npm test -- tests/integration/tasks.test.js tests/integration/agent-runs-artifacts.test.js)`.

## Phase 4: Docs / Cleanup

- [x] 4.1 Add module comments in `src/lib/db/compactReads.js` and `src/lib/runtime/operationalHealthSources.js` marking durable-public vs runtime-internal ownership.
- [x] 4.2 VERIFY/CLEANUP — Run `npm run lint` (no new errors in modified files) and `npm run check:circular` (script does not exist in this repo; accepted deviation).
