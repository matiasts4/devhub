# Spec: terminal-workspace-shortcuts

## Domain: terminal-toolbar-split-controls

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

## Domain: terminal-workspace-shortcuts

### Requirement: Previous And Next Workspace Shortcuts

When the terminal UI is visible, the system MUST support `Ctrl+Alt+ArrowLeft` for the previous workspace and `Ctrl+Alt+ArrowRight` for the next workspace using visible tab order. The shortcut handler MUST be scoped to terminal-visible state and MUST NOT switch workspaces when the terminal UI is hidden.

#### Scenario: Navigate to previous workspace

- GIVEN the terminal UI is visible and a non-first workspace is active
- WHEN the user presses `Ctrl+Alt+ArrowLeft`
- THEN the previous workspace in visible tab order becomes active

#### Scenario: Navigate to next workspace

- GIVEN the terminal UI is visible and a non-last workspace is active
- WHEN the user presses `Ctrl+Alt+ArrowRight`
- THEN the next workspace in visible tab order becomes active

#### Scenario: Hidden terminal does not capture workspace navigation

- GIVEN the terminal UI is hidden
- WHEN the user presses `Ctrl+Alt+ArrowLeft` or `Ctrl+Alt+ArrowRight`
- THEN terminal workspace state does not change

### Requirement: Discoverable Workspace Shortcut Hints

The terminal UI SHOULD expose visible or tooltip-based hints that document workspace navigation shortcuts alongside split-action shortcuts. Hints MUST remain scoped to terminal workspace controls and MUST NOT require unrelated settings or menus.

#### Scenario: Workspace navigation hint is discoverable

- GIVEN the terminal UI is visible
- WHEN a user reads the terminal shortcut hints
- THEN the previous and next workspace shortcuts are documented in terminal-visible UI

### Requirement: No Regression To Existing Split Shortcuts

The system MUST preserve the existing behaviors of `Ctrl+Shift+D`, `Ctrl+Shift+R`, and `Ctrl+Shift+W` while adding workspace navigation shortcuts. Adding workspace navigation MUST NOT alter split layout ordering or panel-close semantics.

#### Scenario: Existing split shortcuts remain unchanged

- GIVEN the terminal UI is visible and a panel is active
- WHEN the user presses `Ctrl+Shift+D`, `Ctrl+Shift+R`, or `Ctrl+Shift+W`
- THEN split-down, split-right, and close-panel behavior remain unchanged from current behavior

### Requirement: Scope Boundary For This Change

This change MUST NOT introduce terminal redesigns, shortcut remapping, persistence-format changes, or non-terminal workspace behavior changes.

#### Scenario: Unrelated terminal systems remain untouched

- GIVEN the change is implemented
- WHEN terminal tabs, persistence, and non-terminal workspace flows are exercised
- THEN behavior outside visible split controls and workspace shortcuts remains unchanged
