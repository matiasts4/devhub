# Proposal: pizarra-core

## Intent

Add an infinite canvas ("pizarra") as a new tab in the existing right dock system. The canvas lets operators place, move, and arrange swarm agents, terminals, notes, and shapes freely in 2D space. It addresses the need to visualize and organize multi-agent workflows spatially rather than in a fixed terminal/panel layout.

## Scope

### In Scope
- Infinite canvas with pan (mouse drag) and zoom (mouse wheel / Ctrl+scroll)
- Pizarra element model: agents, terminals, text boxes, shapes (rectangles, ellipses)
- Layer management with z-index control
- Dock tab integration: "pizarra" as a new tab in WorkspaceRightDock
- Mode switch: user clicks the pizarra tab to enter canvas mode, clicks another tab to return to fixed dock
- @use-gesture integration for pan/zoom gestures
- Coordinate system: canvas logical coordinates (infinite, pannable) vs viewport coordinates (screen pixels)

### Out of Scope
- Standalone full-screen route (future work)
- Canvas persistence to database (future work)
- Drag-and-drop from dock into canvas
- Multi-user sync
- Canvas item connections / edges
- React Flow or any graph library -- custom DOM-based canvas only

## Capabilities

### New Capabilities
- `pizarra-canvas`: Infinite pan/zoom canvas component with element placement, movement, and layer control
- `pizarra-element-types`: Agent nodes, terminal nodes, text boxes, and shapes
- `pizarra-dock-integration`: Pizarra as a tab in the existing right dock tab system

### Modified Capabilities
- None (this is a net-new capability)

## Approach

**Integration point: new dock tab** -- The pizarra will be a new `pizarra` tab in `WorkspaceRightDock.jsx`, coexisting with existing browser/editor/swarm/operator/zed tabs. This provides immediate access without a new route or workspace window type.

**Canvas rendering: absolute-positioned DOM nodes over a transform container** -- The canvas will use a container div with `transform: translate(x, y) scale(zoom)` for pan/zoom. Each element (agent, terminal, textbox, shape) is an absolutely-positioned DOM node inside the transformed container. This avoids a full canvas/WebGL rewrite and keeps interaction handlers simple.

**Pan/Zoom: @use-gesture** -- `@use-gesture` will handle mouse drag (pan) and wheel (zoom) gestures on the canvas container. Zoom will be clamped to [0.1, 4.0]. Pan has no bounds (infinite canvas).

**Element model** -- Each element is an object with:
- `id`: unique string
- `type`: `agent | terminal | textbox | rectangle | ellipse`
- `position: { x: number, y: number }`: canvas logical coordinates
- `size: { width: number, height: number }`
- `zIndex: number`
- `data`: type-specific payload (agent config, terminal ref, text content, shape style)

**Layer management** -- Elements share a single z-index namespace per canvas. Users can bring elements forward/backward via context menu. Default z-index increments on each new element.

**State management** -- Pure React state in a `usePizarra` hook (useState for elements array, zoom, pan offset). No Zustand, no global store. State is ephemeral -- no persistence in this phase.

**Conflicts with react-resizable-panels** -- The canvas lives in the dock tab, NOT inside the terminal workspace area. The terminal workspace uses react-resizable-panels; the dock uses its own conditional rendering. These are sibling subtrees in the DOM, so there is no direct conflict.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/components/workspace/WorkspaceRightDock.jsx` | Modified | Add `pizarra` tab to tab list and conditional render |
| `src/components/workspace/rightDockState.js` | Modified | Add `pizarra` to activeTab type union if needed |
| `src/components/pizarra/` (new) | New | Canvas component, element renderers, usePizarra hook |
| `package.json` | Modified | Add `@use-gesture/core`, `@use-gesture/react` |
| `openspec/changes/pizarra-core/` | New | SDD change folder |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Dock tab width (20-82%) limits canvas real estate | Medium | Canvas supports zooming out to 10% to see full workspace; future standalone route is out of scope but documented |
| Pan/zoom conflicts with nested scroll containers | Medium | Attach gestures to canvas container only; use `stopPropagation` on wheel events |
| No canvas persistence means state is lost on navigation | High (accepted) | Document that persistence is out of scope; plan for localStorage or DB in future phase |
| Performance with many elements (100+) | Low | Use `will-change: transform` on canvas container; defer rendering off-screen elements if needed |

## Rollback Plan

1. Remove `pizarra` tab from `WorkspaceRightDock.jsx` (revert 1 file)
2. Remove `pizarra/` directory from `src/components/`
3. Uninstall `@use-gesture/core` and `@use-gesture/react` from `package.json`
4. Run `npm install` to clean up
5. Delete `openspec/changes/pizarra-core/` directory

Rollback is low-risk because pizarra is a net-new feature with no modifications to existing terminal, dock, or workspace logic.

## Dependencies

- `@use-gesture/core` and `@use-gesture/react` -- must be installed before development
- React 19 (already in use)
- No changes to Tauri, database schema, or API routes

## Success Criteria

- [ ] Pizarra tab appears in the right dock next to existing tabs
- [ ] Canvas supports pan (click + drag on empty space) and zoom (Ctrl + scroll or mouse wheel)
- [ ] At least one element type can be placed on the canvas (agent node or textbox)
- [ ] Elements can be moved by dragging
- [ ] Elements can be reordered in z-index via context menu
- [ ] Clicking another dock tab returns to the fixed view without canvas state persisting
- [ ] No regressions in existing dock tabs or terminal workspace
