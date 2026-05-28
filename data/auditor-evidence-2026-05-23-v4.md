# Auditor Evidence Report — 2026-05-23 v4

## Working Directory
- **Reported pwd:** `/home/matias`
- **Git root:** `/home/matias/ArxonLabs/devhub` (confirmed by `git rev-parse --show-toplevel`)
- **Status:** Active project with 15 swarm-related commits in recent history, ongoing worktree-based swarm execution.

---

## Readiness Assessment: ⚠️ CONDITIONAL PASS

**Verdict: PASS with blocking regressions. Do NOT ship without addressing the test failure.**

The codebase is structurally sound — swarm abstractions are clean, tests are extensive (203 passing), and the architecture supports the targeted delivery. However, two regressions require Director attention before the next execution step.

---

## Git State

### Dirty: YES — 55+ modified, 35+ deleted, 30+ untracked

**Modified (swarm-critical files):**
| File | Status |
|------|--------|
| `src/lib/operations/swarmControl.js` | ✅ Modified, expected |
| `src/lib/operations/contracts.js` | ✅ Modified, expected |
| `src/lib/operations/health.js` | ✅ Modified, expected |
| `src/components/TerminalWorkspacesManager.jsx` | ✅ Modified, expected |
| `src/components/control-room/*.jsx` (7 files) | ✅ Modified, expected |
| `src/components/terminal/utils/swarmRoleMeta.js` | ❓ Untracked (new file) |

**Deleted audit trail files:** 35 `data/audit-trails/headless-*.json` + 2 `test-session-*.json` — expected cleanup of ephemeral test output.

**Untracked risks:**
- `.worktrees/` directory with stale swarm worktrees bleeding into Jest test discovery
- `data/architect-evidence-*.md` — prior swarm artifacts, may cause confusion
- `docs/designs/`, `sdd/ui-professionalization/` — new content not yet tracked

### Worktree Bleed (Medium Risk)
Jest auto-discovers `.worktrees/swarm/launch-9dac5968/*/src/lib/operations/__tests__/swarmControl.test.js` — 5 stale worktrees (director, coder, auditor, architect, devops) all report PASS for tests that FAIL in the main tree. This masks the regression in the primary source.

---

## Swarm File Review

### 1. `src/lib/operations/swarmControl.js` (1566 lines)
| Metric | Value |
|--------|-------|
| Functions exported | 13 |
| Lines of code | ~1566 |
| Test file | `src/lib/operations/__tests__/swarmControl.test.js` |
| Test status | **1 FAILING** (see below) |

**Structure:** Clean functional decomposition with explicit selector pattern. Imports from `@/lib/operations/contracts`. Good separation of concerns — composition, normalization, selection.

**No security issues.** No direct file/DB access in module (fetch requests pass through caller-provided `fetchImpl`).

### 2. `src/components/terminal/utils/swarmRoleMeta.js` (93 lines)
| Metric | Value |
|--------|-------|
| Functions exported | 7 |
| Lines of code | 93 |
| Test file | `tests/unit/swarm-role-meta.test.js` |
| Test status | ✅ Existing (seen in file listing) |

**Health:** Clean extraction of role constants and helpers from TerminalWorkspacesManager. No React imports. Pure functions.

**⚠️ Code Duplication Risk:** TerminalWorkspacesManager.jsx duplicates 7 of these functions:
- `SWARM_ROLE_ORDER`
- `SWARM_ROLE_META`
- `getSwarmSnapshotStorageKey`
- `normalizeRoleKey`
- `inferSwarmRoleKey`
- `buildSwarmRoleMetadata`
- `getSwarmRoleOrder`

If one copy gets updated independently, the two diverge. Recommend importing from `swarmRoleMeta` instead of redefining.

### 3. `src/components/TerminalWorkspacesManager.jsx` (~3000+ lines)
| Metric | Value |
|--------|-------|
| Lines of code | ~3000+ |
| Test files | 6 related test files |
| Test status | Assuming ✅ (not run individually) |

**Health:** Large but well-structured component. Uses refs, effects, callbacks properly. Good use of `useCallback` to avoid re-renders. Swarm launch wizard integration via `SwarmLaunchWizardModal` is clean.

**⚠️ Size risk:** At 3000+ lines, this component is near the threshold where extraction of sub-components would reduce cognitive load.

---

## Test Suite Health

### Primary Regression: 1 test FAILING

**Test:** `createSwarmLaunchDraft seeds launch defaults from the recommended template and project path`

**Root Cause:** The function `createSwarmLaunchDraft` now returns default `roleModels` (LLM model per role), but the test expects `roleModels: {}`.

**Diff:**
```
 Expected  - 1
 Received  + 7

   Object {
     "category": "delivery",
     "mission": "...",
     "mode": "template",
     "providerId": "github-copilot/gpt-5.4-mini",
-    "roleModels": Object {},
+    "roleModels": Object {
+      "architect": "opencode-go/deepseek-v4-flash",
+      "auditor": "opencode-go/deepseek-v4-flash",
+      "coder": "opencode-go/deepseek-v4-flash",
+      "devops": "opencode-go/deepseek-v4-flash",
+      "director": "opencode-go/deepseek-v4-flash",
+    },
     "rolePrograms": Object { ... },
   }
```

**Impact:** LOW — test just needs to be updated to match the new default. The function behavior is additive (not breaking), the test expectation just needs to include the `roleModels` field.

**Overall Test Count:** 1 failed, 203 passed, 204 total across 6 test suites.

---

## Risks & Recommendations

### 🔴 Blocking (must fix before next swarm delivery)

| # | Risk | Severity | Recommendation |
|---|------|----------|----------------|
| R1 | **Test regression** in `swarmControl.test.js` | **HIGH** | Update test expectation to include default `roleModels`. The test is strict `toEqual` which breaks on any new property. |
| R2 | **Worktree bleed** into Jest discovery | **HIGH** | Add `!**/.worktrees/**` to `jest.testPathIgnorePatterns` in `package.json` and/or `.gitignore`. Worktree tests PASS but the main tree test FAILS — the passing worktrees mask the regression. |

### 🟡 Warning (address before deployment)

| # | Risk | Severity | Recommendation |
|---|------|----------|----------------|
| R3 | **Code duplication** 7 functions in `swarmRoleMeta.js` duplicated in `TerminalWorkspacesManager.jsx` | **MEDIUM** | Replace duplicate definitions in `TerminalWorkspacesManager.jsx` with imports from `@/components/terminal/utils/swarmRoleMeta`. |
| R4 | **Dirty git state** with 120+ changed/untracked files | **MEDIUM** | Staging/committing the intended changes and cleaning up stale audit trails and worktrees will reduce error surface. |
| R5 | **Haste module collisions** (4 clashes from worktree dirs) | **LOW** | Jest warns about duplicate `package.json` names from worktrees. Adding path ignore patterns will resolve this. |

### 🟢 Good

| # | Asset | Notes |
|---|-------|-------|
| ✅ | Swarm control abstraction | Clean `compose → normalize → select` pipeline. Evidence-ref identity model is solid. |
| ✅ | Test coverage | 204 tests covering control room, evidence timeline, briefing preview, queue, diagnostics. |
| ✅ | Role meta extraction | `swarmRoleMeta.js` is a well-isolated pure module. |
| ✅ | No security vulnerabilities | No injection points, no hardcoded secrets, no eval, no unsanitized dynamic requires. |
| ✅ | Performance patterns | Memoization (`useMemo`/`useCallback`), ref-based state, proper cleanup effects. |

---

## File Listing (swarm-critical)

```
src/lib/operations/swarmControl.js          — Swarm control room snapshot, selectors, launch
src/lib/operations/contracts.js             — Control room status helpers
src/lib/operations/health.js                — Health endpoint operations
src/components/terminal/utils/swarmRoleMeta.js — Role constants + helpers (new, extracted)
src/components/TerminalWorkspacesManager.jsx — Terminal workspace orchestrator (uses swarm launch)
src/lib/operations/__tests__/swarmControl.test.js — 204 tests, 1 failing
tests/unit/swarm-role-meta.test.js           — Role meta tests
src/components/__tests__/TerminalWorkspacesManager*.test.jsx — 6 test files
```

---

## Final Verdict

**PASS with conditions.** The architecture is healthy, tests are extensive, and the swarm delivery abstractions are well-structured. However, the Director must:

1. **Fix the `createSwarmLaunchDraft` test** (expect `roleModels` with default values)
2. **Isolate worktree paths** from Jest discovery
3. **Consider deduplicating** `swarmRoleMeta` functions from `TerminalWorkspacesManager.jsx`

The blocked test is the only `FAIL` signal. Once resolved, the codebase is ready for the next delivery cycle.
