# opencode-desktop-morphology Specification

## Purpose

Sixth morphology `opencode-desktop`: quiet chrome (radii, borders, shadows, fills). Theme owns color; morphology MUST NOT lock accent.

## Requirements

### Requirement: OPENCODE_DESKTOP registry entry

The system MUST add `OPENCODE_DESKTOP: 'opencode-desktop'` to `MORPHOLOGIES` and a `MORPHOLOGY_OPTIONS` entry labeled for quiet OpenCode Desktop chrome.

#### Scenario: Morphology option appears

- GIVEN Ajustes Appearance is loaded
- WHEN the Morphology section renders
- THEN `MORPHOLOGY_OPTIONS` includes a sixth entry for `MORPHOLOGIES.OPENCODE_DESKTOP`
- AND selecting it calls `setMorphology('opencode-desktop')`

### Requirement: `[data-morphology='opencode-desktop']` chrome token block

The system MUST append `[data-morphology='opencode-desktop']` in `globals.css` defining quiet chrome tokens, including approximately:

| Token | Intent |
|-------|--------|
| `--chrome-radius-panel` | ~12px |
| `--chrome-radius-control` | ~8px |
| `--chrome-border-width` | 1px soft |
| `--chrome-shadow-*` | low elevation |
| `--chrome-*-fill*` | quiet fills |

The block MAY set optional `--terminal-chrome-*` overrides. The block MUST NOT set `--accent-primary` or `--accent-glow`.

#### Scenario: Quiet radii resolve

- GIVEN `data-morphology='opencode-desktop'` is set
- WHEN chrome variables resolve
- THEN `--chrome-radius-panel` is approximately `12px`
- AND `--chrome-radius-control` is approximately `8px`

#### Scenario: No morphology accent lock

- GIVEN `data-theme='opencode'` and `data-morphology='opencode-desktop'`
- WHEN `--accent-primary` resolves
- THEN the value comes from the theme block only
- AND the morphology selector does not override it

#### Scenario: Theme switch keeps morphology chrome

- GIVEN `data-morphology='opencode-desktop'` stays active
- WHEN the user switches theme away from `opencode`
- THEN chrome radii/shadows remain opencode-desktop values
- AND accent follows the newly selected theme

### Requirement: Terminal chrome tokens only

Under `opencode-desktop`, terminal styling MUST change only via shared `--terminal-chrome-*` / `--chrome-*` tokens. Terminal layout, button positions, icon positions, and interaction model MUST remain unchanged.

#### Scenario: Geometry frozen on morphology switch

- GIVEN the terminal page is open
- WHEN morphology becomes `opencode-desktop`
- THEN protected geometry and controls stay fixed
- AND only tokenized chrome treatment may change

### Requirement: Factories remain token consumers

Chrome factories in `src/chrome/morphology.js` MUST continue to read `--chrome-*` variables. No new factory is required unless a new chrome type is introduced (out of scope).

#### Scenario: Panel style uses CSS vars

- GIVEN `opencode-desktop` is active
- WHEN `panelStyle()` / `ChromeSurface` render
- THEN radius and border resolve from `--chrome-*` tokens
