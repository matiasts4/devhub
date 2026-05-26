# Tasks: Plyrium Parity Consolidation

## Review Workload Forecast

| Field                   | Value                                     |
| ----------------------- | ----------------------------------------- |
| Estimated changed lines | 650-850                                   |
| 400-line budget risk    | High                                      |
| Chained PRs recommended | Yes                                       |
| Suggested split         | Unit 1 contract reset → Unit 2 doc parity |
| Delivery strategy       | single-pr                                 |
| Chain strategy          | pending                                   |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal                                     | Likely PR | Notes                                                                                     |
| ---- | ---------------------------------------- | --------- | ----------------------------------------------------------------------------------------- |
| 1    | Reset MCP contract to 36 supported tools | PR 1      | `server.js`, `tools-list.test.js`, delete Telegram MCP module/test; verification included |
| 2    | Sync README/parity docs to new baseline  | PR 2      | `README.md` + Plyrium/roadmap docs; depends on Unit 1 baseline                            |

## Phase 1: RED Contract Guard

- [x] 1.1 In `devhub-mcp/tests/integration/tools-list.test.js`, add failing assertions for “Catalog and docs match supported surface”: exact 36-tool list, no Telegram tools.
- [x] 1.2 Add failing coverage for “Conditional Telegram config does not change support policy” by running the catalog expectations with and without `TELEGRAM_BOT_TOKEN`.

## Phase 2: GREEN MCP Boundary Cleanup

- [x] 2.1 In `devhub-mcp/server.js`, remove `registerTelegramTools` import/call so `tools/list` stays env-invariant.
- [x] 2.2 Delete `devhub-mcp/tools/telegram.js`; keep runtime Telegram storage code such as `src/lib/db/telegram.js` untouched.
- [x] 2.3 Delete `devhub-mcp/tests/integration/telegram-external-adapter.test.js` and remove any MCP-contract references to Telegram helpers.
- [x] 2.4 Make the RED catalog tests pass, then refactor counts/comments only if supported non-Telegram tool names and signatures stay unchanged.

## Phase 3: Documentation Baseline Sync

- [x] 3.1 Update `devhub-mcp/README.md` to publish the 36-tool MCP contract, remove Telegram/ghost entries, and keep CLI workflow guidance executable.
- [x] 3.2 Update `docs/Plyrium/documentos.md` and `docs/Plyrium/comparacion_devhub.md` so shipped MCP/CLI parity is current baseline and Telegram is out of MCP scope.
- [x] 3.3 Update `docs/31_MCP_Decomposition_Plan.md`, `docs/33_CLI_Enhancement_Plan.md`, and `docs/34_Execution_Roadmap.md` to mark stale Telegram/CLI gaps historical and defer retrieval, DB split, manifest, and orchestration work.
- [x] 3.4 Reconcile remaining MCP contract-facing docs (`docs/04_Protocolo_MCP_y_Agentes.md`, `docs/user/05_AgentHub.md`, `devhub-mcp/AGENT-FLOW.md`, `devhub-mcp/AGENT-INSTRUCTIONS.md`) to the same 36-tool non-Telegram baseline.

## Phase 4: Verification and Commit Readiness

- [x] 4.1 Run focused verification: `cd devhub-mcp && npm test -- --runInBand tests/integration/tools-list.test.js` and `npm run mcp:smoke`.
- [x] 4.2 Review updated docs against spec scenarios: same current baseline, no already-shipped gaps, deferred backlog stays explicit.
- [ ] 4.3 Prepare local work-unit commit(s) with tests/docs included; if final diff stays above single-pr guard, stop for `size:exception` decision before apply.
