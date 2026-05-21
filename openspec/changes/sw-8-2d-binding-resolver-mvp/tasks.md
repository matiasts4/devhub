# Tasks: SW-8.2D Binding Resolver MVP

## Phase 1: Resolver foundation (smallest safe batch)

- [x] 1.1 RED — `src/lib/db/localDb.test.js`: add failing resolver tests for `missing` and `bound` using durable `agent_workspaces` + latest `agent_runs`, proving runtime rows are not required for ownership.
- [x] 1.2 GREEN — `src/lib/db/localDb.js`: add `resolveAgentRuntimeBinding()` and export it; select workspace by `project_id/agent_id/preferred_task_id`, derive `run_id` from `getLatestAgentRunForWorkspace()`, return `classification`, legacy `status`, and additive `run_id`.
- [x] 1.3 REFACTOR — `src/lib/db/localDb.js`: refactor shared workspace/run selection into tiny local helpers without changing resolver behavior or widening runtime inputs.

## Phase 2: Drift correction in mission adapter

- [x] 2.1 RED — `src/lib/db/localDb.test.js`: add failing mission-binding tests for `stale` and `orphaned`, including `run_id_or_session_id` correlation-only and supervisor/workspace orphan signals.
- [x] 2.2 GREEN — `src/lib/db/localDb.js`: rewrite `getVerifiedMissionRecipientBinding()` as a thin adapter over `resolveAgentRuntimeBinding()`; keep legacy fields, stop using `run_id_or_session_id` as ownership truth, and use `agent_hub_sessions` only as evidence for `stale` refinement.
- [x] 2.3 REFACTOR — `src/lib/db/localDb.test.js`: remove session-owned assumptions from existing binding fixtures, keeping scenarios explicit for `bound|stale|missing|orphaned`.

## Phase 3: Consumer compatibility seam

- [x] 3.1 RED — `tests/unit/swarm/opencodeTargetResolver.test.js`: add failing assertions that `classification` and `run_id` survive normalization while legacy `status` remains `bound|unbound`.
- [x] 3.2 GREEN — `src/lib/swarm/opencodeTargetResolver.js`: preserve existing `status` contract, pass through `classification`, `run_id`, and legacy fields without collapsing rich state into information loss.
- [x] 3.3 REFACTOR — `tests/unit/swarm/opencodeTargetResolver.test.js`: simplify fixtures to document compatibility boundary, not adapter internals.

## Phase 4: Focused verification

- [x] 4.1 Verify targeted unit tests only: `src/lib/db/localDb.test.js` binding cases and `tests/unit/swarm/opencodeTargetResolver.test.js` compatibility cases.
- [x] 4.2 Verify no route/UI/Tauri files changed and no new durable table/API surface was introduced.
