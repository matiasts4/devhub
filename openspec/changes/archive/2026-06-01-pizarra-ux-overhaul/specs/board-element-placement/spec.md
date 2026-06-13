# Delta Spec: board-element-placement (Pizarra UX Overhaul, Phase 1)

> **Move coverage**: Move 2 (reducer-driven cascade for new elements), Move 6 (add-terminal / add-browser testids).
> **Stem rationale**: new capability. Promoted to base spec at `openspec/specs/board-element-placement/spec.md` on archive. Owns the policy that decides where a new element lands on creation; deliberately separated from the existing `pizarra-canvas` (shape model + selection) and `canvas-terminal` (xterm + fit + zoom) specs.

## Purpose

Define how the pizarra places a newly-created element on the board so that adding a second element never collides with the first. The placement policy is reducer-driven (testable in isolation), deterministic (same `cascadeIndex` always produces the same offset), wraps so the cascade never escapes the viewport, and is the single source of truth for `handleAddElement` in `PizarraPane.jsx`.

## Requirements

### Requirement 1: Reducer-driven cascade offset for new elements

The system MUST track a `cascadeIndex: number` field on the pizarra reducer state. The system MUST expose a `PIZARRA_ACTIONS.CASCADE_OFFSET` action that advances `cascadeIndex` and returns the next available `(x, y)` for a new element.

The cascade step MUST be 24px. The wrap modulus MUST be 8. The system MUST compute the offset as:

```
offsetX = 24 * (cascadeIndex mod 8)
offsetY = 24 * (cascadeIndex mod 8)
```

The system MUST combine the offset with the canvas-center anchor (currently `canvasCenter = { x: width/2 - 320, y: height/2 - 200 }` in `PizarraPane.handleAddElement`) to produce the final element position.

The cascade MUST wrap after the 8th consecutive call so the cascade never escapes the viewport. Calls 1-8 use offsets 0, 24, 48, 72, 96, 120, 144, 168; call 9 wraps to offset 0 again (it is a separate "lap", and overlaps with call 1 are still possible — this is acceptable for Phase 1; full wraparound is deferred to the persistence change).

`handleAddElement` in `PizarraPane.jsx` MUST read the cascade offset from the reducer rather than hard-coding `canvasCenter` for both terminal and browser elements.

#### Scenario: First element lands at the canvas-center anchor

- GIVEN the pizarra state has `cascadeIndex === 0`
- WHEN `handleAddElement('terminal')` is called
- THEN the reducer MUST return the next offset as `(0, 0)`
- AND the new element MUST be created at `canvasCenter`
- AND `cascadeIndex` MUST advance to `1`

#### Scenario: Second element is offset 24px from the first

- GIVEN the pizarra state has `cascadeIndex === 1` (one element was already added)
- WHEN `handleAddElement('browser')` is called
- THEN the reducer MUST return the next offset as `(24, 24)`
- AND the new element MUST be created at `canvasCenter + (24, 24)`
- AND `cascadeIndex` MUST advance to `2`

#### Scenario: Terminal and browser create non-overlapping bounds

- GIVEN the pizarra state has `cascadeIndex === 0` and the canvas is 1280x800
- WHEN `handleAddElement('terminal')` is called
- AND THEN `handleAddElement('browser')` is called
- THEN the two elements' bounding boxes MUST NOT overlap
- AND the second element's bounds MUST be offset by `(24, 24)` from the first

#### Scenario: Cascade wraps after 8 calls

- GIVEN the pizarra state has `cascadeIndex === 7`
- WHEN `CASCADE_OFFSET` is dispatched once
- THEN the returned offset MUST be `(168, 168)`
- AND the next dispatch of `CASCADE_OFFSET` MUST return offset `(0, 0)` (wrap)

#### Scenario: Cascade advance is independent of the element type

- GIVEN the pizarra state has `cascadeIndex === 2`
- WHEN `handleAddElement('terminal')` is called
- AND THEN `handleAddElement('browser')` is called
- THEN the third element MUST be at offset `(48, 48)`
- AND the fourth element MUST be at offset `(72, 72)`
- AND both element types MUST use the same cascade counter (no per-type sub-indices)

### Requirement 2: Cascade is deterministic across re-renders

The system MUST derive the cascade offset from the reducer's `cascadeIndex` field. The system MUST NOT compute the offset from a `useEffect`, `useRef`, or any React state local to `PizarraPane`. The system MUST NOT compute the offset from the current count of `state.elements` (because element deletions would rewind the cascade non-deterministically).

The system MUST be testable: a pure reducer call MUST produce the cascade offset without rendering the component tree.

#### Scenario: Cascade offset is pure-reducer derived

- GIVEN a fresh reducer state `{ cascadeIndex: 0, elements: [], ... }`
- WHEN the reducer is called with `PIZARRA_ACTIONS.CASCADE_OFFSET`
- THEN the returned next-offset MUST be `(0, 0)`
- AND the new state MUST have `cascadeIndex: 1`
- AND no DOM measurement MUST be required

#### Scenario: Deleting an element does not rewind the cascade

- GIVEN the pizarra state has `cascadeIndex === 3` and three elements
- WHEN element with `id === 'el-1'` is deleted
- THEN `cascadeIndex` MUST remain `3`
- AND the next `handleAddElement` call MUST use offset `(72, 72)`, NOT `(0, 0)`

### Requirement 3: Cascade selector test wiring

The system MUST expose `data-testid="pizarra-add-terminal"` and `data-testid="pizarra-add-browser"` on the tool palette buttons so the cascade test can drive the policy end-to-end without coupling to internals.

The system MUST use `userEvent` (not `fireEvent`) to click the add buttons in tests, and the click handler MUST dispatch `CASCADE_OFFSET` then `ADD_ELEMENT` in a single React batch.

#### Scenario: Test drives terminal + browser creation via testids

- GIVEN `PizarraPane` is rendered with the testids exposed
- WHEN a test calls `userEvent.click(screen.getByTestId('pizarra-add-terminal'))`
- AND THEN `userEvent.click(screen.getByTestId('pizarra-add-browser'))`
- THEN the second click MUST dispatch `CASCADE_OFFSET` and `ADD_ELEMENT`
- AND the resulting state MUST have two elements with the cascade offset applied

## Non-Goals

- Per-element-type cascade indices (a single counter drives all element types in Phase 1).
- Smart collision detection (the 24px step is good enough to avoid the immediate "stack on top" symptom; full collision avoidance is deferred).
- Wrapping to the OPPOSITE corner of the canvas on wrap (the cascade stays near `canvasCenter`).
- Multi-board / per-project cascade isolation (a single cascade counter per `usePizarraState` mount; persistence reconciliation is owned by `pizarra-state-persistence`).
- Re-introducing snap-to-grid or any snap math.

## Test mapping

| Scenario                                            | Test file                                                       | Test name                                                   |
| --------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------- |
| First element lands at the canvas-center anchor     | `src/lib/pizarra/__tests__/pizarraReducer.test.js`              | `CASCADE_OFFSET returns (0, 0) when cascadeIndex is 0`      |
| Second element is offset 24px from the first        | `src/lib/pizarra/__tests__/pizarraReducer.test.js`              | `CASCADE_OFFSET advances by 24px per call`                  |
| Terminal and browser create non-overlapping bounds  | `src/components/pizarra/__tests__/PizarraPane.cascade.test.jsx` | `two handleAddElement calls produce non-overlapping bounds` |
| Cascade wraps after 8 calls                         | `src/lib/pizarra/__tests__/pizarraReducer.test.js`              | `CASCADE_OFFSET wraps after 8 calls (modulo 8)`             |
| Cascade advance is independent of the element type  | `src/lib/pizarra/__tests__/pizarraReducer.test.js`              | `cascade counter is shared across element types`            |
| Cascade offset is pure-reducer derived              | `src/lib/pizarra/__tests__/pizarraReducer.test.js`              | `CASCADE_OFFSET is computed without DOM measurement`        |
| Deleting an element does not rewind the cascade     | `src/lib/pizarra/__tests__/pizarraReducer.test.js`              | `DELETE_ELEMENT does not rewind cascadeIndex`               |
| Test drives terminal + browser creation via testids | `src/components/pizarra/__tests__/PizarraPane.cascade.test.jsx` | `add buttons dispatch CASCADE_OFFSET then ADD_ELEMENT`      |
