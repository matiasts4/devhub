# Design: switchyard-fourth-theme-system

## Technical Approach

Promote Switchyard as the fourth morphology via the same-shell pattern used for Aura and Brutalist Stage. Add `SWITCHYARD` to `MORPHOLOGIES` + `MORPHOLOGY_OPTIONS` in `themes.js`, define `[data-morphology='switchyard']` token block in `globals.css`, wire storage/persistence, and add the option to the Settings UI.

The mineral/cobalt/alloy palette sub-axis lives inside Switchyard only — expressed via `document.body.setAttribute('data-palette', paletteId)` with its own storage key, normalization, and CSS block. This keeps palette and morphology as two independent axes that cross only inside the Switchyard morphology block.

## Architecture Decisions

### Decision 1: Token model — morphology tokens vs theme tokens vs palette sub-axis

**Choice**: Three-layer token model with clear scoping.

| Token layer | Attribute | Example |
|---|---|---|
| Morphology tokens | `data-morphology` | `--chrome-radius-panel: 18px`, `--chrome-shadow-panel` |
| Theme tokens (existing) | `data-theme` | `--accent-primary`, `--surface-*`, `--text-*` |
| Palette sub-axis (new) | `data-palette` inside switchyard | `--accent: #63d0c2` (mineral), `--accent: #7a93ff` (cobalt) |

**Rationale**: Palette sub-axis tokens must NOT leak into other morphologies. Scoping them to `[data-morphology='switchyard'] body[data-palette='mineral']` ensures mineral/cobalt/alloy only apply when Switchyard is active.

### Decision 2: Palette persistence — separate storage key vs extending existing accent

**Choice**: New `PALETTE_STORAGE_KEY` + `PALETTES` + `PALETTE_OPTIONS` in `themes.js`.

**Alternatives considered**: Could reuse `ACCENTS` axis for mineral/cobalt/alloy. Rejected because accent options are user-visible standalone choices that apply regardless of morphology; palette variants are Switchyard-internal and only make sense inside that morphology context.

**Rationale**: Clean orthogonal axes. Adding to ACCENTS would confuse the "accent signal" settings section which implies independent override, not morphology-scoped variant.

### Decision 3: CSS block structure — palette overrides inside morphology block

**Choice**:
```css
[data-morphology='switchyard'] {
  --chrome-radius-panel: 18px;
  --chrome-radius-control: 12px;
  --chrome-border-width: 1px;
  --chrome-border-color: rgba(99, 208, 194, 0.18);
  --chrome-shadow-panel: 0 18px 30px rgba(0,0,0,0.34), inset 0 1px 0 rgba(228,255,251,0.05);
  --accent-primary: #63d0c2;
  --accent-glow: rgba(99, 208, 194, 0.16);
}
[data-morphology='switchyard'] body[data-palette='cobalt'] { --accent-primary: #7a93ff; --accent-glow: rgba(122,147,255,0.16); }
[data-morphology='switchyard'] body[data-palette='alloy'] { --accent-primary: #d4a16a; --accent-glow: rgba(212,161,106,0.16); }
```

**Rationale**: Selector chain `[data-morphology='switchyard'] body[data-palette='...']` restricts palette overrides to when Switchyard morphology is active. Mineral becomes the default (defined in the base `[data-morphology='switchyard']` block) — no palette attribute needed for the default.

## Data Flow

```
User selects Switchyard in Settings UI
  → handleSelectMorphology('switchyard')
  → setMorphology('switchyard')
  → setStoredMorphology('switchyard')        [localStorage key: devhub:morphology]
  → applyMorphologyToDocument('switchyard')  [document.documentElement data-morphology='switchyard']
  → browser matches [data-morphology='switchyard'] block → tokens apply

User selects Mineral/Cobalt/Alloy inside Switchyard panel
  → handleSelectPalette(paletteId)           [only rendered when activeMorphology === SWITCHYARD]
  → setStoredPalette(paletteId)              [localStorage key: devhub:palette]
  → applyPaletteToDocument(paletteId)        [document.body data-palette='mineral|cobalt|alloy']
  → browser matches [data-morphology='switchyard'] body[data-palette='mineral'] → palette tokens override
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/lib/theme/themes.js` | Modify | Add `SWITCHYARD` to `MORPHOLOGIES`, add to `MORPHOLOGY_OPTIONS`, add `PALETTES`/`PALETTE_OPTIONS`/`PALETTE_STORAGE_KEY`/`applyPaletteToDocument`/`setPalette`/`getStoredPalette`/`normalizePalette` |
| `src/app/globals.css` | Modify | Add `[data-morphology='switchyard']` block + `[data-morphology='switchyard'] body[data-palette='cobalt|alloy']` overrides |
| `src/app/settings/appearance/page.jsx` | Modify | Add Switchyard to `MORPHOLOGY_OPTIONS` rendering; add palette picker strip (mineral/cobalt/alloy) conditionally rendered when `activeMorphology === MORPHOLOGIES.SWITCHYARD` |
| `src/lib/theme/__tests__/themes.test.js` | Modify | Add test: "exposes switchyard as fourth morphology option"; add palette normalization tests |
| `openspec/changes/switchyard-fourth-theme-system/design.md` | Create | This document |

## Interfaces / Contracts

### New exports from `themes.js`

```js
// New constants
export const PALETTES = { MINERAL: 'mineral', COBALT: 'cobalt', ALLOY: 'alloy' };
export const PALETTE_OPTIONS = [
  { id: PALETTES.MINERAL, label: 'Mineral Teal',  description: 'Cold-mineral dark with teal accent.', primary: '#63d0c2' },
  { id: PALETTES.COBALT,  label: 'Cobalt Relay',   description: 'Blue accent, navy-dark surface.',   primary: '#7a93ff' },
  { id: PALETTES.ALLOY,   label: 'Alloy Sand',     description: 'Bronze accent, warm dark surface.', primary: '#d4a16a' },
];
export const PALETTE_STORAGE_KEY = 'devhub:palette';

// New functions (mirroring theme/morphology/accent pattern)
export function normalizePalette(value) { ... }
export function getStoredPalette() { ... }
export function setStoredPalette(palette) { ... }
export function applyPaletteToDocument(palette) { ... }
export function setPalette(palette) { ... }
```

### CSS token additions in `globals.css`

```css
[data-morphology='switchyard'] {
  --chrome-radius-panel: 18px;
  --chrome-radius-control: 12px;
  --chrome-border-width: 1px;
  --chrome-border-color: rgba(99, 208, 194, 0.18);
  --chrome-shadow-panel: 0 18px 30px rgba(0,0,0,0.34), inset 0 1px 0 rgba(228,255,251,0.05);
  --chrome-shadow-control: 0 8px 20px rgba(0,0,0,0.22);
  --chrome-panel-fill: color-mix(in srgb, var(--surface-card) 60%, var(--accent-primary) 6%);
  --chrome-panel-fill-emphasis: color-mix(in srgb, var(--surface-elevated) 55%, var(--accent-primary) 12%);
  --chrome-control-fill: color-mix(in srgb, var(--surface-card) 70%, var(--accent-primary) 5%);
  --chrome-control-fill-hover: color-mix(in srgb, var(--surface-elevated) 72%, var(--accent-primary) 8%);
  --chrome-press-offset: 0px;
  --accent-primary: #63d0c2;
  --accent-glow: rgba(99, 208, 194, 0.16);
}
[data-morphology='switchyard'] body[data-palette='cobalt'] { --accent-primary: #7a93ff; --accent-glow: rgba(122,147,255,0.16); }
[data-morphology='switchyard'] body[data-palette='alloy'] { --accent-primary: #d4a16a; --accent-glow: rgba(212,161,106,0.16); }
```

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | `normalizePalette`, `getStoredPalette`, `setPalette` | Jest, same pattern as `normalizeMorphology` tests |
| Unit | SWITCHYARD in MORPHOLOGIES, MORPHOLOGY_OPTIONS | Extend existing "exposes brutalist stage as first-class morphology option" test |
| Unit | PALETTE_OPTIONS includes mineral/cobalt/alloy | New test |
| Integration | CSS token resolution for switchyard + palette combos | Manual verification: apply switchyard + each palette, verify accent color changes |
| E2E | Settings UI renders four morphology options | Playwright, `data-testid='appearance-morphology-option-switchyard'` |

## Migration / Rollout

No migration required. Switchyard palette defaults to mineral on first selection. Existing users keep their current morphology; no forced switch.

Rollback: remove SWITCHYARD from `MORPHOLOGIES` + `MORPHOLOGY_OPTIONS`, delete the `[data-morphology='switchyard']` block from `globals.css`, remove palette exports from `themes.js`, revert Settings UI. All file-level, no cross-file side effects.

## Open Questions

- [ ] **Font loading**: Switchyard preview uses Chakra Petch + IBM Plex Mono. Proposal does not include font-scoping; if the morphology should also carry font pair changes, that requires additional `--font-family-*` tokens and Google Fonts load verification. Recommended: defer font scoping to a follow-up change; use existing Geist + JetBrains Mono for now.
- [ ] **Palette picker UX**: The Settings UI currently has no two-axis picker. The palette strip (mineral/cobalt/alloy) will be added below the Switchyard morphology card, visible only when Switchyard is active. Recommended approach but not yet prototyped.
- [ ] **Shimmer pseudo-elements**: The Switchyard preview uses `::after` diagonal highlight sweeps on card surfaces. Aura also uses shimmer pseudo-elements. Need to verify whether Switchyard's shimmer conflicts with or reuses Aura's approach.

## Implementation Slices (Single PR on current branch)

1. **`themes.js`**: Add SWITCHYARD to MORPHOLOGIES + MORPHOLOGY_OPTIONS; add PALETTES/PALETTE_OPTIONS/PALETTE_STORAGE_KEY + normalize/get/set/apply functions.
2. **`globals.css`**: Add `[data-morphology='switchyard']` block + palette overrides.
3. **`settings/appearance/page.jsx`**: Add Switchyard option card; add palette strip conditionally rendered for switchyard.
4. **`themes.test.js`**: Add tests for SWITCHYARD morphology option and new palette functions.

Expected total changed lines: ~380 (within 800-line budget). No chained PRs needed.