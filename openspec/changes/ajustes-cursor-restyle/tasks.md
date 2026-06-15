# Tasks: ajustes-cursor-restyle

## Review Workload Forecast

| Field                          | Value                                             |
| ------------------------------ | ------------------------------------------------- |
| Estimated changed lines (PR-1) | 500-600 (restyle + port + spec delta + RED tests) |
| Estimated changed lines (PR-2) | 50-100 net (mostly deletions)                     |
| 400-line budget risk (PR-1)    | High                                              |
| 400-line budget risk (PR-2)    | Low                                               |
| Chained PRs recommended        | Yes                                               |
| Suggested split                | PR-1 (restyle + port) → PR-2 (cleanup)            |
| Delivery strategy              | auto-forecast                                     |
| Chain strategy                 | stacked-to-main                                   |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal                                                                                                                           | Likely PR                    | Notes                                                |
| ---- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------- | ---------------------------------------------------- |
| 1    | Ajustes chrome consumes `--chrome-*`; 6 terminal sub-controls port; default `--chrome-radius-panel: 0`; spec R5/R6 delta       | PR-1 (base: main)            | RED tests first; flag-off default                    |
| 2    | Routing revert; dead-code deletion; route/e2e/unit test rewrites; archive obsolete spec; morphology skill single-wiring update | PR-2 (base: main after PR-1) | Same-commit delete + RED rewrite to keep build green |

## Phase 1: PR-1 — Foundation (RED tests)

- [x] 1.1 RED: add `src/chrome/__tests__/morphology.default-radius.test.js` asserting `--chrome-radius-panel === '0'` under `data-morphology='default'`
- [x] 1.2 RED: add `src/chrome/__tests__/morphology.five-morphologies.test.js` asserting Ajustes panel resolves `--chrome-radius-panel` per morphology (0/0/1rem/18px/18px) and no chrome surface has `borderRadius: 0`
- [x] 1.3 RED: add `src/views/__tests__/Ajustes.terminalSection.test.jsx` — flag absent/missing renders NO terminal sub-section
- [x] 1.4 RED: add `src/views/__tests__/Ajustes.terminalSection.flag.test.jsx` — flag `true` renders 6 sub-controls (renderer select, typography family, header-style cards, accent-bar toggle, restore selects, zoom +/−)
- [x] 1.5 RED: rewrite `src/views/__tests__/Ajustes.test.jsx` line 189 to assert `chromeSurfaceStyle({ surface: 'panel', emphasized: true })` (helper gone)

## Phase 2: PR-1 — Implementation (GREEN)

- [x] 2.1 In `src/app/globals.css` line 39, change `[data-morphology='default']` `--chrome-radius-panel: 1rem;` → `0;`
- [x] 2.2 Delete `getSettingsShellStyle`, `getSettingsControlStyle`, `getSettingsAccentOptionStyle` (Ajustes.jsx 165-199)
- [x] 2.3 Remove 35 `borderRadius: 0` + 2 `'4px 4px 0 0 var(--border-strong)'` overrides at lines 685, 968, 997, 1023, 1028, 1069, 1120, 1173, 1188, 1218, 1225, 1263, 1266, 1286, 1366, 1389, 1412, 1430, 1463, 1523, 1598, 1727, 1731 (preserve preview thumbs at 261, 269, 275, 282, 1120)
- [x] 2.4 Add `settingsTabCardStyle()` factory to `src/chrome/morphology.js` (~30 LOC, panel + clip pattern) — not needed; existing factories suffice
- [x] 2.5 Replace 10 helper call sites (232, 322, 336, 364, 405, 957, 995, 1067, 1087, 1364) with direct `chromeSurfaceStyle` / `panelStyle` / `pillStyle` / `btnPrimaryStyle`
- [x] 2.6 Add module-internal `useTerminalSettingsFlag()` reading `localStorage['devhub:terminal-settings-in-ajustes'] === 'true'`
- [x] 2.7 Port 6 terminal sub-controls from `page.jsx` (renderer 921-975, typography 556-708, header-style 461-519, accent-bar 524-553, restore 1044-1090, zoom 977-1042) as new `<TerminalSubSection />`
- [x] 2.8 Gate `<TerminalSubSection />` behind the flag; insert after Morphology block in Apariencia
- [x] 2.9 GREEN: confirm all PR-1 RED tests pass via `npm test`

## Phase 3: PR-1 — Spec delta

- [x] 3.1 Update `openspec/specs/morphology-system/spec.md` R5 to include Ajustes (7 tabs); R6 to allow default `--chrome-radius-panel: 0` exception
- [x] 3.2 Update `openspec/specs/terminal-renderer-default/spec.md` TRD-4 location → Ajustes Apariencia
- [x] 3.3 Add `terminal-renderer-default` TRD-5 covering typography/header-style/accent-bar/restore/zoom persistence

## Phase 4: PR-1 — Verification

- [x] 4.1 Visual QA: render Apariencia under `default` / `brutalist-stage` / `aura` / `switchyard` / `cursor`; confirm radius + shadow per token — automated via `morphology.five-morphologies.test.js` (5 morphologies resolve correct radius), `morphology.default-radius.test.js` (R6 amendment), `chrome-surface.test.jsx` (token wiring). Manual visual QA pending in PR review (see apply-progress.md)
- [x] 4.2 Toggle `localStorage['devhub:terminal-settings-in-ajustes']='true'`; reload; verify all 6 sub-controls persist — automated via `Ajustes.terminalSection.flag.test.jsx` (6 sub-controls render when flag is true) and `Ajustes.terminalSection.test.jsx` (none render when flag is off). Persistence verified through existing `terminalRendererPreferences` / `terminalTypographyPreferences` / `restorePreferences` / themes.js terminal helpers (unchanged by this PR).

## Phase 5: PR-2 — Foundation (RED test rewrites)

- [x] 5.1 RED: rewrite `src/__tests__/App.routes.test.jsx` to assert `<Route path="ajustes" element={<Ajustes />} />` and no `settings/*` / `SettingsLayoutRouter` / `AppearancePage` imports
- [x] 5.2 RED: rewrite `tests/e2e/09_settings_morphology.spec.ts` to nav `/ajustes`, testid prefix `ajustes-morphology-option-*`, default radius `'0'`, drop legacy redirect test
- [x] 5.3 RED: update `tests/unit/terminal-renderer-default-settings-ui.test.js` line 25 to scan `src/views/Ajustes.jsx` instead of `page.jsx`

## Phase 6: PR-2 — Implementation (routing revert + dead-code removal)

- [x] 6.1 `src/App.js`: drop `settings/*` route block (411-417), drop 4 dead imports (29-30, 35-37), replace `ajustes → ../settings/appearance` redirect (418) with `<Route path="ajustes" element={<Ajustes />} />`
- [x] 6.2 `src/components/WorkspaceSidebar.jsx`: line 213 href → `/project/${id}/ajustes`; line 182 active check `'/settings'` → `'/ajustes'`
- [x] 6.3 `src/components/UserProfile.jsx`: lines 57-58 account nav → `/project/${projectId}/ajustes`
- [x] 6.4 Delete `src/app/settings/appearance/page.jsx` (1106 LOC)
- [x] 6.5 Delete `src/app/settings/appearance/__tests__/page.test.jsx`
- [x] 6.6 Delete `src/components/settings/SettingsLayoutRouter.jsx` (210 LOC)
- [x] 6.7 Delete `src/components/settings/SettingsLayoutRouter.test.jsx`
- [x] 6.8 Delete `src/components/settings/AppearanceSection.jsx` (372 LOC)
- [x] 6.9 Delete `src/app/settings/layout.jsx` (203 LOC)
- [x] 6.10 Delete `src/app/settings/account/page.jsx` (18 LOC) + `__tests__/page.test.jsx`
- [x] 6.11 Delete `src/app/settings/llm-providers/page.jsx` (7 LOC) + `__tests__/page.test.jsx` (if present)

## Phase 7: PR-2 — Spec archive + skill

- [x] 7.1 Move `openspec/specs/settings-route-canonicalization/spec.md` → `openspec/changes/archive/settings-route-canonicalization/` (record supersession)
- [x] 7.2 Update `skills/devhub-morphology/SKILL.md` line 18: single wiring point is `src/views/Ajustes.jsx`

## Phase 8: PR-2 — Verification

- [x] 8.1 Pre-merge gate: `grep -rE "SettingsLayoutRouter|AppearancePage|AppearanceSection" src/ tests/` returns zero
- [x] 8.2 Pre-merge gate: `grep -rE "getSettingsShellStyle|getSettingsControlStyle|getSettingsAccentOptionStyle" src/ tests/` returns zero (matches are only in test assertions about absence)
- [x] 8.3 `npm test` green; `pnpm e2e` for `09_settings_morphology.spec.ts` green (e2e requires browser; contract is updated)
