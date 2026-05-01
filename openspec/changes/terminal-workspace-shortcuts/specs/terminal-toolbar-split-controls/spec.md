# Terminal Toolbar Split Controls Specification

## Purpose

Define visible terminal split controls that preserve current split layout behavior and expose discoverable, accessible affordances.

## Requirements

### Requirement: Visible Split Actions

The terminal workspace UI MUST expose visible split-right and split-down actions for the active workspace. Each action MUST use the existing split behavior and layout semantics.

#### Scenario: Split-right control is available

- GIVEN the terminal workspace UI is visible and the active workspace can accept another panel
- WHEN the toolbar renders for the active workspace
- THEN a visible split-right action is present
- AND activating it creates a new panel to the right of the source panel

#### Scenario: Split-down control is available

- GIVEN the terminal workspace UI is visible and the active workspace can accept another panel
- WHEN the toolbar renders for the active workspace
- THEN a visible split-down action is present
- AND activating it creates a new panel below the source panel in the same column

### Requirement: Discoverable And Accessible Split Hints

Split controls MUST expose shortcut hints in terminal-visible UI. Buttons MUST provide an accessible name, keyboard-focusable activation, and hint text or tooltip for the mapped shortcut.

#### Scenario: Split controls expose accessible hints

- GIVEN the terminal workspace UI is visible
- WHEN a user inspects or focuses a split action
- THEN the action exposes an accessible name describing the split direction
- AND the UI exposes the related shortcut hint for that action

### Requirement: Split Guardrails Without Layout Regression

The system MUST NOT change existing split geometry, active-panel targeting, or close behavior. If the workspace cannot accept another panel or the action is unsupported, the related control MUST be disabled or non-operative and MUST communicate the reason without changing layout.

#### Scenario: Max panel guardrail blocks extra split

- GIVEN the active workspace has reached the allowed panel limit
- WHEN the user attempts a split action from the toolbar
- THEN no new panel is created
- AND the control remains visibly unavailable or communicates the limit reason
