# Proposal: Switchyard as Fourth Morphology

## Intent

Promote the Switchyard preview (`public/previews/devhub-command-switchyard.html`) to a first-class **morphology** in DevHub's appearance system, making it a selectable option in Settings alongside Default, Brutalist Stage, and Aura. The work is additive and contained — same-shell architecture, no structural rework.

## Scope

### In Scope
- Add `SWITCHYARD` to the `MORPHOLOGIES` registry and `MORPHOLOGY_OPTIONS` in `themes.js`
- Define the Switchyard `[data-morphology='switchyard']` token block in `globals.css` — 18px panel radius, teal accent, grid background CSS, glow shadow system — using the preview's Mineral Teal palette as default values
- Augment `morphology.js` to produce Switchyard-consistent style objects (18px radius) and extend `chrome-surface.jsx` to accept the 18px-panel radius without breaking other morphologies
- Wire `data-palette` attribute (existing infrastructure) **`body[data-palette='mineral|cobalt|alloy']`** as the palette-axis inside Switchyard — Mineral Teal as default, Cobalt Relay and Alloy Sand as alternate color directions
- Add `SWITCHYARD` to the morphology selector in Settings → Appearance

### Out of Scope
- New accent colors beyond the three Switchyard-named palettes
- New widget types or UX patterns
- Migrating any hardcoded components to use `morphology.js` factories

## Capabilities

### New Capabilities
- `switchyard-visual-system`: Switchyard morphology with Mineral Teal (default), Cobalt Relay, and Alloy Sand palettes — expressed as `data-palette` inside `[data-morphology='switchyard']`

### Modified Capabilities
- `morphology-system-refactor` (existing): Extended to support a fourth morphology (switchyard) and 18px-radius panel handling in shared primitives

## Approach

**Same-shell pattern.** Per the Brutalist Stage handoff, add Switchyard as a new `[data-morphology='switchyard']` block in `globals.css` under the existing three. The preview's `body[data-palette='mineral|cobalt|alloy']` CSS maps cleanly to a `data-palette` attribute on `<body>` — `applyThemeToDocument` already supports multi-attribute wiring.

CSS work:
```css
[data-morphology='switchyard'] {
  --chrome-radius-panel: 18px;
  --chrome-radius-control: 12px;
  --chrome-border-width: 1px;
  --chrome-border-color: rgba(99, 208, 194, 0.18);
  --chrome-shadow-panel: 0 18px 30px rgba(0,0,0,0.34), inset 0 1px 0 rgba(228,255,251,0.05);
  /* Mineral teal as default tokens */
  --accent-primary: #63d0c2;
  --accent-glow: rgba(99, 208, 194, 0.16);
}
body[data-palette='cobalt']  { --accent-primary: #7a93ff; --accent-glow: rgba(122,147,255,0.16); }
body[data-palette='alloy']   { --accent-primary: #d4a16a; --accent-glow: rgba(212,161,106,0.16); }
```

JS work: `themes.js` (constant + option), `morphology.js` (new factory for 18px panels), `chrome-surface.jsx` (pass 18px radius through), `settings/appearance/page.jsx` (add option).

**Palette-axis framing:** Mineral / Cobalt / Alloy are **named palette variations inside Switchyard** — the user selects them from a sub-palette picker that only appears when Switchyard is active. They are NOT four separate morphologies.

## Affected Areas

| Area | Impact | Description |
|-----|--------|-------------|
| `src/lib/theme/themes.js` | Modified | Add `SWITCHYARD` to MORPHOLOGIES + MORPHOLOGY_OPTIONS |
| `src/app/globals.css` | Modified | Add `[data-morphology='switchyard']` block + `body[data-palette]` variants |
| `src/chrome/morphology.js` | Modified | Add `panelStyle18()` factory or extend existing for 18px radius |
| `src/components/ui/chrome-surface.jsx` | Modified | Handle `--chrome-radius-panel: 18px` without breaking other morphologies |
| `src/app/settings/appearance/page.jsx` | Modified | Add Switchyard to morphology selector UI |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|-----------|
| 18px radius bleeds into non-Switchyard components | Low | Token-only change; `chrome-surface.jsx` uses `var(--chrome-radius-panel)` which reads the morphology CSS block |
| Palette switcher not visible to user | Med | Add a visible palette-picker strip in Settings when Switchyard is active |

## Rollback Plan

1. Revert `themes.js` — remove SWITCHYARD from `MORPHOLOGIES` and `MORPHOLOGY_OPTIONS`
2. Delete the `[data-morphology='switchyard']` block from `globals.css`
3. Revert `morphology.js` and `chrome-surface.jsx` to pre-change state
4. Settings page reverts to showing only three options

All four files are atomic; rollback is file-level reverting with no cross-file side effects.

## Dependencies

- `public/previews/devhub-command-switchyard.html` — reference for token values and layout language
- `openspec/changes/morphology-system-refactor/proposal.md` — establishes the existing three-morphology pattern

## Success Criteria

- [ ] Four morphologies selectable in Settings → Appearance → Morphology
- [ ] `data-morphology='switchyard'` renders with 18px panels and teal accent on Mineral palette
- [ ] Switching `body[data-palette]` between Mineral/Cobalt/Alloy while Switchyard is active swaps accent colors
- [ ] All three existing morphologies continue to render identically after the change
- [ ] `src/lib/theme/__tests__/themes.test.js` passes with new SWITCHYARD constant
- [ ] Single PR, under 800-line review budget
