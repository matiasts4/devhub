# Verification Report — unified-motion-rollout (Re-verification after remediation)

**Change**: unified-motion-rollout  
**Version**: Phase A (Slices 1–3) + remediation  
**Mode**: Strict TDD  
**Verified**: 2026-07-02  
**Verifier**: sdd-verify sub-agent

---

## Completeness

| Metric           | Value                                                      |
| ---------------- | ---------------------------------------------------------- |
| Tasks total      | 17                                                         |
| Tasks complete   | 15                                                         |
| Tasks incomplete | 0                                                          |
| Tasks deferred   | 2 (TerminalStartupRestoreBanner, Phase B terminal/pizarra) |

All Phase A implementation tasks remain checked. `TerminalStartupRestoreBanner` and terminal/pizarra coordination are correctly deferred.

---

## Build & Tests Execution

**Build**: ✅ Passed

```text
npx next build
▲ Next.js 16.2.6 (Turbopack)
✓ Compiled successfully in 26.6s
Running TypeScript ...
Finished TypeScript in 264ms ...
✓ Generating static pages using 15 workers (55/55) in 345ms
```

**Tests**: ✅ 125 passed / 0 failed / 0 skipped (20 motion-related suites)

```text
npm test -- --testPathPattern="motion|Motion" --runInBand

Test Suites: 20 passed, 20 total
Tests:       125 passed, 125 total
Snapshots:   0 total
Time:        34.092 s
```

**Previously-failing item**: ✅ `ZedAmbientOverlay.toolType.test.jsx` now passes

```text
npm test -- --testPathPattern="ZedAmbientOverlay.toolType" --runInBand

PASS src/components/asistente/__tests__/ZedAmbientOverlay.toolType.test.jsx
  ZedAmbientOverlay — tool-type wiring (ZAA-4)
    √ terminal tool: data-tool="terminal" + zed-aura-pulse-terminal class
    √ browser tool: data-tool="browser" + zed-aura-pulse-browser class
    √ no tool: data-tool="null" and no per-tool pulse class
    √ executing phase: inner div exposes --accent-* CSS vars
    √ reduced motion: no per-tool pulse class even with a tool type
    √ z-index and pointer-events are preserved on the wrapper

Test Suites: 1 passed, 1 total
Tests:       6 passed, 6 total
```

**Coverage**: ➖ Not collected (Jest available; no threshold configured for this change).

---

### TDD Compliance

| Check                         | Result | Details                                                                                            |
| ----------------------------- | ------ | -------------------------------------------------------------------------------------------------- |
| TDD Evidence reported         | ✅     | Found in apply-progress (#77)                                                                      |
| All tasks have tests          | ✅     | 10/10 Phase A tasks with test files                                                                |
| RED confirmed (tests exist)   | ✅     | All listed test files exist                                                                        |
| GREEN confirmed (tests pass)  | ✅     | All 125 motion-related tests pass; remediation test passes                                         |
| Triangulation adequate        | ✅     | Multi-case tests for useRouteDirection (5), motion-tokens (3+), hostMotionMode (7), css-dedup (16) |
| Safety Net for modified files | ✅     | Baseline counts reported for modified files                                                        |

**TDD Compliance**: 6/6 checks passed

---

### Test Layer Distribution

| Layer                  | Tests   | Files  | Tools                        |
| ---------------------- | ------- | ------ | ---------------------------- |
| Unit                   | ~35     | 5      | Jest                         |
| Integration/Structural | ~90     | 15     | Jest + React Testing Library |
| E2E                    | 0       | 0      | Playwright not executed      |
| **Total**              | **125** | **20** | Jest                         |

---

### Changed File Coverage

➖ Coverage analysis skipped — no coverage command run.

---

### Assertion Quality

| File                                                                       | Line  | Assertion                         | Issue                                                         | Severity |
| -------------------------------------------------------------------------- | ----- | --------------------------------- | ------------------------------------------------------------- | -------- |
| `src/components/__tests__/TerminalTabsManager.motion.test.js`              | 19–33 | `expect(source).toMatch(...)`     | Structural/source assertion; verifies import and preset usage | WARNING  |
| `src/components/commandBar/__tests__/CommandBar.motion.test.jsx`           | 19–33 | `expect(source).toMatch(...)`     | Structural/source assertion                                   | WARNING  |
| `src/components/asistente/__tests__/ZedAmbientOverlay.motion.test.jsx`     | 19–33 | `expect(source).toMatch(...)`     | Structural/source assertion                                   | WARNING  |
| `src/components/asistente/__tests__/ZedActivityDrawer.motion.test.jsx`     | 19–33 | `expect(source).toMatch(...)`     | Structural/source assertion                                   | WARNING  |
| `src/components/dashboard/__tests__/SmartSuggestionsPanel.motion.test.jsx` | 19–33 | `expect(source).toMatch(...)`     | Structural/source assertion                                   | WARNING  |
| `src/__tests__/App.motion.slice2.test.jsx`                                 | 19–79 | `expect(app).toMatch(...)`        | Structural/source assertion                                   | WARNING  |
| `src/app/globals.css.__tests__/css-dedup.test.js`                          | 35–78 | `expect(globalsCss).toMatch(...)` | File-content assertion (appropriate for CSS dedup contract)   | —        |

**Assertion quality**: 0 CRITICAL, 6 WARNING. No tautologies, ghost loops, or mock-heavy tests detected.

---

### Quality Metrics

**Linter**: ➖ Not run on changed files only. Pre-existing JSX-transform warnings appear in test output.  
**Type Checker**: ✅ `npx next build` TypeScript step passed with no errors.

---

## Spec Compliance Matrix

Capability: **unified-motion-config-and-non-terminal-migration**

| Requirement                       | Scenario                                | Test                                                                                           | Result       |
| --------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------ |
| Motion mode preference in Ajustes | User changes motion mode                | `Ajustes.appearance.test.jsx > renders the motion mode section and persists changes`           | ✅ COMPLIANT |
| Motion mode preference in Ajustes | Default on first visit                  | `themes.test.js > getStoredMotionMode returns normal when nothing is stored`                   | ✅ COMPLIANT |
| MotionProvider global integration | Provider initializes from storage       | `MotionProvider.test.js > initializes from stored motion mode...`                              | ✅ COMPLIANT |
| MotionProvider global integration | MotionConfig reducedMotion mapping      | `MotionProvider.test.js > passes reducedMotion=user/always...`                                 | ✅ COMPLIANT |
| motion-tokens.js v2               | Preset consumption                      | `motion-tokens.test.js > TRANSITION.spring resolves to the real spring.toggle preset`          | ✅ COMPLIANT |
| motion-tokens.js v2               | Absorbed pizarra values                 | `motion-tokens.test.js > absorbed pizarra EASE_OUT/EASE_SOFT/SURFACE_DUR`                      | ✅ COMPLIANT |
| Non-terminal site migrations      | Sidebar transform motion                | `App.motion.slice2.test.jsx > sidebar wrapper uses translateX...`                              | ✅ COMPLIANT |
| Non-terminal site migrations      | Direction-aware route transitions       | `App.motion.slice2.test.jsx > wraps Outlet inside AnimatePresence mode="wait"`                 | ✅ COMPLIANT |
| Non-terminal site migrations      | Tab indicator preset                    | `TerminalTabsManager.motion.test.js > terminal body transition uses the toggle preset`         | ✅ COMPLIANT |
| Non-terminal site migrations      | ZedAmbientOverlay preset                | `ZedAmbientOverlay.motion.test.jsx > pill transition uses the toggle preset`                   | ✅ COMPLIANT |
| Non-terminal site migrations      | CommandBar preset                       | `CommandBar.motion.test.jsx > command palette transition uses the toggle preset`               | ✅ COMPLIANT |
| Non-terminal site migrations      | Drawer / panel presets                  | `ZedActivityDrawer.motion.test.jsx`, `SmartSuggestionsPanel.motion.test.jsx`                   | ✅ COMPLIANT |
| CSS keyframe deduplication        | No duplicate keyframes                  | `css-dedup.test.js`                                                                            | ✅ COMPLIANT |
| Reduced-motion compliance         | Reduced mode collapses to ≤50ms opacity | `motion-tokens.test.js > getTransition reduced mode`, runtime use in components                | ✅ COMPLIANT |
| Amplified-motion support          | Amplified route push                    | `motion-tokens.test.js > amplified mode returns amplified preset`, `App.js` routeDistance 44px | ✅ COMPLIANT |
| Motion demos                      | Demo reads global mode by default       | `MotionLab.test.js`                                                                            | ✅ COMPLIANT |
| Motion demos                      | Local override remains available        | `MotionLab.test.js`, `useDemoTransition.test.js`                                               | ✅ COMPLIANT |

Capability: **terminal-pizarra-motion-coordination**

| Requirement              | Scenario | Test | Result      |
| ------------------------ | -------- | ---- | ----------- |
| All Phase B requirements | —        | —    | ➖ DEFERRED |

**Compliance summary**: 17/17 Phase A scenarios compliant; Phase B deferred.

---

## Correctness (Static Evidence)

| Requirement                        | Status         | Notes                                                                                                                                                                             |
| ---------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Motion mode storage                | ✅ Implemented | `themes.js` exposes `MOTION_MODE_STORAGE_KEY`, `normalizeMotionMode`, `getStoredMotionMode`, `setStoredMotionMode`, `applyMotionModeToDocument`, `setMotionMode`                  |
| Global MotionModeContext           | ✅ Implemented | `MotionModeContext.js` exports `useMotionMode()` and provider                                                                                                                     |
| MotionProvider integration         | ✅ Implemented | Reads stored mode, drives `MotionConfig.reducedMotion`, listens for `devhub:motion-mode-change` + `storage` events                                                                |
| motion-tokens v2                   | ✅ Implemented | Imports `spring`/`amplified` from `motionPresets.js`; `TRANSITION.spring = spring.toggle.transition`; `SURFACE_DUR`, `EASE_OUT`, `EASE_SOFT`, `HOST_MOTION_MODES` exported        |
| surfaceMotion.js adapter           | ⚠️ Partial     | `motion-tokens.js` absorbed the values, but `surfaceMotion.js` still defines its own inline `DUR`, `EASE_OUT`, `EASE_SOFT` instead of re-exporting from tokens (design deviation) |
| Ajustes motion toggle              | ✅ Implemented | 3-way toggle in _Apariencia_ tab; persists via `setMotionMode`; dispatches change event                                                                                           |
| MotionLab global default           | ✅ Implemented | Initializes local mode from `useMotionMode()`; local toggle does not persist                                                                                                      |
| Sidebar transform                  | ✅ Implemented | `App.js` wraps `WorkspaceSidebar` in `motion.div` with `x` + `opacity` variants; width snaps instantly on parent                                                                  |
| Route transitions                  | ✅ Implemented | `AnimatePresence mode="wait"` around keyed `motion.div`; `useRouteDirection` hook; terminal container remains sibling                                                             |
| Component migrations               | ✅ Implemented | `TerminalTabsManager`, `CommandBar`, `ZedAmbientOverlay`, `ZedActivityDrawer`, `SmartSuggestionsPanel` all use `getTransition(intent, mode)`                                      |
| CSS deduplication                  | ✅ Implemented | Duplicate keyframes live only in `globals.css`; `index.css` imports `globals.css` and no longer defines them                                                                      |
| HostMotionMode contract            | ✅ Implemented | `hostMotionMode.js` exports `HOST_MOTION_MODES`, `getMotionConstraints`, `validateAnimationProps` with layout-prop detection                                                      |
| Reduced-motion collapse            | ✅ Implemented | `getTransition('reduced')` returns `TRANSITION.reduced` (50ms opacity-only); all migrated components use it                                                                       |
| Amplified support                  | ✅ Implemented | `getTransition('amplified')` selects `amplified` presets; route distance 44px vs 24px normal                                                                                      |
| Layout properties in changed files | ✅ Verified    | No `width`/`height`/`top`/`left` motion variants in any file modified by this rollout                                                                                             |
| Terminal/pizarra files             | ⚠️ Modified    | `TerminalTTY.jsx`, `TerminalTTY.test.js`, `workspaceAnimProps.js`, `workspaceAnimProps.test.js` show changes from parallel terminal work; no `src/lib/pizarra/` files modified    |

---

## Coherence (Design)

| Decision                                                   | Followed?  | Notes                                                                                                                  |
| ---------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------- |
| Storage pattern: extend `themes.js`                        | ✅ Yes     | All motion-mode helpers live in `src/lib/theme/themes.js`                                                              |
| Global motion context separate from local showcase context | ✅ Yes     | New `MotionModeContext.js` for global; MotionLab keeps local provider                                                  |
| MotionLab default reads global mode once                   | ✅ Yes     | `useEffect` syncs local state from `globalMode`                                                                        |
| MotionConfig.reducedMotion mapping                         | ✅ Yes     | `reduced` → `always`; `normal`/`amplified` → `user`                                                                    |
| Sidebar transform: translateX + opacity                    | ✅ Yes     | `App.js` animates `x`/`opacity`; width snaps on wrapper                                                                |
| Route transitions: AnimatePresence inside `<main>`         | ✅ Yes     | Terminal container is sibling, not wrapped                                                                             |
| Token v2 spring source: motionPresets.js                   | ✅ Yes     | `spring`/`amplified` imported and re-exported                                                                          |
| surfaceMotion.js as thin adapter                           | ⚠️ Partial | Design says adapter should import from tokens; file still hardcodes `DUR`/`EASE_OUT`/`EASE_SOFT`                       |
| HOST_MOTION_MODES contract                                 | ✅ Yes     | Defined in `motion-tokens.js` and validated in `hostMotionMode.js`                                                     |
| No layout-property animations in migrated files            | ✅ Yes     | Only `Sidebar.jsx`, `WorkspaceSidebar.jsx`, and deferred `TerminalStartupRestoreBanner.jsx` still animate layout props |

---

## Issues Found

### CRITICAL

None. The previous blocker (`ZedAmbientOverlay.toolType.test.jsx` stale `useReducedMotion` mock) is resolved.

### WARNING

1. **Terminal files modified by parallel work**  
   `git diff --name-only HEAD` shows `src/components/TerminalTTY.jsx`, `src/components/__tests__/TerminalTTY.test.js`, `src/components/terminal/workspaceAnimProps.js`, and `src/components/terminal/__tests__/workspaceAnimProps.test.js` as modified. No `src/lib/pizarra/` files are modified. These changes are GPU/visibility recovery work from the user's parallel terminal branch, not from the motion rollout remediation, but they are present in the working tree.  
   **Impact**: Does not affect motion rollout verification, but the Phase A boundary expected no terminal edits.

2. **`surfaceMotion.js` did not become a thin adapter**  
   Design decision: "Keep as a thin adapter that imports durations/easings from `motion-tokens.js` and re-exports them." The file still defines its own `DUR`, `EASE_OUT`, and `EASE_SOFT` inline. `motion-tokens.js` did absorb the values, so the spec requirement is partially met, but the fork is not retired.

3. **Structural/source-pattern tests dominate migration coverage**  
   `TerminalTabsManager.motion.test.js`, `CommandBar.motion.test.jsx`, `ZedAmbientOverlay.motion.test.jsx`, `ZedActivityDrawer.motion.test.jsx`, `SmartSuggestionsPanel.motion.test.jsx`, and `App.motion.slice2.test.jsx` assert source strings rather than runtime behavior. They verify the migration but couple tests to implementation details.

4. **`WorkspaceSidebar.jsx` and `Sidebar.jsx` still animate width/height**  
   These components are outside the Phase A migration scope (not listed in design file changes), but they animate layout properties. Users in `reduced` mode at the OS level are protected by the global `@media (prefers-reduced-motion: reduce)` rule; the app-level `reduced` mode does not override these pre-existing inline animations.

5. **`CommandBar.component.test.jsx` remains broken**  
   Fails with `Cannot find module '@testing-library/user-event'`. This is a pre-existing missing-dependency issue, not caused by the motion rollout. Verified by running the test and confirming the error originates from the import statement, not from motion code.

### SUGGESTION

6. Add an integration test that renders `Ajustes` → changes motion mode → asserts `MotionProvider` context updates and `MotionConfig.reducedMotion` changes, to reduce reliance on structural tests.

7. Consider a follow-up task to make `surfaceMotion.js` import `SURFACE_DUR`, `EASE_OUT`, `EASE_SOFT` from `motion-tokens.js` and re-export them, fully retiring the fork.

8. Coordinate the parallel terminal work before Phase B so the terminal/pizarra motion requirements can be verified against a stable terminal baseline.

---

## Verdict

**PASS**

The previously-blocking `ZedAmbientOverlay.toolType.test.jsx` regression is resolved: the test now mocks `useMotionMode()` from `MotionModeContext`, and all 6 tests pass. All 20 motion-related suites (125 tests) pass, `npx next build` passes, and no layout-property animations were introduced in the changed files. `CommandBar.component.test.jsx` still fails, but solely due to a missing `@testing-library/user-event` dependency unrelated to this change. The only residual concern is that parallel terminal work has modified terminal files in the same working tree; this does not affect Phase A motion verification but should be reconciled before Phase B.
