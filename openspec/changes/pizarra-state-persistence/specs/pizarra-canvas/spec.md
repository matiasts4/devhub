# Pizarra Canvas Specification

## Purpose

Persistent whiteboard (pizarra) feature with elements, viewport, tool state, and multi-board support. State persists across page refresh using localStorage. Undo/redo is deferred to a separate SDD.

---

## Requirements

### Requirement: usePizarraState Hook Interface

The system MUST provide a `usePizarraState(projectId)` hook that returns the current pizarra state and mutation functions.

The hook signature MUST be:
```js
const { state, setState, addElement, updateElement, removeElement, clearCanvas } = usePizarraState(projectId)
```

The returned `state` object MUST contain:
```js
{
  elements: Map<elementId, PizarraElement>,
  viewport: { x: number, y: number, zoom: number },
  activeTool: 'select' | 'text' | 'rect' | 'circle' | 'line' | 'arrow',
  toolSettings: { color: string, strokeWidth: number, fontSize: number },
  activeBoardId: string,
  boards: Map<boardId, { id, name, createdAt }>
}
```

`PizarraElement` base shape MUST include: `{ id, type, x, y, width, height, scale, rotation, zIndex, locked, createdAt, updatedAt }`.

#### Scenario: Hook returns initial state from localStorage on mount

- GIVEN localStorage contains valid pizarra state for project `xyz`
- WHEN the component mounts and calls `usePizarraState('xyz')`
- THEN the hook returns state with `elements`, `viewport`, `activeTool`, `toolSettings`, `activeBoardId`, and `boards` hydrated from localStorage
- AND `addElement`, `updateElement`, `removeElement`, and `clearCanvas` functions are available

#### Scenario: Hook returns empty state when no localStorage entry exists

- GIVEN localStorage contains no entry for project `abc`
- WHEN `usePizarraState('abc')` is called
- THEN the hook returns a state with empty `elements` Map and `boards` Map
- AND default `viewport` (`{ x: 0, y: 0, zoom: 1 }`), `activeTool: 'select'`, and default `toolSettings`

#### Scenario: Active board defaults to first board when none is set

- GIVEN localStorage contains valid pizarra state for project `xyz` with at least one board and `activeBoardId: null`
- WHEN `usePizarraState('xyz')` is called
- THEN `state.activeBoardId` MUST be set to the ID of the first board in `state.boards`

---

### Requirement: localStorage Schema

The system MUST use localStorage key `devhub_pizarra_state:{projectId}` to persist pizarra state per project.

The stored value MUST be `JSON.stringify({ elements: Object.fromEntries(state.elements), viewport, activeTool, toolSettings, activeBoardId, boards: Object.fromEntries(state.boards), schemaVersion: 1 })`.

On mount, the hook MUST lazily read from localStorage and hydrate into useState.

On state change, a useEffect MUST write back to localStorage with a debounce of 500ms.

#### Scenario: State persists across page refresh

- GIVEN a user has drawn a rectangle element on the pizarra for project `xyz`
- WHEN the user refreshes the page and opens the pizarra for project `xyz`
- THEN the rectangle element MUST appear at the same position with the same properties
- AND `state.viewport`, `state.activeTool`, and `state.toolSettings` MUST match the pre-refresh values

#### Scenario: Switching projects loads corresponding state

- GIVEN project `xyz` has pizarra state with element `A` stored
- AND project `abc` has pizarra state with element `B` stored
- WHEN the user switches from project `xyz` to project `abc`
- THEN `usePizarraState` for project `abc` MUST return state containing element `B`
- AND element `A` MUST NOT appear in project `abc`'s state

---

### Requirement: Read/Write/Sanitize Pattern

The system MUST follow TWM persistence conventions: lazy initializer reads from localStorage once on mount, useEffect on state change writes to localStorage, JSON.parse wrapped in try/catch with fallback to empty state on parse error, and type guards on stored data to prevent invalid state hydration.

#### Scenario: Malformed JSON falls back to empty state

- GIVEN localStorage contains `{ elements: "not-an-array" }` for project `xyz` (invalid structure)
- WHEN `usePizarraState('xyz')` is called
- THEN the hook MUST catch the error or type guard failure
- AND return empty `elements` Map and default state without throwing
- AND NOT crash the application

#### Scenario: Partial valid state is loaded correctly

- GIVEN localStorage contains valid `viewport` and `activeTool` but missing `toolSettings` for project `xyz`
- WHEN `usePizarraState('xyz')` is called
- THEN `state.viewport` and `state.activeTool` MUST be hydrated from localStorage
- AND `state.toolSettings` MUST fall back to defaults

#### Scenario: Debounced write prevents excessive localStorage writes

- GIVEN localStorage is empty for project `xyz`
- WHEN `addElement` is called with 10 rapid consecutive invocations (within 200ms)
- THEN localStorage MUST be written at most twice: once on first change and once after 500ms debounce settles
- AND intermediate states MUST NOT trigger a write

---

### Requirement: State Isolation

The system MUST isolate pizarra state by `projectId`. Each project has its own pizarra state, and there is no cross-project state sharing.

#### Scenario: Clearing project `xyz` does not affect project `abc`

- GIVEN project `xyz` has pizarra state with 5 elements
- AND project `abc` has pizarra state with 3 elements
- WHEN `clearCanvas` is called for project `xyz`
- THEN project `xyz`'s elements MUST be empty
- AND project `abc`'s elements MUST remain unchanged with 3 elements

---

### Requirement: Undo/Redo Explicitly Excluded

The system MUST NOT implement undo/redo functionality in this SDD. This capability is deferred to a future SDD.

(Rationale: Undo/redo would expand scope significantly; current priority is canvas rendering and terminal integration.)