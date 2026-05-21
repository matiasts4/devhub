# Terminal Renderer Selection Specification

## Purpose

Define explicit renderer choice for integrated terminal panels and workspace restores while keeping `xterm` as the baseline contract.

## Requirements

### Requirement: Explicit Integrated Renderer Choice

The system MUST expose a renderer choice inside the terminal workspace/panel UI. `xterm` MUST always be selectable as the baseline option. Experimental renderer options MAY be listed, but selection MUST stay inside the integrated panel workflow.

#### Scenario: User selects a renderer for an active panel

- GIVEN a visible terminal panel in a workspace
- WHEN the user selects `xterm` or an experimental renderer from the renderer control
- THEN the selected mode is recorded for that panel without opening an external window

#### Scenario: New panel starts from baseline

- GIVEN a newly created terminal panel with no saved renderer preference
- WHEN the panel first renders
- THEN its requested renderer defaults to `xterm`

### Requirement: Renderer Preference Persistence

The system MUST persist the requested renderer preference with terminal workspace state so reload, restore, and reopen flows can recover the same requested mode for each saved panel.

#### Scenario: Reload restores requested renderer preference

- GIVEN a panel was saved with a requested experimental renderer
- WHEN the workspace state is loaded again
- THEN the same requested renderer is restored for that panel before effective renderer resolution runs

#### Scenario: Separate panels keep separate preferences

- GIVEN two panels in the same workspace use different requested renderers
- WHEN the workspace state is persisted and restored
- THEN each panel keeps its own requested renderer instead of inheriting another panel's setting

### Requirement: TERM-02 Scope Boundary

The system MUST limit TERM-02 to renderer selection and persisted preference semantics. It MUST NOT require TERM-03/04 native runtime delivery and MUST NOT expand into external terminal windows.

#### Scenario: Experimental option exists before native runtime exists

- GIVEN an experimental renderer can be selected but its native runtime is not shipped
- WHEN the user saves or restores that preference
- THEN TERM-02 still behaves inside the integrated terminal panel and does not launch a native renderer implementation
