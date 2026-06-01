# Delta Spec: board-terminal-drag (Pizarra UX Overhaul, Phase 1)

> **Move coverage**: Move 3 (harden `usePizarraSurfaceDrag`), Move 6 (drag-handle testid).
> **Stem rationale**: new capability. Promoted to base spec at `openspec/specs/board-terminal-drag/spec.md` on archive. The hook also covers browser-surface drags (per `PizarraBrowserSurface.jsx`), but the contract is named after its first consumer.

## Purpose

Define the contract of `usePizarraSurfaceDrag` so that the recently-extracted RAF-batched drag hook survives rapid drag + zoom + native GTK/VTE overlay sync. The contract covers RAF batching, zero-delta short-circuit, unmount cleanup, zoom-aware delta math, and the native-sync dedupe that prevents the live surface layer from re-syncing the same bounds to the native overlay twice in a row.

## Requirements

### Requirement 1: RAF-batched move event coalescing

The system MUST coalesce multiple `mousemove` (or `pointermove`) events that arrive in the same animation frame into a single `onMove` invocation. The hook MUST accumulate the delta from the previous frame's flush into `pendingMoveRef` and call `onMove` exactly once per animation frame.

The hook MUST cancel its in-flight RAF when a `mousedown` / `pointerdown` on a different surface (or a `mouseup` / `pointerup`) ends the drag, and MUST clear `pendingMoveRef` on cancel so the next drag starts from a clean slate.

#### Scenario: Multiple move events in the same frame produce a single onMove call

- GIVEN the hook is in a drag with `bounds = { x: 0, y: 0, width: 100, height: 100 }`
- WHEN three `mousemove` events with deltas `(+5, +5)`, `(+5, +5)`, `(+5, +5)` fire in the same animation frame
- AND the RAF callback runs
- THEN `onMove` MUST be called exactly once
- AND the accumulated delta passed to `onMove` MUST be `(totalDeltaX=15, totalDeltaY=15)` (or the equivalent accumulator for the move contract)

#### Scenario: Mouseup cancels the in-flight RAF

- GIVEN the hook has a pending RAF scheduled
- WHEN `mouseup` (or `pointerup`) fires
- THEN the pending RAF MUST be cancelled via `cancelAnimationFrame`
- AND `pendingMoveRef.current` MUST be `null`
- AND the next drag MUST start from `bounds` as the baseline (not from the in-flight delta)

### Requirement 2: Zero-delta short-circuit

The system MUST NOT invoke `onNativeSync` when the accumulated delta since the last `onNativeSync` call is `(0, 0)`. The system SHOULD still invoke `onMove` exactly once per animation frame even when the delta is zero (so the caller can re-anchor the position), but `onNativeSync` is purely for the GTK/VTE overlay and a zero-delta sync is a wasted IPC round-trip.

#### Scenario: Zero-delta move does not call onNativeSync

- GIVEN the hook is in a drag
- WHEN a `mousemove` event fires with delta `(0, 0)` in a single frame
- AND the RAF callback runs
- THEN `onNativeSync` MUST NOT be called
- AND `onMove` MAY be called once with the zero delta (caller decides)

#### Scenario: Repeated zero-delta frames do not spam onNativeSync

- GIVEN the hook is in a drag and the cursor is stationary for 10 frames
- WHEN each frame's RAF callback runs
- THEN `onNativeSync` MUST NOT be called even once across the 10 frames

### Requirement 3: Zoom-aware delta scaling

The system MUST divide the raw `clientX`/`clientY` delta by the current `resolvedZoom` before passing the result to `onMoveElement` (or whatever callback the consumer wires up). The system MUST use the latest `resolvedZoom` at the moment of the RAF flush, not at `mousedown` time.

The math is:

```
moveDeltaX = rawDeltaX / resolvedZoom
moveDeltaY = rawDeltaY / resolvedZoom
```

where `rawDeltaX/Y` is the accumulated `clientX`/`clientY` delta from the start of the drag.

#### Scenario: Delta is divided by resolvedZoom before being passed downstream

- GIVEN `resolvedZoom = 2.0` and the raw delta is `(40, 60)`
- WHEN the RAF callback runs
- THEN the delta passed to `onMove` (or `onMoveElement`) MUST be `(20, 30)` (the `40 / 2.0`, `60 / 2.0` value)
- AND the un-divided raw delta MUST NOT leak to the consumer

#### Scenario: Zoom change mid-drag uses the latest resolvedZoom

- GIVEN the drag starts at `resolvedZoom = 1.0` with raw delta `(10, 10)`
- AND the user scrolls to change `resolvedZoom` to `2.0`
- AND then more `mousemove` events accumulate to a total raw delta of `(50, 50)`
- WHEN the next RAF callback runs
- THEN the delta passed downstream MUST be `(25, 25)` (using `2.0`, not `1.0`)

### Requirement 4: Unmount cancels pending RAF

The system MUST cancel any in-flight RAF on hook unmount. The system MUST remove all window-level event listeners (`mousemove`, `mouseup`, `pointermove`, `pointerup`) the hook installed during the drag. The system MUST NOT invoke `onMove` or `onNativeSync` after unmount.

#### Scenario: Unmount with pending RAF cancels the RAF

- GIVEN the hook has a pending RAF scheduled (drag in progress)
- WHEN the component using the hook unmounts
- THEN the pending RAF MUST be cancelled via `cancelAnimationFrame`
- AND the cleanup function returned by `useEffect` MUST have run
- AND `onMove` MUST NOT be called after unmount

#### Scenario: Unmount removes window listeners

- GIVEN the hook installed `mousemove` and `mouseup` listeners on `window` during the drag
- WHEN the hook unmounts (either mid-drag or after a clean mouseup)
- THEN the listeners MUST be removed
- AND a subsequent `mousemove` event on `window` MUST NOT trigger any hook callback

### Requirement 5: Native-sync dedupe by resolved position

The system MUST compare the would-be `onNativeSync` payload (the new resolved `{x, y, width, height}` of the dragged element) against the last payload passed to `onNativeSync` for the same drag. The system MUST skip the call when the new payload is structurally equal to the last payload (same `x`, `y`, `width`, `height`).

The comparison MUST be a value comparison (not a reference comparison) because the consumer builds a new object on every move.

#### Scenario: Repeated identical payload does not re-sync

- GIVEN the hook already called `onNativeSync` with `{x: 100, y: 200, width: 400, height: 300}` for this drag
- WHEN a subsequent RAF flush would call `onNativeSync` with the same `{x, y, width, height}`
- THEN `onNativeSync` MUST NOT be called

#### Scenario: Payload change re-arms onNativeSync

- GIVEN the hook already called `onNativeSync` with `{x: 100, y: 200, width: 400, height: 300}` for this drag
- WHEN a subsequent RAF flush produces a new resolved payload `{x: 124, y: 224, width: 400, height: 300}`
- THEN `onNativeSync` MUST be called once with the new payload

### Requirement 6: Drag-handle testid contract

The system MUST expose a `data-testid="pizarra-drag-handle"` attribute on the draggable header of any surface (terminal or browser) that uses `usePizarraSurfaceDrag`. The testid MUST be on the same DOM element the hook's `mousedown`/`pointerdown` listener is attached to (or an ancestor of it, in which case the test fires the event on the testid node and the hook receives it via bubbling).

#### Scenario: Drag handle carries the testid

- GIVEN a `CanvasTerminal` or `PizarraBrowserSurface` renders
- WHEN the test queries for `[data-testid="pizarra-drag-handle"]`
- THEN the testid MUST be present in the DOM
- AND a `mousedown` event on that node MUST start a drag

## Non-Goals

- Pinch / touch gesture handling (desktop only in Phase 1; touch is deferred).
- Replacing the live surface layer's pre-zoomed-bounds math (the layer keeps its own division by `resolvedZoom` for the position sync; the hook contract is the _delta_ contract, not the resolved-position contract).
- Pinning RAF on a custom scheduler (browser RAF is sufficient; tests use a jest setup shim).
- Snap-to-grid or magnetic drag.
- Drag inertia or momentum.

## Test mapping

| Scenario                                                            | Test file                                                        | Test name                                                         |
| ------------------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------- |
| Multiple move events in the same frame produce a single onMove call | `src/components/pizarra/__tests__/usePizarraSurfaceDrag.test.js` | `RAF batches multiple move events into a single onMove call`      |
| Mouseup cancels the in-flight RAF                                   | `src/components/pizarra/__tests__/usePizarraSurfaceDrag.test.js` | `mouseup cancels in-flight RAF and clears pendingMoveRef`         |
| Zero-delta move does not call onNativeSync                          | `src/components/pizarra/__tests__/usePizarraSurfaceDrag.test.js` | `zero-delta move does not invoke onNativeSync`                    |
| Repeated zero-delta frames do not spam onNativeSync                 | `src/components/pizarra/__tests__/usePizarraSurfaceDrag.test.js` | `stationary cursor does not invoke onNativeSync across 10 frames` |
| Delta is divided by resolvedZoom before being passed downstream     | `src/components/pizarra/__tests__/usePizarraSurfaceDrag.test.js` | `delta is divided by resolvedZoom before being passed to onMove`  |
| Zoom change mid-drag uses the latest resolvedZoom                   | `src/components/pizarra/__tests__/usePizarraSurfaceDrag.test.js` | `zoom change mid-drag uses the latest resolvedZoom at flush time` |
| Unmount with pending RAF cancels the RAF                            | `src/components/pizarra/__tests__/usePizarraSurfaceDrag.test.js` | `unmount cancels pending RAF`                                     |
| Unmount removes window listeners                                    | `src/components/pizarra/__tests__/usePizarraSurfaceDrag.test.js` | `unmount removes window mousemove and mouseup listeners`          |
| Repeated identical payload does not re-sync                         | `src/components/pizarra/__tests__/usePizarraSurfaceDrag.test.js` | `onNativeSync is deduped by resolved position`                    |
| Payload change re-arms onNativeSync                                 | `src/components/pizarra/__tests__/usePizarraSurfaceDrag.test.js` | `onNativeSync fires when the resolved position changes`           |
| Drag handle carries the testid                                      | `src/components/pizarra/__tests__/usePizarraSurfaceDrag.test.js` | `drag handle exposes data-testid="pizarra-drag-handle"`           |
