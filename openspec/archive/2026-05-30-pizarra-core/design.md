# Design: pizarra-core

## Technical Approach

Implement a floating canvas "pizarra" tab in the right dock that allows users to drag/position workspace elements freely. The canvas uses CSS transforms for pan/zoom via @use-gesture, with Framer Motion for element dragging. Elements are React components with state managed via useState in a CanvasViewportContext.

## Architecture Decisions

### Decision: Canvas Viewport Context (vs Prop Drilling)

**Choice**: CanvasViewportContext provider wrapping all pizarra components
**Alternatives considered**: Prop drilling transform state to every component
**Rationale**: Pizarra elements (textbox, shapes, agent nodes) need transform data at any nesting depth. Context eliminates prop chain maintenance and keeps element components reusable.

### Decision: @use-gesture over native handlers

**Choice**: Use `@use-gesture/react` for pan/zoom gestures
**Alternatives considered**: Native wheel/drag event handlers with manual state management
**Rationale**: @use-gesture handles edge cases (pinch-to-zoom, passive listeners, multi-touch) that native handlers require boilerplate to match. Project already uses framer-motion which pairs well with @use-gesture.

### Decision: CSS transform over Canvas API

**Choice**: CSS `transform: translate() scale()` on positioned elements
**Alternatives considered**: HTML5 Canvas 2D context with manual rendering
**Rationale**: DOM-based canvas integrates naturally with React's component model, supports CSS styling, and avoids reimplementing hit-testing. For pizarra's expected element count (<100), DOM perf is acceptable.

### Decision: Framer Motion for element dragging

**Choice**: Framer Motion `drag` on PizarraElement wrappers
**Alternatives considered**: Custom drag via onPointerDown + CSS transforms
**Rationale**: Framer Motion handles pointer capture, bounds, and momentum out of the box. Consistent with existing animation patterns in the codebase.

## Data Flow

```
CanvasViewportContext { offsetX, offsetY, scale }
    │
    ├── PizarraCanvas (gesture handler, state owner)
    │       │
    │       ├── PizarraElement[] (positioned via CSS transform)
    │       │       │
    │       │       └── PizarraToolPalette (tool selection)
    │       │
    │       └── SelectionOverlay (selected element handles)
    │
    └── viewportToCanvas(vx, vy) → { x, y }
```

**Element drag flow**:
1. User mousedown on element → Framer Motion drag begins
2. onDragUpdate → update element position in state
3. Position stored as canvas logical coords
4. Render: CSS transform combines element position + viewport pan/zoom

**Pan flow**:
1. Wheel/drag on canvas background → @use-gesture handler
2. Handler updates offsetX, offsetY in viewport state
3. All elements re-render with new CSS transform

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/components/pizarra/CanvasViewportContext.jsx` | Create | React context with { transform, pan, zoom, viewportToCanvas, canvasToViewport } |
| `src/components/pizarra/PizarraCanvas.jsx` | Create | Main canvas component with @use-gesture handlers |
| `src/components/pizarra/PizarraElement.jsx` | Create | Base wrapper component with Framer Motion drag |
| `src/components/pizarra/PizarraToolPalette.jsx` | Create | Tool selection UI (select, textbox, rectangle, ellipse, arrow) |
| `src/components/pizarra/elements/TextboxElement.jsx` | Create | Text element with editable content |
| `src/components/pizarra/elements/ShapeElement.jsx` | Create | Rectangle, ellipse, line, arrow shapes via SVG |
| `src/components/pizarra/PizarraPane.jsx` | Create | Container: toolbar + canvas |
| `src/components/workspace/WorkspaceRightDock.jsx` | Modify | Add `isPizarraActive` conditional + PizarraPane import |
| `src/components/workspace/rightDockState.js` | Modify | Add `'pizarra'` to activeTab/maximizedView allowlists |
| `package.json` | Modify | Add `@use-gesture/react` dependency |

## Interfaces / Contracts

```jsx
// CanvasViewportContext value shape
{
  offsetX: number,       // pan offset X
  offsetY: number,       // pan offset Y
  scale: number,         // zoom level [0.1, 4.0]
  viewportToCanvas: (vx: number, vy: number) => { x, y },
  canvasToViewport: (cx: number, cy: number) => { x, y },
}

// PizarraElement props
{
  id: string,
  type: 'textbox' | 'rectangle' | 'ellipse' | 'line' | 'arrow' | 'agent',
  position: { x: number, y: number },
  size: { width: number, height: number },
  zIndex: number,
  locked: boolean,
  selected: boolean,
  onSelect: (id: string) => void,
  onPositionChange: (id: string, pos: { x, y }) => void,
}
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | viewportToCanvas / canvasToViewport math | Jest with assertTransforms |
| Unit | sanitizeRightDockState accepts 'pizarra' | Jest unit test |
| Integration | PizarraCanvas renders elements at correct positions | Playwright with canvas coords assertion |
| E2E | Pan gesture moves viewport | Playwright mouse drag + canvas position check |
| E2E | Zoom wheel changes scale within [0.1, 4.0] | Playwright wheel + scale assertion |

## Migration / Rollout

No migration required. This is a new feature flag behind existing dock infrastructure.

Rollout phases:
1. Add 'pizarra' to dock state sanitizers (no UI change yet)
2. Create pizarra components (no integration yet)
3. Integrate PizarraPane into WorkspaceRightDock
4. Add @use-gesture dependency

Feature toggle: CSS class `.pizarra-hidden` on the pane container allows instant disable without code changes.

## Open Questions

- [ ] Should pizarra state persist across sessions? (spec says no for v1)
- [ ] Do we need keyboard shortcuts for tool selection? (spec says no for v1)
- [ ] Should elements be selectable via box-select (drag selection rectangle)? (out of scope for v1)
