# Canvas Terminal Specification

## Purpose

Define how `TerminalTTY` instances are embedded inside a pizarra (infinite canvas) as draggable, resizable, zoomable elements. Canvas controls positioning, sizing, and zoom; terminals update xterm.js FitAddon dimensions accordingly. Only the xterm.js renderer is permitted in canvas context.

---

## Requirements

### Requirement: CanvasTerminal Wrapper

The system SHALL provide a `CanvasTerminal` component that wraps `TerminalTTY` inside a `position: absolute` div for canvas-relative positioning.

#### Props

| Prop         | Type                                | Description                                       |
| ------------ | ----------------------------------- | ------------------------------------------------- |
| `terminalId` | `string`                            | Unique identifier for this terminal instance      |
| `position`   | `{ x: number, y: number }`          | Canvas logical coordinates of the top-left corner |
| `size`       | `{ width: number, height: number }` | Logical dimensions in canvas coordinate space     |
| `canvasZoom` | `number`                            | Current canvas zoom level (1.0 = 100%)            |

#### Behavior

- On mount: register `terminalId` with canvas context (map `terminalId → sessionId`)
- On unmount: deregister `terminalId` and close its session
- Pass `hideTitleBar={true}` to `TerminalTTY`
- Render `TerminalTTY` inside a `div` with `position: absolute`

#### Scenario: Mount registers terminal

- GIVEN a `CanvasTerminal` with `terminalId="t1"` and `position={x:100,y:200}`
- WHEN the component mounts
- THEN the canvas context MUST store the mapping `terminalId → sessionId`
- AND the container div MUST have `position: absolute`, `left: 100px`, `top: 200px`

#### Scenario: Unmount deregisters terminal

- GIVEN a mounted `CanvasTerminal` with `terminalId="t1"`
- WHEN the component unmounts
- THEN the canvas context MUST remove the mapping `terminalId → sessionId`
- AND the WebSocket session for that terminal MUST be closed gracefully

---

### Requirement: Zoom Propagation to Terminal

When canvas zoom changes, the system MUST update the container DOM node `width` and `height` attributes (NOT CSS `transform: scale()`) so that `getBoundingClientRect()` reports physical pixels for correct FitAddon calculations. The zoom SHALL be focal-point-preserving under the cursor: the canvas coordinate under the cursor at the time of the wheel event SHALL stay under the cursor at the new zoom.

#### Formula

```
physicalWidth  = logicalWidth  * zoom
physicalHeight = logicalHeight * zoom

// focal-point-preserving zoom (canvasViewport.zoomAtPoint)
canvasX = (focalX - panX) / zoom
canvasY = (focalY - panY) / zoom
nextPanX = focalX - canvasX * nextZoom
nextPanY = focalY - canvasY * nextZoom
```

#### Behavior

- Container DOM node `width` attribute MUST be set to `logicalWidth * zoom`
- Container DOM node `height` attribute MUST be set to `logicalHeight * zoom`
- Zoom updates MUST be debounced to at most once per animation frame (16ms)
- `transform: scale()` MUST NOT be used anywhere for canvas terminal sizing
- Wheel-driven zoom MUST call `canvasViewport.zoomAtPoint({ currentZoom, currentPan, deltaY, focalX, focalY, minZoom, maxZoom })`
- `focalX` SHALL equal `event.clientX - canvasRect.left`
- `focalY` SHALL equal `event.clientY - canvasRect.top`

#### Scenario: Zoom doubles container width

- GIVEN a canvas at zoom 1.0 with a terminal of logical width 400
- WHEN the user scrolls the wheel and zoom becomes 2.0
- THEN the container DOM node `width` attribute MUST be set to 800
- AND `getBoundingClientRect().width` MUST return 800 (physical pixels)

#### Scenario: Debounced zoom update

- GIVEN a canvas zoom changing rapidly from 1.0 to 2.0 within 10ms
- WHEN the zoom event fires multiple times
- THEN zoom updates MUST be debounced to max once per animation frame (16ms)
- AND the container MUST reflect the final zoom value after debounce settles

#### Scenario: Wheel over empty canvas zooms at cursor focal point

- GIVEN the cursor is at canvas-container-local coordinates `(400, 200)` and the canvas is at `zoom = 1.0`, `pan = { x: 0, y: 0 }`
- WHEN the user wheels over the empty canvas (no terminal/browser hit) and `deltaY` produces `nextZoom = 1.25`
- THEN the system SHALL call `canvasViewport.zoomAtPoint({ currentZoom: 1, currentPan: {0,0}, deltaY, focalX: 400, focalY: 200 })`
- AND the resulting `pan` SHALL keep the canvas coordinate under `(400, 200)` pinned at `(400, 200)` in container-local space

#### Scenario: Wheel over a terminal does NOT zoom

- GIVEN a `CanvasTerminal` exists at canvas-container-local coordinates `(100, 100)` with `width = 400`, `height = 300`
- WHEN the user wheels inside the terminal's bounding rect with the cursor at `(300, 250)`
- THEN `PizarraCanvas.wheel` SHALL call `shouldCanvasConsumeWheel(event)` and observe a `false` return
- AND the zoom SHALL NOT change
- AND the wheel event SHALL be allowed to scroll the terminal's xterm viewport

#### Scenario: Focal point stays under cursor after zoom

- GIVEN a canvas at `zoom = 1.0`, `pan = { x: 0, y: 0 }` and a known canvas point at `(0.3, 0.4)` of the canvas container
- WHEN the user wheels and `zoom` becomes `1.5`
- THEN after the focal zoom math, that same canvas point SHALL still be at `(0.3, 0.4)` of the canvas container in screen space

---

### Requirement: Coordinate Translation Utilities

The system SHALL provide utilities to translate between canvas logical coordinates and viewport absolute coordinates, accounting for canvas element position, pan offset, and zoom.

#### Formulas

```
viewportX = canvasRect.left + panOffset.x + (canvasLogicalX * zoom)
viewportY = canvasRect.top  + panOffset.y + (canvasLogicalY * zoom)

canvasLogicalX = (viewportX - canvasRect.left - panOffset.x) / zoom
canvasLogicalY = (viewportY - canvasRect.top  - panOffset.y) / zoom
```

#### Behavior

- `canvasElement.getBoundingClientRect()` MUST be tracked via `ResizeObserver` on the canvas container
- The canvas container is the scrollable/panable wrapper, NOT the canvas element itself
- Utilities MUST handle the canvas element moving within the viewport (ResizeObserver on canvas container)
- Pan offset represents how far the canvas has been scrolled/panned in viewport pixels

#### Scenario: Canvas to viewport translation

- GIVEN a canvas element with `getBoundingClientRect().left = 200` and `top = 100`
- AND pan offset `{ x: 50, y: 30 }`
- AND zoom = 0.5
- AND canvas logical position `(100, 200)`
- WHEN translating to viewport coordinates
- THEN `viewportX` MUST equal `200 + 50 + (100 * 0.5) = 300`
- AND `viewportY` MUST equal `100 + 30 + (200 * 0.5) = 230`

#### Scenario: Viewport to canvas translation (click detection)

- GIVEN a canvas element with `getBoundingClientRect().left = 200` and `top = 100`
- AND pan offset `{ x: 50, y: 30 }`
- AND zoom = 0.5
- AND a click at viewport position `(350, 400)`
- WHEN translating to canvas logical coordinates
- THEN `canvasLogicalX` MUST equal `(350 - 200 - 50) / 0.5 = 200`
- AND `canvasLogicalY` MUST equal `(400 - 100 - 30) / 0.5 = 540`

---

### Requirement: Terminal Resize Event Handling

When a PTY resize event arrives over WebSocket as `{ type: 'resize', cols, rows }`, the system MUST update the canvas terminal container physical dimensions and propagate the new size back to the canvas state.

#### Behavior

- `TerminalTTY` receives `{ type: 'resize', cols, rows }` from the PTY
- `TerminalTTY` calls `fitAddon.fit()` which uses `getBoundingClientRect()` to calculate new cols/rows
- If the terminal is canvas-hosted: the resize event MUST update the container pixel dimensions
- The canvas MUST propagate the new physical size back to canvas state (canvas element MAY auto-fit to content)

#### Scenario: PTY resize updates container dimensions

- GIVEN a canvas-hosted terminal with logical dimensions 400x300 at zoom 1.0
- WHEN the PTY sends `{ type: 'resize', cols: 80, rows: 24 }`
- THEN `TerminalTTY` MUST call `fitAddon.fit()` and update the PTY back with new dimensions
- AND the container physical width/height MUST be updated to reflect the new terminal size

---

### Requirement: Session Lifecycle on Canvas

Each canvas terminal is an independent WebSocket session; session creation and closure follow the same flow as dock terminals, with additional canvas-context binding.

#### Behavior

- Session creation: `TerminalTTY` opens `/api/terminal/session` with canvas context in options
- Session recovery: if the canvas host component crashes, orphaned terminals MUST reconnect
- Session close: graceful shutdown via `TerminalTTY` `onClose` prop or canvas cleanup
- Canvas maintains `terminalId → sessionId` map for coordinated lifecycle management
- On canvas close: iterate all registered terminals and close each session

#### Scenario: Session creation on canvas

- GIVEN a user drops a terminal onto the canvas
- WHEN `CanvasTerminal` mounts
- THEN `TerminalTTY` MUST open `/api/terminal/session` with canvas-context options
- AND the canvas context MUST store `terminalId → sessionId` mapping

#### Scenario: Canvas close closes all sessions

- GIVEN a canvas with 3 active terminals (t1, t2, t3) with sessions s1, s2, s3
- WHEN the canvas component unmounts
- THEN the system MUST close sessions s1, s2, and s3 gracefully
- AND no orphan WebSocket connections MUST remain

---

### Requirement: VTE Renderer Constraint

Canvas-hosted terminals MUST use the xterm.js renderer and MUST NOT use the VTE experimental renderer.

#### Behavior

- If a canvas terminal receives `requestedRendererMode: 'vte-experimental'`, the system MUST fallback to xterm renderer
- A console warning MUST be emitted when the fallback occurs: `"Canvas terminals do not support VTE renderer. Falling back to xterm."`
- Enforcement is the responsibility of `CanvasTerminal` or the canvas hosting layer

#### Scenario: VTE renderer rejected in canvas context

- GIVEN a canvas terminal with `requestedRendererMode: 'vte-experimental'`
- WHEN the terminal initializes
- THEN the system MUST use xterm renderer instead of VTE
- AND a console warning MUST be emitted: `"Canvas terminals do not support VTE renderer. Falling back to xterm."`

---

### Requirement: PizarraCanvas Wheel Routing

`PizarraCanvas` SHALL route wheel events through `shouldCanvasConsumeWheel(event)` from `@/lib/pizarra/pizarraWheel`. When the helper returns `true`, the canvas SHALL consume the wheel and apply a focal zoom. When the helper returns `false`, the canvas SHALL NOT call `preventDefault`, SHALL NOT change `zoom` or `pan`, and SHALL allow the inner surface to scroll.

#### Scenario: Wheel handler consults shouldCanvasConsumeWheel

- GIVEN a wheel event fired on the `PizarraCanvas` wrapper
- WHEN the wheel handler runs
- THEN the first action SHALL be a call to `shouldCanvasConsumeWheel(event)` from `pizarraWheel.js`
- AND if it returns `false`, the handler SHALL return early before any zoom state mutation

#### Scenario: Inline selector list is removed

- GIVEN the `PizarraCanvas` wheel handler
- WHEN the handler is read
- THEN it SHALL NOT contain an inline `event.target.closest(...)` call
- AND it SHALL NOT contain an inline `setZoom((z) => z - deltaY * 0.001)` call

#### Scenario: canvasViewport provider wheel also routes via the helper

- GIVEN the canvas-wide wheel handler in `canvasViewport.js` (the `useEffect` that listens on `canvasContainerRef`)
- WHEN that handler is read
- THEN it SHALL use `shouldCanvasConsumeWheel(event)` instead of its own inline selector list
- AND the selector set SHALL be identical to `PIZARRA_INTERACTIVE_WHEEL_SELECTOR`

---

### Requirement: Surface Enter Animation Applied to Live Surfaces

Every newly-spawned terminal and browser surface in the pizarra live-surface layer SHALL mount with the `SURFACE_ENTER_OPACITY_ONLY` keyframes exported by `@/lib/pizarra/surfaceMotion`. The opacity-only variant SHALL be used (not the transform-bearing `SURFACE_ENTER_ANIMATION`) because transforming the wrapper would desync the IPC-positioned native VTE / WebKitGTK content rect.

#### Scenario: CanvasTerminal inner frame applies the enter keyframes

- GIVEN a `CanvasTerminal` is mounted under `PizarraLiveSurfaceLayer`
- WHEN the inner frame element is inspected
- THEN its `style.animation` SHALL equal `pizarraSurfaceEnterOpacity 340ms cubic-bezier(0.22, 1, 0.36, 1) both`
- AND no CSS `transform` SHALL be applied to the positioned wrapper

#### Scenario: PizarraBrowserSurface inner frame applies the enter keyframes

- GIVEN a `PizarraBrowserSurface` is mounted under `PizarraLiveSurfaceLayer`
- WHEN the inner frame element is inspected
- THEN its `style.animation` SHALL equal `pizarraSurfaceEnterOpacity 340ms cubic-bezier(0.22, 1, 0.36, 1) both`

#### Scenario: Keyframes are present in the document

- GIVEN `ensureSurfaceMotionKeyframes()` has been called
- WHEN `document.getElementById('pizarra-surface-motion-keyframes')` is read
- THEN the element SHALL exist
- AND it SHALL contain a `@keyframes pizarraSurfaceEnterOpacity` rule with `from { opacity: 0 }` and `to { opacity: 1 }`

#### Scenario: Reduced motion collapses enter to a short fade

- GIVEN `prefers-reduced-motion: reduce` is active
- WHEN a new terminal surface mounts
- THEN the enter animation SHALL resolve in `≤ 50ms` (per the `surfaceMotion.js` reduced-motion `@media` block)
- AND the chrome SHALL be visible and interactive after that window

---

## Acceptance Summary

| Requirement                                      | Covered | Scenario Count |
| ------------------------------------------------ | ------- | -------------- |
| CanvasTerminal Wrapper                           | Yes     | 2              |
| Zoom Propagation to Terminal                     | Yes     | 6              |
| Coordinate Translation Utilities                 | Yes     | 2              |
| Terminal Resize Event Handling                   | Yes     | 1              |
| Session Lifecycle on Canvas                      | Yes     | 2              |
| VTE Renderer Constraint                          | Yes     | 1              |
| PizarraCanvas Wheel Routing                      | Yes     | 3              |
| Surface Enter Animation Applied to Live Surfaces | Yes     | 4              |

**Total**: 8 requirements, 21 scenarios.
