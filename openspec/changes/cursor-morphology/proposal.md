# Proposal: cursor-morphology

## Intent

Add a fifth `cursor` morphology that gives DevHub a warmer, denser Cursor/Copilot-style devtools chrome while keeping the dark/amber/terminal-first brand intact. At the same time, fix the active settings-route confusion (legacy `Ajustes.jsx` vs. canonical `src/app/settings/`) and replace the hardcoded LLM provider registry with a backend-driven, token-aligned UI. Finally, capture the morphology workflow in a reusable `devhub-morphology` skill so future agents can extend the system without relearning it.

## Scope

### In Scope

- Add `CURSOR` to the morphology registry, CSS token block, factory consumption, and selectors in both `src/app/settings/appearance/page.jsx` and `src/views/Ajustes.jsx`.
- Canonicalize settings routing: render the canonical settings pages inside `HashRouter`, redirect `/project/:id/ajustes` to `/project/:id/settings/appearance`, and update `WorkspaceSidebar` + `UserProfile` links.
- Refactor `LLMProviderSettings.jsx` to derive the provider list from `/api/settings/llm-providers` and `llmProviderConfig.js`, keeping only a lightweight frontend metadata map (name, icon, field schema). Add missing providers such as `minimax`.
- Create and install a `devhub-morphology` skill documenting how to add morphologies.

### Out of Scope

- Full Next.js App Router migration; `HashRouter` remains the runtime router.
- New light mode, new themes, or new palette axes for `cursor`.
- Migrating other legacy `Ajustes.jsx` tabs (project, swarm, danger) beyond the redirect.
- Removing `Ajustes.jsx`; it is deprecated after verification.

## Capabilities

### New Capabilities

- `cursor-morphology`: new token set and selector integration for the `cursor` morphology.
- `settings-route-canonicalization`: HashRouter-compatible wrapper, redirects, and navigation-link updates.
- `llm-settings-registry-alignment`: backend-driven provider list with frontend metadata map.
- `devhub-morphology-skill`: reusable agent skill for morphology extensions.

### Modified Capabilities

- `morphology-system`: add `CURSOR` to the registry and token blocks without regressing existing morphologies.

## Approach

- Follow the `switchyard` precedent in `openspec/specs/morphology-system/spec.md`. Add `CURSOR: 'cursor'` to `MORPHOLOGIES`/`MORPHOLOGY_OPTIONS`, define `[data-morphology='cursor']` in `globals.css` with slightly larger panel radii, smaller control radii, softer shadows, and warm amber accent. Factories in `src/chrome/morphology.js` already consume CSS vars, so no new factory is required unless a gap appears.
- Build a react-router-compatible settings layout wrapper (e.g. `src/components/settings/SettingsLayoutRouter.jsx`) that mirrors `src/app/settings/layout.jsx` but uses `react-router-dom` `Link` and `useLocation`. Mount the canonical page components (`appearance`, `llm-providers`, `account`) under `/project/:id/settings/*` in `src/App.js`. Redirect the legacy `/project/:id/ajustes` route to `/project/:id/settings/appearance`.
- Replace the hardcoded `PROVIDER_CONFIGS` object in `LLMProviderSettings.jsx` with a dynamic provider-key list from the backend and a minimal `PROVIDER_META` map for UI-only concerns. Update `reconcilePriorityOrder` to operate against live keys. Provide sensible defaults for unknown providers so the UI never crashes on registry drift.
- Write `skills/devhub-morphology/SKILL.md` and copy/symlink it to `~/.config/opencode/skills/devhub-morphology/SKILL.md`. The skill will document the registry files, token variables, factory usage, preview requirements, and a checklist for adding future morphologies.

## Affected Areas

| Area                                              | Impact   | Description                                    |
| ------------------------------------------------- | -------- | ---------------------------------------------- |
| `src/lib/theme/themes.js`                         | New      | `CURSOR` constant + `MORPHOLOGY_OPTIONS` entry |
| `src/app/globals.css`                             | New      | `[data-morphology='cursor']` token block       |
| `src/chrome/morphology.js`                        | Verify   | Ensure factories read new tokens correctly     |
| `src/app/settings/appearance/page.jsx`            | Modified | Add cursor option and preview                  |
| `src/views/Ajustes.jsx`                           | Modified | Add cursor option to legacy selector           |
| `src/App.js`                                      | Modified | Settings routes + legacy redirect              |
| `src/components/WorkspaceSidebar.jsx`             | Modified | Settings link target                           |
| `src/components/UserProfile.jsx`                  | Modified | Account settings link target                   |
| `src/components/settings/LLMProviderSettings.jsx` | Modified | Backend-driven provider list                   |
| `src/lib/llmProviderConfig.js`                    | Modified | Expose provider metadata helper                |
| `skills/devhub-morphology/SKILL.md`               | New      | Reusable morphology skill                      |

## Risks

| Risk                                             | Likelihood | Mitigation                                                                         |
| ------------------------------------------------ | ---------- | ---------------------------------------------------------------------------------- |
| Route wrapper duplicates Next.js layout logic    | Med        | Keep the Next.js files untouched; create a single HashRouter wrapper component.    |
| LLM field schema still drifts                    | Med        | Default unknown providers to a generic key/value UI; keep `PROVIDER_META` minimal. |
| Morphology regression on terminal/kanban/pizarra | Low        | Visual regression check; do not modify existing morphology blocks.                 |

## Rollback Plan

Revert the five file groups: themes/registry, globals.css block, App.js routes + sidebar/UserProfile links, LLMProviderSettings to its prior hardcoded state, and remove the new skill files. Stored morphology values unknown to the reverted registry are normalized to `default` automatically.

## Dependencies

- Existing `/api/settings/llm-providers` endpoints and `data/llm-providers-config.json`.
- No new external dependencies.

## Success Criteria

- [ ] `cursor` appears and applies from both Appearance and Ajustes pages.
- [ ] `/project/:id/settings/appearance` is reachable from the sidebar; `/project/:id/ajustes` redirects there.
- [ ] LLM settings lists providers from the backend (including `minimax`) and persists changes.
- [ ] Existing morphologies render identically.
- [ ] `devhub-morphology` skill is installed at both project and global paths and readable by OpenCode.
