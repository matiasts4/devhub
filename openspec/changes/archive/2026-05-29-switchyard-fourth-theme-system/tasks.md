# Tasks: switchyard-fourth-theme-system

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 300–380 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | single-pr-default |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Full Switchyard morphology + palette axis | PR 1 | All 5 files in one PR; no branch switch; stay on current branch |

## Phase 1: Foundation — themes.js constants and palette functions

- [ ] 1.1 Add `SWITCHYARD: 'switchyard'` to `MORPHOLOGIES` in `src/lib/theme/themes.js`
- [ ] 1.2 Add Switchyard entry to `MORPHOLOGY_OPTIONS` with label `"Switchyard"` and teal description
- [ ] 1.3 Add `PALETTES = { MINERAL, COBALT, ALLOY }`, `PALETTE_OPTIONS`, `PALETTE_STORAGE_KEY` constants
- [ ] 1.4 Add `normalizePalette()`, `getStoredPalette()`, `setStoredPalette()`, `applyPaletteToDocument()`, `setPalette()` functions mirroring the accent pattern
- [ ] 1.5 Verify all new exports match the interfaces documented in design.md

## Phase 2: Core — CSS token block and morphology factory

- [ ] 2.1 Add `[data-morphology='switchyard']` token block in `src/app/globals.css` after `[data-morphology='aura']` with 18px panel/12px control radii, teal border, and shadow
- [ ] 2.2 Add `[data-morphology='switchyard'] body[data-palette='cobalt']` and `body[data-palette='alloy']` override blocks with correct accent/glow values per spec
- [ ] 2.3 Add `panelStyle18(options)` factory in `src/chrome/morphology.js` — same as `panelStyle()` but with `borderRadius: '18px'` for panels (or extend `panelStyle()` to accept optional radius override)
- [ ] 2.4 Verify `chromeSurfaceStyle()` in `src/components/ui/chrome-surface.jsx` already reads `var(--chrome-radius-panel)` — no structural changes needed

## Phase 3: Integration — Settings UI with palette sub-picker

- [ ] 3.1 Import new palette exports in `src/app/settings/appearance/page.jsx`
- [ ] 3.2 Add Switchyard card to `MORPHOLOGY_OPTIONS` rendering in the Morphology section (renders automatically since it's in MORPHOLOGY_OPTIONS)
- [ ] 3.3 Add palette strip (Mineral / Cobalt / Alloy) conditionally rendered below morphology selector only when `activeMorphology === MORPHOLOGIES.SWITCHYARD`
- [ ] 3.4 Wire `handleSelectPalette(paletteId)` calling `setPalette()` and updating local `activePalette` state; palette strip hidden otherwise
    - Test: `body[data-palette]` attribute changes on palette selection
    - Test: palette strip does not render when morphology is Default/Brutalist Stage/Aura

## Phase 4: Testing

- [ ] 4.1 Add test in `src/lib/theme/__tests__/themes.test.js`: "exposes switchyard as fourth morphology option" — extend existing first-class morphology test to include SWITCHYARD in `MORPHOLOGY_OPTIONS` arrayContaining
- [ ] 4.2 Add test: `normalizePalette()` normalizes valid values and falls back to `PALETTES.MINERAL`
- [ ] 4.3 Add test: `setPalette()` persists to localStorage via `PALETTE_STORAGE_KEY`
- [ ] 4.4 Add test: `applyPaletteToDocument()` sets `document.body data-palette` attribute (note: body, not documentElement — matches design)
- [ ] 4.5 Add test: `PALETTE_OPTIONS` includes MINERAL, COBALT, ALLOY each with correct `primary` color value
