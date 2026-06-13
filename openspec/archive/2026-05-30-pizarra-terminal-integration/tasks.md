# Tasks: Pizarra Terminal Integration

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~600 |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Single PR: Infrastructure + Implementation + Tests |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Medium

## Phase 1: Infrastructure

- [ ] 1.1 Create `src/lib/pizarra/canvasViewport.js` with `CanvasViewportContext`, `useCanvasViewport()` hook, `canvasToViewport(cx, cy, {zoom, pan, canvasRect})` and `viewportToCanvas(vx, vy, {zoom, pan, canvasRect})` utilities using the formulas from the design spec.
- [ ] 1.2 In `CanvasViewportProvider`, attach a `ResizeObserver` to the canvas container element and expose `viewportRect` via context so children can track canvas element position changes.
- [ ] 1.3 Write unit tests in `src/lib/pizarra/__tests__/canvasViewport.test.js` for `canvasToViewport` and `viewportToCanvas` with known input/output pairs (e.g., zoom=0.5, pan={x:50,y:30}, canvasRect={left:200,top:100}, verify spec scenarios).

## Phase 2: Core Implementation

- [ ] 2.1 Modify `src/components/TerminalTTY.jsx`: add `externalDimensionSource` prop (function returning `{width, height}` or null). Update `fitTerminalViewport` and the ResizeObserver inside `initializeTerminal` to call `externalDimensionSource()` instead of `container.getBoundingClientRect()` when provided.
- [ ] 2.2 Create `src/components/pizarra/CanvasTerminal.jsx` that imports and renders `TerminalTTY` with `hideTitleBar={true}`, `requestedRendererMode="xterm"` (enforcing xterm renderer), and `externalDimensionSource` set to read the container div's current physical width/height.
- [ ] 2.3 Add CSS module `src/components/pizarra/CanvasTerminal.module.css` with `.container { position: absolute; overflow: hidden; }` — no transform rules.
- [ ] 2.4 In `CanvasTerminal`, add a `useEffect` on `canvasZoom` prop that debounces at most once per animation frame (16ms) and sets `container.style.width = String(size.width * canvasZoom) + 'px'` and `container.style.height = String(size.height * canvasZoom) + 'px'` — NOT CSS transform.
- [ ] 2.5 Add `ResizeObserver` on the container div inside `CanvasTerminal` so that when DOM size changes (zoom or resize), `TerminalTTY`'s ResizeObserver fires and `fitAddon.fit()` reads correct physical pixel dimensions via `externalDimensionSource`.
- [ ] 2.6 Wire `onResize(size)` callback: when `TerminalTTY` (via canvas container ResizeObserver + `fitTerminalViewport`) detects a PTY-driven resize, propagate the new `{width, height}` back to the parent canvas state via `onResize` prop.

## Phase 3: Integration

- [ ] 3.1 In `CanvasTerminal`, on mount register `terminalId -> sessionId` mapping with the canvas context; on unmount deregister and close the session. Emit a console warning `"Canvas terminals do not support VTE renderer. Falling back to xterm."` if `requestedRendererMode !== 'xterm'`.
- [ ] 3.2 Add `CanvasViewportProvider` (from `canvasViewport.js`) to the pizarra root component, wrapping all canvas children so `CanvasTerminal` can call `useCanvasViewport()` to read `{zoom, pan, canvasRect}`.
- [ ] 3.3 On canvas unmount, iterate all registered `terminalId -> sessionId` entries and close each WebSocket session gracefully so no orphan connections remain.

## Phase 4: Testing

- [ ] 4.1 Unit test: `canvasToViewport` and `viewportToCanvas` with zoom=1.0 and zoom=0.5 — verify exact integer outputs from the spec's example calculations.
- [ ] 4.2 Unit test: zoom attribute update — mock container div, set `size={400,300}` at zoom=2.0, assert container width/height DOM attributes equal 800/600 after debounce settles.
- [ ] 4.3 Unit test: VTE renderer fallback — assert `console.warn` is called with the expected message when `requestedRendererMode='vte-experimental'` is passed to `CanvasTerminal`.
- [ ] 4.4 Integration test (manual): drag a terminal onto the canvas, zoom from 1.0 to 2.0, open DevTools console, verify `getBoundingClientRect().width` equals `logicalWidth * zoom` at each step.
