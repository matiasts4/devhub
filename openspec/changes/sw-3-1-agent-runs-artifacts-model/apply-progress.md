# Apply Progress: SW-3.1 Agent Runs and Artifacts Model

## Mode

- Strict TDD
- Artifact store: hybrid
- Scope implemented in this pass: SW-3.1A persistence + evidence writers + durable MCP read surface + downstream audit consumers

## Completed Tasks

- [x] 1.1 RED: Added `tests/unit/local-db-agent-runs.test.js`
- [x] 1.2 GREEN: Implemented durable `agent_runs` + append-only `agent_artifacts` in `src/lib/db/localDb.js`
- [x] 1.3 Defined shared helpers in `src/lib/db/agentRunArtifacts.js`
- [x] 2.1 RED: Extended execute route coverage for durable run/evidence creation
- [x] 2.2 GREEN: Execute route now creates `agent_runs` + startup artifact, no git verbs
- [x] 2.3 RED: Extended QA route coverage for approval/retry/block durable outcome recording
- [x] 2.4 GREEN: QA route now closes runs and appends QA artifacts
- [x] 2.5 Added MCP durable read/write surface for runs/artifacts in `devhub-mcp/server.js`
- [x] 3.1 Updated `src/lib/agentRegistryLive.js` + tests so live UI derives outcome/status hints from durable run/artifact projections while keeping `devhub_agent_runs` observer-only
- [x] 3.2 Updated Telegram realtime/status helpers + tests to summarize durable run headers and artifact evidence links instead of runtime-local truth
- [x] 3.3 Added downstream read adapters via MCP tools: `get_agent_run`, `list_agent_runs`, `list_agent_artifacts`, `get_workspace_evidence`
- [x] 4.1 Added execute/qa integration coverage with ordered durable artifact assertions and no git artifact leakage
- [x] 4.2 Updated docs/OpenSpec rollout notes to pin SW-3.1 as audit model and keep SW-2.2 next for `prepare_agent_workspace` evidence emission

## Remaining Tasks

- None for SW-3.1A remaining scope

## TDD Cycle Evidence

| Task | Test File                                                                                                                                                                    | Layer       | Safety Net                                             | RED                                                     | GREEN                                                       | TRIANGULATE                                                 | REFACTOR                                                         |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------ | ------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------- |
| 1.1  | `tests/unit/local-db-agent-runs.test.js`                                                                                                                                     | Unit        | ✅ `src/lib/db/localDb.test.js` 11/11                  | ✅ new failing persistence tests added first            | ✅ `tests/unit/local-db-agent-runs.test.js` 3/3             | ✅ immutable header + append-only + lineage/evidence cases  | ✅ extracted helper module `agentRunArtifacts.js`                |
| 1.2  | `tests/unit/local-db-agent-runs.test.js`                                                                                                                                     | Unit        | ✅ `src/lib/db/localDb.test.js` 11/11                  | ✅ same RED batch                                       | ✅ root focused regression 31/31                            | ✅ seq ordering + terminal update + rewrite guard           | ✅ added reusable DB helpers instead of route-local SQL          |
| 1.3  | `tests/unit/local-db-agent-runs.test.js`                                                                                                                                     | Unit        | N/A (new helper file)                                  | ✅ helper expectations written first                    | ✅ root focused regression 31/31                            | ✅ legacy opaque + structured ref paths                     | ✅ validation/normalization isolated in helper module            |
| 2.1  | `src/app/api/agent/execute/route.test.js`                                                                                                                                    | Unit        | ✅ old execute route tests 2/2                         | ✅ run/artifact assertions added first                  | ✅ route test 2/2                                           | ✅ success + missing task paths                             | ➖ none needed                                                   |
| 2.2  | `src/app/api/agent/execute/route.test.js`                                                                                                                                    | Unit        | ✅ old execute route tests 2/2                         | ✅ same RED batch                                       | ✅ root focused regression 31/31                            | ✅ durable run + startup artifact output verified           | ✅ route keeps executor boundary minimal                         |
| 2.3  | `src/app/api/agent/qa-result/route.test.js`                                                                                                                                  | Unit        | ✅ old QA route tests 2/2                              | ✅ approval/retry/block assertions added first          | ✅ route test 3/3                                           | ✅ approved + rejected + blocked branches                   | ✅ helper extraction inside route                                |
| 2.4  | `src/app/api/agent/qa-result/route.test.js`                                                                                                                                  | Unit        | ✅ old QA route tests 2/2                              | ✅ same RED batch                                       | ✅ root focused regression 31/31                            | ✅ terminal reason classes differentiated                   | ✅ no merge/delete side effects introduced                       |
| 2.5  | `devhub-mcp/tests/integration/agent-runs-artifacts.test.js`, `devhub-mcp/tests/integration/tools-list.test.js`                                                               | Integration | ✅ MCP suites: reporting 4/4, lifecycle 6/6, tools 1/1 | ✅ new MCP tool assertions added first                  | ✅ MCP focused regression 13/13                             | ✅ create/read/append/complete/list evidence flows          | ✅ reused server helper layer for SQLite/Supabase split          |
| 3.1  | `src/lib/agentRegistryLive.test.js`                                                                                                                                          | Unit        | ✅ focused registry baseline 5/5                       | ✅ durable projection assertions written first          | ✅ focused suite 11/11                                      | ✅ terminal/completed/blocked projection paths covered      | ✅ extracted observer-run resolver + durable status helpers      |
| 3.2  | `tests/unit/telegram-monitor-realtime.test.js`, `tests/unit/telegram-status-api.test.js`                                                                                     | Unit        | ✅ focused telegram baseline 6/6 + status API 4/4      | ✅ durable audit summary assertions written first       | ✅ focused suites 7/7 + 5/5                                 | ✅ run_status, artifact refs, fallback workspace evidence   | ✅ telegram status route now projects latest durable audit rows  |
| 3.3  | `devhub-mcp/tests/integration/agent-runs-artifacts.test.js`                                                                                                                  | Integration | ✅ MCP lifecycle/reporting baseline                    | ✅ downstream read assertions added first               | ✅ MCP focused regression 13/13                             | ✅ workspace evidence + chronology consumers covered        | ➖ none needed                                                   |
| 4.1  | `tests/integration/agent-run-audit-routes.test.js`                                                                                                                           | Integration | ✅ execute + QA route baselines 5/5                    | ✅ end-to-end ordered artifact assertions written first | ✅ integration suite 2/2                                    | ✅ approved + blocked chronologies with seq/evidence checks | ✅ local fixture DB gained table ops shim instead of route mocks |
| 4.2  | `docs/23_Swarm_Workspace_Intencion_y_Roadmap.md`, `docs/24_Politica_Git_y_Versionado_Agentes.md`, `openspec/changes/sw-3-1-agent-runs-artifacts-model/design.md`, `tasks.md` | Docs/Spec   | ✅ existing rollout notes reviewed                     | ✅ doc expectations updated first via task checklist    | ✅ focused regression suite 30/30 + MCP 3/3 after docs sync | ➖ docs-only                                                | ✅ rollout notes now pin durable audit model + SW-2.2 dependency |

## Tests Run

- `npm test -- --runTestsByPath "src/app/api/agent/execute/route.test.js"`
- `npm test -- --runTestsByPath "src/app/api/agent/qa-result/route.test.js"`
- `npm test -- --runTestsByPath "src/lib/agentRegistryLive.test.js"`
- `npm test -- --runTestsByPath "src/lib/db/localDb.test.js"`
- `npm test -- --runTestsByPath "tests/unit/telegram-monitor-realtime.test.js"`
- `npm test -- --runTestsByPath "tests/unit/local-db-agent-runs.test.js"`
- `npm test -- --runTestsByPath "src/lib/db/localDb.test.js" "tests/unit/local-db-agent-runs.test.js" "src/app/api/agent/execute/route.test.js" "src/app/api/agent/qa-result/route.test.js" "src/lib/agentRegistryLive.test.js" "tests/unit/telegram-monitor-realtime.test.js"`
- `npm test -- --runTestsByPath "tests/integration/prepare-agent-workspace-reporting.test.js"` (in `devhub-mcp/`)
- `npm test -- --runTestsByPath "tests/integration/agent-workspaces-lifecycle.test.js"` (in `devhub-mcp/`)
- `npm test -- --runTestsByPath "tests/integration/agent-runs-artifacts.test.js"` (in `devhub-mcp/`)
- `npm test -- --runTestsByPath "tests/integration/tools-list.test.js"` (in `devhub-mcp/`)
- `npm test -- --runTestsByPath "tests/integration/prepare-agent-workspace-reporting.test.js" "tests/integration/agent-workspaces-lifecycle.test.js" "tests/integration/agent-runs-artifacts.test.js" "tests/integration/tools-list.test.js"` (in `devhub-mcp/`)
- `npm test -- --runTestsByPath "src/lib/agentRegistryLive.test.js"`
- `npm test -- --runTestsByPath "tests/unit/telegram-monitor-realtime.test.js"`
- `npm test -- --runTestsByPath "tests/unit/telegram-status-api.test.js"`
- `npm test -- --runTestsByPath "tests/integration/agent-run-audit-routes.test.js"`
- `npm test -- --runTestsByPath "src/lib/agentRegistryLive.test.js" "tests/unit/telegram-monitor-realtime.test.js" "tests/unit/telegram-status-api.test.js" "tests/integration/agent-run-audit-routes.test.js" "src/app/api/agent/execute/route.test.js" "src/app/api/agent/qa-result/route.test.js"`
- `npm test -- --runTestsByPath "tests/integration/agent-runs-artifacts.test.js" "tests/integration/tools-list.test.js"` (in `devhub-mcp/`)

## Risks

- Supabase path for new MCP tools is implemented but not exercised in this pass; current verification is SQLite-first.
- UI consumers still rely on observer-local `devhub_agent_runs` for panel/session hints/panel IDs; durable audit truth now drives outcome summaries, but panel/session transport remains local-storage-based.
- Execute/QA routes currently create/close runs per route invocation without recovery-group orchestration yet; retry lineage is supported at persistence level but not fully wired by route flow.
- Telegram status currently projects the latest durable run/workspace globally, not per-chat/per-agent partition; good enough for current monitor, but richer downstream scoping still belongs to future consumer work.

## Touched Files

- `src/lib/db/agentRunArtifacts.js`
- `src/lib/db/localDb.js`
- `src/app/api/agent/execute/route.js`
- `src/app/api/agent/execute/route.test.js`
- `src/app/api/agent/qa-result/route.js`
- `src/app/api/agent/qa-result/route.test.js`
- `lib/test-schema.js`
- `tests/unit/local-db-agent-runs.test.js`
- `devhub-mcp/server.js`
- `devhub-mcp/tests/integration/agent-runs-artifacts.test.js`
- `devhub-mcp/tests/integration/tools-list.test.js`
- `src/lib/agentRegistryLive.js`
- `src/lib/agentRegistryLive.test.js`
- `src/views/telegramMonitorRealtime.js`
- `src/app/api/telegram/status/route.js`
- `tests/unit/telegram-monitor-realtime.test.js`
- `tests/unit/telegram-status-api.test.js`
- `tests/integration/agent-run-audit-routes.test.js`
- `docs/23_Swarm_Workspace_Intencion_y_Roadmap.md`
- `docs/24_Politica_Git_y_Versionado_Agentes.md`
- `openspec/changes/sw-3-1-agent-runs-artifacts-model/design.md`
- `openspec/changes/sw-3-1-agent-runs-artifacts-model/tasks.md`
- `openspec/changes/sw-3-1-agent-runs-artifacts-model/apply-progress.md`

## Notes

- `devhub_agent_runs` was left observer-only.
- `observed_dirty='dirty-excluded'` stays preserved verbatim.
- No git/worktree/merge filesystem verbs were introduced into the MCP surface.
- Downstream summaries now prefer durable `run_status`/artifact projections; runtime mirrors still only provide panel/session identity hints.
