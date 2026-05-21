# Apply Progress: SW-2.1 Agent Workspaces Strategy

## Status

- Mode: Strict TDD
- Batch: SW-2.1A
- Outcome: Completed SW-2.1A scope with passing targeted tests

## Completed Tasks

- [x] 1.1 Add failing coverage in `src/lib/db/localDb.test.js` for `agent_workspaces` fields, unique locks, terminal immutability, frozen baseline `f814998dd05cb491caf8637bf570dbd74b539090`, and verbatim `observed_dirty='dirty-excluded'` handling.
- [x] 1.2 Update `src/lib/db/localDb.js` to add `agent_workspaces` schema, status enum, indexes, and non-terminal `(agent_id,current_task_id)` ownership guard while keeping `workspace_path` logical and `worktree_path` executor-reported.
- [x] 2.1 Add failing integration tests in `devhub-mcp/tests/integration/agent-workspaces-lifecycle.test.js` for lifecycle-only tools: create planned workspace, report provisioning, pause/resume, conflict, cleanup request, orphan, and terminal outcomes.
- [x] 2.2 Extend `devhub-mcp/server.js` with `agent_workspaces` create/update/report handlers that enforce state invariants, required observed fields on `ready|active`, terminal-row immutability, and opaque `evidence_ref` pass-through for SW-3.1.
- [x] 2.3 Update `src/app/api/agent/execute/route.js`, `src/app/api/agent/qa-result/route.test.js`, and related route coverage so DevHub routes emit/report lifecycle intents only; no git, merge, checkout, delete, or worktree execution in DevHub MCP.
- [x] 3.1 Add failing contract tests in `devhub-mcp/tests/integration/agent-workspaces-lifecycle.test.js` for reserved-vs-observed drift, collision payloads, `last_error`, `recovery_reason`, and executor-reported `worktree_path`/`observed_*` fields.
- [x] 3.2 Document and wire the executor adapter payload contract in `devhub-mcp/server.js` and `docs/04_Protocolo_MCP_y_Agentes.md`; executor adapters provision outside MCP and only report metadata back.
- [x] 3.3 Update `src/lib/agentRegistryLive.js` and `src/lib/agentRegistryLive.test.js` so `devhub_agent_runs` remains observer-only and links by `workspace_id` or reported status, never as workspace ownership source.
- [x] 4.1 Add integration coverage for deterministic branch/path/id collisions, drift-to-`conflicted`, lost ownership to `orphaned`, and `cleanup_pending -> completed|failed` transitions with preserved historical metadata.
- [x] 4.2 Update `docs/23_Swarm_Workspace_Intencion_y_Roadmap.md` and `docs/24_Politica_Git_y_Versionado_Agentes.md` with instrumentation expectations, safe baseline `f814998dd05cb491caf8637bf570dbd74b539090`, and why `dirty-excluded` must never be normalized to clean.
- [x] 5.1 Update `docs/03_Esquema_BaseDatos.md`, `docs/08_Enjambre_Agentes_y_Orquestacion.md`, and `docs/user/05_AgentHub.md` to map current runtime concepts to `agent_workspaces`, lifecycle states, cleanup intent semantics, and observer-only run metadata.
- [x] 5.2 Record dependency handoff in this change set: SW-3.1 starts only after Phases 2-4 freeze `evidence_ref` and lifecycle outputs; SW-2.2 stays blocked until schema, service/API, executor contract, and docs agree on the frozen workspace contract.

## Remaining Tasks

- [ ] None within SW-2.1A scope.

## Deviations From Design

- None on control-plane boundary. Implementation kept git/worktree execution outside DevHub.
- Collision handling still persists a `conflicted` fallback row when insert-time unique locks reject a second reservation; acceptable for SW-2.1A, but SW-2.2/SW-3.1 should enrich downstream evidence/history rather than reopening ownership rules.

## Issues / Risks

- Existing unrelated dirty tree remains broad; only targeted files for SW-2.1A were touched.
- Root Jest runs still emit pre-existing haste collision warnings from unrelated nested package.json files, but targeted suites pass.
- Route implementation currently uses `process.cwd()` and local DB intent rows as a narrow bridge; future SW-2.2/SW-3.1 should replace placeholder repo/evidence assumptions with executor-supplied durable correlation.
- Documentation still references some pre-freeze roadmap language in older historical docs outside this change set; they remain intentionally untouched here.

## TDD Cycle Evidence

| Task | Test File                                                                                                            | Layer            | Safety Net                                                  | RED                                                                          | GREEN                                                                                                                 | TRIANGULATE                                                                              | REFACTOR                                                                         |
| ---- | -------------------------------------------------------------------------------------------------------------------- | ---------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 1.1  | `src/lib/db/localDb.test.js`                                                                                         | Unit             | ✅ 2/2 passing baseline                                     | ✅ Added failing schema/lock/immutability assertions first                   | ✅ `npm test -- src/lib/db/localDb.test.js` passed 7/7                                                                | ✅ covered baseline, dirty-excluded, collisions, ready-guard, terminal immutability      | ✅ extracted workspace row helpers and tightened null override handling          |
| 1.2  | `src/lib/db/localDb.test.js`                                                                                         | Unit             | ✅ 2/2 passing baseline                                     | ✅ schema tests written first                                                | ✅ same targeted suite passed after schema/index/trigger implementation                                               | ✅ multiple lock and invariant paths exercised                                           | ✅ consolidated status sets/constants in runtime schema                          |
| 2.1  | `devhub-mcp/tests/integration/agent-workspaces-lifecycle.test.js`                                                    | Integration      | ✅ 31/31 passing baseline in existing MCP integration batch | ✅ new lifecycle tests written before server changes                         | ✅ `npm test -- tests/integration/tools-list.test.js tests/integration/agent-workspaces-lifecycle.test.js` passed 5/5 | ✅ create, ready, active, pause, orphan, cleanup, collision, drift, immutability         | ✅ factored workspace helpers in MCP server                                      |
| 2.2  | `devhub-mcp/tests/integration/agent-workspaces-lifecycle.test.js`, `devhub-mcp/tests/integration/tools-list.test.js` | Integration      | ✅ same MCP baseline                                        | ✅ failing tool catalog + lifecycle expectations first                       | ✅ targeted MCP batch passed after adding tools/handlers                                                              | ✅ tool listing plus lifecycle contract paths                                            | ✅ helper functions centralize validation/update/collision logic                 |
| 2.3  | `src/app/api/agent/execute/route.test.js`, `src/app/api/agent/qa-result/route.test.js`                               | Unit             | N/A (new route tests)                                       | ✅ tests asserted no git side effects before route edits                     | ✅ `npm test -- src/app/api/agent/execute/route.test.js src/app/api/agent/qa-result/route.test.js` passed 4/4         | ✅ approve/reject/checkpoint paths plus missing task edge case                           | ✅ extracted workspace intent builder; QA route now writes lifecycle intent only |
| 3.1  | `devhub-mcp/tests/integration/agent-workspaces-lifecycle.test.js`                                                    | Integration      | ✅ same MCP baseline                                        | ✅ drift/collision assertions added first                                    | ✅ targeted MCP batch passed                                                                                          | ✅ explicit collision payloads, drift conflict, last_error, recovery_reason              | ✅ reused shared collision/drift helpers                                         |
| 3.2  | `devhub-mcp/tests/integration/agent-workspaces-lifecycle.test.js`, `docs/04_Protocolo_MCP_y_Agentes.md`              | Integration/Docs | ✅ same MCP baseline                                        | ✅ contract expectations encoded in integration tests first                  | ✅ MCP batch remained green after docs/handler alignment                                                              | ✅ docs now match tool catalog and boundary wording                                      | ➖ minimal doc refactor only                                                     |
| 3.3  | `src/lib/agentRegistryLive.test.js`                                                                                  | Unit             | ✅ 2/2 passing baseline                                     | ✅ workspace_id precedence tests added first                                 | ✅ `npm test -- src/lib/agentRegistryLive.test.js` passed 4/4                                                         | ✅ workspace_id and task fallback both covered                                           | ✅ simplified observer lookup precedence                                         |
| 4.1  | `devhub-mcp/tests/integration/agent-workspaces-lifecycle.test.js`                                                    | Integration      | ✅ 4/4 passing workspace baseline                           | ✅ added failing path/id collision and history-preservation assertions first | ✅ `npm test -- tests/integration/agent-workspaces-lifecycle.test.js` passed 5/5                                      | ✅ branch/path/id collisions, orphan retention, cleanup_pending terminal history covered | ✅ added explicit `collision_reason` helper instead of leaking git details       |
| 4.2  | `tests/unit/docs-swarm-alignment.test.js`, `tests/unit/git-versioning-policy-doc.test.js`                            | Unit/Docs        | ✅ 10/10 passing docs baseline                              | ✅ freeze semantics assertions added before doc edits                        | ✅ docs test batch passed 12/12                                                                                       | ✅ baseline, dirty-excluded, cleanup intent, dependency freeze covered                   | ✅ limited edits to targeted docs only                                           |
| 5.1  | `tests/unit/docs-swarm-alignment.test.js`                                                                            | Unit/Docs        | ✅ same docs baseline                                       | ✅ AgentHub/orchestration/schema expectations written first                  | ✅ docs batch stayed green                                                                                            | ✅ runtime-to-workspace mapping and observer-only mirror wording covered                 | ➖ no extra refactor beyond wording alignment                                    |
| 5.2  | `tests/unit/docs-swarm-alignment.test.js`, `tests/unit/git-versioning-policy-doc.test.js`                            | Unit/Docs        | ✅ same docs baseline                                       | ✅ dependency handoff assertions added first                                 | ✅ docs batch stayed green                                                                                            | ✅ SW-2.2 blocked / SW-3.1 evidence_ref handoff covered                                  | ➖ doc-only freeze update                                                        |

## Test Summary

- Total tests written/expanded across both batches: 30+
- Total targeted tests passing at completion: 52
- Layers used: Unit, Integration
- Approval tests: None — behavior changed intentionally toward control-plane-only contract
- Pure functions created/extracted: workspace intent builder plus MCP workspace validation/update helpers
- Pure functions created/extracted: workspace intent builder plus MCP workspace validation/update/collision helpers

## Tests Run

1. Safety net
   - `npm test -- src/lib/db/localDb.test.js` ✅
   - `npm test -- src/lib/agentRegistryLive.test.js` ✅
   - `npm test -- tests/integration/tools-list.test.js tests/integration/projects.test.js tests/integration/tasks.test.js tests/integration/milestones-dashboard.test.js` (workdir `devhub-mcp`) ✅
2. TDD cycles
   - `npm test -- src/lib/db/localDb.test.js` ✅
   - `npm test -- tests/integration/tools-list.test.js tests/integration/agent-workspaces-lifecycle.test.js` (workdir `devhub-mcp`) ✅
   - `npm test -- src/app/api/agent/execute/route.test.js src/app/api/agent/qa-result/route.test.js` ✅
   - `npm test -- src/lib/agentRegistryLive.test.js` ✅
3. Final targeted verification
   - `npm test -- src/app/api/agent/execute/route.test.js src/app/api/agent/qa-result/route.test.js src/lib/agentRegistryLive.test.js src/lib/db/localDb.test.js` ✅
   - `npm test -- tests/integration/tools-list.test.js tests/integration/agent-workspaces-lifecycle.test.js tests/integration/projects.test.js tests/integration/tasks.test.js tests/integration/milestones-dashboard.test.js` (workdir `devhub-mcp`) ✅
4. Continuation batch
   - `npm test -- tests/integration/agent-workspaces-lifecycle.test.js` (workdir `devhub-mcp`) ✅
   - `npm test -- tests/unit/docs-swarm-alignment.test.js tests/unit/git-versioning-policy-doc.test.js` ✅
