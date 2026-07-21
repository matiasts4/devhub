# Delta for morphology-system

## ADDED Requirements

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

## MODIFIED Requirements

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

### Requirement: Shared primitives consume chrome tokens or morphology factories

Card, Input, Switch, Dialog, Select, Button, AND the Ajustes settings page (`src/views/Ajustes.jsx`, all 7 tabs) MUST derive chrome geometry (border radius, border width, shadow) from `--chrome-*` CSS variables or from `src/chrome/morphology.js` factory functions. The Ajustes page MUST NOT ship `borderRadius: 0` overrides or `4px 4px 0 0 var(--border-strong)` shadows on chrome surfaces. The three local helpers `getSettingsShellStyle`, `getSettingsControlStyle`, `getSettingsAccentOptionStyle` (deleted on 2026-06-15 by `ajustes-cursor-restyle`) are forbidden; their call sites MUST use `chromeSurfaceStyle()` / `panelStyle()` / `pillStyle()` / `btnPrimaryStyle()` directly. Factories MUST remain pure token consumers when `opencode-desktop` is added (no morphology-id branching required for the sixth morphology).
(Previously: same consumer contract without explicit sixth-morphology token-consumer invariant.)

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
