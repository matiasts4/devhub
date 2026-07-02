# Archive Report — unified-motion-rollout (Phase A)

**Change**: unified-motion-rollout  
**Phase**: A (Foundation + UI, Migrations, CSS + Contract + Verification)  
**Status**: ✅ Archived with Phase B deferred  
**Archived**: 2026-07-02  
**Artifact store**: Hybrid (OpenSpec + Engram)  
**OpenSpec change folder**: Retained at `openspec/changes/unified-motion-rollout/` (Phase B deferred; not moved to archive).

---

## Executive Summary

Phase A propagated the approved `motion-lab-showcase` motion pattern across the non-terminal surfaces of the DevHub web app. It added a persistent motion-mode preference (`reduced | normal | amplified`) in Ajustes, wired it through a global `MotionProvider`, upgraded `motion-tokens.js` to v2, migrated non-terminal inline springs to preset-based motion, replaced the sidebar width animation with a transform-based motion, added direction-aware route transitions, and deduplicated CSS keyframes. All Phase A implementation tasks are complete and verified; Phase B terminal/pizarra coordination is deferred until the user's parallel terminal work lands.

---

## What Was Built

### 1. Foundation

- Motion-mode storage helpers in `src/lib/theme/themes.js` (`MOTION_MODE_STORAGE_KEY`, `normalizeMotionMode`, `getStoredMotionMode`, `setStoredMotionMode`, `applyMotionModeToDocument`, `setMotionMode`).
- Global `src/components/ui/motion/MotionModeContext.js` exporting `useMotionMode()`.
- Updated `src/components/ui/motion/MotionProvider.jsx` to read the stored mode, drive `MotionConfig.reducedMotion`, and provide the mode via context.

### 2. Preference UI

- 3-way motion-mode control added to `src/views/Ajustes.jsx` in the _Apariencia_ tab.
- `src/views/MotionLab.jsx` initializes its local mode from the global context while keeping a non-persistent local toggle.

### 3. Core Migrations

- `src/App.js`: sidebar wrapper uses `translateX` + opacity; route outlet wrapped in `AnimatePresence` with direction-aware variants; terminal container remains a sibling.
- `src/hooks/useRouteDirection.js`: new hook for forward/back route direction.
- `src/components/TerminalTabsManager.jsx`: active tab indicator uses `spring.toggle`.
- `src/components/asistente/ZedAmbientOverlay.jsx`: ambient loop uses preset instead of inline `360/30/0.7`.
- `src/components/commandBar/CommandBar.jsx`: command palette uses `spring.toggle` instead of inline `500/30`.
- `src/components/asistente/ZedActivityDrawer.jsx`: expand/collapse uses `spring.open`.
- `src/components/dashboard/SmartSuggestionsPanel.jsx`: entrance uses `spring.open`.

### 4. CSS + Contract

- Duplicate `@keyframes` removed from `src/index.css`; single source now lives in `src/app/globals.css`.
- `motion-tokens.js` v2 imports `spring`/`amplified` from `motionPresets.js`, aliases `TRANSITION.spring` to `spring.toggle.transition`, absorbs pizarra forked values, and exports `HOST_MOTION_MODES`.

---

## Final State

| Metric                                                  | Value                                                        |
| ------------------------------------------------------- | ------------------------------------------------------------ |
| Phase A implementation tasks                            | 15 / 15 complete                                             |
| Phase A deferred tasks                                  | 2 (`TerminalStartupRestoreBanner`, Phase B terminal/pizarra) |
| Tests passing                                           | 125 / 125                                                    |
| Test suites passing                                     | 20 / 20                                                      |
| Build                                                   | ✅ Passed (`npx next build`)                                 |
| CRITICAL issues                                         | 0                                                            |
| Layout-property animations in changed files             | 0                                                            |
| Inline hardcoded springs in migrated non-terminal sites | 0                                                            |

### Verification

- **Build**: `npx next build` passed (Next.js 16.2.6 / Turbopack, 55/55 static pages).
- **Tests**: `npm test -- --testPathPattern="motion|Motion" --runInBand` → 125 passed, 0 failed, 0 skipped.
- **Remediated test**: `ZedAmbientOverlay.toolType.test.jsx` now mocks `useMotionMode()` and passes (6/6).
- **TDD compliance**: 6/6 checks passed.

### Known Warnings (Non-blocking)

1. `surfaceMotion.js` still defines its own `DUR`, `EASE_OUT`, and `EASE_SOFT` inline instead of re-exporting from `motion-tokens.js`. The values have been absorbed into tokens, but the fork is not fully retired.
2. Several migration tests assert source strings rather than runtime behavior.
3. `CommandBar.component.test.jsx` remains broken due to a missing `@testing-library/user-event` dependency unrelated to this change.
4. `WorkspaceSidebar.jsx` and `Sidebar.jsx` still animate layout properties, but they are outside Phase A scope.

---

## Approved Decisions

1. Motion mode is now user-configurable in Ajustes (`reduced` / `normal` / `amplified`) and persists to `localStorage` under `devhub:motion-mode`.
2. `MotionProvider` globally applies the motion mode via `MotionConfig` + `MotionModeContext`.
3. `motion-tokens.js` v2: `TRANSITION.spring` references `spring.toggle.transition` (no longer dead); pizarra forked values absorbed.
4. Sidebar migrated from width animation to transform (`translateX` + opacity).
5. Route transitions added (`AnimatePresence` + direction-aware variants).
6. All non-terminal inline hardcoded springs migrated to `getTransition(intent, mode)`.
7. CSS keyframes deduplicated (single source in `globals.css`).
8. `HostMotionMode` contract established (`TRANSFORM_SAFE` vs `OPACITY_ONLY`).
9. `amplified` mode is user-selectable but the default remains `normal`.
10. Phase B is deferred until the user's parallel terminal work lands.

---

## Deferred Items (Phase B)

Phase B covers terminal and pizarra motion coordination. It MUST begin only after the user's parallel terminal work is stable.

| Item                                                     | Description                                                                                                     | Blocking Dependency                                     |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Retire `forceTerminalViewportRepaint`                    | Replace ~20 calls in `TerminalTTY.jsx` with a `layout-settled` event contract.                                  | User's parallel terminal work                           |
| Merge `surfaceMotion.js` fork into `motion-tokens.js` v2 | Make `surfaceMotion.js` a thin adapter that re-exports from tokens; enforce opacity-only for terminal surfaces. | User's parallel terminal work                           |
| Adopt presets in `workspaceAnimProps.js`                 | Replace ad-hoc transitions with approved spring presets.                                                        | User's parallel terminal work                           |
| Formalize `SharedTerminalSurface` warm-cache contract    | Define load, hit, and invalidation semantics.                                                                   | User's parallel terminal work                           |
| Tab reorder spring                                       | Replace hardcoded transition in `TerminalWorkspacesManager.jsx` lines 4804–4861 with `spring.drag`.             | User's parallel terminal work                           |
| `TerminalStartupRestoreBanner` migration                 | Migrate entrance/exit to `spring.open`.                                                                         | User's parallel terminal work / terminal file stability |
| Native IPC opacity-only contract                         | Enforce `HOST_MOTION_MODES.OPACITY_ONLY` for every React subtree hosting VTE / WebKitGTK.                       | User's parallel terminal work                           |

The deferred requirements remain documented in:

- `openspec/changes/unified-motion-rollout/specs/terminal-pizarra-motion-coordination/spec.md`
- Engram observation #74 (combined spec) under the `terminal-pizarra-motion-coordination` capability.

---

## Artifacts

### OpenSpec

| Artifact             | Path                                                                                                     | State                            |
| -------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Proposal             | `openspec/changes/unified-motion-rollout/proposal.md`                                                    | Retained                         |
| Phase A spec (delta) | `openspec/changes/unified-motion-rollout/specs/unified-motion-config-and-non-terminal-migration/spec.md` | Retained                         |
| Phase B spec (delta) | `openspec/changes/unified-motion-rollout/specs/terminal-pizarra-motion-coordination/spec.md`             | Retained (deferred)              |
| Design               | `openspec/changes/unified-motion-rollout/design.md`                                                      | Retained                         |
| Tasks                | `openspec/changes/unified-motion-rollout/tasks.md`                                                       | Retained (Phase A tasks checked) |
| Verify report        | `openspec/changes/unified-motion-rollout/verify-report.md`                                               | Retained                         |
| Archive report       | `openspec/changes/unified-motion-rollout/archive-report.md`                                              | ✅ Created                       |
| Main spec (new)      | `openspec/specs/unified-motion-config-and-non-terminal-migration/spec.md`                                | ✅ Created                       |
| Main spec (updated)  | `openspec/specs/motion-lab-showcase/spec.md`                                                             | ✅ Updated                       |

### Engram (Observation IDs)

| Artifact       | Observation ID | Topic                                       |
| -------------- | -------------- | ------------------------------------------- |
| Proposal       | #73            | `sdd/unified-motion-rollout/proposal`       |
| Spec           | #74            | `sdd/unified-motion-rollout/spec`           |
| Design         | #75            | `sdd/unified-motion-rollout/design`         |
| Tasks          | #76            | `sdd/unified-motion-rollout/tasks`          |
| Apply progress | #77            | `sdd/unified-motion-rollout/apply-progress` |
| Verify report  | #79            | `sdd/unified-motion-rollout/verify-report`  |
| Archive report | (this save)    | `sdd/unified-motion-rollout/archive-report` |

---

## Spec Sync Details

| Domain                                             | Action   | Details                                                                                                                                                     |
| -------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `unified-motion-config-and-non-terminal-migration` | Created  | 9 requirements added (8 new + 1 modified import from motion-lab-showcase context), 15 scenarios                                                             |
| `motion-lab-showcase`                              | Updated  | Requirement "Motion demos" modified: added global-mode initialization + local override preservation; 2 new scenarios added, 11 existing scenarios preserved |
| `terminal-pizarra-motion-coordination`             | Deferred | Delta spec retained in change folder; not synced to main specs until Phase B                                                                                |

---

## Notes

- The OpenSpec change folder was intentionally **not** moved to `openspec/changes/archive/` because Phase B is deferred and the folder must remain accessible for the next phase.
- No commits were made per session preflight.
- All Phase A implementation tasks in `tasks.md` are checked; the only unchecked items are Phase B deferred work.
- The verification report contains 0 CRITICAL issues.

---

## SDD Cycle State

**Phase A**: Plan → Spec → Design → Tasks → Apply → Verify → Archive ✅ COMPLETE  
**Phase B**: Pending user terminal work → Re-plan/spec if needed → Apply → Verify → Archive ⏸️ DEFERRED
