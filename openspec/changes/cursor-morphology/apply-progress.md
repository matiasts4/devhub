# Apply Progress: cursor-morphology — Slice A + Slice B + Slice C + Slice D

**Change**: cursor-morphology  
**Mode**: Strict TDD  
**PR**: 4 of 5 (stacked-to-main)  
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

## Files Changed — Slice D

| File                                                   | Action    | What Was Done                                                                                                                    |
| ------------------------------------------------------ | --------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `skills/devhub-morphology/SKILL.md`                    | Created   | Reusable agent skill documenting morphology registry, tokens, selectors, factories, tests, and common pitfalls.                  |
| `skills/devhub-morphology/__tests__/skill.test.js`     | Created   | Strict TDD validation tests for skill frontmatter, content, global install parity, AGENTS.md registration, and registry listing. |
| `~/.config/opencode/skills/devhub-morphology/SKILL.md` | Created   | Global copy of the project skill for cross-session discoverability.                                                              |
| `AGENTS.md`                                            | Modified  | Added `devhub-morphology` to the project skills section.                                                                         |
| `eslint.config.js`                                     | Modified  | Added `skills/**/__tests__/**/*.js` to `commonJsAndJestFiles` so skill tests pass linting and pre-commit hooks.                  |
| `.atl/skill-registry.md`                               | Generated | Skill registry refreshed via `gentle-ai skill-registry refresh --force`; lists `devhub-morphology`.                              |

## TDD Cycle Evidence

| Task | Test File                                          | Layer | Safety Net | RED     | GREEN  | TRIANGULATE                                | REFACTOR |
| ---- | -------------------------------------------------- | ----- | ---------- | ------- | ------ | ------------------------------------------ | -------- |
| 4.1  | `skills/devhub-morphology/__tests__/skill.test.js` | Unit  | N/A (new)  | Written | Passed | 3 cases (frontmatter, checklist, pitfalls) | Clean    |
| 4.2  | `skills/devhub-morphology/__tests__/skill.test.js` | Unit  | N/A (new)  | Written | Passed | 1 case (global matches project)            | Clean    |
| 4.3  | `skills/devhub-morphology/__tests__/skill.test.js` | Unit  | N/A (new)  | Written | Passed | 2 cases (AGENTS.md, registry listing)      | Clean    |

### Test Summary

- **Total tests written**: 6
- **Total tests passing**: 6/6 in `skills/devhub-morphology/__tests__/skill.test.js`
- **Layers used**: Unit (6)
- **Approval tests**: None — no refactoring tasks
- **Pure functions created**: 0 (skill is documentation artifact)

## Deviations from Design

None — implementation matches `design.md`. The skill is installed at both project and global paths, registered in `AGENTS.md`, and appears in the local skill registry.

## Issues Found

1. **Test-harness fix**: the new skill test at `skills/devhub-morphology/__tests__/skill.test.js` was not covered by the existing `commonJsAndJestFiles` ESLint glob, causing pre-commit to fail with `no-undef` for `require`/`__dirname`/`describe`/`expect`. Added `skills/**/__tests__/**/*.js` to `eslint.config.js` so skill tests are linted as CommonJS + Jest. This is harness maintenance, not production code.

## Remaining Tasks

- [ ] 5.1 Add E2E smoke spec
- [ ] 5.2 Visual regression check for existing morphologies

## Workload / PR Boundary

- **Mode**: stacked-to-main
- **Current work unit**: Slice D — create and install `devhub-morphology` skill
- **Boundary**: This PR builds on Slice C and ends after task 4.3. It does not include E2E verification (Slice E).
- **Estimated review budget impact**: ~200 changed lines in Slice D (well under the 400-line single-commit guideline and the 800-line slice budget).

## Status

18/18 Phase 1 + Phase 2 + Phase 3 + Phase 4 tasks complete. Slice D is ready for verify or the next PR in the stack.
