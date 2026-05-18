# Tasks: SW-3.1 Agent Runs and Artifacts Model

## Phase 1: Persistence Contracts

- [ ] 1.1 RED: Add `tests/unit/local-db-agent-runs.test.js` for immutable `agent_runs` headers, append-only `agent_artifacts`, `(run_id, seq)` ordering, lineage links, and legacy `evidence_ref` acceptance.
- [ ] 1.2 GREEN: Extend `src/lib/db/localDb.js` with `agent_runs` / `agent_artifacts` tables, indexes, table ops, and write guards that allow terminal metadata updates but block provenance rewrites.
- [ ] 1.3 Define shared contract helpers in `src/lib/db/localDb.js` or adjacent module for artifact kind/phase/producer validation, supersession rules, and workspace `evidence_ref` locator semantics.

## Phase 2: Reporting Adapters and Evidence Writers

- [ ] 2.1 RED: Add `src/app/api/agent/execute/__tests__/route.test.js` covering run creation, task/agent assignment, executor-intent response payloads, and rejection of control-plane git side effects.
- [ ] 2.2 GREEN: Refactor `src/app/api/agent/execute/route.js` to create run headers, append startup evidence references, and stop calling `git checkout -b`; branch/worktree actions stay executor-owned evidence.
- [ ] 2.3 RED: Add `src/app/api/agent/qa-result/__tests__/route.test.js` for approval/retry/block flows, durable QA outcome recording, and no direct merge/delete behavior.
- [ ] 2.4 GREEN: Refactor `src/app/api/agent/qa-result/route.js` to close runs with terminal outcome + QA artifacts, release agent/task state safely, and treat merge/cleanup as executor-produced evidence only.
- [ ] 2.5 Add MCP/reporting read-write surface in `devhub-mcp/server.js` for run headers, ordered artifacts, and workspace evidence locators without exposing Git verbs or worktree ownership.

## Phase 3: Downstream Consumers

- [ ] 3.1 Update `src/lib/agentRegistryLive.js` and `src/lib/agentRegistryLive.test.js` so UI mirrors derive status from durable run/artifact projections while `devhub_agent_runs` remains observer-only.
- [ ] 3.2 Update `src/views/telegramMonitorRealtime.js` plus focused Telegram tests to summarize run headers and artifact links from the new audit model instead of runtime-local truth.
- [ ] 3.3 Add consumer read adapters/selectors for Supervisor Loop / Control Room surfaces in `devhub-mcp/server.js` so chronology, attachments, and retry lineage read from `agent_runs` + `agent_artifacts`.

## Phase 4: Verification and Documentation Anchors

- [ ] 4.1 Add integration coverage for workspace evidence emission, QA outcome persistence, and execute/qa boundary cleanup using local DB fixtures and ordered artifact assertions.
- [ ] 4.2 Update `docs/23_Swarm_Workspace_Intencion_y_Roadmap.md`, `docs/24_Politica_Git_y_Versionado_Agentes.md`, and relevant OpenSpec notes to pin SW-3.1 as the audit model and keep SW-2.2 next for `prepare_agent_workspace` evidence emission.
