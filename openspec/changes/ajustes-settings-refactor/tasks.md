# Tasks: ajustes-settings-refactor

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~900–1100 (15 new files + 2 modified) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1: shared primitives + section components → PR 2: provider components + CopilotAuthPanel → PR 3: coordinators + tests |
| Delivery strategy | size:exception (approved) |
| Chain strategy | single-pr |

Decision resolved: size:exception approved by maintainer.

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Shared primitives (ProviderCardShell, ModelPicker, ProviderActions) + 6 section components | PR 1 | Base: main; ~400 lines; no coordinator wiring yet |
| 2 | 5 provider components + CopilotAuthPanel isolation | PR 2 | Base: PR 1; ~350 lines; uses primitives from PR 1 |
| 3 | Ajustes coordinator + LLMProviderSettings sub-coordinator + test suite | PR 3 | Base: PR 2; ~250 lines; final wiring + all tests |

---

## Phase 1: Shared Primitives

- [x] 1.1 RED: write failing unit test for `ProviderCardShell` — renders children, title, icon slot
- [x] 1.2 CREATE `src/components/settings/shared/ProviderCardShell.jsx` — shadcn Card wrapper (~98 lines)
- [x] 1.3 RED: write failing unit test for `ModelPicker` — renders select, calls onChange with new value
- [x] 1.4 CREATE `src/components/settings/shared/ModelPicker.jsx` — shadcn Select wrapper (~92 lines)
- [x] 1.5 RED: write failing unit test for `ProviderActions` — renders enable/disable toggle, save button
- [x] 1.6 CREATE `src/components/settings/shared/ProviderActions.jsx` — action bar primitive (~82 lines)
- [x] 1.7 GREEN: all three primitive tests pass; no existing tests broken (28 tests pass)

## Phase 2: Section Components (extracted from Ajustes.jsx)

Note: Actual sections match existing Ajustes.jsx tabs (project, theme, llm, swarm, profile, prefs, danger) — not the design doc's idealized names.

- [x] 2.1 CREATE `src/views/settings/ProjectSection.jsx` — extract project tab (~335 lines)
- [x] 2.2 CREATE `src/views/settings/AppearanceSection.jsx` — extract theme/appearance tab (~212 lines)
- [x] 2.3 CREATE `src/views/settings/LLMSection.jsx` — placeholder for LLM tab (delegated to LLMProviderSettings)
- [x] 2.4 CREATE `src/views/settings/SwarmSection.jsx` — extract swarm tab (~212 lines)
- [x] 2.5 CREATE `src/views/settings/ProfileSection.jsx` — extract profile tab (~82 lines)
- [x] 2.6 CREATE `src/views/settings/PrefsSection.jsx` — extract preferences tab (~73 lines)
- [x] 2.7 CREATE `src/views/settings/DangerSection.jsx` — extract danger zone tab (~102 lines)
- [x] 2.8 GREEN: barrel export `src/views/settings/index.js` created

## Phase 3: Provider Components (extracted from LLMProviderSettings.jsx)

- [x] 3.1 CREATE `src/components/settings/providers/CopilotProvider.jsx` (~79 lines); imports ProviderCardShell
- [x] 3.2 CREATE `src/components/settings/providers/OpenCodeProvider.jsx` (~29 lines)
- [x] 3.3 CREATE `src/components/settings/providers/OpenRouterProvider.jsx` (~55 lines)
- [x] 3.4 CREATE `src/components/settings/providers/ZenProvider.jsx` (~46 lines)
- [x] 3.5 CREATE `src/components/settings/providers/DirectProvider.jsx` (~56 lines)
- [x] 3.6 GREEN: all provider components use ProviderCardShell

## Phase 4: CopilotAuthPanel Isolation

- [x] 4.1 CREATE `src/components/settings/providers/CopilotAuthPanel.jsx` — all OAuth state owned here (~284 lines); props: `isAuthenticated`, `onAuthChange`
- [x] 4.2 GREEN: CopilotAuthPanel tests pass (idle, authed, logout, error states)

## Phase 5: Coordinators Refactor

- [x] 5.1 MODIFY `src/components/settings/LLMProviderSettings.jsx` → 113 lines (≤ 150 ✓); delegates to 5 provider components
- [x] 5.2 MODIFY `src/views/Ajustes.jsx` → 100 lines (≤ 100 ✓); replace hand-rolled tabs with shadcn `<Tabs>`; renders 7 section components + LLMProviderSettings
- [x] 5.3 Verify no hand-rolled card markup remains in refactored files — ProviderCardShell used by all providers
- [x] 5.4 Verify `git diff package.json` shows zero new dependencies (only script added, no deps)

## Phase 6: Tests

- [x] 6.1 Unit: ProviderCardShell tests (7 tests)
- [x] 6.2 Unit: ModelPicker tests (6 tests)
- [x] 6.3 Unit: ProviderActions tests (10 tests)
- [x] 6.4 Unit: CopilotAuthPanel tests (5 tests)
- [x] 6.5 Run full test suite (`npm test`) — 30 settings tests pass; 23 pre-existing failures unrelated to this change

## Phase 7: Cleanup

- [x] 7.1 Barrel exports created: `src/views/settings/index.js` and `src/components/settings/shared/index.js`
- [x] 7.2 Global lucide-react mock added via jest.config.js moduleNameMapper
- [x] 7.3 Design open questions resolved: SettingsLayout inline in Ajustes.jsx (coordinator ≤ 100 lines); Playwright E2E scaffold noted for future work
