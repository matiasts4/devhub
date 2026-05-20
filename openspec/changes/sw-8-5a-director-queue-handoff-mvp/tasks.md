# Tasks: SW-8.5A Director Queue Handoff MVP

## Phase 1: Route queue projection seam

- [x] 1.1 RED — `tests/agenthub/api/operations-health.test.js`: add failing GET cases for ordered, blocked, and empty `director_queue` from `get_execution_queue`; assert no rerank or synthetic entries.
- [x] 1.2 GREEN — `src/lib/devhub/mcpClient.js`, `src/app/api/agenthub/operations/health/route.js`: add server MCP helper and project `director_queue.items`/empty state into health GET with `project_id`. _(Accepted deviation: MCP helper stayed route-local in `src/app/api/agenthub/operations/health/route.js`; `src/lib/devhub/mcpClient.js` was not created.)_
- [x] 1.3 REFACTOR — `src/app/api/agenthub/operations/health/route.js`: extract bounded queue mapping helpers; keep authority/freshness explicit and projection-only.

## Phase 2: Queue normalization seam

- [x] 2.1 RED — `src/lib/operations/__tests__/fixtures/controlRoomSnapshot.js`, `src/lib/operations/__tests__/swarmControl.test.js`: add failing fixture/unit coverage for normalized `director_queue` order, blocked semantics, empty state, and degraded freshness. _(Direct evidence landed in `src/lib/operations/__tests__/swarmControl.test.js`; fixture-file change was not required.)_
- [x] 2.2 GREEN — `src/lib/operations/swarmControl.js`: normalize/select `director_queue` plus default handoff state without creating local queue truth.
- [x] 2.3 REFACTOR — `src/lib/operations/swarmControl.js`: reuse existing authority/freshness helpers; remove duplicate fallback logic.

## Phase 3: Read-only panel render

- [x] 3.1 RED — `src/views/__tests__/SwarmControl.test.jsx`: add failing UI cases for ordered rows, blocked badges, empty state, and strict “checkpoint before next claim” copy.
- [x] 3.2 GREEN — `src/components/control-room/DirectorQueuePanel.jsx`, `src/views/SwarmControl.jsx`: render bounded queue panel from normalized snapshot only; pass `project_id` on health fetch.
- [x] 3.3 REFACTOR — `src/components/control-room/DirectorQueuePanel.jsx`, `src/views/SwarmControl.jsx`: keep panel props minimal; avoid panel-owned queue state.

## Phase 4: Safe claim handoff seam

- [x] 4.1 RED — `tests/agenthub/api/operations-health.test.js`: add failing POST `claim_director_next_task` cases for success refresh, zero/multiple eligible executors, and empty/blocked claim results from `get_next_task`.
- [x] 4.2 GREEN — `src/app/api/agenthub/operations/health/route.js`: validate exactly one active non-director executor, call `get_next_task`, re-read `get_workspace_evidence` + `get_execution_queue`, and return refreshed durable handoff state.
- [x] 4.3 REFACTOR — `src/app/api/agenthub/operations/health/route.js`, `src/lib/devhub/mcpClient.js`: centralize MCP call/error shaping; no optimistic task/workspace/run records. _(Accepted deviation: helper centralization stayed route-local; no shared `src/lib/devhub/mcpClient.js` was introduced.)_

## Phase 5: Handoff UI wiring

- [x] 5.1 RED — `src/views/__tests__/SwarmControl.test.jsx`: add failing cases for disabled handoff button, successful durable result card, and empty/blocked/error messages after refresh.
- [x] 5.2 GREEN — `src/components/control-room/DirectorQueuePanel.jsx`, `src/views/SwarmControl.jsx`: submit POST handoff, render returned durable task/workspace/run/supervisor summary, and disable action when recipient resolution is unsafe.
- [x] 5.3 REFACTOR — `src/views/SwarmControl.jsx`, `src/components/control-room/DirectorQueuePanel.jsx`: isolate submit lifecycle state only; keep refreshed snapshot as sole truth.

## Phase 6: Focused verification + checkpoint

- [ ] 6.1 Verify — run `npm test -- tests/agenthub/api/operations-health.test.js src/lib/operations/__tests__/swarmControl.test.js src/views/__tests__/SwarmControl.test.jsx`; confirm every queue/handoff scenario and no SW-8.6A/8.7A/8.8A/9.x/BROWSER drift. _(Not yet re-run as one combined verification command during this artifact sync.)_
- [ ] 6.2 Checkpoint — inspect `git status --short` + diff, create a local checkpoint commit, then and only then start any follow-up task. _(Not done; commit/checkpoint is outside this sync task.)_

## Scope Guard

- [x] Keep file scope bounded to `src/lib/devhub/mcpClient.js`, `src/app/api/agenthub/operations/health/route.js`, `src/lib/operations/swarmControl.js`, `src/components/control-room/DirectorQueuePanel.jsx`, `src/views/SwarmControl.jsx`, and the listed tests/fixtures. _(Direct evidence: current `git status --short` shows only the bounded source/test files plus this OpenSpec change folder; accepted deviation remains route-local helper instead of `src/lib/devhub/mcpClient.js`.)_
- [x] Reject free-form assignee picker, composer/evidence/approvals UI, new queue scorer/schema, Browser/GTK, and any second queue truth. _(Direct evidence: completed implementation artifacts and Engram apply-progress cover only queue projection + safe claim handoff seams.)_
