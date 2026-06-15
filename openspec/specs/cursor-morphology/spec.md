# Spec: cursor-morphology

> **Source of truth**: promoted from `openspec/changes/cursor-morphology/specs/cursor-morphology/spec.md` on 2026-06-14 (archive of `cursor-morphology`).
> **Status**: active. Owned by DevHub theme team.
> **Origin**: `cursor-morphology` Slice A.

## Purpose

Define the `cursor` morphology as a fifth, warmer, denser Cursor/Copilot-style devtools chrome. Token-driven, additive, and verified to leave the four pre-existing morphologies (`default`, `brutalist-stage`, `aura`, `switchyard`) unchanged.

## Requirements

### Requirement: CURSOR registry entry

The system MUST add `CURSOR: 'cursor'` to the `MORPHOLOGIES` constant in `themes.js`, and add a corresponding entry to `MORPHOLOGY_OPTIONS` with label `"Cursor"` and description matching its warm-amber, 18px-panel character.

**Files**: `src/lib/theme/themes.js`

#### Scenario: Cursor option appears in Morphology selector

- GIVEN the Appearance page is loaded
- WHEN the user views the Morphology section
- THEN `MORPHOLOGY_OPTIONS` includes a fifth entry for `MORPHOLOGIES.CURSOR`
- AND the label reads `"Cursor"`

---

### Requirement: `[data-morphology='cursor']` CSS token block in globals.css

The system MUST add a `[data-morphology='cursor']` token block in `globals.css` immediately after the existing four morphology blocks, defining:

```
--chrome-radius-panel: 18px;
--chrome-radius-control: 8px;
--chrome-border-width: 1px;
--chrome-border-color: color-mix(in srgb, var(--accent-primary) 22%, var(--border-subtle));
--chrome-shadow-panel: 0 14px 28px rgba(0, 0, 0, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.03);
--chrome-shadow-control: 0 4px 12px rgba(0, 0, 0, 0.18);
--chrome-panel-fill: color-mix(in srgb, var(--surface-card) 96%, var(--accent-primary) 4%);
--chrome-panel-fill-emphasis: color-mix(in srgb, var(--surface-elevated) 94%, var(--accent-primary) 6%);
--chrome-control-fill: color-mix(in srgb, var(--surface-card) 90%, transparent);
--chrome-control-fill-hover: color-mix(in srgb, var(--surface-elevated) 92%, transparent);
--chrome-press-offset: 0px;
--accent-primary: oklch(0.74 0.16 57);
--accent-glow: rgba(227, 179, 65, 0.16);
```

**Files**: `src/app/globals.css`

#### Scenario: Cursor tokens resolve correctly

- GIVEN `data-morphology='cursor'` is set on `document.documentElement`
- WHEN the browser resolves CSS variables
- THEN `--chrome-radius-panel` equals `18px`
- AND `--chrome-radius-control` equals `8px`
- AND `--accent-primary` equals `oklch(0.74 0.16 57)` (warm amber)

---

### Requirement: Cursor applies from Appearance and legacy Ajustes

The system MUST render the cursor option in both `src/app/settings/appearance/page.jsx` and `src/views/Ajustes.jsx`; selecting it on either page MUST call `setMorphology('cursor')`, which writes `data-morphology='cursor'` on `document.documentElement`.

**Files**: `src/app/settings/appearance/page.jsx`, `src/views/Ajustes.jsx`, `src/lib/theme/themes.js`

#### Scenario: Selection updates document in Appearance

- GIVEN the Appearance page is loaded
- WHEN the cursor morphology option is clicked
- THEN `setMorphology('cursor')` is called
- AND `html[data-morphology='cursor']` is set

#### Scenario: Selection updates document in Ajustes

- GIVEN the legacy Ajustes page is loaded
- WHEN the cursor morphology option is clicked
- THEN `setMorphology('cursor')` is called
- AND `html[data-morphology='cursor']` is set
