# Apply Progress: SW-7.1 MCP Control Center Verifiable

## Mode

Strict TDD

## Completed Tasks

- [x] 1.1 RED: Added `tests/unit/mcp-control-center.test.js` for durable-first assembly, degraded durable failure, live/configured inventory authority, and unsafe verb classification.
- [x] 1.2 GREEN: Created `src/lib/mcp/control-center.js` and extended `src/lib/operations/contracts.js` with MCP snapshot/evidence/probe/tool factories.
- [x] 1.3 REFACTOR: Centralized durable evidence reads, tool catalog extraction, and unsafe verb classification in one read model without touching `devhub_agent_runs`.
- [x] 2.1 RED: Expanded MCP control center unit tests to cover doctor probe classes, list-tools authority merging, smoke reachability, missing live inventory, and attach unavailable semantics.
- [x] 2.2 GREEN: Implemented doctor serialization from durable workspace/run/artifact/supervisor evidence plus bounded live probe overlays.
- [x] 2.3 GREEN: Implemented list-tools merging from `devhub-mcp/server.js`, live inventory, and configured fallback while keeping filesystem/git/worktree out of safe control-plane actions.
- [x] 2.4 GREEN: Implemented smoke as read-only verification of durable joins, bounded connectivity, and optional attach evidence.
- [x] 3.1 RED: Extended `tests/unit/MCPStatusPanel.test.jsx` for authority/freshness/evidence rendering and hidden unsafe actions.
- [x] 3.2 GREEN: Updated `src/components/chat/MCPStatusPanel.jsx` to render `doctor`, `list-tools`, and `smoke` views from the shared snapshot.
- [x] 3.3 GREEN: Updated `src/lib/operations/health.js` consumers so MCP health summaries derive from snapshot semantics instead of `note` heuristics.
- [x] 4.1 RED: Extended `tests/unit/mcp-status-contract.test.js` for compatibility payload plus `doctor`/`list-tools`/`smoke` fields.
- [x] 4.2 GREEN: Refactored `/api/agenthub/mcp/status` into a compatibility wrapper over the shared control-center assembler.
- [x] 4.3 REFACTOR: Removed inferred-only route branching and centralized configured fallback rules in the shared read model.

## Files Changed

| File | Action | Notes |
| --- | --- | --- |
| `src/lib/mcp/control-center.js` | Created | Durable-first assembler, bounded live probe overlay, tool safety classification, legacy server grouping |
| `src/lib/operations/contracts.js` | Modified | Added MCP snapshot/probe/tool/evidence normalizers |
| `src/app/api/agenthub/mcp/status/route.js` | Modified | Compatibility wrapper now returns shared snapshot output |
| `src/lib/operations/health.js` | Modified | MCP health source now reads control-center snapshot semantics |
| `src/lib/operations/presenters.js` | Modified | Added durable/live/configured and freshness labels |
| `src/components/chat/MCPStatusPanel.jsx` | Modified | Renders doctor/list-tools/smoke sections with evidence markers |
| `src/views/AgentHub.jsx` | Modified | Refresh now targets `/api/agenthub/mcp/status` |
| `tests/unit/mcp-control-center.test.js` | Created | Core unit coverage for snapshot assembly |
| `tests/unit/mcp-status-contract.test.js` | Modified | Compatibility route coverage for new contract |
| `tests/unit/operations-health.test.js` | Modified | Health mapping coverage for MCP snapshot |
| `tests/unit/MCPStatusPanel.test.jsx` | Modified | Behavioral rendering coverage for control center view |
| `openspec/changes/sw-7-1-mcp-control-center-verifiable/tasks.md` | Modified | Marked completed apply tasks |

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1.1-2.4 | `tests/unit/mcp-control-center.test.js` | Unit | Blocked — workspace lacks local `node_modules`; used shared repo Jest runtime after confirming frozen worktree HEAD | ✅ Wrote failing tests against missing `src/lib/mcp/control-center.js` | ✅ Focused Jest path passed | ✅ 4 cases (durable healthy, durable unavailable, live inventory, unsafe verbs) | ✅ Extracted readers/classifiers into shared module |
| 3.1-3.2 | `tests/unit/MCPStatusPanel.test.jsx` | Unit | Same runtime constraint as above | ✅ Tightened panel test first | ✅ Focused Jest path passed | ✅ Snapshot view plus unsafe-action hiding | ✅ Added small presentational helpers without changing behavior |
| 3.3 | `tests/unit/operations-health.test.js`, `tests/agenthub/api/operations-health.test.js` | Unit + Integration | Same runtime constraint as above | ✅ Tightened health mapper expectations first | ✅ Focused Jest paths passed | ✅ Legacy payload vs control-center payload paths covered | ➖ Minimal refactor only |
| 4.1-4.3 | `tests/unit/mcp-status-contract.test.js` | Unit | Same runtime constraint as above | ✅ Compatibility tests written first | ✅ Focused Jest path passed | ✅ Fallback plus live inventory cases | ✅ Route reduced to wrapper |

## Test Summary

- Total tests written/tightened: 13 focused assertions across 5 suites
- Total tests passing: 13
- Layers used: Unit, Integration
- Approval tests: None — this batch was feature work, not behavior-preserving refactor of opaque code
- Pure/shared functions created: `classifyMcpToolSafety`, `readDurableToolCatalog`, `readDurableDiagnosticContext`, snapshot factory helpers

## Deviations from Design

- Did **not** touch `tests/agenthub/api/mcp-status.test.js` because it requires a running Next server and the dedicated worktree has no local dependency install. Contract parity stayed covered through focused unit/integration route tests instead.
- Did **not** implement Phase 5 docs/e2e tasks due explicit scope limits and parallel-conflict avoidance with SW-5.1/SW-6.1.

## Issues Found

- Dedicated worktree lacks `node_modules`, so `npm test` fails out of the box. Focused Jest runs succeeded by pointing `NODE_PATH` and Jest binary to the shared repo dependencies while keeping code changes isolated to the dedicated worktree.
- `MCPStatusPanel` server-render test emits a React outdated JSX transform warning from existing toolchain config; warning is pre-existing and non-blocking.

## Remaining Tasks

- [ ] 5.1 RED: Add `tests/unit/operations-health.test.js` and `tests/e2e/mcp-control-center-parity.test.js` coverage for AgentHub/Control Room parity, degraded durable failures, and live-probe enrichment without truth override.
- [ ] 5.2 GREEN: Update canonical docs only if orchestrator decides the doc touch is worth the parallel-conflict risk.
- [ ] 5.3 REFACTOR: Prune remaining MCP health inference notes/comments in broader downstream consumers after SW-5.1/SW-6.1 merge window is safe.

## Status

13/16 apply tasks complete for this scoped batch. Ready for small follow-up focused on Phase 5 parity/docs if orchestrator wants it.
