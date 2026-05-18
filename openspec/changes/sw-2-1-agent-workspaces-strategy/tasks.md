# Tasks: SW-2.1 Agent Workspaces Strategy

## Phase 1: Schema Foundation

- [ ] 1.1 Add failing coverage in `src/lib/db/localDb.test.js` for `agent_workspaces` fields, unique locks, terminal immutability, frozen baseline `f814998dd05cb491caf8637bf570dbd74b539090`, and verbatim `observed_dirty='dirty-excluded'` handling.
- [ ] 1.2 Update `src/lib/db/localDb.js` to add `agent_workspaces` schema, status enum, indexes, and non-terminal `(agent_id,current_task_id)` ownership guard while keeping `workspace_path` logical and `worktree_path` executor-reported.

## Phase 2: Control-Plane Lifecycle API

- [ ] 2.1 Add failing integration tests in `devhub-mcp/tests/integration/agent-workspaces-lifecycle.test.js` for lifecycle-only tools: create planned workspace, report provisioning, pause/resume, conflict, cleanup request, orphan, and terminal outcomes.
- [ ] 2.2 Extend `devhub-mcp/server.js` with `agent_workspaces` create/update/report handlers that enforce state invariants, required observed fields on `ready|active`, terminal-row immutability, and opaque `evidence_ref` pass-through for SW-3.1.
- [ ] 2.3 Update `src/app/api/agent/execute/route.js`, `src/app/api/agent/qa-result/route.test.js`, and related route coverage so DevHub routes emit/report lifecycle intents only; no git, merge, checkout, delete, or worktree execution in DevHub MCP.

## Phase 3: Executor Contract And Runtime Bridge

- [ ] 3.1 Add failing contract tests in `devhub-mcp/tests/integration/agent-workspaces-lifecycle.test.js` for reserved-vs-observed drift, collision payloads, `last_error`, `recovery_reason`, and executor-reported `worktree_path`/`observed_*` fields.
- [ ] 3.2 Document and wire the executor adapter payload contract in `devhub-mcp/server.js` and `docs/04_Protocolo_MCP_y_Agentes.md`; executor adapters provision outside MCP and only report metadata back.
- [ ] 3.3 Update `src/lib/agentRegistryLive.js` and `src/lib/agentRegistryLive.test.js` so `devhub_agent_runs` remains observer-only and links by `workspace_id` or reported status, never as workspace ownership source.

## Phase 4: Collision, Recovery, Cleanup Instrumentation

- [ ] 4.1 Add integration coverage for deterministic branch/path/id collisions, drift-to-`conflicted`, lost ownership to `orphaned`, and `cleanup_pending -> completed|failed` transitions with preserved historical metadata.
- [ ] 4.2 Update `docs/23_Swarm_Workspace_Intencion_y_Roadmap.md` and `docs/24_Politica_Git_y_Versionado_Agentes.md` with instrumentation expectations, safe baseline `f814998dd05cb491caf8637bf570dbd74b539090`, and why `dirty-excluded` must never be normalized to clean.

## Phase 5: Docs, Migration, Dependency Freeze

- [ ] 5.1 Update `docs/03_Esquema_BaseDatos.md`, `docs/08_Enjambre_Agentes_y_Orquestacion.md`, and `docs/user/05_AgentHub.md` to map current runtime concepts to `agent_workspaces`, lifecycle states, cleanup intent semantics, and observer-only run metadata.
- [ ] 5.2 Record dependency handoff in this change set: SW-3.1 starts only after Phases 2-4 freeze `evidence_ref` and lifecycle outputs; SW-2.2 stays blocked until schema, service/API, executor contract, and docs agree on the frozen workspace contract.
