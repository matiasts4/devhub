# Tasks: cursor-morphology

Add the `cursor` morphology, canonicalize settings routing under `HashRouter`, align LLM settings with the backend provider registry, and capture the morphology workflow in a reusable skill.

## Task Checklist

### Phase 1: Slice A — `cursor` morphology

- [x] 1.1 Register `CURSOR` morphology in `src/lib/theme/themes.js`
- [x] 1.2 Add cursor CSS token block to `src/app/globals.css`
- [x] 1.3 Wire cursor selector in `src/app/settings/appearance/page.jsx`
- [x] 1.4 Wire cursor selector in legacy `src/views/Ajustes.jsx`
- [x] 1.5 Test cursor registry and tokens

### Phase 2: Slice B — Settings route canonicalization

- [x] 2.1 Create `SettingsLayoutRouter` wrapper
- [x] 2.2 Mount settings routes and redirect legacy `/ajustes`
- [x] 2.3 Update sidebar settings link
- [x] 2.4 Update profile account link
- [x] 2.5 Test settings routing

### Phase 3: Slice C — LLM provider registry alignment

- [ ] 3.1 Fetch backend provider list
- [ ] 3.2 Create `ProviderCard` component
- [ ] 3.3 Refactor `LLMProviderSettings` to use metadata map
- [ ] 3.4 Update `llmProviderConfig` helper schema hints
- [ ] 3.5 Test backend-driven LLM UI

### Phase 4: Slice D — `devhub-morphology` skill

- [ ] 4.1 Write project-local skill
- [ ] 4.2 Install skill globally
- [ ] 4.3 Verify skill discoverability

### Phase 5: Verification

- [ ] 5.1 Add E2E smoke spec
- [ ] 5.2 Visual regression check for existing morphologies

## Review Workload Forecast

| Field                   | Value                            |
| ----------------------- | -------------------------------- |
| Estimated changed lines | ~1,000–1,100                     |
| Review budget lines     | 800                              |
| 400-line budget risk    | High                             |
| Chained PRs recommended | Yes                              |
| Suggested split         | PR 1 → PR 2 → PR 3 → PR 4 → PR 5 |
| Delivery strategy       | auto-forecast                    |
| Chain strategy          | stacked-to-main                  |

Decision needed before apply: No (auto-forecast selected; forecast recommends chained PRs)
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

Slice A, B, C, and D are independent; E2E verification lands last. `stacked-to-main` chosen: each slice merges to `main` in order.

### Suggested Work Units

| Unit | Goal                                                  | Likely PR | Notes                                   |
| ---- | ----------------------------------------------------- | --------- | --------------------------------------- |
| 1    | Add `cursor` morphology tokens and selectors          | PR 1      | Independent; includes unit + page tests |
| 2    | Canonicalize HashRouter settings routes and nav links | PR 2      | Independent; no dependency on Unit 1    |
| 3    | Backend-drive the LLM provider list with fallback UI  | PR 3      | Independent; largest slice              |
| 4    | Create and install `devhub-morphology` skill          | PR 4      | Independent; manual global symlink/copy |
| 5    | Add E2E smoke verification                            | PR 5      | Depends on Units 1–4                    |

## Phase 1: Slice A — `cursor` morphology

| ID  | Title                                   | Description                                                                                                         | Est. Lines | Files Affected                           | Acceptance Criteria                                                                                                 | Dependencies |
| --- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------ |
| 1.1 | Register `CURSOR` morphology            | Add `CURSOR: 'cursor'` to `MORPHOLOGIES` and a `"Cursor"` entry to `MORPHOLOGY_OPTIONS`.                            | ~10        | `src/lib/theme/themes.js`                | `themes.js` exports `MORPHOLOGIES.CURSOR` and the option label is `"Cursor"`.                                       | —            |
| 1.2 | Add cursor CSS token block              | Append `[data-morphology='cursor']` to `globals.css` with panel/control radii, warm amber accent, and chrome fills. | ~30        | `src/app/globals.css`                    | Computed tokens match design values (`--chrome-radius-panel: 18px`, `--accent-primary: oklch(0.74 0.16 57)`, etc.). | 1.1          |
| 1.3 | Wire cursor selector in Appearance page | Render the cursor option in `src/app/settings/appearance/page.jsx`; selecting it calls `setMorphology('cursor')`.   | ~30        | `src/app/settings/appearance/page.jsx`   | Option visible; click sets `html[data-morphology='cursor']`.                                                        | 1.1, 1.2     |
| 1.4 | Wire cursor selector in legacy Ajustes  | Add the cursor option to `src/views/Ajustes.jsx` morphology selector.                                               | ~20        | `src/views/Ajustes.jsx`                  | Legacy page shows and applies cursor morphology.                                                                    | 1.1, 1.2     |
| 1.5 | Test cursor registry and tokens         | Extend `src/lib/theme/__tests__/themes.test.js` and add a computed-style test for the cursor block.                 | ~40        | `src/lib/theme/__tests__/themes.test.js` | Tests pass; existing morphology baselines unchanged.                                                                | 1.1–1.4      |

## Phase 2: Slice B — Settings route canonicalization

| ID  | Title                              | Description                                                                                                                       | Est. Lines | Files Affected                                                            | Acceptance Criteria                                                                    | Dependencies |
| --- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------ |
| 2.1 | Create `SettingsLayoutRouter`      | Build a `react-router`-compatible wrapper mirroring `src/app/settings/layout.jsx` using `Link`/`useLocation`.                     | ~80        | `src/components/settings/SettingsLayoutRouter.jsx`                        | Renders canonical settings pages inside `HashRouter` without Next.js layout conflicts. | —            |
| 2.2 | Mount settings routes and redirect | Add `/project/:projectId/settings/*` routes in `src/App.js` and redirect `/project/:projectId/ajustes` to `/settings/appearance`. | ~50        | `src/App.js`                                                              | Canonical routes reachable; legacy route redirects.                                    | 2.1          |
| 2.3 | Update sidebar settings link       | Change `WorkspaceSidebar.jsx` "Ajustes" link to `/project/:id/settings/appearance`; active state covers `/settings` sub-routes.   | ~20        | `src/components/WorkspaceSidebar.jsx`                                     | Link navigates correctly and highlights on any settings page.                          | 2.2          |
| 2.4 | Update profile account link        | Change `UserProfile.jsx` account settings navigation to `/project/:id/settings/account`.                                          | ~15        | `src/components/UserProfile.jsx`                                          | Click opens canonical account settings.                                                | 2.2          |
| 2.5 | Test settings routing              | Add/extend tests for redirect, sidebar active state, and profile navigation.                                                      | ~50        | `src/app/settings/appearance/__tests__/page.test.jsx` or new routing test | Tests pass.                                                                            | 2.1–2.4      |

## Phase 3: Slice C — LLM provider registry alignment

| ID  | Title                                              | Description                                                                                                                                    | Est. Lines | Files Affected                                                   | Acceptance Criteria                                                                           | Dependencies |
| --- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------ |
| 3.1 | Fetch backend provider list                        | Make `LLMProviderSettings.jsx` call `GET /api/settings/llm-providers` and derive provider keys from the response.                              | ~60        | `src/components/settings/LLMProviderSettings.jsx`                | Backend providers render in backend order, including `minimax`.                               | —            |
| 3.2 | Create `ProviderCard` component                    | Extract a card component that renders one provider from `PROVIDER_META` + live config, with generic fallback for unknown providers.            | ~120       | `src/components/settings/ProviderCard.jsx`                       | Known providers use metadata; unknown providers render generic key/value UI without crashing. | 3.1          |
| 3.3 | Refactor `LLMProviderSettings` to use metadata map | Replace hardcoded `PROVIDER_CONFIGS` with `PROVIDER_META` (name, icon, field schema) and wire `ProviderCard`; keep copilot device-flow intact. | ~180       | `src/components/settings/LLMProviderSettings.jsx`                | Save uses `POST /api/settings/llm-providers`; device flow unchanged.                          | 3.2          |
| 3.4 | Update `llmProviderConfig` helper                  | Add/expose optional env-var schema hints for backend-driven fields.                                                                            | ~30        | `src/lib/llmProviderConfig.js`                                   | Helper exports schema hints consumed by `ProviderCard` if available.                          | 3.2          |
| 3.5 | Test backend-driven LLM UI                         | Extend `src/components/settings/__tests__/LLMProviderSettings.test.jsx` with `minimax` and a synthetic unknown provider.                       | ~100       | `src/components/settings/__tests__/LLMProviderSettings.test.jsx` | Tests pass; reconcile drops stale keys and backfills known providers.                         | 3.1–3.4      |

## Phase 4: Slice D — `devhub-morphology` skill

| ID  | Title                        | Description                                                                                                                                        | Est. Lines | Files Affected                                         | Acceptance Criteria                                       | Dependencies |
| --- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------ | --------------------------------------------------------- | ------------ |
| 4.1 | Write project-local skill    | Create `skills/devhub-morphology/SKILL.md` with frontmatter, registry files, token variables, factory usage, previews, and an extension checklist. | ~120       | `skills/devhub-morphology/SKILL.md`                    | File has valid YAML frontmatter and a complete checklist. | —            |
| 4.2 | Install skill globally       | Copy or symlink the skill to `~/.config/opencode/skills/devhub-morphology/SKILL.md`.                                                               | —          | `~/.config/opencode/skills/devhub-morphology/SKILL.md` | OpenCode discovers the skill and frontmatter parses.      | 4.1          |
| 4.3 | Verify skill discoverability | Confirm the skill appears in the local skill registry and frontmatter is valid.                                                                    | ~10        | Skill manifest or local check                          | Skill listed with valid metadata.                         | 4.2          |

## Phase 5: Verification

| ID  | Title                   | Description                                                                                                                                          | Est. Lines | Files Affected                                    | Acceptance Criteria                          | Dependencies |
| --- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------- | -------------------------------------------- | ------------ |
| 5.1 | Add E2E smoke spec      | Create a Playwright spec verifying `/project/:id/settings/appearance` reachable, `/ajustes` redirects, and existing morphologies render identically. | ~80        | `e2e/settings-morphology.spec.js` (or equivalent) | Spec passes against local dev server.        | 1–4          |
| 5.2 | Visual regression check | Run a manual or automated check that default, brutalist-stage, aura, and switchyard tokens did not change.                                           | —          | `src/app/globals.css`, screenshots                | No baseline drift for existing morphologies. | 1.2, 5.1     |

## Decision Log

- Forecast exceeded the 800-line review budget; auto-forecast resolved to chained PRs.
- Chain strategy: `stacked-to-main` (auto-selected for speed-first independent slices).
- Proceeding to `sdd-apply` starting with Slice A.
