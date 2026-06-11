# Delta for canvas-terminal

> Modifies `openspec/specs/canvas-terminal/spec.md`. (Note: the previous
> delta in `openspec/changes/pizarra-shared-view-state/specs/canvas-terminal/spec.md`
> removed the VTE Renderer Constraint. That removal is presupposed and is
> NOT re-asserted here.)

## MODIFIED Requirements

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

## ADDED Requirements

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
