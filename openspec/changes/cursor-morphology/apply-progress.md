# Apply Progress: cursor-morphology — Slice A + Slice B

**Change**: cursor-morphology  
**Mode**: Strict TDD  
**PR**: 2 of 5 (stacked-to-main)  
**Date**: 2026-06-14

## Completed Tasks

- [x] 1.1 Register `CURSOR` morphology in `src/lib/theme/themes.js`
- [x] 1.2 Add cursor CSS token block to `src/app/globals.css`
- [x] 1.3 Wire cursor selector in `src/app/settings/appearance/page.jsx`
- [x] 1.4 Wire cursor selector in legacy `src/views/Ajustes.jsx`
- [x] 1.5 Test cursor registry and tokens
- [x] 2.1 Create `SettingsLayoutRouter` wrapper
- [x] 2.2 Mount settings routes and redirect legacy `/ajustes`
- [x] 2.3 Update sidebar settings link
- [x] 2.4 Update profile account link
- [x] 2.5 Test settings routing

## Files Changed

| File                                                  | Action   | What Was Done                                                                                |
| ----------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------- |
| `src/lib/theme/themes.js`                             | Modified | Added `CURSOR: 'cursor'` to `MORPHOLOGIES` and a `"Cursor"` entry to `MORPHOLOGY_OPTIONS`.   |
| `src/app/globals.css`                                 | Modified | Added `[data-morphology='cursor']` token block after existing morphology blocks.             |
| `src/lib/theme/__tests__/themes.test.js`              | Modified | Added registry, token block, and baseline-preservation tests.                                |
| `src/app/settings/appearance/__tests__/page.test.jsx` | Modified | Updated mock to include cursor and terminal-header fixtures; added cursor option click test. |
| `src/views/__tests__/Ajustes.appearance.test.jsx`     | Modified | Updated mock to include cursor; added cursor option click test.                              |

## TDD Cycle Evidence

| Task | Test File                                             | Layer       | Safety Net                   | RED                                      | GREEN                      | TRIANGULATE                            | REFACTOR |
| ---- | ----------------------------------------------------- | ----------- | ---------------------------- | ---------------------------------------- | -------------------------- | -------------------------------------- | -------- |
| 1.1  | `src/lib/theme/__tests__/themes.test.js`              | Unit        | 25/25 passing                | Written (CURSOR normalize + options)     | Passed                     | Skipped — structural constant          | Clean    |
| 1.2  | `src/lib/theme/__tests__/themes.test.js`              | Unit        | 25/25 passing                | Written (cursor CSS block + values)      | Passed                     | 3 cases (values, variables, baselines) | Clean    |
| 1.3  | `src/app/settings/appearance/__tests__/page.test.jsx` | Integration | 0/11 passing (mock outdated) | Written (cursor option renders + clicks) | Passed after updating mock | 2 cases (render + click)               | Clean    |
| 1.4  | `src/views/__tests__/Ajustes.appearance.test.jsx`     | Integration | 1/1 passing                  | Written (cursor option renders + clicks) | Passed after updating mock | 2 cases (render + click)               | Clean    |
| 1.5  | `src/lib/theme/__tests__/themes.test.js`              | Unit        | N/A (new tests)              | Covered by 1.1 + 1.2 tests               | Passed                     | Multiple cases per behavior            | Clean    |

### Test Summary

- **Total tests written**: 14 (6 in `themes.test.js`, 7 new/updated in `page.test.jsx`, 1 new in `Ajustes.appearance.test.jsx`)
- **Total tests passing**: 42 across 3 test suites
- **Layers used**: Unit (28), Integration (14)
- **Approval tests**: None — no refactoring tasks
- **Pure functions created**: 0 (declarative CSS + registry entries)

### Safety Net Note

The `page.test.jsx` safety net was 0/11 passing before this slice because the existing mock did not include `TERMINAL_HEADER_STYLES` and related helpers that `page.jsx` now consumes. I updated the mock as part of the test setup so the cursor wiring could be verified. This is test-fixture maintenance, not a production-code change.

## Deviations from Design

None — implementation matches `design.md`. The cursor token block uses the exact values from the design document.

## Issues Found

1. **Pre-existing `page.test.jsx` mock drift**: The existing mock for `@/lib/theme/themes` was missing `TERMINAL_HEADER_STYLES`, `getTerminalHeaderStyleOptions`, `getStoredTerminalHeaderStyle`, `setTerminalHeaderStyle`, `getStoredTerminalAccentBarVisible`, and `setStoredTerminalAccentBarVisible`. This caused all `page.test.jsx` tests to crash before this slice. I restored the mock to match the current `page.jsx` interface.
2. **Git stash recovery**: My initial changes to `themes.js`, `globals.css`, and `themes.test.js` were temporarily lost when a `git stash pop` aborted due to an unrelated pre-existing change in `src/components/TerminalTTY.jsx`. I recovered the files with `git checkout stash@{0} -- <files>` and dropped the stash.

## Slice B — Settings route canonicalization

### Files Changed

| File                                                              | Action   | What Was Done                                                                                                                  |
| ----------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `src/components/settings/SettingsLayoutRouter.jsx`                | Added    | Built a `react-router`-compatible wrapper mirroring `src/app/settings/layout.jsx` using `Link`/`useLocation`.                  |
| `src/App.js`                                                      | Modified | Mounted `/project/:projectId/settings/*` routes and redirected legacy `/project/:projectId/ajustes` to `/settings/appearance`. |
| `src/components/WorkspaceSidebar.jsx`                             | Modified | Pointed the "Ajustes" link to `/project/:id/settings/appearance` and kept it active on `/settings` sub-routes.                 |
| `src/components/UserProfile.jsx`                                  | Modified | Used `useParams` to build `/project/:projectId/settings/account` and fall back to `/settings/account`.                         |
| `src/components/__tests__/UserProfile.routes.test.jsx`            | Added    | New test verifying the profile dropdown navigates to project-scoped account settings.                                          |
| `src/components/__tests__/WorkspaceSidebar.routes.test.jsx`       | Added    | Tests sidebar settings link navigation and active-state coverage.                                                              |
| `src/components/settings/__tests__/SettingsLayoutRouter.test.jsx` | Added    | Tests the token-aware settings layout wrapper.                                                                                 |
| `src/__tests__/App.routes.test.jsx`                               | Added    | Tests canonical settings routes and legacy `/ajustes` redirect.                                                                |

### TDD Cycle Evidence

| Task | Test File                                                         | Layer       | Safety Net | RED                                   | GREEN                           | TRIANGULATE                                  | REFACTOR |
| ---- | ----------------------------------------------------------------- | ----------- | ---------- | ------------------------------------- | ------------------------------- | -------------------------------------------- | -------- |
| 2.1  | `src/components/settings/__tests__/SettingsLayoutRouter.test.jsx` | Integration | 0 passing  | Written (layout renders + nav links)  | Passed after wrapper added      | 4 cases (render, active, link hrefs, outlet) | Clean    |
| 2.2  | `src/__tests__/App.routes.test.jsx`                               | Integration | 0 passing  | Written (routes + redirect)           | Passed after route mount        | 3 cases (appearance, account, redirect)      | Clean    |
| 2.3  | `src/components/__tests__/WorkspaceSidebar.routes.test.jsx`       | Integration | 0 passing  | Written (link href + active state)    | Passed after link update        | 2 cases (href, active)                       | Clean    |
| 2.4  | `src/components/__tests__/UserProfile.routes.test.jsx`            | Integration | 0 passing  | Written (dropdown → account settings) | Passed after `useParams` wiring | 1 case (project-scoped navigation)           | Clean    |
| 2.5  | All routing test files above                                      | Integration | N/A        | Covered by 2.1–2.4 tests              | 13/13 passing                   | Multiple cases per route/link                | Clean    |

### Test Summary

- **Total tests written**: 13 (1 in UserProfile.routes.test.jsx, 4 in App.routes.test.jsx, 3 in WorkspaceSidebar.routes.test.jsx, 5 in SettingsLayoutRouter.test.jsx)
- **Total tests passing**: 13/13 across 4 routing test suites
- **Layers used**: Integration (13)
- **Approval tests**: None
- **Pure functions created**: 0

### Deviations from Design

None — implementation matches `design.md`. The canonical settings routes sit under the existing `HashRouter` without Next.js layout conflicts.

### Issues Found

No new issues. Pre-existing unrelated working-tree changes in terminal files were left untouched per constraints.

## Remaining Tasks

- [ ] 3.1 Fetch backend provider list
- [ ] 3.2 Create `ProviderCard` component
- [ ] 3.3 Refactor `LLMProviderSettings` to use metadata map
- [ ] 3.4 Update `llmProviderConfig` helper
- [ ] 3.5 Test backend-driven LLM UI
- [ ] 4.1 Write project-local `devhub-morphology` skill
- [ ] 4.2 Install skill globally
- [ ] 4.3 Verify skill discoverability
- [ ] 5.1 Add E2E smoke spec
- [ ] 5.2 Visual regression check for existing morphologies

## Workload / PR Boundary

- **Mode**: stacked-to-main
- **Current work unit**: Slice B — canonical HashRouter settings routes and nav links
- **Boundary**: This PR builds on Slice A and ends after task 2.5. It does not touch LLM registry (Slice C), the morphology skill (Slice D), or E2E verification (Slice E).
- **Estimated review budget impact**: ~250 changed lines in Slice B (well under the 800-line slice budget and the 400-line single-commit guideline).

## Status

10/10 Phase 1 + Phase 2 tasks complete. Slice B is ready for verify or the next PR in the stack.
