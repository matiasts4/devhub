# Tasks: pizarra-state-persistence

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~500-600 (impl + tests) |
| 400-line budget risk | Medium |
| Chained PRs recommended | No (single PR is viable) |
| Suggested split | Single PR: helpers + hook + component + tests |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | All infrastructure, hook, component, and tests | PR 1 | Standalone deliverable; all files created together |

---

## Phase 1: Infrastructure — stateHelpers.js

- [ ] 1.1 Create `src/lib/pizarra/stateHelpers.js` with `createEmptyState()` returning state shape with empty `elements: Map()`, `viewport: {x:0, y:0, zoom:1}`, `activeTool: 'select'`, default `toolSettings`, and default `boards: Map()`
- [ ] 1.2 Implement `serialize(state)` — converts Map fields (`elements`, `boards`) to plain objects via `Object.fromEntries`, adds `schemaVersion: 1`
- [ ] 1.3 Implement `deserialize(raw)` — parses JSON, validates top-level keys, reconstructs Maps from plain objects, returns null on failure
- [ ] 1.4 Implement `validate(raw)` — type guards: `viewport` object with `{x,y,zoom}` numbers, `activeTool` in allowed string set, `toolSettings` object with `color`/`strokeWidth`/`fontSize`; returns boolean
- [ ] 1.5 Export all helpers from `src/lib/pizarra/stateHelpers.js`

## Phase 2: Core Implementation — usePizarraState.js

- [ ] 2.1 Create `src/components/workspace/usePizarraState.js` with `usePizarraState(projectId)` hook signature returning `{ state, setState, addElement, updateElement, removeElement, clearCanvas, undo, redo }`
- [ ] 2.2 Implement lazy initializer: read `devhub_pizarra_state:{projectId}` from localStorage, deserialize, validate; fall back to `createEmptyState()` on error or missing key
- [ ] 2.3 Set `activeBoardId` to first board ID when stored `activeBoardId` is null/undefined and `boards` is non-empty
- [ ] 2.4 Implement `addElement(element)` — generate `elementId` (crypto.randomUUID or Date.now fallback), set `createdAt`/`updatedAt`, insert into `state.elements` Map, return elementId
- [ ] 2.5 Implement `updateElement(elementId, updates)` — merge updates into existing element in Map, set `updatedAt`
- [ ] 2.6 Implement `removeElement(elementId)` — delete from `state.elements` Map
- [ ] 2.7 Implement `clearCanvas()` — clear all elements in `state.elements` Map
- [ ] 2.8 Implement `undo` and `redo` as no-op stubs with `// TODO: deferred to future SDD` comments
- [ ] 2.9 Add `useEffect([state])` with 500ms debounce to serialize and write state to localStorage key `devhub_pizarra_state:{projectId}`
- [ ] 2.10 Ensure `setState` uses functional update form so state mutations (addElement, etc.) trigger the useEffect

## Phase 3: Component Integration — PizarraPane.jsx + wiring

- [ ] 3.1 Create `src/components/workspace/PizarraPane.jsx` — component that calls `usePizarraState(projectId)` and renders the canvas area (stub render with state summary text or basic SVG placeholder)
- [ ] 3.2 Integrate `PizarraPane` into `WorkspaceRightDock.jsx` — add "pizarra" tab entry to `RIGHT_DOCK_TABS` if not already present; mount `PizarraPane` for the tab panel
- [ ] 3.3 Update `RIGHT_DOCK_STATE_KEYS` in `rightDockState.js` to include `'pizarra'` for state key mapping

## Phase 4: Testing

- [ ] 4.1 Write unit tests for `createEmptyState` — verify all defaults (viewport, activeTool, toolSettings, empty Maps)
- [ ] 4.2 Write unit tests for `serialize` — verify Map→Object conversion and schemaVersion field
- [ ] 4.3 Write unit tests for `deserialize` — happy path, malformed JSON returns null, missing keys falls back gracefully
- [ ] 4.4 Write unit tests for `validate` — valid state passes, missing viewport fails, wrong activeTool fails, partial state fails
- [ ] 4.5 Write unit tests for `usePizarraState` hook — verify returned API shape (all 8 keys present), addElement returns elementId, updateElement/removeElement mutate correctly, clearCanvas empties elements Map
- [ ] 4.6 Write integration tests for localStorage roundtrip — mount hook → addElement → unmount → remount with same projectId → verify elements Map is hydrated
- [ ] 4.7 Write integration tests for project isolation — mount two hook instances with different projectIds → add element to one → verify the other has no cross-contamination
- [ ] 4.8 Test debounce behavior — mock localStorage, call addElement 3x rapidly, assert localStorage.setItem called at most twice