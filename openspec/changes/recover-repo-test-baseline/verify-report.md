# Verification Report

**Change**: `recover-repo-test-baseline`
**Mode**: Strict TDD
**Test runner**: `npm test`

---

## Completeness

| Metric | Value |
|---|---:|
| Tasks total | 12 |
| Tasks checked | 12 |
| Tasks fully re-verified now | 11 |
| Tasks environment-blocked during re-verification | 1 |

Environment-blocked re-verification:
- **1.3 / 1.1-1.2 integration replay** — `tests/agenthub/api/config.test.js` currently fails with `TypeError: fetch failed` because no Next server is reachable on `http://localhost:3100` in this verify environment. `tests/agenthub/api/sessions.test.js` self-skips under the same condition.

---

## TDD Compliance

| Check | Result | Details |
|---|---|---|
| TDD evidence reported | ✅ | `sdd/recover-repo-test-baseline/apply-progress` includes TDD Cycle Evidence table |
| RED confirmed (tests exist) | ✅ | All referenced test files exist |
| GREEN reconfirmed | ⚠️ | 7 unit suites pass now; AgentHub integration replay is blocked by missing local server |
| Triangulation adequate | ✅ | Base URL, restored labels, URL normalization, CSS/sidebar, payload ID, tty path each have explicit scenario coverage |
| Safety net evidence present | ✅ | Apply-progress documents prior baseline/targeted re-runs |
| Assertion quality | ✅ | No tautologies, ghost loops, or smoke-only assertions found in change-scoped tests |

---

## Test Layer Distribution

| Layer | Files | Tests | Status |
|---|---:|---:|---|
| Unit | 7 | 51 | ✅ Passing now |
| Integration | 2 | 23 | ⚠️ `config.test.js` blocked by missing local server; `sessions.test.js` self-skips when server absent |
| E2E | 0 | 0 | ➖ Not used for this change |

---

## Commands Executed

1. `npm test -- --runTestsByPath tests/agenthub/api/harness.test.js tests/agenthub/api/config.test.js tests/agenthub/api/sessions.test.js src/components/__tests__/TerminalTabsManager.test.js tests/unit/right-dock-state.test.js src/components/__tests__/cssTokens.test.js src/components/__tests__/Sidebar.test.js src/lib/projectClassification.test.js src/lib/terminal/ttyServer.test.js`
   - Result: **8 passed suites, 1 failed suite**
   - Failure: `tests/agenthub/api/config.test.js` → `TypeError: fetch failed` at `http://localhost:3100`

2. `npm test -- --runTestsByPath tests/agenthub/api/harness.test.js src/components/__tests__/TerminalTabsManager.test.js tests/unit/right-dock-state.test.js src/components/__tests__/cssTokens.test.js src/components/__tests__/Sidebar.test.js src/lib/projectClassification.test.js src/lib/terminal/ttyServer.test.js`
   - Result: **7/7 suites passed, 51/51 tests passed**

3. `npm test`
   - Result: **repo-wide gate still FAILING**
   - Residual observed crash: `ReferenceError: window is not defined` from `react-dom/client` during full-suite execution, matching the documented out-of-scope residual cluster.

---

## Spec Compliance Matrix

| Requirement | Scenario | Test Evidence | Result |
|---|---|---|---|
| AgentHub API canonical base URL | Default runtime port is used | `tests/agenthub/api/harness.test.js` → `defaults to the canonical AgentHub runtime port when env is unset` | ✅ COMPLIANT |
| AgentHub API canonical base URL | Explicit override wins | `tests/agenthub/api/harness.test.js` → `uses AGENTHUB_BASE_URL override unchanged when provided` | ✅ COMPLIANT |
| Restored terminal tab labels | Restored named tab | `src/components/__tests__/TerminalTabsManager.test.js` → `prefixes label with ↺ when tab.restored is true and tab has a name` | ✅ COMPLIANT |
| Restored terminal tab labels | Fresh unnamed tab | `src/components/__tests__/TerminalTabsManager.test.js` → `returns normal label when restored is undefined` + `returns "Terminal N" (1-indexed) when name is empty` | ✅ COMPLIANT |
| Right dock URL normalization | Malformed explicit host is rejected | `tests/unit/right-dock-state.test.js` → `normalizeBrowserUrl rejects malformed explicit URLs instead of searching for them` | ✅ COMPLIANT |
| Right dock URL normalization | Free text becomes a search URL | `tests/unit/right-dock-state.test.js` → `normalizeBrowserUrl turns free-text terms into a web search` | ✅ COMPLIANT |
| Right dock URL normalization | Local development host remains navigable | `tests/unit/right-dock-state.test.js` → `normalizeBrowserUrl keeps valid single-label local hosts navigable` | ✅ COMPLIANT |
| Canonical product contracts | CSS and sidebar assertions follow current theme contracts | `src/components/__tests__/cssTokens.test.js`, `src/components/__tests__/Sidebar.test.js` | ✅ COMPLIANT |
| Canonical product contracts | Runtime-generated IDs remain valid in project payload tests | `src/lib/projectClassification.test.js` → `builds a project creation payload with classification fields` | ✅ COMPLIANT |
| Canonical product contracts | TTY server command path stays repo-resolved | `src/lib/terminal/ttyServer.test.js` → `resolves devhub-mcp/server.js relative to this file, not a hardcoded home path` | ✅ COMPLIANT |

**Compliance summary**: **10/10 scenarios compliant** for change scope.

---

## Correctness (Static Structural Evidence)

| Requirement | Status | Notes |
|---|---|---|
| AgentHub API canonical base URL | ✅ Implemented | `tests/agenthub/api/harness.js` centralizes `getAgentHubBaseUrl()` with default `http://localhost:3100`; AgentHub suites import it |
| Restored terminal tab labels | ✅ Implemented | `src/components/TerminalTabsManager.jsx` exports `getRestoredTabLabel()` as alias of `getTabLabel()` |
| Right dock URL normalization | ✅ Implemented | `shouldTreatAsSearchQuery()` and `normalizeBrowserUrl()` preserve search fallback while rejecting malformed explicit URLs |
| Canonical product contracts | ✅ Implemented | CSS/sidebar/project classification/tty path tests align to current source-of-truth contracts |

---

## Coherence (Design)

| Decision | Followed? | Notes |
|---|---|---|
| Centralize AgentHub API port contract on `3100` | ✅ | Implemented in shared harness and consumed by suites/flow verifier |
| Preserve helper compatibility via alias export | ✅ | `getRestoredTabLabel()` delegates to `getTabLabel()` |
| Keep rightDock runtime behavior, fix stale expectation drift only when proven | ✅ | Runtime normalization precedence fix is minimal and matches spec |
| Prefer test/runtime updates over broad product rewrites | ✅ | Phase 3 mostly verified existing contracts rather than changing product behavior |

---

## Issues Found

**CRITICAL**
- Repo-wide `npm test` is still red. Full-suite execution crashes with `ReferenceError: window is not defined` from `react-dom/client`, matching residual out-of-scope suite `tests/unit/operational-feedback-components.test.jsx`.

**WARNING**
- Current verify environment does not have a reachable Next server on `http://localhost:3100`, so `tests/agenthub/api/config.test.js` cannot be re-proven end-to-end here.
- `tests/agenthub/api/sessions.test.js` passes by early return when the server is unreachable, so it does not provide runtime proof in this verify run.

**SUGGESTION**
- If archive must be unblocked immediately, land this change only after a separate follow-up fixes the `operational-feedback-components` DOM/runtime issue or isolates that suite behind the correct Jest environment.

---

## Verdict

**FAIL**

Change-scope requirements are behaviorally compliant, but archive should remain blocked because the repo-wide `npm test` baseline gate is still red and one integration replay (`config.test.js`) could not be re-validated in the current verify environment.
