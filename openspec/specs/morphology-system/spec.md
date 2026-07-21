# Spec: morphology-system

> **Source of truth**: originally promoted from `openspec/changes/switchyard-fourth-theme-system/spec.md` on 2026-05-29 (archive of `switchyard-fourth-theme-system`); updated on 2026-06-14 (archive of `cursor-morphology`) to add the `cursor` token block sibling and to broaden the no-regression invariant to cover all four pre-`cursor` morphologies; updated on 2026-07-19 (archive of `opencode-desktop-appearance`) to allow sixth morphology `opencode-desktop` and broaden no-regression to the five pre-`opencode-desktop` morphologies.
> **Status**: active. Owned by DevHub theme team.
> **Origin**: Switchyard Fourth Morphology; extended by `cursor-morphology` (R4 ADDED, R5 MODIFIED); extended by `opencode-desktop-appearance` (sixth slot + no-regression/factory invariants).

## Purpose

Define the morphology system: the registry, the per-morphology CSS token blocks, the chrome factory functions, the chrome primitives that consume them, and the no-regression invariant that keeps the five pre-`opencode-desktop` morphologies stable across future additions.

## Requirements

### Requirement: SWITCHYARD constant in MORPHOLOGIES registry

The system MUST add `SWITCHYARD: 'switchyard'` to the `MORPHOLOGIES` constant in `themes.js`, and add a corresponding entry to `MORPHOLOGY_OPTIONS` with label `"Switchyard"` and description describing its teal-accented, 18px-panel character.

**Files**: `src/lib/theme/themes.js`

#### Scenario: New Switchyard option appears in Morphology selector

- GIVEN the Appearance page is loaded
- WHEN the user views the Morphology section
- THEN `MORPHOLOGY_OPTIONS` includes a fourth entry for `MORPHOLOGIES.SWITCHYARD`
- AND the label reads `"Switchyard"`

---

### Requirement: `[data-morphology='switchyard']` CSS token block in globals.css

The system MUST add a `[data-morphology='switchyard']` token block in `globals.css` immediately after the existing three morphology blocks, defining:

```
--chrome-radius-panel: 18px;
--chrome-radius-control: 12px;
--chrome-border-width: 1px;
--chrome-border-color: rgba(99, 208, 194, 0.18);
--chrome-shadow-panel: 0 18px 30px rgba(0,0,0,0.34), inset 0 1px 0 rgba(228,255,251,0.05);
--accent-primary: #63d0c2;
--accent-glow: rgba(99, 208, 194, 0.16);
```

**Files**: `src/app/globals.css`

#### Scenario: Switchyard tokens resolve correctly

- GIVEN `data-morphology='switchyard'` is set on `document.documentElement`
- WHEN the browser resolves CSS variables
- THEN `--chrome-radius-panel` equals `18px`
- AND `--accent-primary` equals `#63d0c2`

---

### Requirement: Switchyard palette-axis via `body[data-palette='mineral|cobalt|alloy']`

The system MUST support three `body[data-palette]` values as Switchyard sub-variants. Each overrides `--accent-primary` and `--accent-glow` but has no effect unless `data-morphology='switchyard'` is also present:

| Palette | `--accent-primary` | `--accent-glow`          |
| ------- | ------------------ | ------------------------ |
| mineral | `#63d0c2`          | `rgba(99,208,194,0.16)`  |
| cobalt  | `#7a93ff`          | `rgba(122,147,255,0.16)` |
| alloy   | `#d4a16a`          | `rgba(212,161,106,0.16)` |

The Mineral value MUST be the default (applied without any `data-palette` attribute).

**Files**: `src/app/globals.css`

#### Scenario: Palette switcher changes accent inside Switchyard

- GIVEN `data-morphology='switchyard'` is active
- WHEN `body[data-palette='cobalt']` is set
- THEN `--accent-primary` resolves to `#7a93ff`
- AND glow effects use cobalt glow color

#### Scenario: Palette is inert when morphology is not Switchyard

- GIVEN `data-morphology='default'` (or Brutalist Stage or Aura) is active
- WHEN `body[data-palette='alloy']` is set
- THEN all Switchyard palette tokens are ignored
- AND the accent color follows the theme's own `--accent-primary`

---

### Requirement: 18px panel radius factory in morphology.js

The system MUST add a `panelStyle18(options)` factory function in `morphology.js` — identical in shape to `panelStyle()` but using `borderRadius: '18px'` for panels — OR extend the existing `panelStyle()` to accept an optional radius override that delegates to the CSS variable.

**Files**: `src/chrome/morphology.js`

#### Scenario: 18px radius applied to panel via factory

- GIVEN Switchyard is the active morphology
- WHEN code calls `panelStyle18({ emphasized: true })`
- THEN the returned style object contains `borderRadius: '18px'`
- AND all other token resolutions follow `[data-morphology='switchyard']`

---

### Requirement: chrome-surface.jsx reads `--chrome-radius-panel` from CSS variable

The `ChromeSurface` component and `chromeSurfaceStyle()` function MUST use `borderRadius: 'var(--chrome-radius-panel)'` for panel surfaces and `borderRadius: 'var(--chrome-radius-control)'` for control/pill surfaces. No hardcoded radius values are permitted.

**Files**: `src/components/ui/chrome-surface.jsx`

#### Scenario: ChromeSurface renders correct radius per active morphology

- GIVEN `data-morphology='switchyard'` is active
- WHEN `ChromeSurface surface="panel"` renders
- THEN the `borderRadius` inline style value is `18px`
- AND all other morphology selections render at their own radii

---

### Requirement: Palette sub-picker UI in Settings when Switchyard is active

The system MUST show a palette sub-picker (Mineral / Cobalt / Alloy) in the Appearance page only when `data-morphology='switchyard'` is the active morphology. The sub-picker MUST allow switching the `body[data-palette]` attribute to change the active palette.

**Files**: `src/app/settings/appearance/page.jsx`

#### Scenario: Palette options appear under Switchyard

- GIVEN Switchyard morphology is active
- WHEN the Appearance page renders
- THEN a palette selector row appears below the morphology selector
- AND Mineral is highlighted as active by default
- AND clicking Cobalt sets `body.dataset.palette = 'cobalt'`

#### Scenario: Palette sub-picker hidden when Switchyard inactive

- GIVEN Default, Brutalist Stage, or Aura is active
- WHEN the Appearance page renders
- THEN no palette sub-picker for Mineral/Cobalt/Alloy appears
- AND the existing accent selector remains unchanged

---

### Requirement: All existing morphologies unchanged (default-radius exception)

The system MUST NOT modify any token values for Brutalist Stage, Aura, Switchyard, Cursor, or Default morphology blocks, except Default MAY set `--chrome-radius-panel` to `0` to preserve the legacy Ajustes square look. The no-regression set is the full pre-`opencode-desktop` morphology set (including `cursor`).
(Previously: no-regression covered Default, Brutalist Stage, Aura, Switchyard, and Cursor with default-radius exception; wording referenced four pre-`cursor` morphologies in Purpose — now explicitly the five pre-`opencode-desktop` morphologies must not regress when adding the sixth.)

#### Scenario: Brutalist Stage radius unchanged

- GIVEN Brutalist Stage was existing before any later morphology was added
- WHEN the test runs or user selects Brutalist Stage
- THEN `--chrome-radius-panel` equals `0`
- AND `--chrome-shadow-panel` equals `4px 4px 0 0 var(--border-strong)`

#### Scenario: Default radius is 0 by design (R6 amendment)

- GIVEN Default is the active morphology
- WHEN the browser resolves `--chrome-radius-panel`
- THEN it equals `0`
- AND all other default-morphology tokens remain at pre-`cursor` values

#### Scenario: Switchyard morphology radius and accent unchanged

- GIVEN Switchyard was existing before any later morphology was added
- WHEN the test runs or user selects Switchyard (with the default Mineral palette)
- THEN `--chrome-radius-panel` equals `18px`
- AND `--accent-primary` equals `#63d0c2`

#### Scenario: Cursor morphology tokens unchanged

- GIVEN Cursor was existing before `opencode-desktop` was added
- WHEN the user selects Cursor
- THEN `--chrome-radius-panel` equals `18px`
- AND `--chrome-radius-control` equals `8px`
- AND `--accent-primary` remains warm amber (`oklch(0.74 0.16 57)`)

---

### Requirement: Shared primitives consume chrome tokens or morphology factories

Card, Input, Switch, Dialog, Select, Button, AND the Ajustes settings page (`src/views/Ajustes.jsx`, all 7 tabs) MUST derive chrome geometry (border radius, border width, shadow) from `--chrome-*` CSS variables or from `src/chrome/morphology.js` factory functions. The Ajustes page MUST NOT ship `borderRadius: 0` overrides or `4px 4px 0 0 var(--border-strong)` shadows on chrome surfaces. The three local helpers `getSettingsShellStyle`, `getSettingsControlStyle`, `getSettingsAccentOptionStyle` (deleted on 2026-06-15 by `ajustes-cursor-restyle`) are forbidden; their call sites MUST use `chromeSurfaceStyle()` / `panelStyle()` / `pillStyle()` / `btnPrimaryStyle()` directly. Factories MUST remain pure token consumers when `opencode-desktop` is added (no morphology-id branching required for the sixth morphology).
(Previously: same consumer contract without explicit sixth-morphology token-consumer invariant.)

**Files**: `src/chrome/morphology.js`, `src/components/ui/chrome-surface.jsx`, `src/components/ui/button.jsx`, `src/components/ui/card.jsx`, `src/components/ui/input.jsx`, `src/components/ui/switch.jsx`, `src/components/ui/dialog.jsx`, `src/components/ui/select.jsx`, `src/views/Ajustes.jsx`

> **Partial coverage note (2026-06-15)**: Ajustes now consumes chrome tokens directly. `Button` consumes via `morphology.js` factories. `Card` and `Input` (shadcn primitives) still use Tailwind `rounded-xl` / `rounded-md`. Pre-existing gap, tracked separately.

#### Scenario: Radius follows morphology on shared primitives

- GIVEN `data-morphology='cursor'` is active
- WHEN Card and Button render
- THEN Card radius resolves from `--chrome-radius-panel`
- AND Button radius resolves from `--chrome-radius-control`

#### Scenario: Ajustes Apariencia honors cursor chrome

- GIVEN `data-morphology='cursor'` is active
- WHEN Apariencia panel renders
- THEN `--chrome-radius-panel` is `18px`
- AND Apariencia's computed `border-radius` is `18px`

#### Scenario: opencode-desktop uses same factories

- GIVEN `data-morphology='opencode-desktop'` is active
- WHEN panel and control chrome render via factories
- THEN geometry comes from `--chrome-*` variables
- AND factories do not hardcode opencode-desktop-only radii in JS

---

### Requirement: Sixth morphology slot for opencode-desktop

The morphology system MUST allow a sixth morphology id `opencode-desktop` in `MORPHOLOGIES` / `MORPHOLOGY_OPTIONS` without requiring factory rewrites. Shared primitives MUST keep consuming `--chrome-*` tokens so the new morphology applies through existing chrome factories.

#### Scenario: Six morphologies registered

- GIVEN the theme registry is loaded
- WHEN `MORPHOLOGY_OPTIONS` is enumerated
- THEN it contains exactly the prior five plus `opencode-desktop`
- AND each id remains independently selectable

#### Scenario: Unknown morphology still normalizes

- GIVEN a stored morphology value is unsupported
- WHEN `normalizeMorphology` runs
- THEN it falls back to a supported default
- AND theme selection is not mutated

---

### Requirement: Single PR delivery within 800-line review budget

The implementation MUST modify only these five files:

1. `src/lib/theme/themes.js` — add constant + option
2. `src/app/globals.css` — add morphology block + palette overrides
3. `src/chrome/morphology.js` — add factory or extend existing
4. `src/components/ui/chrome-surface.jsx` — no structural changes, just use CSS var
5. `src/app/settings/appearance/page.jsx` — add Switchyard option + palette sub-picker

No new files outside these five, no dependency additions, no schema migrations.

## MODIFIED Requirements

- **All existing morphologies unchanged** — the original Switchyard-integration requirement listed only `Default, Brutalist Stage, or Aura` as the morphologies that must not regress. On 2026-06-14 (archive of `cursor-morphology`) the scope was broadened to also include `Switchyard`. Title changed from "All existing morphologies unchanged after Switchyard integration" to "All existing morphologies unchanged". A third scenario was added to cover the Switchyard baseline (`--chrome-radius-panel: 18px` and `--accent-primary: #63d0c2`). On 2026-06-15 (archive of `ajustes-cursor-restyle`) a default-radius exception was added so Default MAY set `--chrome-radius-panel: 0` to preserve the legacy Ajustes square look; the requirement title gained the `(default-radius exception)` suffix and the prior "Default morphology radius unchanged" scenario was rewritten as "Default radius is 0 by design (R6 amendment)". On 2026-07-19 (archive of `opencode-desktop-appearance`) the no-regression set became the five pre-`opencode-desktop` morphologies (including Cursor), and a Cursor baseline scenario was added.
- **Shared primitives consume chrome tokens or morphology factories** — on 2026-06-15 (archive of `ajustes-cursor-restyle`) the requirement body was extended to include `src/views/Ajustes.jsx` (all 7 tabs) as a chrome-token consumer, the three local helpers `getSettingsShellStyle` / `getSettingsControlStyle` / `getSettingsAccentOptionStyle` were forbidden, the `**Files**` list was extended to include `src/views/Ajustes.jsx`, the partial-coverage note date was bumped to 2026-06-15 to record the new coverage, and a new scenario "Ajustes Apariencia honors cursor chrome" was added. On 2026-07-19 (archive of `opencode-desktop-appearance`) factories must remain pure token consumers for the sixth morphology (no morphology-id branching), and scenario "opencode-desktop uses same factories" was added.
- **Sixth morphology slot for opencode-desktop** — ADDED on 2026-07-19 (archive of `opencode-desktop-appearance`).

## REMOVED Requirements

None.
