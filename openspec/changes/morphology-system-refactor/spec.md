# Delta for Morphology System Refactor

## ADDED Requirements

### Requirement: Chrome Token Contract

The system MUST expose a complete set of `--chrome-*` CSS custom properties on `[data-morphology]` elements. These tokens define all chrome concerns: radius, border, shadow, fill, and press offset. Token values MUST be morphology-specific and MUST NOT contain hardcoded literals in consuming factory functions.

The contract MUST include exactly these tokens:

| Token                          | Purpose                           |
| ------------------------------ | --------------------------------- |
| `--chrome-radius-panel`        | Panel/card border-radius          |
| `--chrome-radius-control`      | Button, pill, input border-radius |
| `--chrome-border-width`        | Border thickness                  |
| `--chrome-border-color`        | Border color                      |
| `--chrome-shadow-panel`        | Box-shadow for panels             |
| `--chrome-shadow-control`      | Box-shadow for controls           |
| `--chrome-panel-fill`          | Panel background                  |
| `--chrome-panel-fill-emphasis` | Emphasized panel background       |
| `--chrome-control-fill`        | Control background                |
| `--chrome-control-fill-hover`  | Control hover background          |
| `--chrome-press-offset`        | Press effect translation          |

#### Scenario: Token availability on morphology switch

- GIVEN the user has selected a valid morphology
- WHEN DevHub applies the morphology via `data-morphology`
- THEN all `--chrome-*` tokens MUST be resolvable on the document root
- AND no `--chrome-*` token returns an invalid value

### Requirement: Default Morphology

The system MUST ship a `default` morphology with soft rounded aesthetics. This morphology MUST define the following token values:

- `--chrome-radius-panel`: `1rem`
- `--chrome-radius-control`: `999px`
- `--chrome-border-width`: `1px`
- `--chrome-border-color`: `var(--border-subtle)`
- `--chrome-shadow-panel`: `var(--shadow-soft)`
- `--chrome-shadow-control`: `0 10px 24px rgba(1, 4, 9, 0.18)`
- `--chrome-panel-fill`: `var(--surface-card)`
- `--chrome-panel-fill-emphasis`: `var(--surface-elevated)`
- `--chrome-control-fill`: `color-mix(in srgb, var(--surface-card) 84%, transparent)`
- `--chrome-control-fill-hover`: `color-mix(in srgb, var(--surface-elevated) 88%, transparent)`
- `--chrome-press-offset`: `0px`

#### Scenario: Default morphology renders rounded corners and soft shadows

- GIVEN the active morphology is `default`
- WHEN a panel surface renders
- THEN border-radius equals `--chrome-radius-panel` (1rem)
- AND box-shadow matches `--chrome-shadow-panel` (soft shadow)

#### Scenario: Default control renders pill-shaped

- GIVEN the active morphology is `default`
- WHEN a control surface renders
- THEN border-radius equals `--chrome-radius-control` (999px — full pill)
- AND background equals `--chrome-control-fill`

### Requirement: Brutalist Stage Morphology

The system MUST ship a `brutalist-stage` morphology with refined brutalist aesthetics. This morphology MUST define the following token values:

- `--chrome-radius-panel`: `0.5rem`
- `--chrome-radius-control`: `0.5rem`
- `--chrome-border-width`: `2px`
- `--chrome-border-color`: `var(--border-strong)`
- `--chrome-shadow-panel`: `4px 4px 0 0 var(--border-strong)`
- `--chrome-shadow-control`: `3px 3px 0 0 var(--border-strong)`
- `--chrome-panel-fill`: `var(--surface-card)`
- `--chrome-panel-fill-emphasis`: `var(--surface-elevated)`
- `--chrome-control-fill`: `var(--surface-muted)`
- `--chrome-control-fill-hover`: `var(--surface-hover)`
- `--chrome-press-offset`: `1px`

#### Scenario: Brutalist Stage renders sharp corners and 3D shadow effect

- GIVEN the active morphology is `brutalist-stage`
- WHEN a panel surface renders
- THEN border-radius equals `--chrome-radius-panel` (0.5rem — slight refinement from pure sharp)
- AND box-shadow is a hard-left offset shadow (4px 4px 0 0)

#### Scenario: Brutalist Stage control renders squared with offset shadow

- GIVEN the active morphology is `brutalist-stage`
- WHEN a control surface renders
- THEN border-radius equals `--chrome-radius-control` (0.5rem)
- AND box-shadow equals `--chrome-shadow-control` (3px 3px 0 0)
- AND pressing the control shifts it by `--chrome-press-offset` (1px)

### Requirement: Aura Morphology

The system MUST ship an `aura` morphology with glassmorphism-inspired aesthetics. This morphology MUST define the following token values:

- `--chrome-radius-panel`: `1.25rem`
- `--chrome-radius-control`: `1rem`
- `--chrome-border-width`: `1px`
- `--chrome-border-color`: `color-mix(in srgb, var(--accent-primary) 30%, transparent)`
- `--chrome-shadow-panel`: `0 8px 32px color-mix(in srgb, var(--accent-primary) 15%, transparent), 0 2px 8px rgba(0,0,0,0.2)`
- `--chrome-shadow-control`: `0 4px 16px color-mix(in srgb, var(--accent-primary) 10%, transparent)`
- `--chrome-panel-fill`: `color-mix(in srgb, var(--surface-card) 85%, var(--accent-primary) 8%)`
- `--chrome-panel-fill-emphasis`: `color-mix(in srgb, var(--surface-elevated) 80%, var(--accent-primary) 12%)`
- `--chrome-control-fill`: `color-mix(in srgb, var(--surface-card) 70%, var(--accent-primary) 5%)`
- `--chrome-control-fill-hover`: `color-mix(in srgb, var(--surface-elevated) 75%, var(--accent-primary) 8%)`
- `--chrome-press-offset`: `0px`

#### Scenario: Aura renders glass-like semi-transparent surfaces and glow

- GIVEN the active morphology is `aura`
- WHEN a panel surface renders
- THEN border-radius equals `--chrome-radius-panel` (1.25rem)
- AND box-shadow includes an accent-primary glow component
- AND panel background includes an accent-primary tint via color-mix

#### Scenario: Aura control renders with subtle accent tint

- GIVEN the active morphology is `aura`
- WHEN a control surface renders
- THEN border-radius equals `--chrome-radius-control` (1rem — slightly rounded, not pill)
- AND background includes a subtle accent-primary tint via color-mix

### Requirement: Morphology Factory Compliance

All UI primitive factory functions in `morphology.js` MUST reference `var(--chrome-*)` tokens. Factory functions MUST NOT contain hardcoded `borderRadius`, `boxShadow`, or `border` literals for chrome concerns. Inline style objects with hardcoded border-radius, box-shadow, or border properties for chrome concerns are PROHIBITED.

#### Scenario: Morphology switch changes all chrome surfaces

- GIVEN a user switches from `default` to `brutalist-stage` morphology in settings
- WHEN DevHub updates `data-morphology` on the document root
- THEN all factory-produced chrome surfaces update their visual treatment without component re-renders triggered by route changes
- AND `--chrome-radius-panel`, `--chrome-border-width`, `--chrome-shadow-panel` tokens reflect the new morphology

### Requirement: Critical Hardcode Resolution

The following files MUST be refactored to consume `--chrome-*` tokens instead of hardcoded literals:

- `ProjectDashboard.jsx` — remove local brutalist style functions, use shared `morphology.js`
- `Roadmap.jsx` — replace hardcoded `borderRadius`/`shadow` with `var(--chrome-*)` tokens
- `SwarmTopologyGraph.jsx` — replace `#27272a` hardcodes with `var(--chrome-border-color)`

(Reason: these are high-impact breakages when morphology switches, per proposal risk analysis)

#### Scenario: SwarmTopologyGraph uses CSS tokens for border color

- GIVEN `SwarmTopologyGraph.jsx` renders a node border
- WHEN the morphology is `brutalist-stage`
- THEN the border color resolves to `var(--chrome-border-color)` which evaluates to `var(--border-strong)`
- AND NOT the hardcoded `#27272a`

## REMOVED Requirements

### Requirement: Hardcoded Brutalist Literals in Shared Factories

(Reason: `morphology.js` factories must use tokens, not inline literals — replaced by Morphology Factory Compliance requirement above)

### Requirement: Local Brutalist Functions in ProjectDashboard

(Reason: ProjectDashboard must use shared `morphology.js` factories — replaced by Critical Hardcode Resolution requirement above)
