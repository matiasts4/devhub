# Tasks: SW-4.1 Supervisor Loop Design

## Phase 1: Control-plane contract anchors

- [x] 1.1 RED — Add failing contract coverage in `src/lib/db/localDb.test.js` and `devhub-mcp/tests/integration/tasks.test.js` for `SupervisorSnapshot`, reason/evidence fields, and approval checkpoint keys.
- [x] 1.2 GREEN — Extend `src/lib/db/localDb.js` with durable supervisor snapshot + approval projection storage keyed by task/workspace/run/evidence, excluding git/worktree ownership fields.
- [x] 1.3 GREEN — Wire `devhub-mcp/server.js` helpers so queue/lease tools consume supervisor anchors without changing `get_next_task`, `add_task_comment`, `update_task`, or `create_task`.

## Phase 2: Queue evaluation, retry, and orphan recovery

- [x] 2.1 RED — Create `devhub-mcp/tests/integration/supervisor-loop.test.js` covering `dispatch`, `wait`, `retry`, `block`, and `recover_orphan` from queue + workspace/run/artifact fixtures.
- [x] 2.2 GREEN — Implement evaluator and counters in `devhub-mcp/server.js` using existing queue ordering, lease claims, `retry_count`, run lineage, and latest `evidence_ref`.
- [x] 2.3 GREEN — Persist stale-lease, orphaned-workspace/run, and `dirty_excluded_observed` reconciliation via `devhub-mcp/server.js` + `src/lib/db/localDb.js` without normalizing executor state.
- [x] 2.4 REFACTOR — Extract pure decision helpers into `src/lib/swarm/supervisorLoop.js` so MCP integration stays orchestration-only and unit-testable.

## Phase 3: Human approval and downstream boundary cleanup

- [x] 3.1 RED — Extend `devhub-mcp/tests/integration/supervisor-loop.test.js` for `request_approval`, pending wait, rejection, and no implicit approval from executor progress.
- [x] 3.2 GREEN — Add approval request/decision persistence in `src/lib/db/localDb.js` and `devhub-mcp/server.js`, keyed by task/workspace/run/reason/evidence with auditable timestamps.
- [x] 3.3 GREEN — Refit `src/app/api/agent/execute/route.js` and `src/app/api/agent/qa-result/route.js` to consume supervisor dispatch/approval outcomes only; keep remaining git side effects flagged as explicit follow-up debt.

## Phase 4: Observability and consumer read models

- [x] 4.1 RED — Add read-model tests in `src/lib/agentRegistryLive.test.js` and `src/components/__tests__/SwarmQueuePanel.test.js` for normalized supervisor states, reasons, counters, and `evidence_ref`.
- [x] 4.2 GREEN — Project supervisor snapshots through `src/lib/agentRegistryLive.js`, `src/components/SwarmQueuePanel.jsx`, and MCP responses in `devhub-mcp/server.js` without terminal/log/path coupling.
- [x] 4.3 GREEN — Document UI/Telegram/Control Center payload expectations in `docs/23_Swarm_Workspace_Intencion_y_Roadmap.md` and `docs/user/02_SwarmControl_Explained.md` against supervisor snapshots only.

## Phase 5: Verification and rollout anchors

- [x] 5.1 VERIFY — Add regression coverage in `src/lib/db/localDb.test.js`, `src/lib/swarm/__tests__/queue.test.js`, and `devhub-mcp/tests/integration/supervisor-loop.test.js` for spec scenarios and unchanged-failure blocking.
- [x] 5.2 VERIFY — Add consumer regression checks for blocked/approval/orphan rendering in `src/components/__tests__/SwarmQueuePanel.test.js` and relevant AgentHub polling tests.
- [x] 5.3 CLEANUP — Update `docs/13_Swarm_Autonomo_v2.md` with explicit post-SW-4.1 follow-up to remove remaining legacy execute/qa route side effects in a separate change.
