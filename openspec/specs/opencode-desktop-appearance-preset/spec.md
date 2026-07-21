# opencode-desktop-appearance-preset Specification

## Purpose

One-click Ajustes preset applying theme `opencode` + morphology `opencode-desktop` + density `compact`, with explicit undo/reset. Axes remain independently selectable.

## Requirements

### Requirement: Apply OpenCode Desktop preset

The system MUST provide a helper (e.g. `applyOpenCodeDesktopPreset()`) that applies theme `opencode`, morphology `opencode-desktop`, and density `compact` via the existing appearance pipeline (`setTheme` / `setMorphology` / density apply). Ajustes MUST expose a one-click control that invokes it.

#### Scenario: One-click applies all three axes

- GIVEN Ajustes Appearance is loaded
- WHEN the user activates the OpenCode Desktop preset control
- THEN theme becomes `opencode`
- AND morphology becomes `opencode-desktop`
- AND density becomes `compact`

#### Scenario: Axes stay independently selectable after preset

- GIVEN the preset was applied
- WHEN the user selects a different theme only
- THEN morphology and density remain at their last values
- AND theme updates without forcing the preset pair

### Requirement: Undo or reset density path

The system MUST provide a clear undo/reset path so density `compact` (and the preset pair) can be reversed without devtools. This MAY be preset undo that restores prior appearance, a minimal density control, or both. Full density picker is optional.

#### Scenario: Compact is reversible from UI

- GIVEN density is `compact` after preset apply
- WHEN the user uses the undo/reset (or density) control
- THEN density leaves `compact` for a supported non-compact value
- AND the change is visible without reloading via devtools

#### Scenario: Preset undo restores prior state when offered

- GIVEN undo captures appearance before preset apply
- WHEN the user activates undo
- THEN theme, morphology, and density return to the captured prior values

### Requirement: No TitleBar or icon scope creep

The preset and density controls MUST NOT implement TitleBar structural diet, icon sprites, or Solid/OC component ports.

#### Scenario: Scope stays appearance axes only

- GIVEN the preset feature is shipped
- WHEN Ajustes and chrome are inspected
- THEN only theme, morphology, and density (plus undo) are added
- AND TitleBar structure and icon assets are unchanged
