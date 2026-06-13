# Delta for canvas-terminal

## REMOVED Requirements

### Requirement: VTE Renderer Constraint

(Reason: Superseded by `pizarra-shared-view-state`. Native VTE is now permitted in canvas embedding provided the surface is registered with the shared surface provider and the drag-flicker decoupling is active. The xterm-only restriction is removed because it conflicts with the shared surface model and the existing canvas implementation already uses native VTE.)

---

## ADDED Requirements

### Requirement: Native VTE Permitted in Canvas

The system MAY embed a native VTE renderer inside `CanvasTerminal` provided the surface is registered as a shared surface via `SharedSurfacesProvider` and the drag-flicker decoupling (per the Flicker Decoupling requirement below) is active. The xterm.js renderer remains supported as an alternative; the choice between the two renderers SHALL be controlled by `requestedRendererMode`.

#### Scenario: Native VTE renders in canvas when flicker fix is active

- GIVEN a `CanvasTerminal` registered with `SharedSurfacesProvider` as `surfaceId = 'term-canvas-1'`
- AND the drag-flicker decoupling is active (no `suspendNativeSurface` fires on mousedown)
- WHEN the terminal initializes with `requestedRendererMode: 'vte-experimental'`
- THEN the system SHALL use the native VTE renderer
- AND no console warning about VTE fallback SHALL be emitted
- AND the VTE panel SHALL appear in the canvas at the same position as the React wrapper

#### Scenario: Fallback to xterm when flicker fix is not active

- GIVEN the drag-flicker decoupling is NOT active (legacy code path behind feature flag)
- WHEN a `CanvasTerminal` initializes with `requestedRendererMode: 'vte-experimental'`
- THEN the system SHALL fallback to the xterm.js renderer
- AND a console warning SHALL be emitted: `"Canvas terminals require flicker fix to use VTE renderer. Falling back to xterm."`

---

### Requirement: Flicker Decoupling (suspendNativeSurface)

The system SHALL decouple `suspendNativeSurface` from the mousedown event. The native VTE panel SHALL be suspended only while a real drag or resize is in progress. A real drag is defined as a `mousemove` event that occurs AFTER a `mousedown` and before the corresponding `mouseup`. A bare mousedown without movement SHALL NOT trigger the IPC round-trip to suspend and re-show the native panel.

#### Scenario: Mousedown alone does not suspend native panel

- GIVEN a `CanvasTerminal` is rendered with a native VTE panel
- WHEN the user mousedowns on the terminal without moving the cursor
- THEN the native VTE panel SHALL remain visible
- AND no IPC message to suspend the panel SHALL be sent
- AND no IPC message to re-show the panel SHALL be sent
- AND the user MAY release the mousedown without any flicker

#### Scenario: Mousemove after mousedown suspends native panel

- GIVEN a `CanvasTerminal` is rendered with a native VTE panel
- AND the user has mousedowned on the terminal
- WHEN the user moves the cursor more than 0px
- THEN the system SHALL set `isLiveDragging = true`
- AND the native VTE panel SHALL be suspended (hidden from screen)
- AND the React wrapper SHALL be the only visible representation

#### Scenario: Mouseup reattaches native panel

- GIVEN `isLiveDragging === true` and the native VTE panel is suspended
- WHEN the user mouseups
- THEN the system SHALL set `isLiveDragging = false`
- AND the native VTE panel SHALL be reattached
- AND the wrapper SHALL use `transform: translate3d(0,0,0)` for one frame so the chrome catches up
- AND the reattach SHALL NOT cause a visible flicker (one-frame snap is acceptable)

#### Scenario: Resize handles use the same decoupling

- GIVEN a `CanvasTerminal` has a resize handle
- WHEN the user mousedowns on the resize handle without moving
- THEN the native VTE panel SHALL remain visible (no flicker)
- AND when the user drags the handle, the panel SHALL suspend only for the actual drag duration

---

## MODIFIED Requirements

None. Existing requirements (CanvasTerminal Wrapper, Zoom Propagation, Coordinate Translation, Terminal Resize Event Handling, Session Lifecycle on Canvas) are unchanged in their normative content; they continue to govern canvas terminal behavior. The VTE Renderer Constraint that previously restricted renderer choice is REMOVED above.
