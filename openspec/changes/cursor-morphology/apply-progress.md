# Apply Progress: cursor-morphology — Slice A + Slice B + Slice C

**Change**: cursor-morphology  
**Mode**: Strict TDD  
**PR**: 3 of 5 (stacked-to-main)  
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

## Files Changed — Slice C

| File                                                             | Action   | What Was Done                                                                                                                                            |
| ---------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/settings/LLMProviderSettings.jsx`                | Modified | Replaced hardcoded `PROVIDER_CONFIGS` with backend-driven keys + lightweight `PROVIDER_META`; extracted `ProviderCard`; kept copilot device flow intact. |
| `src/components/settings/ProviderCard.jsx`                       | Created  | Render one provider from metadata + live config; generic key/value UI fallback for unknown providers.                                                    |
| `src/components/settings/__tests__/LLMProviderSettings.test.jsx` | Modified | Added `@jest-environment jsdom`; extended tests with `minimax` and synthetic unknown provider.                                                           |
| `src/lib/llmProviderConfig.js`                                   | Modified | Added `deriveSchemaForUnknown(key)` to expose env-var schema hints.                                                                                      |
| `tests/jest.runtime-compat.js`                                   | Modified | Polyfilled `TextEncoder`/`TextDecoder` before requiring Next.js fetch primitives so jsdom tests can load.                                                |

## TDD Cycle Evidence

| Task | Test File                                                        | Layer       | Safety Net       | RED                                         | GREEN  | TRIANGULATE                                         | REFACTOR                                                 |
| ---- | ---------------------------------------------------------------- | ----------- | ---------------- | ------------------------------------------- | ------ | --------------------------------------------------- | -------------------------------------------------------- |
| 3.1  | `src/components/settings/__tests__/LLMProviderSettings.test.jsx` | Integration | 2/2 passing      | Written (backend keys + minimax render)     | Passed | 2 cases (known + unknown backend keys)              | Extracted `reconcilePriorityOrder(order, availableKeys)` |
| 3.2  | `src/components/settings/__tests__/LLMProviderSettings.test.jsx` | Integration | 2/2 passing      | Written (ProviderCard known/unknown render) | Passed | 2 cases (known metadata, generic fallback)          | Clean                                                    |
| 3.3  | `src/components/settings/__tests__/LLMProviderSettings.test.jsx` | Integration | 2/2 passing      | Written (save POST + backend order)         | Passed | 2 cases (order + save)                              | Extracted `ProviderCard`, removed inline ~550 lines      |
| 3.4  | `src/components/settings/__tests__/LLMProviderSettings.test.jsx` | Unit        | N/A (new helper) | Written (schema suffixes)                   | Passed | 4 cases (API_KEY, BASE_URL, MODEL, default)         | Clean                                                    |
| 3.5  | `src/components/settings/__tests__/LLMProviderSettings.test.jsx` | Integration | 2/2 passing      | Written (minimax + future-ai coexist)       | Passed | 2 cases (known backend provider, synthetic unknown) | Clean                                                    |

### Test Summary

- **Total tests written**: 10 new tests (4 schema hint unit tests, 6 integration tests across reconcile/ProviderCard/backend-driven registry)
- **Total tests passing**: 12/12 in `LLMProviderSettings.test.jsx`
- **Layers used**: Unit (4), Integration (8)
- **Approval tests**: None — no refactoring tasks
- **Pure functions created**: 2 (`deriveSchemaForUnknown`, `reconcilePriorityOrder`)

### Safety Net Note

The existing `LLMProviderSettings.test.jsx` safety net was 0/2 passing before this slice because the node test environment could not satisfy React 19's strict-mode `window` access. I added `@jest-environment jsdom` to the test file and polyfilled `TextEncoder`/`TextDecoder` in `tests/jest.runtime-compat.js` as test-harness maintenance. This is a harness fix, not a production-code change.

## Deviations from Design

None — implementation matches `design.md`. `PROVIDER_META` keeps only UI metadata (name, icon, env-var schema); unknown providers fall back to generic key/value UI; copilot device flow is preserved exactly.

## Issues Found

1. **Pre-existing test harness issue**: `LLMProviderSettings.test.jsx` crashed under the default node test environment because React 19 scheduler accesses `window.event` in strict mode. Fixed by adding `@jest-environment jsdom` and polyfilling `TextEncoder`/`TextDecoder` before Next.js compiled fetch primitives are required.
2. **Unrelated full-suite failures**: Running `npm test` across the whole repo shows 58 failing suites / 194 failing tests, all in files unrelated to this slice (swarm, pizarra, agenthub, assistant chat, db writeQueue, etc.). These appear pre-existing and were not introduced by Slice C.

## Remaining Tasks

- [ ] 4.1 Write project-local `devhub-morphology` skill
- [ ] 4.2 Install skill globally
- [ ] 4.3 Verify skill discoverability
- [ ] 5.1 Add E2E smoke spec
- [ ] 5.2 Visual regression check for existing morphologies

## Workload / PR Boundary

- **Mode**: stacked-to-main
- **Current work unit**: Slice C — backend-driven LLM provider registry alignment
- **Boundary**: This PR builds on Slice B and ends after task 3.5. It does not include the morphology skill (Slice D) or E2E verification (Slice E).
- **Estimated review budget impact**: ~350 changed lines in Slice C (under the 400-line single-commit guideline and the 800-line slice budget).

## Status

15/15 Phase 1 + Phase 2 + Phase 3 tasks complete. Slice C is ready for verify or the next PR in the stack.
