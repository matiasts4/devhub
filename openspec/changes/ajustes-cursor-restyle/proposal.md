# Proposal: ajustes-cursor-restyle

## Intent

Restyle the working legacy settings page (`src/views/Ajustes.jsx`, 7 tabs, 1758 LOC) into the cursor-morphology visual language, port the terminal-specific settings that live only in the unused new App-Router page, and deprecate the new page and its router. The prior `cursor-morphology` change shipped a 1106-LOC visual mockup at `src/app/settings/appearance/page.jsx` that exposes only 1 of 7 setting groups and was wired ahead of the legacy page; users reach a stub via the sidebar while the working page is orphaned behind a redirect.

## Why

- Legacy works. The new page is a visual mockup with 1 of 7 tabs.
- `Ajustes.jsx` ships 35 `borderRadius: 0` and 2 `4px 4px 0 0 var(--border-strong)` overrides that bypass the morphology system. Under `cursor` (and `switchyard`/`aura`) the chrome does not look right because the page ignores the active token block.
- Terminal settings (renderer mode, typography, header style, accent bar, restore policies, zoom) live ONLY in `page.jsx`. Deprecating that page without porting is a functional regression.
- The new routing (`/settings/appearance` + `SettingsLayoutRouter`) hides the working page behind a redirect; users hit a stub first.
- `openspec/specs/settings-route-canonicalization/spec.md` is now obsolete but not yet archived.

## What Changes

1. Restyle `Ajustes.jsx` to consume `chromeSurfaceStyle()` and `morphology.js` factories directly. Remove all `borderRadius: 0` overrides and both `4px 4px 0 0` shadow overrides. Delete the three local helpers (`getSettingsShellStyle`, `getSettingsControlStyle`, `getSettingsAccentOptionStyle`).
2. Port terminal settings from `page.jsx` into a new Terminal sub-section in the Apariencia tab: renderer mode, typography, header style, accent bar, restore policies, zoom.
3. Rely on `--chrome-radius-panel: 0` for the default morphology block so the page renders square under default and rounded under cursor/switchyard/aura.
4. Revert routing: keep `Ajustes` mounted at `/project/:id/ajustes`; drop the `/ajustes → /settings/appearance` redirect; point `WorkspaceSidebar` and `UserProfile` back to `/ajustes`.
5. Deprecate dead code: remove `src/app/settings/appearance/page.jsx`, `src/components/settings/SettingsLayoutRouter.jsx`, `src/components/settings/AppearanceSection.jsx` (372 LOC), and the sibling `layout.jsx`, `account/page.jsx`, `llm-providers/page.jsx` files. Archive `openspec/specs/settings-route-canonicalization/spec.md`.

## Scope (Two-PR Slice)

| PR | Files | LOC est. | Work |
|----|-------|----------|------|
| **PR-1: Restyle + port terminal settings** | `src/views/Ajustes.jsx`, `src/chrome/morphology.js` (new `settingsTabCardStyle()` factory), `src/app/globals.css` (default block if needed), `src/views/__tests__/Ajustes.test.jsx` | 500-600 | 35 radius removals + 2 shadow edits + 3 helper deletions + 6 sub-control port; tests; visual QA under all 5 morphologies |
| **PR-2: Cleanup** | `src/App.js`, `src/components/WorkspaceSidebar.jsx`, `src/components/UserProfile.jsx`, deleted files, `src/__tests__/App.routes.test.jsx`, `tests/e2e/09_settings_morphology.spec.ts`, `tests/unit/terminal-renderer-default-settings-ui.test.js`, `openspec/specs/settings-route-canonicalization/spec.md`, `skills/devhub-morphology/SKILL.md` | 50-100 net | Delete App-Router page + router + section + sibling files; revert sidebar; rewrite route/e2e tests; archive obsolete spec; update morphology skill to single wiring point |

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- **`morphology-system`** — extend R5 (shared primitives consume chrome tokens) to cover the 7 Ajustes tabs; remove the explicit Ajustes gap from the partial-coverage note. May require a delta to R6 if `--chrome-radius-panel` for the default block is set to `0` (per resolved decision 2). Title still: "All existing morphologies unchanged" — the change is documented as a deliberate update, not a regression.
- **`settings-route-canonicalization`** — superseded by this change. Archive in PR-2. No requirements survive.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/views/Ajustes.jsx` | Modified | Bulk restyle + terminal port |
| `src/chrome/morphology.js` | Modified | New `settingsTabCardStyle()` factory |
| `src/app/globals.css` | Modified (conditional) | Default block radius token if default is meant to be square |
| `src/App.js` | Modified | Drop `settings/*` routes, drop redirect, mount Ajustes at `/ajustes` |
| `src/components/WorkspaceSidebar.jsx` | Modified | Link reverts to `/ajustes` |
| `src/components/UserProfile.jsx` | Modified | Account nav points to `/ajustes` |
| `src/app/settings/appearance/page.jsx` | Removed | 1106 LOC |
| `src/components/settings/SettingsLayoutRouter.jsx` | Removed | 210 LOC |
| `src/components/settings/AppearanceSection.jsx` | Removed | 372 LOC |
| `src/app/settings/{layout,account/page,llm-providers/page}.jsx` | Removed | Dead code |
| `src/views/__tests__/Ajustes.test.jsx` | Modified | Replace helper assertions |
| `src/__tests__/App.routes.test.jsx` | Modified | New route shape |
| `tests/e2e/09_settings_morphology.spec.ts` | Modified | New path, no redirect assertion |
| `tests/unit/terminal-renderer-default-settings-ui.test.js` | Modified | Scan Ajustes, not page.jsx |
| `openspec/specs/settings-route-canonicalization/spec.md` | Archived | Obsolete |
| `skills/devhub-morphology/SKILL.md` | Modified | Single wiring point (Ajustes) |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Default morphology visual regression — removing `borderRadius: 0` in Ajustes exposes the default token. If default is supposed to stay square, set `--chrome-radius-panel: 0` for the default block (Decision 2). | Med | Confirm intent before PR-1 lands; if default stays 1rem, Ajustes will look subtly different; document the change. |
| `--chrome-radius-panel: 0` for default conflicts with `morphology-system` R6 (no-regression invariant locks default to 1rem). | Med | Spec delta in PR-1 amends R6 to record the new default. |
| Terminal settings port complexity — 6 distinct sub-controls (renderer, typography, header style, accent bar, restore policies, zoom) need extraction, plumbing, and state. | Med-High | Land PR-1 behind a feature flag if needed. Smoke test against the original `page.jsx` data. |
| Dead code removal safety — `SettingsLayoutRouter` and `AppearancePage` are still imported by App.js and tests; missing an import breaks the build. | Low | Single commit per PR; `git status` clean check; full `pnpm test` run before merge. |
| Cursor morphology at scale — first major surface (Ajustes, 7 tabs) under cursor chrome; Onboarding wizard modal may look too soft without the hard shadow. | Med | Visual QA per tab; iterate on cursor token values if needed. |
| Obsolete `settings-route-canonicalization` spec — until archived, future changes may rebuild wrong routes against the old spec. | Low | PR-2 archives it. Block `sdd-archive` from running against it in between. |

## Rollback Plan

- **PR-1**: revert the single commit. `borderRadius: 0` overrides return; terminal settings live in `page.jsx` again. No data migration, no schema changes.
- **PR-2**: revert the single commit. `SettingsLayoutRouter` returns, sidebar flips to `/settings/appearance`, dead code restored from git. No data migration.

## Dependencies

- `morphology-system` spec (active) — pre-existing requirement the new code must respect.
- `cursor-morphology` spec (active) — provides the cursor token block this change exposes.
- `chromeSurfaceStyle()` and `morphology.js` factories (shipped) — the canonical primitives Ajustes will adopt.

## Out of Scope

- No new backend endpoints, IPC changes, or schema migrations.
- No new settings categories beyond the terminal port.
- No migration to `/settings/*` URL space; `/ajustes` stays canonical.
- The `partial coverage note` in `morphology-system` for Card/Input Tailwind radii remains a separate, pre-existing gap.

## Open Decisions (Resolved)

1. Port terminal settings into Ajustes.jsx as part of PR-1 — DECIDED.
2. Default stays square — Ajustes will render square under default via the CSS variable, rounded under cursor/switchyard/aura. Set `--chrome-radius-panel: 0` for the default block. DECIDED.
3. Route — keep `/project/:id/ajustes`. Revert sidebar. DECIDED.
4. Dead code — remove `page.jsx` + `SettingsLayoutRouter.jsx` + `AppearanceSection.jsx` + 3 sibling files. DECIDED.

## Success Criteria

- [ ] All 7 Ajustes tabs render with the active morphology's chrome (radius, shadow, border). No `borderRadius: 0` or hardcoded shadow overrides remain in `Ajustes.jsx`.
- [ ] Terminal settings (renderer, typography, header style, accent bar, restore policies, zoom) are reachable from the Apariencia tab in Ajustes.jsx and persist correctly.
- [ ] Switching between `default`, `brutalist-stage`, `aura`, `switchyard`, `cursor` morphologies visibly changes Ajustes geometry.
- [ ] `WorkspaceSidebar` and `UserProfile` settings links point to `/project/:id/ajustes`; visiting `/project/:id/settings/*` 404s.
- [ ] `page.jsx`, `SettingsLayoutRouter.jsx`, `AppearanceSection.jsx`, `layout.jsx`, `account/page.jsx`, `llm-providers/page.jsx` are deleted; related tests are removed or rewritten; `pnpm test` and `pnpm e2e` pass.
- [ ] `openspec/specs/settings-route-canonicalization/spec.md` is archived.
- [ ] `skills/devhub-morphology/SKILL.md` lists `Ajustes.jsx` as the single wiring point.
- [ ] `morphology-system` spec delta lands with PR-1 (or a follow-up) to record the new default-morphology radius and remove the Ajustes gap from R5's partial-coverage note.
