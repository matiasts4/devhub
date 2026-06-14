# Apply Progress: cursor-morphology — Slice A + Slice B + Slice C + Slice D + Slice E

**Change**: cursor-morphology  
**Mode**: Strict TDD  
**PR**: 5 of 5 (stacked-to-main)  
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
- [x] 3.1 Fetch backend provider list
- [x] 3.2 Create `ProviderCard` component
- [x] 3.3 Refactor `LLMProviderSettings` to use metadata map
- [x] 3.4 Update `llmProviderConfig` helper schema hints
- [x] 3.5 Test backend-driven LLM UI
- [x] 4.1 Write project-local `devhub-morphology` skill
- [x] 4.2 Install skill globally
- [x] 4.3 Verify skill discoverability
- [x] 5.1 Add E2E smoke spec
- [x] 5.2 Visual regression check for existing morphologies

## Files Changed — Slice E

| File                                       | Action   | What Was Done                                                                                                                                                        |
| ------------------------------------------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/e2e/09_settings_morphology.spec.ts` | Created  | Playwright E2E smoke spec verifying canonical settings route reachability, legacy `/ajustes` redirect, existing morphology baseline tokens, and cursor token values. |
| `src/App.js`                               | Modified | Fixed legacy `/ajustes` redirect to use relative `../settings/appearance` so it resolves to `/project/:id/settings/appearance`.                                      |
| `src/__tests__/App.routes.test.jsx`        | Modified | Updated redirect assertion to match the corrected relative redirect path.                                                                                            |

## TDD Cycle Evidence

| Task | Test File                                  | Layer | Safety Net     | RED     | GREEN  | TRIANGULATE                              | REFACTOR |
| ---- | ------------------------------------------ | ----- | -------------- | ------- | ------ | ---------------------------------------- | -------- |
| 5.1  | `tests/e2e/09_settings_morphology.spec.ts` | E2E   | ✅ 5/5 passing | Written | ✅ 4/4 | ✅ 4 route + morphology cases            | ✅ Clean |
| 5.2  | `tests/e2e/09_settings_morphology.spec.ts` | E2E   | N/A            | Written | ✅ 4/4 | ✅ 4 existing morphologies token-checked | ✅ Clean |

### Test Summary

- **Total tests written**: 4
- **Total tests passing**: 4/4 in `tests/e2e/09_settings_morphology.spec.ts`
- **Layers used**: E2E (4)
- **Approval tests**: None — no refactoring tasks
- **Pure functions created**: 0

## Visual Regression Check (Task 5.2)

No pre-existing automated visual baseline exists for DevHub morphologies, so the check was performed as an **automated CSS token diff** inside the E2E spec:

- For each existing morphology (`default`, `brutalist-stage`, `aura`, `switchyard`), the spec selects the option and reads the resolved computed values of `--chrome-radius-panel`, `--chrome-radius-control`, `--chrome-border-width`, and `--chrome-press-offset` from `document.documentElement`.
- Each value is asserted against the baseline declared in `design.md` / `src/app/globals.css`.
- The `cursor` morphology is verified separately with its own expected token values.
- All checks passed; no drift was detected in existing morphology tokens.

Evidence:

```text
✅ default           → --chrome-radius-panel: 1rem, --chrome-radius-control: 999px, --chrome-border-width: 1px, --chrome-press-offset: 0px
✅ brutalist-stage   → --chrome-radius-panel: 0,   --chrome-radius-control: 0,   --chrome-border-width: 2px, --chrome-press-offset: 1px
✅ aura              → --chrome-radius-panel: 1.25rem, --chrome-radius-control: 1rem, --chrome-border-width: 1px, --chrome-press-offset: 0px
✅ switchyard        → --chrome-radius-panel: 18px, --chrome-radius-control: 12px, --chrome-border-width: 1px, --chrome-press-offset: 0px
✅ cursor            → --chrome-radius-panel: 18px, --chrome-radius-control: 8px,  --chrome-border-width: 1px, --chrome-press-offset: 0px
```

## Deviations from Design

1. **Redirect path fix**: `App.js` originally used `to="settings/appearance"` inside the `/project/:id/ajustes` route. Because `Navigate` resolves relative paths against the current location, this produced `/project/:id/ajustes/settings/appearance`, which does not match any route. Changed to `to="../settings/appearance"` so the redirect resolves to `/project/:id/settings/appearance` as specified in `design.md` and `spec.md`. This is a bug fix in previously-committed Slice B code discovered during Slice E E2E verification; the design intent was correct but the implementation was one segment off.

## Issues Found

1. **Slice B redirect bug**: The legacy `/project/:id/ajustes` redirect was relative and appended `settings/appearance` to the current path instead of replacing `ajustes`. The E2E spec for task 5.1 caught this. Fixed in `src/App.js` and the corresponding unit test in `src/__tests__/App.routes.test.jsx` was updated to assert the corrected path.

## Remaining Tasks

None. All 20 tasks are complete.

## Workload / PR Boundary

- **Mode**: stacked-to-main
- **Current work unit**: Slice E — E2E smoke spec and visual regression check
- **Boundary**: This PR depends on Slices A–D and ends after task 5.2. It is the final PR in the stack.
- **Estimated review budget impact**: ~180 changed lines in Slice E (well under the 400-line single-commit guideline and the 800-line slice budget).

## Status

20/20 tasks complete. Slice E is ready for verify.
