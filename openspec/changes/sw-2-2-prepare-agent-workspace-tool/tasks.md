# Tasks: SW-2.2 Prepare Agent Workspace Tool

## Phase 1: Contract and Persistence Anchors

- [ ] 1.1 RED: Add failing coverage in `src/lib/db/localDb.test.js` and `tests/agenthub/mcp/prepare-agent-workspace-contract.test.js` for identity validation, baseline default `f814998dd05cb491caf8637bf570dbd74b539090`, idempotent ack by `workspace_id + correlation_id`, durable-only fields, and opaque `evidence_ref`.
- [ ] 1.2 GREEN: Extend `src/lib/db/localDb.js` with preparation-lease helpers, latest outcome/error metadata, and SW-3.1 evidence linkage while keeping branch/head/path/dirty out of durable truth.
- [ ] 1.3 GREEN: Add `prepare_agent_workspace` request/ack schemas and handler wiring in `devhub-mcp/server.js`, pinned to SW-2.1 `02d82361449a09e93e5880a08e35e3043617002d` and SW-3.1 `4b1e344dcd202c911498af17236fcb86a2a2cb1e`.

## Phase 2: Executor Handshake and Evidence Reporting

- [ ] 2.1 RED: Add failing integration coverage in `devhub-mcp/tests/integration/prepare-agent-workspace-reporting.test.js` for ack-to-report flow, executor outcome acceptance, and unchanged `evidence_ref` pass-through.
- [ ] 2.2 GREEN: Implement outcome/report handlers in `devhub-mcp/server.js` for `ready|conflicted|failed|orphaned`, storing only lifecycle metadata plus latest opaque `evidence_ref`.
- [ ] 2.3 GREEN: Update `src/lib/agentRegistryLive.js` and `src/lib/agentRegistryLive.test.js` so `devhub_agent_runs` mirrors durable workspace/run projections only, never executor truth.

## Phase 3: Conflict, Orphaned, and Retry Semantics

- [ ] 3.1 RED: Extend `devhub-mcp/tests/integration/prepare-agent-workspace-reporting.test.js` for ownership collision, base drift, dirty-excluded divergence, duplicate correlation no-op, and retry with fresh evidence.
- [ ] 3.2 GREEN: Add reconciliation rules in `src/lib/db/localDb.js` and `devhub-mcp/server.js` for append-only evidence refs, `conflicted` / `orphaned` transitions, and executor-lost recovery metadata.

## Phase 4: Execute and QA Boundary Cleanup

- [ ] 4.1 RED: Add focused route coverage in `src/app/api/agent/execute/__tests__/route.test.js` and `src/app/api/agent/qa-result/__tests__/route.test.js` proving DevHub no longer performs checkout, merge, delete, or worktree side effects.
- [ ] 4.2 GREEN: Refactor `src/app/api/agent/execute/route.js` to request workspace preparation through the executor handshake and return task/run/workspace correlation only.
- [ ] 4.3 GREEN: Refactor `src/app/api/agent/qa-result/route.js` to accept QA outcomes plus executor evidence refs, leaving merge and cleanup to executor adapters and SW-3.1 audit rows.

## Phase 5: Verification, Docs, and Downstream Hooks

- [ ] 5.1 Add consumer verification in `src/views/telegramMonitorRealtime.js`, `tests/unit/telegram-monitor-realtime.test.js`, and `tests/agenthub/flows/mcp-toolchain.test.js` so downstream surfaces read workspace/run outcomes without git verbs.
- [ ] 5.2 Update `docs/03_Esquema_BaseDatos.md`, `docs/04_Protocolo_MCP_y_Agentes.md`, `docs/23_Swarm_Workspace_Intencion_y_Roadmap.md`, `docs/24_Politica_Git_y_Versionado_Agentes.md`, and `docs/user/05_AgentHub.md` with executor ownership, frozen checkpoints, auditable `evidence_ref`, and `dirty-excluded` expectations.
