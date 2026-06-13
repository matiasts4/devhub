# Design: pizarra-state-persistence

> **pizarra-ux-overhaul marker (2026-06-01)**: this design currently
> proposes `elements: Map<elementId, PizarraElement>` and a
> `viewport: {x, y, zoom}` field. The actual
> `src/lib/pizarra/pizarraReducer.js` uses
> `elements: Array<PizarraElement>` with `cascadeIndex: number`, and
> zoom/pan live in `CanvasViewportContext` (NOT in the reducer).
>
> When this change lands, it MUST adopt the array-shaped reducer
> (the actual source of truth) and reconcile the spec via the
> migration plan in `openspec/changes/pizarra-ux-overhaul/design.md`
> §9. The TODO marker below tracks the reconciliation; remove it
> once the in-flight persistence change adopts the array shape.
>
> <!-- TODO(pizarra-ux-overhaul): migrate elements: Map<id, PizarraElement> to elements: Array<PizarraElement>; remove the viewport field from the persisted state; the zoom/pan lives in CanvasViewportContext only. See openspec/changes/pizarra-ux-overhaul/specs/pizarra-state-persistence/spec.md -->

## Technical Approach

Implement a `usePizarraState` React hook that provides whiteboard state management with localStorage persistence per project. Follow the established TWM persistence pattern: lazy initializer for read, useEffect for write, debounced sync, and robust error handling.

## Architecture Decisions

### Decision: Map-based element storage

**Choice**: `elements: Map<elementId, PizarraElement>` instead of plain object or array.
**Alternatives considered**: Object `{ [id]: element }` or array `[]`.
**Rationale**: Map provides O(1) lookup/insert/delete without traversing arrays. Element updates are frequent during drawing; Map operations are constant time vs O(n) for arrays or object iteration for targeted updates.

### Decision: 500ms debounced writes

**Choice**: Debounce localStorage writes by 500ms.
**Alternatives considered**: Immediate write on every state change, or throttled at 100ms.
**Rationale**: Freehand drawing generates rapid state updates (mouse move events). Immediate writes flood localStorage; 500ms balances persistence reliability with responsiveness. Spec mandates debounce behavior.

### Decision: Project-scoped isolation

**Choice**: State partitioned by `projectId` via `devhub_pizarra_state:{projectId}` key.
**Alternatives considered**: Global key with project ID embedded in state, or workspace-scoped.
**Rationale**: Proposal specifies project-scoped behavior. TWM uses project-keyed storage (`devhub_right_dock_{projectId}`). Consistent with existing patterns; no cross-project state leakage.

### Decision: Stub undo/redo

**Choice**: Provide no-op `undo`/`redo` functions; comment as deferred.
**Alternatives considered**: Implement command pattern with history stack.
**Rationale**: Spec explicitly excludes undo/redo. Adding history array now would complicate state shape and migrations. Structure allows future addition without breaking changes.

## Data Flow

```
Component mounts
      │
      ▼
usePizarraState(projectId)
      │
      ▼
Lazy initializer ──► localStorage.getItem(`devhub_pizarra_state:{projectId}`)
      │                          │
      │                          ▼ (parse + validate)
      │                      Hydrated state
      │                          │
      └──────────────────────► useState(initialState)
                                    │
                                    ▼
                              Render with state
                                    │
                   ┌────────────────┼────────────────┐
                   │                │                │
                   ▼                ▼                ▼
            addElement()     updateElement()   removeElement()
                   │                │                │
                   └────────────┬───┴────────────────┘
                                ▼
                         setState(newState)
                                │
                                ▼
                     useEffect [state] triggered
                                │
                                ▼
                         Debounce 500ms
                                │
                                ▼
                    localStorage.setItem(...)
```

## File Changes

| File                                                   | Action | Description                                           |
| ------------------------------------------------------ | ------ | ----------------------------------------------------- |
| `src/components/workspace/usePizarraState.js`          | Create | Hook with state, mutations, localStorage sync         |
| `src/lib/pizarra/stateHelpers.js`                      | Create | `createEmptyState`, serialization, validation helpers |
| `src/components/workspace/PizarraPane.jsx`             | Create | Canvas wrapper component consuming the hook           |
| `src/components/workspace/hooks/useOperatorActions.js` | Modify | Add "pizarra" to dock tabs if needed for integration  |
| `openspec/changes/pizarra-state-persistence/design.md` | Create | This document                                         |

## Interfaces / Contracts

### usePizarraState Hook

```javascript
// Signature
const {
  state, // { elements, viewport, activeTool, toolSettings, activeBoardId, boards }
  setState, // (updater) => void — functional update
  addElement, // (element) => elementId
  updateElement, // (elementId, updates) => void
  removeElement, // (elementId) => void
  clearCanvas, // () => void
  undo, // () => void — stub, deferred
  redo, // () => void — stub, deferred
} = usePizarraState(projectId);
```

### State Shape

```javascript
{
  elements: Map<elementId, PizarraElement>,
  viewport: { x: number, y: number, zoom: number },
  activeTool: 'select' | 'text' | 'rect' | 'circle' | 'line' | 'arrow',
  toolSettings: { color: '#000000', strokeWidth: 2, fontSize: 16 },
  activeBoardId: string,
  boards: Map<boardId, { id, name, createdAt }>
}
```

### localStorage Schema

Key: `devhub_pizarra_state:{projectId}`

```javascript
JSON.stringify({
  elements: Object.fromEntries(state.elements), // Serialize Map → Object
  viewport: state.viewport,
  activeTool: state.activeTool,
  toolSettings: state.toolSettings,
  activeBoardId: state.activeBoardId,
  boards: Object.fromEntries(state.boards),
  schemaVersion: 1,
});
```

### PizarraElement Base Shape

```javascript
{
  id: string,
  type: 'rect' | 'circle' | 'line' | 'arrow' | 'text' | 'freehand',
  x: number,
  y: number,
  width?: number,
  height?: number,
  scale: number,
  rotation: number,
  zIndex: number,
  locked: boolean,
  createdAt: number,
  updatedAt: number,
  // type-specific properties (points, text, color, strokeWidth, etc.)
}
```

## Testing Strategy

| Layer       | What to Test                                         | Approach                                 |
| ----------- | ---------------------------------------------------- | ---------------------------------------- |
| Unit        | `createEmptyState` returns correct defaults          | Direct function call assertion           |
| Unit        | `sanitizePizarraState` falls back on malformed input | Jest with mock localStorage              |
| Unit        | Hook returns correct API shape                       | React Testing Library, renderHook        |
| Integration | State persists across refresh                        | Simulated storage + hook remount         |
| Integration | Project isolation (xyz vs abc)                       | Two hook instances, verify no cross-talk |

## Migration / Rollout

No migration required for v1. `schemaVersion: 1` field enables future migration path via version comparison and transform functions in `stateHelpers.js`.

## Open Questions

- [ ] Canvas rendering library: fabric.js vs Konva vs custom SVG? Deferred to separate decision.
- [ ] Freehand drawing smoothing algorithm? Stroke point sampling rate?
- [ ] Board naming/renaming UI? For now, single default board.
