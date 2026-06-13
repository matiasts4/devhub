# Proposal: pizarra-state-persistence

## Intent

Add a whiteboard (pizarra) feature with persistent state using the existing localStorage pattern. The pizarra allows freehand drawing, shape placement, and text annotation on a canvas. State MUST survive page refresh and include tool selection, viewport, and all drawn elements.

## Scope

### In Scope

- Define pizarra state shape (elements, viewport, tool state, board metadata)
- Define `usePizarraState` hook interface with localStorage sync
- Define localStorage schema (`devhub_pizarra_state:{projectId}`)
- Implement read-on-mount, write-on-change persistence following TWM conventions
- Support multiple named boards per project
- Handle storage quota with history depth limit
- Add pizarra entry point (button in workspace right dock)

### Out of Scope

- Undo/redo (separate SDD)
- Canvas library selection (delegated to design phase)
- Real-time collaboration
- Export/import board data (future capability)

## Capabilities

### New Capabilities

- `pizarra-canvas`: persistent whiteboard with elements, viewport, tool state, and multi-board support.

### Modified Capabilities

- None.

## Approach

Create a new `usePizarraState` hook in `src/components/workspace/hooks/` that:
1. Reads persisted state from `devhub_pizarra_state:{projectId}` on mount
2. Exposes typed setters: `addElement`, `updateElement`, `removeElement`, `setViewport`, `setTool`
3. Writes state to localStorage on every change via useEffect (same pattern as TWM)
4. Maintains a schema version field for future migrations
5. Enforces a 100-element history depth limit before truncating oldest entries

State is project-scoped and independent from workspace state. A user switching workspaces retains the same pizarra boards. The active board ID is stored within pizarra state.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/components/workspace/hooks/usePizarraState.js` | New | Hook with state + localStorage sync |
| `src/components/workspace/PizarraCanvas.jsx` | New | Canvas component (UI only; canvas lib deferred to design) |
| `src/components/workspace/hooks/useOperatorActions.js` | Modified | Add pizarra toggle button |
| `openspec/changes/pizarra-state-persistence/` | New | Change folder |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| localStorage quota exceeded with dense strokes | Med | Enforce 100-element depth; expose board clear action |
| Canvas library choice affects state shape | Med | Defer library to design; keep element schema library-agnostic |
| State shape changes break existing boards | Low | Schema version field enables migration path |

## Rollback Plan

1. Remove `usePizarraState.js` hook
2. Remove `PizarraCanvas.jsx` component
3. Revert any modifications to `useOperatorActions.js`
4. Clear localStorage key via browser DevTools if needed

No schema migrations required for rollback.

## Dependencies

- Canvas library decision (deferred to design phase)
- Right dock extension point (already exists via `WorkspaceRightDock`)

## Success Criteria

- [ ] `usePizarraState` hook exists with typed element operations
- [ ] localStorage key `devhub_pizarra_state:{projectId}` persists across refresh
- [ ] Pizarra opens from workspace right dock
- [ ] Drawing elements persist after page reload
- [ ] Depth limit prevents unbounded storage growth
