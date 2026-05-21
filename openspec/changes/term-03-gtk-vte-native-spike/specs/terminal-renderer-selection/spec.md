# Terminal Renderer Selection Specification

## Purpose

Extend TERM-02 requested/effective renderer semantics so GTK VTE experimental intent stays on the existing integrated selection path.

## Requirements

### Requirement: Explicit GTK VTE Request Uses Existing Renderer Path

The system MUST treat `vte-experimental` as a requested renderer on the same panel/workspace selection path already used by `xterm`. Selecting it MUST update requested state before capability resolution and MUST NOT bypass integrated panel workflow.

#### Scenario: Active panel explicitly requests GTK VTE experimental mode

- GIVEN a visible active terminal panel
- WHEN the user selects `vte-experimental` from the existing renderer control
- THEN the active panel stores `vte-experimental` as its requested renderer
- AND effective renderer resolution runs afterward on that same panel

#### Scenario: Restore reuses the same requested renderer contract

- GIVEN a panel was persisted with requested renderer `vte-experimental`
- WHEN the workspace reloads or the panel reopens
- THEN the same requested renderer is restored before effective renderer resolution

### Requirement: TERM-03 Selection Scope Boundary

The system MUST limit TERM-03 selection behavior to Linux-only GTK VTE same-window spike semantics. It MUST NOT introduce Ghostty behavior, external windows, multi-panel native generalization, or TERM-04-specific flows through this selection path.

#### Scenario: Out-of-scope renderer behavior is rejected from TERM-03

- GIVEN a renderer path would require Ghostty, another window, or TERM-04 behavior
- WHEN the active panel resolves its selection
- THEN TERM-03 SHALL keep that behavior out of scope
- AND the panel remains inside integrated renderer selection semantics
