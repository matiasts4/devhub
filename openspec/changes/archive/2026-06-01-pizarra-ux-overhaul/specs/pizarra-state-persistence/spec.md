# Delta Spec: pizarra-state-persistence (Pizarra UX Overhaul, Phase 1 — alignment note)

> **Move coverage**: this delta is the Move 6 alignment note for `pizarra-state-persistence`. It does NOT ship a persistence implementation. It documents the source-of-truth decision so the `pizarra-state-persistence` change can adopt the array-shaped reducer without a second migration.
> **Stem rationale**: this delta reuses the existing `pizarra-state-persistence` stem so the orchestrator can fold the alignment note back into the in-flight `pizarra-state-persistence` change at archive time.

## Purpose

Mark the source-of-truth state shape for the pizarra so the `pizarra-state-persistence` change can adopt the array-based reducer (as actually implemented in `src/lib/pizarra/pizarraReducer.js`) and migrate the spec without re-litigating the decision. The actual persistence implementation remains in the in-flight `pizarra-state-persistence` change; this delta only documents the current state shape, the rationale, and a TODO for the migration.

## Requirements

### Requirement 1: Source of truth is the array-based reducer

The system MUST treat `src/lib/pizarra/pizarraReducer.js` (the in-tree `pizarraReducer` reducer and `usePizarraState` hook) as the source of truth for the pizarra state shape as of Phase 1.

The state shape, as currently implemented, MUST be:

```js
{
  activeTool: 'select' | 'text' | 'rect' | 'circle' | 'line' | 'arrow',
  activeToolSettings: object,
  elements: Array<PizarraElement>,   // ← array, not Map
  selectedElementIds: Array<string>,
  // (Phase 1 also adds cascadeIndex: number per board-element-placement)
}
```

The system MUST persist this array shape, NOT a `Map<id, PizarraElement>`. Any future spec that describes a Map-shaped state MUST be treated as stale and superseded by this requirement.

#### Scenario: Persisted state uses the array shape, not a Map

- GIVEN the user adds 3 elements via `handleAddElement`
- WHEN `usePizarraState` is asked to serialize its state
- THEN the serialized `elements` field MUST be an array
- AND the array MUST have 3 entries
- AND the entries MUST be objects with `{ id, type, x, y, ... }` (the existing element shape)

### Requirement 2: Viewport state lives outside the reducer (zoom/pan via context)

The system MUST keep `zoom` and `pan` (the canvas viewport state) in `CanvasViewportContext` (`src/lib/pizarra/canvasViewport.js`), NOT in the pizarra reducer state. The `pizarraReducer` MUST NOT own the viewport.

The persisted state shape MUST be:

```js
{
  pizarra: {
    activeTool, activeToolSettings, elements, selectedElementIds, cascadeIndex
  },
  viewport: {
    // NOT PERSISTED in Phase 1. Zoom and pan are session-only.
  }
}
```

#### Scenario: Viewport is not part of the persisted state

- GIVEN the user pans and zooms the canvas
- WHEN `usePizarraState` is asked to serialize its state for persistence
- THEN the serialized state MUST NOT contain a `viewport` key
- AND the zoom/pan values MUST remain in `CanvasViewportContext` only

### Requirement 3: TODO — migrate the stale Map-shaped spec

The system MUST carry a forward-pointer TODO in the `pizarra-state-persistence` change: when that change lands, it MUST update its own spec to match the array-based reducer (and drop the `Map<id, PizarraElement>` description that pre-dates the actual implementation).

The TODO MUST be:

```
// TODO(pizarra-ux-overhaul): pizarra-state-persistence spec uses
// elements: Map<id, PizarraElement> — this is stale. The actual
// reducer uses elements: Array. Adopt the array shape per
// openspec/changes/pizarra-ux-overhaul/specs/pizarra-state-persistence/spec.md
// and remove this TODO when reconciled.
```

#### Scenario: The stale Map shape is flagged for migration

- GIVEN the `pizarra-state-persistence` change is still in flight
- WHEN its proposal is reviewed
- THEN the proposal MUST carry the `TODO(pizarra-ux-overhaul)` comment
- AND the proposal MUST reference this spec as the source of truth

## Non-Goals

- Implementing persistence in this change. The actual localStorage / persistence implementation lives in the in-flight `pizarra-state-persistence` change.
- Changing the reducer state shape in this change. The array shape is the current shape; this delta documents it.
- Persisting the viewport (zoom/pan) in this change. Viewport is session-only.
- Persisting `cascadeIndex`. The cascade resets per session; the persistence change MAY choose to persist it as a follow-up but is not required to.
- Re-introducing a Map-shaped state. The Map shape is stale and MUST NOT return.

## Test mapping

| Scenario                                        | Test file                                          | Test name                                                                         |
| ----------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------- |
| Persisted state uses the array shape, not a Map | `src/lib/pizarra/__tests__/pizarraReducer.test.js` | `reducer state.elements is an array, not a Map`                                   |
| Viewport is not part of the persisted state     | `src/lib/pizarra/__tests__/pizarraReducer.test.js` | `reducer state does not contain a viewport key`                                   |
| The stale Map shape is flagged for migration    | (doc review; no automated test)                    | `pizarra-state-persistence proposal carries the TODO(pizarra-ux-overhaul) marker` |
