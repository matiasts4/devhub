# Tasks: Morphology System Refactor

## Review Workload Forecast

| Field                   | Value                                |
| ----------------------- | ------------------------------------ |
| Estimated changed lines | 500–650                              |
| 400-line budget risk    | High                                 |
| Chained PRs recommended | Yes                                  |
| Suggested split         | Single PR with exception-ok accepted |
| Delivery strategy       | ask-on-risk                          |
| Chain strategy          | pending                              |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal                                                                                      | Likely PR | Notes                                |
| ---- | ----------------------------------------------------------------------------------------- | --------- | ------------------------------------ |
| 1    | Core infrastructure: morphology.js refactor + globals.css aura block + themes.js registry | PR 1      | Foundation all other tasks depend on |
| 2    | Critical hardcode fixes: ProjectDashboard + Roadmap + SwarmTopologyGraph                  | PR 2      | Depends on PR 1                      |

## Phase 1: morphology.js Token Refactor

- [ ] 1.1 `src/chrome/morphology.js` — Refactor `panelStyle()` to use `var(--chrome-radius-panel)`, `var(--chrome-border-width)`, `var(--chrome-border-color)`, `var(--chrome-shadow-panel)`
- [ ] 1.2 `src/chrome/morphology.js` — Refactor `btnPrimaryStyle()`: replace hardcoded `borderRadius: '0'` with `var(--chrome-radius-control)`, `boxShadow: '3px 3px 0 0 var(--accent-shadow)'` with `var(--chrome-shadow-control)`
- [ ] 1.3 `src/chrome/morphology.js` — Refactor `btnSecondaryStyle()`: replace hardcoded `borderRadius: '0'` with `var(--chrome-radius-control)`, `boxShadow` with `var(--chrome-shadow-control)`
- [ ] 1.4 `src/chrome/morphology.js` — Verify `btnDangerStyle()` uses `var(--chrome-radius-control)` and `var(--chrome-shadow-control)` — flag if not compliant
- [ ] 1.5 `src/chrome/morphology.js` — Refactor `pillStyle()`: replace hardcoded `borderRadius: '0'` with `var(--chrome-radius-control)`
- [ ] 1.6 `src/chrome/morphology.js` — Review `progressFillStyle()`: verify `borderRadius: '2px'` is acceptable or replace with `var(--chrome-radius-control)` if appropriate
- [ ] 1.7 `src/chrome/morphology.js` — Deprecate or remove `brutalPanelStyle`, `brutalProgressTrackStyle` backward-compat wrappers if no external callers remain

## Phase 2: globals.css — Add Aura Morphology

- [ ] 2.1 `src/app/globals.css` — Add `[data-morphology='aura']` block with glassmorphism tokens: `--chrome-radius-panel: 1.25rem`, `--chrome-radius-control: 1rem`, `--chrome-border-width: 1px`, `--chrome-border-color: color-mix(in srgb, var(--accent-primary) 30%, transparent)`, `--chrome-shadow-panel` with accent glow, `--chrome-shadow-control`, `--chrome-panel-fill`, `--chrome-panel-fill-emphasis`, `--chrome-control-fill`, `--chrome-control-fill-hover`, `--chrome-press-offset: 0px`
- [ ] 2.2 `src/app/globals.css` — Verify `[data-morphology='default']` block has all spec token values: `--chrome-radius-panel: 1rem`, `--chrome-radius-control: 999px`, `--chrome-border-width: 1px`, etc.
- [ ] 2.3 `src/app/globals.css` — Verify `[data-morphology='brutalist-stage']` block has all spec token values: `--chrome-radius-panel: 0.5rem`, `--chrome-radius-control: 0.5rem`, `--chrome-border-width: 2px`, `--chrome-shadow-panel: 4px 4px 0 0 var(--border-strong)`, etc.

## Phase 3: themes.js — Add AURA Registry

- [ ] 3.1 `src/lib/theme/themes.js` — Add `AURA: 'aura'` to `MORPHOLOGIES` export
- [ ] 3.2 `src/lib/theme/themes.js` — Add `{ id: MORPHOLOGIES.AURA, label: 'Aura', ... }` to `MORPHOLOGY_OPTIONS`
- [ ] 3.3 `src/app/settings/appearance/page.jsx` — Verify `Aura` option renders in `MORPHOLOGY_OPTIONS` grid (should auto-render since it reads from the registry)

## Phase 4: ProjectDashboard Hardcode Fixes

- [ ] 4.1 `src/views/ProjectDashboard.jsx` — Remove local `brutalPanelStyle()` function definition
- [ ] 4.2 `src/views/ProjectDashboard.jsx` — Remove local `brutalPanelActiveStyle()` function definition
- [ ] 4.3 `src/views/ProjectDashboard.jsx` — Remove local `brutalBtnPrimaryStyle()` function definition
- [ ] 4.4 `src/views/ProjectDashboard.jsx` — Remove local `brutalProgressTrackStyle()` function definition
- [ ] 4.5 `src/views/ProjectDashboard.jsx` — Refactor `StatCard` to use `ChromeSurface` component instead of local brutalist style objects
- [ ] 4.6 `src/views/ProjectDashboard.jsx` — Update all `StatCard` usages to use `ChromeSurface` with `panelStyle()` from morphology.js imports

## Phase 5: Roadmap Hardcode Fixes

- [x] 5.1 `src/views/Roadmap.jsx` — Replace hardcoded `borderRadius: '0'`, `border: '2px solid var(--border-strong)'`, `boxShadow: '4px 4px 0px 0px var(--border-strong)'` on milestone card elements with `panelStyle()` from morphology.js imports
- [x] 5.2 `src/views/Roadmap.jsx` — Fix timeline dot styles to use morphology tokens instead of inline literals
- [x] **Roadmap.jsx borderRadius residuals** — `borderRadius: '0'` literals at lines 85 and 338 removed by `sdd/ui-professionalization` T10 (commit T10). Workspace section wrapper now derives from `getWorkspaceSectionSurfaceStyle({ emphasized: true })`; progress fill derives from `progressFillStyle()`. See `sdd/ui-professionalization/verify-report.md` and morphology verify-report cross-link.

## Phase 6: SwarmTopologyGraph Hardcode Fixes

- [ ] 6.1 `src/components/control-room/SwarmTopologyGraph.jsx` — Replace hardcoded `#27272a` with `var(--chrome-border-color)` token reference
- [ ] 6.2 `src/components/control-room/SwarmTopologyGraph.jsx` — Replace hardcoded `#141416` with `var(--chrome-panel-fill)` token reference
- [ ] 6.3 `src/components/control-room/SwarmTopologyGraph.jsx` — Replace hardcoded `4px 4px` box-shadow literals with `var(--chrome-shadow-panel)` token reference
- [ ] 6.4 `src/components/control-room/SwarmTopologyGraph.jsx` — Use `ChromeSurface` for node component backgrounds where applicable

## Phase 7: Verification

- [ ] 7.1 Run `document.documentElement.getAttribute('data-morphology')` check after switching morphologies
- [ ] 7.2 Verify `morphology.js` factory output contains only `var(--chrome-*)` tokens, no hardcoded border-radius or box-shadow literals
- [ ] 7.3 Playwright: switch to Aura morphology via settings, verify no console errors, verify CSS computed styles reflect `--chrome-*` tokens
- [ ] 7.4 Confirm `ProjectDashboard.jsx` has zero `brutalPanelStyle`, `brutalBtnPrimaryStyle` function calls after refactor
- [ ] 7.5 Confirm `SwarmTopologyGraph.jsx` has zero `#27272a` string occurrences after refactor
