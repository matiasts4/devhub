# ajustes-cursor-restyle — Exploration

## Context

The `cursor-morphology` change shipped in two PRs that landed inconsistent state. PR-1 of cursor-morphology added a `cursor` morphology (warm-amber, rounded, soft-shadow chrome via `--chrome-*` tokens) to `src/lib/theme/themes.js` and `src/app/globals.css`, then wired the selector into the new `src/app/settings/appearance/page.jsx` AND into legacy `src/views/Ajustes.jsx`. PR-2 of cursor-morphology created `SettingsLayoutRouter` and rerouted `WorkspaceSidebar`'s "Ajustes" link from `/project/:id/ajustes` to `/project/:id/settings/appearance`. The result: the new App-Router page (1106 LOC) is reachable but only exposes 1 of 7 setting groups (Appearance, including terminal-specific sub-controls), while the legacy `Ajustes.jsx` (1758 LOC) is the only file that holds the 7 working tabs (Proyecto, Apariencia, LLM, Swarm, Perfil, Preferencias, Peligro) and is now orphaned behind a redirect. Visually, `Ajustes.jsx` ships with 35 hardcoded `borderRadius: 0` overrides and two `4px 4px 0 0 var(--border-strong)` shadows that force a brutalist look regardless of which morphology the user picks. The new direction reverses PR-2: restyle the legacy `Ajustes.jsx` to use the cursor-morphology token layer (and the existing `chrome/morphology.js` factories) so all 7 tabs honor the active morphology, then deprecate the App-Router page + `SettingsLayoutRouter` and point the sidebar back to `/ajustes`.

## Current State

### Files in scope

| File                                               | LOC  | Role                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/views/Ajustes.jsx`                            | 1758 | Legacy 7-tab settings; renderers = `renderProjectTab`, `renderThemeTab`, `renderLlmTab` (delegates to `LLMProviderSettings`), `renderSwarmTab`, `renderProfileTab`, `renderPrefsTab`, `renderDangerTab`. Top of file defines local helpers `getSettingsShellStyle`, `getSettingsControlStyle`, `getSettingsAccentOptionStyle` (lines 165-199) that re-spread `chromeSurfaceStyle` then **override** `borderRadius: 0` and force brutalist box-shadow. Tab nav at line 1713-1742, header at 1705-1709.                      |
| `src/app/settings/appearance/page.jsx`             | 1106 | New App-Router page. Sections: Theme (319-433), Terminal Zone (435-711), Accent signal (713-809), Morphology (811-919), Terminal renderer (921-975), Zoom Level (977-1042), Restauración de Terminales (1044-1090). Uses `rounded-2xl`, `rounded-xl`, `rounded-lg`, `rounded-md` Tailwind classes — softer, larger radii than the cursor tokens. Helpers `getAppearanceSectionStyle`, `getAppearanceBadgeStyle`, `getAppearanceOptionStyle`, `getAppearanceControlStyle`, `getAppearanceAccentSwatchStyle` (lines 94-143). |
| `src/components/settings/SettingsLayoutRouter.jsx` | 210  | react-router wrapper (link/useLocation) that mirrors `src/app/settings/layout.jsx`. Renders a sidebar with 9 nav items (Account, Appearance, LLM Providers, Shortcuts, AI Agents, BridgeVoice, Notifications, CLI, API Keys) and an `<Outlet/>` for nested pages. **Only 8 of the 9 items are dead — only `appearance` is mounted in `App.js:411-417`.**                                                                                                                                                                   |
| `src/components/WorkspaceSidebar.jsx`              | 557  | Lines 211-214: `href = key === 'settings' ? '/project/${id}/settings/appearance' : ...` (the new PR-2 path). Active check at 182: `pathname?.includes('/${key}')` — which means `settings` only matches when the URL literally contains `/settings`.                                                                                                                                                                                                                                                                       |
| `src/chrome/morphology.js`                         | 417  | Token-driven factories: `panelStyle`, `panelHeaderStripStyle`, `btnPrimaryStyle`, `btnSecondaryStyle`, `btnDangerStyle`, `pillStyle`, `dangerBannerStyle`, `dataTileStyle`, `progressTrackStyle`, `progressFillStyle`, `inputStyle`, `selectStyle`, `sectionSurfaceStyle`, `codeBlockStyle`, `filterBarStyle`, `kanbanColumnStyle`, `kanbanColumnHeaderStyle`, `kanbanCardStyle`, `timelineItemStyle`. Plus `brutalPanelStyle`/`brutalProgressTrackStyle`/`brutalProgressFillStyle` for the brutalist-stage morphology.    |
| `src/components/ui/chrome-surface.jsx`             | 69   | `ChromeSurface` (forwardRef, asChild support) + `chromeSurfaceStyle` (`surface: 'panel' \| 'pill'`, `emphasized`, `tone`).                                                                                                                                                                                                                                                                                                                                                                                                 |
| `src/app/globals.css` line 197-215                 | —    | `[data-morphology='cursor']` block sets `--chrome-radius-panel: 18px`, `--chrome-radius-control: 8px`, `--chrome-border-width: 1px`, soft shadows.                                                                                                                                                                                                                                                                                                                                                                         |

### Routes (current)

`src/App.js:411-418`:

```
<Route path="settings/*" element={<SettingsLayoutRouter />}>
  <Route index element={<Navigate to="appearance" replace />} />
  <Route path="appearance" element={<AppearancePage />} />
  <Route path="account" element={<AccountPage />} />
  <Route path="llm-providers" element={<LLMProvidersPage />} />
  <Route path="*" element={<Navigate to="appearance" replace />} />
</Route>
<Route path="ajustes" element={<Navigate to="../settings/appearance" replace />} />
```

### Consumers of the soon-to-be-deprecated files

| File                                                              | What it imports/references                                                                                                                                                   | Risk                                                                                                                             |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `src/App.js:29-30`                                                | `import SettingsLayoutRouter`, `import AppearancePage`                                                                                                                       | Mounts both at `/settings/*` and `/settings/appearance`                                                                          |
| `src/__tests__/App.routes.test.jsx`                               | Source-regex tests for the import statements and `<Route path="settings/*" element={<SettingsLayoutRouter />}>`                                                              | Must rewrite to expect the legacy `Ajustes` component at that path                                                               |
| `src/components/settings/__tests__/SettingsLayoutRouter.test.jsx` | Default export of `SettingsLayoutRouter`                                                                                                                                     | Must be deleted alongside the component                                                                                          |
| `src/app/settings/appearance/__tests__/page.test.jsx`             | Default export of `AppearancePage` + `getAppearanceSectionStyle`                                                                                                             | Must be deleted with the page                                                                                                    |
| `tests/unit/terminal-renderer-default-settings-ui.test.js`        | Reads `src/app/settings/appearance/page.jsx` as text and asserts the `xterm-webgl` select/badge/copy are present                                                             | If we drop the page, this contract moves to `Ajustes.jsx` (or is dropped)                                                        |
| `tests/e2e/09_settings_morphology.spec.ts`                        | Asserts `/#/project/.../settings/appearance` renders `appearance-morphology-option-default` and `...-cursor` testids; asserts `/ajustes` redirects to `/settings/appearance` | Must be rewritten to use `data-testid="ajustes-morphology-option-..."` and remove the redirect assertion                         |
| `openspec/specs/settings-route-canonicalization/spec.md`          | Spec written by the prior change                                                                                                                                             | The `ajustes-cursor-restyle` change **removes** the canonical settings routes; this spec becomes obsolete (archive or supersede) |
| `skills/devhub-morphology/SKILL.md` lines 18, 34, 61              | References both `src/app/settings/appearance/page.jsx` and `src/views/Ajustes.jsx` as canonical wiring points                                                                | After the change, only `Ajustes.jsx` remains; skill should be updated to drop the new page reference                             |

The `LLMProviderSettings` component (consumed by `renderLlmTab` at line 1168) is unaffected by this change.

## Visual Debt Inventory

Map of every hardcoded brutalist style in `src/views/Ajustes.jsx` and the factory/token that should replace it. Lines from current source.

| File:line                                                          | Hardcoded style                                                                                                                                                      | Replacement                                                                                                                             |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `src/views/Ajustes.jsx:165-173`                                    | `getSettingsShellStyle` — spreads `chromeSurfaceStyle({ surface: 'panel', emphasized })` then hardcodes `borderRadius: 0` and `background: var(--chrome-panel-fill)` | Delete the helper; call `chromeSurfaceStyle({ surface: 'panel', emphasized })` directly (or wrap in `ChromeSurface asChild`)            |
| `src/views/Ajustes.jsx:175-181`                                    | `getSettingsControlStyle` — same pattern, `borderRadius: 0` override                                                                                                 | Delete; call `chromeSurfaceStyle({ surface: 'pill', tone })` directly                                                                   |
| `src/views/Ajustes.jsx:183-199`                                    | `getSettingsAccentOptionStyle` — overrides with `boxShadow: '6px 6px 0 rgba(1, 4, 9, 0.18)'` and `borderRadius: 0` when not active                                   | Delete; use `chromeSurfaceStyle({ surface: 'panel', emphasized: isActive, tone })` and let the morphology supply the shadow             |
| `src/views/Ajustes.jsx:194`                                        | `boxShadow: isActive ? 'var(--chrome-shadow-panel)' : '6px 6px 0 rgba(1, 4, 9, 0.18)'`                                                                               | `'var(--chrome-shadow-panel)'` for both — drop the second branch                                                                        |
| `src/views/Ajustes.jsx:241, 261, 269, 275, 282`                    | `borderRadius: 0` on the inner theme preview art                                                                                                                     | Cosmetic only — these are pixel-art thumbs inside the theme option card. Keep them, they are not chrome surfaces.                       |
| `src/views/Ajustes.jsx:365-366`                                    | `boxShadow: '4px 4px 0 0 var(--border-strong)'` on the Onboarding wizard modal                                                                                       | Use `var(--chrome-shadow-panel)` (cursor token resolves to a soft shadow)                                                               |
| `src/views/Ajustes.jsx:407, 416, 968, 997, 1023, 1028, 1069, 1120` | `borderRadius: 0` on secondary buttons/pills inside modal & filter chips                                                                                             | Remove — the underlying factory already provides `var(--chrome-radius-control)`                                                         |
| `src/views/Ajustes.jsx:685, 1173, 1286, 1430, 1523`                | `style={{ ...panelStyle(), borderRadius: 0 }}` on tab card root                                                                                                      | Drop the `borderRadius: 0` override; spread `panelStyle()` only                                                                         |
| `src/views/Ajustes.jsx:1188, 1218, 1225, 1263`                     | `borderRadius: 0` on swarm status icon, indicator, data tile                                                                                                         | Use `pillStyle({ tone })` and `dataTileStyle({ color })`; drop the override                                                             |
| `src/views/Ajustes.jsx:1266`                                       | `boxShadow: '4px 4px 0 0 var(--border-strong)'` on swarm data tile                                                                                                   | Replace with `boxShadow: 'var(--chrome-shadow-panel)'` or rely on `dataTileStyle()`                                                     |
| `src/views/Ajustes.jsx:1366, 1389, 1412`                           | `borderRadius: 0` on swarm slider badge & input track                                                                                                                | Drop override; rely on `chrome-radius-control`                                                                                          |
| `src/views/Ajustes.jsx:1463`                                       | `borderRadius: 0` on profile avatar chip                                                                                                                             | Drop override                                                                                                                           |
| `src/views/Ajustes.jsx:1598`                                       | `style={{ ...panelStyle({ tone: 'danger' }), borderRadius: 0 }}` on danger card root                                                                                 | Drop override                                                                                                                           |
| `src/views/Ajustes.jsx:1727, 1731`                                 | `getSettingsControlStyle` for tab nav buttons                                                                                                                        | Switch to direct `chromeSurfaceStyle({ surface: 'pill', tone: activeTab === key ? 'accent' : 'neutral' })`                              |
| `src/views/Ajustes.jsx:685, 1173, 1286, 1430, 1523, 1598`          | `panelStyle({...}, borderRadius: 0)` pattern repeated for every tab card root                                                                                        | Establish a `settingsTabCardStyle()` factory in `src/chrome/morphology.js` for the `overflow-hidden border` card pattern (panel + clip) |

### Visual elements to preserve from the new page (cursor-morphology style)

| Element in new page.jsx                                                    | What it does                                                                                 | Carries to Ajustes.jsx                                                                                                       |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `rounded-2xl border p-6` panels (lines 322, 436, 714, 812, 922, 978, 1045) | Soft, generous corner radius; spacious padding rhythm                                        | `panelStyle()` with `chrome-radius-panel: 18px` already delivers this — do NOT add Tailwind `rounded-2xl`; rely on the token |
| Warm-amber accent (`oklch(0.74 0.16 57)`)                                  | `--accent-primary` token, set by cursor morphology                                           | Inherited automatically — no extra wiring                                                                                    |
| Softer shadows (`var(--chrome-shadow-panel)`)                              | Token resolves to `0 14px 28px rgba(0, 0, 0, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.03)` | Inherited                                                                                                                    |
| Section header strip `border-b px-6 py-4` (lines 686-690, 1174-1179)       | Header chrome above panel content                                                            | Ajustes already uses this pattern (line 686-690, 1174-1179, 1288-1292, 1432-1436, 1525-1529) — keep it                       |
| `rounded-full` active badge (lines 402-406, 510-515, 766-771)              | Small pill with accent fill                                                                  | Replace the current `borderRadius: 0` badges at 290-293, 1106-1110 with `pillStyle({ tone: 'accent' })` — no override        |

## Slice Plan

### PR-1: Ajustes visual restyle

**Goal**: `src/views/Ajustes.jsx` honors the active `[data-morphology]` token layer in every surface; no `borderRadius: 0` overrides, no hardcoded `'4px 4px 0 0 var(--border-strong)'` shadows.

**Files**:

- `src/views/Ajustes.jsx` — bulk edit; estimated ~600-800 lines touched (35 `borderRadius: 0` removals + 2 shadow edits + 3 helper deletions + replacement calls).
- `src/chrome/morphology.js` — add one new factory `settingsTabCardStyle()` for the repeating `overflow-hidden border` card pattern (≤30 LOC).
- `src/views/__tests__/Ajustes.test.jsx` — adjust the `getSettingsShellStyle` assertion to instead check the new factory or that `borderRadius: 0` no longer appears in the shell style.
- `src/views/__tests__/Ajustes.projectType.test.jsx` — already asserts `borderRadius: 0` is gone in project-type/doc-policy buttons; no change needed (test will pass under the new chrome).

**Estimated diff size**: ~600-900 lines (mostly removals of inline `borderRadius: 0` overrides, but the test fixture rerenders and the helper-function deletions will show as deletions of ~40 lines each).

**Visual verification**: open the app, switch to `cursor` morphology, navigate each of the 7 tabs, confirm:

- Tab nav pills have `border-radius: 8px` (control token)
- Tab card panels have `border-radius: 18px` (panel token)
- Buttons (`Guardar`, `Guardar cambios`, `Guardar perfil`, `Guardar configuración`, `Eliminar`) have `border-radius: 8px`
- Onboarding wizard modal: panel radius 18px, soft shadow
- Data tiles in Swarm tab: radius 18px, soft shadow
- Danger tab: card uses `panelStyle({ tone: 'danger' })` natively (red border, no override)

**Rollback**: revert the single commit; `borderRadius: 0` overrides return. No data migration, no DB changes, no API changes.

### PR-2: Routing + deprecation cleanup

**Goal**: remove the App-Router `src/app/settings/appearance/page.jsx` and the `SettingsLayoutRouter`, mount `Ajustes.jsx` at `/settings/appearance` as the canonical surface, point the sidebar back to `/ajustes`, drop the legacy redirect.

**Files**:

- `src/App.js` — replace `<Route path="settings/*" element={<SettingsLayoutRouter />}>` block with `<Route path="ajustes" element={<Ajustes />}>` (and delete the `ajustes → settings/appearance` redirect at line 418); drop imports of `SettingsLayoutRouter`, `AppearancePage`, `AccountPage`, `LLMProvidersPage`.
- `src/components/WorkspaceSidebar.jsx:211-214` — change settings link to `/project/${id}/ajustes`.
- `src/components/UserProfile.jsx:56-58` — change `account` settings nav to `/project/${projectId}/ajustes` (or open a future account sub-tab — see open questions).
- `src/components/settings/SettingsLayoutRouter.jsx` — delete file.
- `src/components/settings/__tests__/SettingsLayoutRouter.test.jsx` — delete file.
- `src/app/settings/appearance/page.jsx` — delete file.
- `src/app/settings/appearance/__tests__/page.test.jsx` — delete file.
- `src/app/settings/layout.jsx`, `src/app/settings/account/page.jsx`, `src/app/settings/llm-providers/page.jsx` — decide: keep (dead code) or delete. Recommend delete since `App.js` no longer mounts them.
- `src/__tests__/App.routes.test.jsx` — rewrite the regexes to expect `import Ajustes from './views/Ajustes'` and `<Route path="ajustes" element={<Ajustes />}>`; drop the `ajustes → ../settings/appearance` redirect assertion.
- `tests/unit/terminal-renderer-default-settings-ui.test.js` — **only keep if** the terminal renderer select, typography, header style, restore policies, accent bar, and zoom are migrated to `Ajustes.jsx` (see Open Question 2). Otherwise delete the test or rewrite it to scan Ajustes.
- `tests/e2e/09_settings_morphology.spec.ts` — rewrite to navigate to `/#/project/${PROJECT_ID}/ajustes`, assert `data-testid="ajustes-morphology-option-cursor"` is visible, and drop the `/ajustes → /settings/appearance` redirect test.
- `skills/devhub-morphology/SKILL.md` — drop the line "wire it into both `src/app/settings/appearance/page.jsx` and `src/views/Ajustes.jsx`" → becomes "wire it into `src/views/Ajustes.jsx`".
- `openspec/specs/settings-route-canonicalization/spec.md` — archive the spec (it conflicts with the new direction) or rename the file and supersede its requirements.

**Estimated diff size**: ~500-800 lines (one ~210 LOC file deleted, one ~1106 LOC file deleted, two test files deleted, App.js and WorkspaceSidebar rewritten, e2e/spec rewrites).

**Rollback**: revert the commit. `SettingsLayoutRouter` returns, sidebar flips back, App-Router page is reachable again. No data migration.

## Risks

1. **Lost functionality from the new page**: the App-Router page exposes terminal renderer mode, terminal typography (font/weight/line height/letter spacing), terminal header style, accent bar, restore policies, and zoom level. The legacy `Ajustes.jsx` does **not** have any of these. If the user just wants visual alignment and is OK losing terminal-specific settings, this is a regression for whoever relied on the new page between cursor-morphology PR-2 and now. Must confirm with the user before PR-2 lands (see Open Question 2).
2. **`Ajustes.jsx` was deliberately made brutalist**: lines 165-199 ship `borderRadius: 0` overrides on `getSettingsShellStyle/Control/Accent` with a comment-implied intent (the legacy brutalist-stage was the original target). Removing the overrides means the default morphology (which has its own panel radius) will look different than before for users on `default` morphology. The morphology-system spec already says default is square; if the project wants square under default, the user needs to either keep the overrides for default only, or change the default token values.
3. **Test coverage gap**: `src/views/__tests__/Ajustes.test.jsx` lines 188-193 hardcode the assertion `appearanceShellStyle.background).not.toContain('var(--surface-card)')` and `appearanceShellStyle.borderColor).toBe('var(--chrome-border-color)')`. After removing `getSettingsShellStyle`, that test will break; the rewrite must check the new factory (or the inline call site).
4. **OpenSpec spec conflict**: `openspec/specs/settings-route-canonicalization/spec.md` (written by cursor-morphology) is now obsolete but not yet archived. If `sdd-archive` runs against it before this change ships, it will re-encode the wrong routing rules.
5. **The cursor morphology is itself newly landed**: PR-1 of `cursor-morphology` shipped only weeks ago. Its visual choices (18px panel radius, 8px control radius, soft shadow) are untested at scale across the rest of the app. Restyling all 7 Ajustes tabs to use it is the first major surface relying on it; expect to discover visual issues (e.g., the Onboarding wizard modal may look too soft now that the 4px hard shadow is gone).

## Open Questions

1. **Default morphology under Ajustes**: do you want Ajustes to look like the **cursor** chrome (rounded, soft shadow) for everyone, or only when `data-morphology='cursor'` is active? The `chromeSurfaceStyle` factory already varies by `--chrome-*` tokens per morphology, so removing the `borderRadius: 0` overrides is the right move. But the user should confirm they are OK with the default morphology (square) looking different from brutalist-stage.
2. **Terminal-specific settings**: the new `page.jsx` is the only place terminal renderer mode, terminal typography, header style, accent bar, restore policies, and zoom level are exposed. Do you want to (a) drop them entirely, (b) merge them into `Ajustes.jsx` as a new "Terminal" sub-tab or under the existing "Apariencia" tab, or (c) keep `page.jsx` only for the terminal section and route appearance → `Ajustes.jsx`? The user's prompt only says "Restyle the legacy Ajustes.jsx" and "Deprecate the new page.jsx", which suggests (a) — but (a) is a functional regression.
3. **`UserProfile.jsx` account nav target**: after PR-2, where should the account button navigate? `/ajustes` (everything in one surface), or do we keep a separate account route? Currently `UserProfile.jsx:56-58` points to `/project/${projectId}/settings/account`, which becomes a 404 after `App.js` no longer mounts `AccountPage`.
4. **OpenSpec settings-route-canonicalization spec**: archive it, supersede it with a new `ajustes-routing-revert` spec, or leave it as-is? The change introduces a direct contradiction.

## Ready for Proposal

Yes. The exploration surfaced a clear two-PR slice with one open question (Q2: terminal settings) that the orchestrator should resolve with the user before `sdd-propose` finalizes scope. PR-1 (visual restyle) is safe to ship independently of PR-2's open question because it does not change routing. PR-2 depends on the answer to Q2 before tasks can be enumerated.
