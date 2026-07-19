# Capability: electron-browser-overlays

## Purpose

Coordinate UI overlays (modals, menus, Pizarra chrome, right-dock controls) with WebContentsView, which paints above the DOM and cannot be covered by CSS z-index alone.

## ADDED Requirements

### Requirement: No CSS-only stacking assumption

The product MUST NOT rely solely on CSS `z-index` to draw React overlays above an active WebContentsView.

#### Scenario: Modal opens over browser dock

- **GIVEN** a native browser panel is visible
- **WHEN** a modal or critical overlay opens that must receive clicks
- **THEN** the host MUST hide, clip, or re-stack the WebContentsView so the modal is interactive
- **AND** when the modal closes, the panel MUST restore prior visibility/bounds

### Requirement: Avoid-rects

The system MUST support avoid-rects (existing `devhub:register-avoid-rect` pattern) so chrome regions punch through or force native view adjustments.

#### Scenario: Floating chrome over dock

- **GIVEN** a browser panel is visible and a floating control registers an avoid-rect
- **WHEN** the rect intersects the panel bounds
- **THEN** the host MUST either set browser visibility false for that region strategy, or shrink/offset bounds, or apply a documented clip strategy
- **AND** clearing the avoid-rect MUST restore layout

### Requirement: Workspace switch hides browser

Switching away from a workspace/panel that owns the native browser MUST hide or detach visual stacking so other UI is clickable.

#### Scenario: Switch workspace

- **GIVEN** workspace W1 shows native browser panel P
- **WHEN** the user switches to workspace W2 without P
- **THEN** P MUST not remain clickable on screen
- **AND** returning to W1 MUST restore P without mandatory full reload

### Requirement: Pizarra bounds sync

Pizarra browser surfaces MUST continue to drive bounds via the bridge (`scheduleNativeBrowserResize` / measure callbacks). Electron main MUST apply those bounds to the WebContentsView.

#### Scenario: Pizarra drag resize

- **GIVEN** a Pizarra browser pane is native-backed
- **WHEN** the user drags to resize the pane
- **THEN** WebContentsView bounds MUST track the measured rect within one frame budget of the coalesced resize path

### Requirement: E0 scope

E0 MUST document the overlay strategy and implement at least hide-on-command (visibility IPC). Full avoid-rect geometry MAY land in E2.
