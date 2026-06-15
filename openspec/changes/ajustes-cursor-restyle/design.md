# Design: ajustes-cursor-restyle

## Technical Approach

Two PRs. **PR-1** restyles `src/views/Ajustes.jsx` (1758 LOC) to consume `chromeSurfaceStyle()` / `panelStyle()` / `pillStyle()` / `btnPrimaryStyle()` and the `--chrome-*` token layer directly, deletes the three local helpers, removes 35 `borderRadius: 0` overrides + 2 `4px 4px 0 0 var(--border-strong)` shadows, ports the 6 terminal sub-controls (renderer, typography, header style, accent bar, restore policies, zoom) from `page.jsx` into a new `Terminal` sub-section in the Apariencia tab, and amends the default-morphology block in `globals.css` so `--chrome-radius-panel: 0` (preserves the legacy square look). **PR-2** reverts the App-Router route block, drops the redirect, points `WorkspaceSidebar`/`UserProfile` back to `/project/:id/ajustes`, deletes dead code, rewrites the route/e2e/unit tests, and archives `openspec/specs/settings-route-canonicalization/spec.md`.

Composition over rewrite: every chrome site keeps its `panelStyle()` / `pillStyle()` / `chromeSurfaceStyle()` shape; the 3 helpers and 37 inline overrides are deleted at the call sites, not refactored. Terminal sub-controls port by lifting the existing render blocks (not rewriting them) and embedding them in Apariencia behind a `devhub:terminal-settings-in-ajustes` localStorage flag.

## Architecture Decisions

| Decision | Choice | Alternative | Rationale |
|---|---|---|---|
| Default radius after restyle | `--chrome-radius-panel: 0` in `[data-morphology='default']` | Keep `1rem` and accept drift | Preserves legacy square Ajustes look. R6 amendment scoped to one token. |
| 6 sub-controls placement | Apariencia tab, after Morphology, behind `devhub:terminal-settings-in-ajustes` | Separate "Terminal" top-level tab | Spec R3 groups terminal under Apariencia. Flag gates risk. |
| 3 local helpers | **Delete** outright | Keep wrappers delegating to factories | Proposal mandate; kills the "do not copy to other morphologies" pitfall. |
| 35 radius + 2 shadow overrides | Delete at the call site; rely on `--chrome-radius-panel` / `--chrome-shadow-panel` | Replace with `brutalPanelStyle` calls | Token layer is the single source of truth. |
| Page.jsx test (`page.test.jsx`) | Delete with `page.jsx` in PR-2 | Migrate to scan Ajustes | Test scans factories that go away with the file. |
| `LLMProviderSettings` import | Keep in Ajustes (R8 covers it) | Move to dead-code slice | Backs the working `LLM` tab; out of scope. |
| Archive order | PR-2 final commit moves spec to `openspec/changes/archive/` | Block sdd-archive via inbox | PR-2 already changes the source-of-truth. |
| Flag semantics | `false` (default) → 6 sub-controls hidden; pre-existing Apariencia intact. `true` → render `<TerminalSubSection />` | Branch per sub-control | One boolean, one render site. |

## File Changes — PR-1 (restyle + port)

| File | Action | Description |
|---|---|---|
| `src/views/Ajustes.jsx` | Modify (~-85/+260 LOC) | See "Ajustes.jsx refactor" and "Terminal sub-control port" sections below. |
| `src/chrome/morphology.js` | Modify (+0) | No factory changes — `panelStyle`, `pillStyle`, `btnPrimaryStyle`, `chromeSurfaceStyle` already wire `--chrome-*`. |
| `src/app/globals.css` | Modify (+1/-1) | In `[data-morphology='default']` (line 39): change `--chrome-radius-panel: 1rem;` to `--chrome-radius-panel: 0;`. All other default tokens stay. |
| `src/views/__tests__/Ajustes.test.jsx` | Modify | Drop `getSettingsShellStyle({ emphasized: true })` assertion (line 189); assert `chromeSurfaceStyle({ surface: 'panel', emphasized: true })` instead. |

### Ajustes.jsx refactor (PR-1)

**Delete the 3 helpers (lines 165-199):** `getSettingsShellStyle`, `getSettingsControlStyle`, `getSettingsAccentOptionStyle`. Replace their 10 call sites (lines 232, 322, 336, 364, 405, 957, 995, 1067, 1087, 1364, 1727, 1731) with direct `chromeSurfaceStyle({ surface, emphasized, tone })` / `panelStyle({...})` / `pillStyle({...})` / `btnPrimaryStyle({...})` calls.

**Delete 35 `borderRadius: 0` + 2 `4px 4px 0 0 var(--border-strong)` overrides** at lines: 171, 179, 196 (in deleted helpers — moot), 685, 968, 997, 1023, 1028, 1069, 1120, 1173, 1188, 1218, 1225, 1263, 1266, 1286, 1366, 1389, 1412, 1430, 1463, 1523, 1598 (chrome surfaces — delete the key; parent already provides the token). The 5 theme-card preview inner blocks at 261, 269, 275, 282, 1120 are decoration, not chrome — **keep** as deliberate square preview thumbnails. The 2 `4px 4px 0 0` shadows at 366 (OnboardingWizard modal) and 1266 (Swarm KPI tile) are deleted; token already encodes the brutalist shadow under `brutalist-stage`.

**Add the flag gate** (new helper inside Ajustes.jsx, not exported):

```js
function useTerminalSettingsFlag() {
  const [enabled] = useState(
    typeof window !== 'undefined' &&
      window.localStorage.getItem('devhub:terminal-settings-in-ajustes') === 'true'
  );
  return enabled;
}
```

Insert `<TerminalSubSection />` after the Morphology block (line 1163, before `</ChromeSurface>` close at 1164). Gate the entire subtree: `{flag && <TerminalSubSection …/>}`.

### Terminal sub-control port (PR-1)

| Sub-control | `page.jsx` source range | Render shape to lift | Ajustes target |
|---|---|---|---|
| Renderer mode | 921-975 (markup) + 223-229 (handler) | `<select>` with `xterm-webgl` / `vte-experimental` / `xterm`; subtitle copy "xterm-webgl is the only active renderer…" | Inside `<TerminalSubSection>`, first row |
| Typography | 556-708 (markup) + 267-304 (handlers) | Sliders + selects; `TERMINAL_FONT_FAMILY_PRESETS`, `applyTerminalTypographyToDocument`, `CustomEvent('devhub:terminal-typography-changed')` | Inside `<TerminalSubSection>`, second row; mount listener once in `useEffect` |
| Header style | 461-519 (markup) + 239-252 (handler) | 4-card grid via `getTerminalHeaderStyleOptions()`; writes `data-terminal-header-style` on container | Inside `<TerminalSubSection>`, third row |
| Accent bar | 524-553 (markup) + 254-264 (handler) | Toggle; writes `data-terminal-accent-bar` on container | Inside `<TerminalSubSection>`, fourth row |
| Restore policies | 1044-1090 (markup) + 231-237 (handler) | 3 `<select>` rows (`opencode`, `generic`, `swarm`); `RESTORE_POLICY.AUTO/MANUAL/OFF` | Inside `<TerminalSubSection>`, fifth row |
| Zoom | 977-1042 (markup) + 186-189 (handler) | `+`/`−`/reset buttons + track bar; `getStoredZoom` / `setZoom` | Inside `<TerminalSubSection>`, sixth row |

## File Changes — PR-2 (cleanup + routing revert)

| File | Action | Description |
|---|---|---|
| `src/App.js` | Modify (~-12/+3) | Drop `SettingsLayoutRouter`/`AppearancePage`/`AccountPage`/`LLMProvidersPage` imports (lines 29-30, 35-37). Remove the entire `settings/*` route block (lines 411-417). Replace line 418 `<Route path="ajustes" element={<Navigate to="../settings/appearance" replace />} />` with `<Route path="ajustes" element={<Ajustes />} />` (and import `Ajustes` at top). |
| `src/components/WorkspaceSidebar.jsx` | Modify (-1/+1, line 213) | Revert: `href = \`/project/${project?.id}/ajustes\`` (drop the `/settings/appearance` path). Update active check at line 182 from `pathname?.includes('/settings')` → `pathname?.includes('/ajustes')`. |
| `src/components/UserProfile.jsx` | Modify (-1/+1, lines 57-58) | Revert account nav to `/project/${projectId}/ajustes`. |
| `src/app/settings/appearance/page.jsx` | **Delete** (1106 LOC) | Dead. |
| `src/app/settings/appearance/__tests__/page.test.jsx` | **Delete** | Tests dead code. |
| `src/components/settings/SettingsLayoutRouter.jsx` | **Delete** (210 LOC) | Dead. |
| `src/components/settings/SettingsLayoutRouter.test.jsx` | **Delete** | Tests dead code. |
| `src/components/settings/AppearanceSection.jsx` | **Delete** (372 LOC) | Dead (only mounted via `SettingsLayoutRouter`). |
| `src/app/settings/layout.jsx` | **Delete** (203 LOC) | Dead. |
| `src/app/settings/account/page.jsx` | **Delete** (18 LOC) | Dead. |
| `src/app/settings/account/__tests__/page.test.jsx` | **Delete** | Tests dead code. |
| `src/app/settings/llm-providers/page.jsx` | **Delete** (7 LOC) | Dead. |
| `src/app/settings/llm-providers/__tests__/page.test.jsx` | **Delete** (if exists) | Tests dead code. |
| `src/__tests__/App.routes.test.jsx` | Rewrite | Replace regex assertions (lines 21/27/35/52) with `import Ajustes from './views/Ajustes'` and `<Route path="ajustes" element={<Ajustes />} />`; assert `SettingsLayoutRouter`/`AppearancePage` are absent. |
| `tests/e2e/09_settings_morphology.spec.ts` | Rewrite | Change nav from `/#/project/${PROJECT_ID}/settings/appearance` to `/#/project/${PROJECT_ID}/ajustes`. Swap selector prefix `appearance-morphology-option-*` → `ajustes-morphology-option-*`. Update `MORPHOLOGY_BASELINES.default['--chrome-radius-panel']` from `'1rem'` to `'0'`. **Delete** the `legacy /ajustes route redirects` test at line 131. |
| `tests/unit/terminal-renderer-default-settings-ui.test.js` | Modify (line 25) | `path.resolve(__dirname, '../../src/app/settings/appearance/page.jsx')` → `path.resolve(__dirname, '../../src/views/Ajustes.jsx')`. |
| `openspec/specs/settings-route-canonicalization/spec.md` | **Archive** | Move to `openspec/changes/archive/settings-route-canonicalization/`. Final step of PR-2. |
| `skills/devhub-morphology/SKILL.md` | Modify (line 18) | Drop "and `src/views/Ajustes.jsx`" from the selector wiring rule — single wiring point is now Ajustes. |

**Pre-PR-2 gate** (run from repo root; both must return zero matches before commit):

```bash
grep -rE "SettingsLayoutRouter|AppearancePage|AppearanceSection" src/ tests/ --include="*.{js,jsx,ts,tsx}"
grep -rE "getSettingsShellStyle|getSettingsControlStyle|getSettingsAccentOptionStyle" src/ tests/
```

## Interfaces / Contracts

No new public APIs. Single localStorage key:

```
localStorage['devhub:terminal-settings-in-ajustes']: 'true' | undefined
```

`useTerminalSettingsFlag()` (defined above) is module-internal to Ajustes.jsx. The existing terminal preference storage keys (`devhub_terminal_renderer_default_mode`, `devhub_terminal_typography`, etc.) are unchanged — PR-1 only moves the *UI* surface.

## Testing Strategy (Strict TDD)

| Layer | RED File | Becomes GREEN when |
|---|---|---|
| Unit (chrome) | `src/chrome/__tests__/morphology.default-radius.test.js` — asserts `getComputedStyle(html).getPropertyValue('--chrome-radius-panel') === '0'` under `data-morphology='default'` | globals.css patch lands |
| Unit (chrome) | `src/chrome/__tests__/morphology.five-morphologies.test.js` — asserts Ajustes panel resolves per-morphology `--chrome-radius-panel` and has no `borderRadius: 0` on chrome surfaces (5× render under each morphology) | PR-1 refactor + visual QA |
| Component | `src/views/__tests__/Ajustes.terminalSection.flag.test.jsx` — flag `true` renders 6 sub-controls (renderer `<select data-testid="settings-terminal-renderer-select">`, typography family, header style cards, accent bar toggle, restore selects, zoom +/-) | PR-1 port + flag gate |
| Component | `src/views/__tests__/Ajustes.terminalSection.test.jsx` — flag absent/missing renders no terminal section (default) | PR-1 port + flag gate |
| Component (existing) | `src/views/__tests__/Ajustes.test.jsx` line 189 — migrate helper assertion to `chromeSurfaceStyle` | PR-1 refactor |
| Routes (unit) | `src/__tests__/App.routes.test.jsx` (rewrite as RED) — Ajustes mounted at `ajustes`; no `settings/*` route; no `SettingsLayoutRouter`/`AppearancePage` imports | PR-2 |
| E2E | `tests/e2e/09_settings_morphology.spec.ts` (rewrite as RED) — all 5 morphologies render Apariencia at `/ajustes`; sidebar nav works; no legacy redirect | PR-1 + PR-2 |
| Unit (terminal UI) | `tests/unit/terminal-renderer-default-settings-ui.test.js` (line 25 RED edit) — scan Ajustes, not page.jsx | PR-1 port + PR-2 deletion |

**Order**: RED files commit BEFORE implementation in both PRs. PR-2's RED rewrites ship in the same commit as the deletions so the build stays green throughout the cleanup.

## Migration / Rollout

1. **PR-1 ships with flag off** (default). Apariencia visually identical to today. RED test asserts gated section is hidden. Visual QA: render Apariencia under `default` / `brutalist-stage` / `aura` / `switchyard` / `cursor`; confirm no `borderRadius: 0` regression on chrome surfaces; confirm `4px 4px 0 0` shadow under `brutalist-stage` still rendered (via token, not override).
2. **Internal dogfood**: flip flag in dev via `localStorage.setItem('devhub:terminal-settings-in-ajustes', 'true')`. Validate all 6 sub-controls persist across reload.
3. **PR-2 lands**: routing revert + dead-code removal. Flag stays in for one minor version, then removal is a separate `sdd-explore`.
4. **Rollback**: PR-1 reverts with one commit (overrides return; terminal settings back in `page.jsx`). PR-2 reverts with one commit (`SettingsLayoutRouter` returns, sidebar flips back). No data migration, no schema, no backend.
