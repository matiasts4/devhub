# Terminal Workspace Shortcuts Specification

## Purpose

Define discoverable keyboard navigation across terminal workspaces without regressing current split shortcuts or expanding scope into unrelated terminal changes.

## Requirements

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
