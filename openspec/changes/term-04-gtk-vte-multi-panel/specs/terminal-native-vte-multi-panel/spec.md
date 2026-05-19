# Terminal Native VTE Multi-Panel Specification

## Purpose

Define Linux-only same-window GTK/VTE behavior for multiple visible split panels with panel-scoped lifecycle.

## Requirements

### Requirement: Visible Split Panels Keep Independent Native Surfaces

The system MUST allow multiple visible panels in the same visible layout to render GTK/VTE concurrently by panel id. Attaching native rendering MUST target the requested panel bounds. An inactive but still visible split panel MUST remain rendered while its layout remains visible.

#### Scenario: Two visible split panels attach concurrently

- GIVEN two split terminal panels are visible in one workspace view
- WHEN both panels resolve effectively to `vte-experimental`
- THEN each panel shows its own GTK/VTE surface in its own bounds
- AND neither panel is hidden only because the other gains focus

#### Scenario: Hidden layout detaches without closing

- GIVEN a panel has an attached GTK/VTE surface
- WHEN its workspace or view becomes not visible
- THEN the native surface is hidden or detached from view
- AND the live terminal session remains open until explicit close

### Requirement: Focus, Input, Resize, and Close Are Panel-Scoped

The system MUST route focus, keyboard input, pointer ownership, and resize by panel id. Resize MUST update only the addressed panel. Unmount or hide MUST NOT be treated as close. Explicit close MUST dispose only the addressed panel's native lifecycle.

#### Scenario: Focus and input move without collapsing siblings

- GIVEN two visible native panels share one split layout
- WHEN the user activates the second panel
- THEN focus and input move to that panel only
- AND the first visible panel remains rendered

#### Scenario: Explicit close removes one panel only

- GIVEN two visible native panels are attached
- WHEN the user explicitly closes one panel
- THEN only that panel's native lifecycle is disposed
- AND the sibling panel remains rendered and usable
