# Tasks: SW-7.1 MCP Control Center Verifiable

## Phase 1: Contract Anchors

- [x] 1.1 RED: Add `tests/unit/mcp-control-center.test.js` cases for durable-first snapshot assembly, authority/freshness/evidence fields, and degraded durable-read failures from `src/lib/mcp/control-center.js`.
- [x] 1.2 GREEN: Create `src/lib/mcp/control-center.js` and extend `src/lib/operations/contracts.js` with `McpControlCenterSnapshot`, probe, tool, and evidence shapes shared by UI/API consumers.
- [x] 1.3 REFACTOR: Extract durable evidence readers and unsafe-verb classification so SW-5.1/Telegram consume one read model without touching `devhub_agent_runs`.

## Phase 2: Doctor / List-Tools / Smoke Pipelines

- [x] 2.1 RED: Expand `tests/unit/mcp-control-center.test.js` for `doctor` probe classes, `list-tools` authority merging, `smoke` safe-read checks, missing live inventory, and optional GTK/VTE attach evidence.
- [x] 2.2 GREEN: Implement `doctor` serialization in `src/lib/mcp/control-center.js` using DevHub task/workspace/run/artifact/supervisor evidence plus bounded live probes.
- [x] 2.3 GREEN: Implement `list-tools` merging from `devhub-mcp/server.js`, live executor inventory, and configured fallback while marking Git/worktree/branch/merge/filesystem verbs non-control-plane.
- [x] 2.4 GREEN: Implement `smoke` in `src/lib/mcp/control-center.js` as read-only reachability/evidence verification with explicit degraded or unavailable results.

## Phase 3: Degraded / Freshness / Evidence UX

- [x] 3.1 RED: Add/extend component tests for `src/components/chat/MCPStatusPanel.jsx` to cover authority badges, freshness labels, degraded reasons, evidence refs, and hidden unsafe actions.
- [x] 3.2 GREEN: Update `src/components/chat/MCPStatusPanel.jsx` to render `doctor`, `list-tools`, and `smoke` views from the shared snapshot without inferring health from placeholders.
- [x] 3.3 GREEN: Update `src/lib/operations/health.js` and `src/app/api/agenthub/operations/health/route.js` so MCP summaries map from snapshot authority/evidence instead of `note` heuristics.

## Phase 4: Compatibility Debt Cleanup

- [x] 4.1 RED: Extend `tests/unit/mcp-status-contract.test.js` for legacy `/api/agenthub/mcp/status` compatibility plus new `doctor`/`list-tools`/`smoke` payload fields.
- [x] 4.2 GREEN: Refactor `src/app/api/agenthub/mcp/status/route.js` into a compatibility wrapper over `src/lib/mcp/control-center.js`, preserving `servers[]` until consumers migrate.
- [x] 4.3 REFACTOR: Remove inferred-only status branches and centralize configured fallback rules so legacy MCP/Telegram/UI materials stay audit inputs, not truth sources.

## Phase 5: Docs and Verification

- [ ] 5.1 RED: Add `tests/unit/operations-health.test.js` and `tests/e2e/mcp-control-center-parity.test.js` coverage for AgentHub/Control Room parity, degraded durable failures, and live-probe enrichment without truth override.
- [ ] 5.2 GREEN: Update `docs/review/MODULO-07-mcp-server.md`, `docs/review/MODULO-10-agentes-swarm.md`, and `docs/review/MODULO-06-telegram-bot.md` to document shared read-model semantics and safe smoke boundaries.
- [ ] 5.3 REFACTOR: Prune obsolete notes/comments around MCP health inference and confirm all downstream consumers reference the shared snapshot contract only.
