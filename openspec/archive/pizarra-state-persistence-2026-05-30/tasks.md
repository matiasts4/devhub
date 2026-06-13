# Tasks: pizarra-state-persistence

## Status: COMPLETED

All 20 tasks completed. Implementation verified and archived 2026-05-30.

---

## Phase 1: Infrastructure — stateHelpers.js

- [x] 1.1 Create `src/lib/pizarra/stateHelpers.js` with `createEmptyState()` returning state shape with empty `elements: Map()`, `viewport: {x:0, y:0, zoom:1}`, `activeTool: 'select'`, default `toolSettings`, and default `boards: Map()`
- [x] 1.2 Implement `serialize(state)` — converts Map fields (`elements`, `boards`) to plain objects via `Object.fromEntries`, adds `schemaVersion: 1`
- [x] 1.3 Implement `deserialize(raw)` — parses JSON, validates top-level keys, reconstructs Maps from plain objects, returns null on failure
- [x] 1.4 Implement `validate(raw)` — type guards: `viewport` object with `{x,y,zoom}` numbers, `activeTool` in allowed string set, `toolSettings` object with `color`/`strokeWidth`/`fontSize`; returns boolean
- [x] 1.5 Export all helpers from `src/lib/pizarra/stateHelpers.js`

## Phase 2: Core Implementation — usePizarraState.js

- [x] 2.1 Create `src/components/workspace/usePizarraState.js` with `usePizarraState(projectId)` hook signature returning `{ state, setState, addElement, updateElement, removeElement, clearCanvas, undo, redo }`
- [x] 2.2 Implement lazy initializer: read `devhub_pizarra_state:{projectId}` from localStorage, deserialize, validate; fall back to `createEmptyState()` on error or missing key
- [x] 2.3 Set `activeBoardId` to first board ID when stored `activeBoardId` is null/undefined and `boards` is non-empty
- [x] 2.4 Implement `addElement(element)` — generate `elementId` (crypto.randomUUID or Date.now fallback), set `createdAt`/`updatedAt`, insert into `state.elements` Map, return elementId
- [x] 2.5 Implement `updateElement(elementId, updates)` — merge updates into existing element in Map, set `updatedAt`
- [x] 2.6 Implement `removeElement(elementId)` — delete from `state.elements` Map
- [x] 2.7 Implement `clearCanvas()` — clear all elements in `state.elements` Map
- [x] 2.8 Implement `undo` and `redo` as no-op stubs with `// TODO: deferred to future SDD` comments
- [x] 2.9 Add `useEffect([state])` with 500ms debounce to serialize and write state to localStorage key `devhub_pizarra_state:{projectId}`
- [x] 2.10 Ensure `setState` uses functional update form so state mutations (addElement, etc.) trigger the useEffect

## Phase 3: Component Integration — PizarraPane.jsx + wiring

- [x] 3.1 Create `src/components/workspace/PizarraPane.jsx` — component that calls `usePizarraState(projectId)` and renders the canvas area (stub render with state summary text or basic SVG placeholder)
- [x] 3.2 Integrate `PizarraPane` into `WorkspaceRightDock.jsx` — add "pizarra" tab entry to `RIGHT_DOCK_TABS` if not already present; mount `PizarraPane` for the tab panel
- [x] 3.3 Update `RIGHT_DOCK_STATE_KEYS` in `rightDockState.js` to include `'pizarra'` for state key mapping

## Phase 4: Testing

- [x] 4.1 Write unit tests for `createEmptyState` — verify all defaults (viewport, activeTool, toolSettings, empty Maps)
- [x] 4.2 Write unit tests for `serialize` — verify Map→Object conversion and schemaVersion field
- [x] 4.3 Write unit tests for `deserialize` — happy path, malformed JSON returns null, missing keys falls back gracefully
- [x] 4.4 Write unit tests for `validate` — valid state passes, missing viewport fails, wrong activeTool fails, partial state fails
- [x] 4.5 Write unit tests for `usePizarraState` hook — verify returned API shape (all 8 keys present), addElement returns elementId, updateElement/removeElement mutate correctly, clearCanvas empties elements Map
- [x] 4.6 Write integration tests for localStorage roundtrip — mount hook → addElement → unmount → remount with same projectId → verify elements Map is hydrated
- [x] 4.7 Write integration tests for project isolation — mount two hook instances with different projectIds → add element to one → verify the other has no cross-contamination
- [x] 4.8 Test debounce behavior — mock localStorage, call addElement 3x rapidly, assert localStorage.setItem called at most twice
