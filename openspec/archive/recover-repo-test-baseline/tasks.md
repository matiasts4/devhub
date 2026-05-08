# Tasks: Recover Repo-wide Test Baseline

## Phase 1: AgentHub harness cluster

- [x] 1.1 RED — Update `tests/agenthub/api/config.test.js`, `tests/agenthub/api/sessions.test.js`, and related failing API suites to lock the current AgentHub base URL/env contract to port `3100` and expose any remaining `3000` fallback assumptions.
- [x] 1.2 GREEN — Change `tests/agenthub/api/harness.js` default base URL/docs to `AGENTHUB_BASE_URL || http://localhost:3100` without altering request/timeout semantics.
- [x] 1.3 VERIFY — Run the affected `tests/agenthub/api/*.test.js` suites and confirm fetch failures no longer come from stale harness defaults.

## Phase 2: Helper export + right-dock normalization cluster

- [x] 2.1 RED — Refresh `src/components/__tests__/TerminalTabsManager.test.js` and `tests/unit/right-dock-state.test.js` to codify the current restored-tab labeling/export contract and malformed-host normalization/search behavior.
- [x] 2.2 GREEN — Add the smallest compatibility-safe fix in `src/components/TerminalTabsManager.jsx` and, only if runtime mismatch is proven, `src/components/workspace/rightDockState.js` so tests match shipped behavior instead of stale assumptions.
- [x] 2.3 REFACTOR — Remove duplicate/stale expectations in those test files while preserving the existing pure helper API surface for tab labels and right-dock state.

## Phase 3: Theme/runtime/path stale-assumption cluster

- [x] 3.1 RED — Update `src/components/__tests__/cssTokens.test.js` and `src/components/__tests__/Sidebar.test.js` to assert current token/class contracts (`--accent-primary`, `var(...)` classes, collapsed width) instead of legacy amber-string assumptions.
- [x] 3.2 RED — Update `src/lib/projectClassification.test.js` and `src/lib/terminal/ttyServer.test.js` to expose the real runtime contract for `crypto.randomUUID()` availability and project-relative `DEVHUB_MCP_CMD` path resolution.
- [x] 3.3 GREEN — Apply the least invasive fix in `src/lib/projectClassification.js`, `src/lib/terminal/ttyServer.js`, and test setup only where the failing runtime contract is truly mismatched.
- [x] 3.4 VERIFY — Run the four targeted suites above and confirm no new regressions in `src/components/sidebarUtils.js` or terminal session restore behavior.

## Phase 4: Repo baseline verification

- [x] 4.1 VERIFY — Run `npm test` after Phases 1–3 pass and capture any residual failures by suite so baseline recovery scope stays explicit.
- [x] 4.2 CLEANUP — Update `openspec/changes/recover-repo-test-baseline/tasks.md` checkboxes during apply and leave notes only for out-of-scope residual reds, if any.

## Residual Out-of-Scope Reds

- `tests/unit/operational-feedback-components.test.jsx` still crashes during the full-suite run with `ReferenceError: window is not defined` from `react-dom/client` under the repo's Jest `node` environment.
