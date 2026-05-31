# Design: Pizarra Terminal Integration

## Technical Approach

Embed `TerminalTTY` instances inside the pizarra infinite canvas as draggable, resizable, zoomable elements. Canvas controls positioning, sizing, and zoom. The key architectural constraint: `FitAddon.fit()` uses `getBoundingClientRect()` which returns physical pixels, NOT CSS-transformed visual pixels. Therefore, zoom is propagated by updating container DOM `width`/`height` attributes rather than CSS `transform: scale()`.

## Architecture Decisions

### Decision: Zoom via DOM attributes, not CSS transform

**Choice**: Update container `width`/`height` attributes on zoom change
**Alternatives considered**: CSS `transform: scale()` — breaks FitAddon because getBoundingClientRect() ignores CSS transforms
**Rationale**: FitAddon computes cols/rows from physical pixel dimensions. Only DOM attribute changes affect getBoundingClientRect().

### Decision: CanvasViewportContext for shared state

**Choice**: React Context provides `{ zoom, pan, viewportRect }` to all canvas children
**Alternatives considered**: Prop drilling through every component — fragile, verbose
**Rationale**: Consistent coordinate translation across terminal elements, future canvas elements (agent nodes, textboxes).

### Decision: VTE renderer blocked in canvas context

**Choice**: CanvasTerminal enforces `requestedRendererMode: 'xterm'`
**Alternatives considered**: Allow VTE renderer — VTE operates outside DOM, canvas-relative positioning fails
**Rationale**: Native VTE renders to GTK surface, not inside the canvas DOM tree.

### Decision: Independent WebSocket sessions per canvas terminal

**Choice**: Each CanvasTerminal opens its own `/api/terminal/session` WebSocket
**Alternatives considered**: Share session across canvas instances — breaks isolation, session recovery
**Rationale**: Canvas crash orphans terminal; independent sessions allow reconnection. TerminalTTY handles reconnect logic.

## Data Flow

```
Canvas Viewport (zoom/pan state)
    │
    ├── CanvasViewportContext
    │       │
    │       ▼
    │   CanvasTerminal (position: absolute)
    │       │
    │       ├── onZoomChange → update container width/height
    │       │
    │       ▼
    │   TerminalTTY (hideTitleBar=true)
    │       │
    │       ├── ResizeObserver → FitAddon.fit()
    │       │       │
    │       │       └── getBoundingClientRect() → correct physical pixels
    │       │
    │       └── WebSocket → PTY resize events
    │
    └── Canvas Element (click detection, coordinate translation)
```

### Zoom Sequence (1.0 -> 2.0)

```
wheel event → zoom context update → container.style.width = logicalWidth * zoom
                                   → container.style.height = logicalHeight * zoom
                                   → ResizeObserver fires
                                   → FitAddon.fit() reads getBoundingClientRect()
                                   → new cols/rows → WebSocket resize → PTY notifies
```

### PTY Resize Sequence

```
PTY sends {type:'resize', cols, rows} → TerminalTTY FitAddon.fit()
        → container.getBoundingClientRect() → terminal auto-fit to content
        → CanvasTerminal receives onResize → canvas element size updates
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/components/pizarra/CanvasTerminal.jsx` | Create | Wrapper: position:absolute, zoom-aware sizing, TerminalTTY integration |
| `src/components/pizarra/CanvasTerminal.module.css` | Create | Styles for canvas-hosted terminal container |
| `src/lib/pizarra/canvasViewport.js` | Create | CanvasViewportContext + coordinate translation utilities |
| `src/components/TerminalTTY.jsx` | Modify | Accept `externalDimensionSource` prop for canvas-hosted sizing |

## Interfaces

### CanvasViewportContext

```typescript
interface CanvasViewportContextValue {
  zoom: number;           // 1.0 = 100%
  pan: { x: number; y: number };
  viewportRect: DOMRect; // canvas container bounding rect
  canvasRect: DOMRect;   // canvas element bounding rect
  // Coordinate translation
  canvasToViewport: (cx: number, cy: number) => { x: number; y: number };
  viewportToCanvas: (vx: number, vy: number) => { x: number; y: number };
}
```

### CanvasTerminal Props

```typescript
interface CanvasTerminalProps {
  terminalId: string;
  position: { x: number; y: number };   // canvas logical coords
  size: { width: number; height: number }; // logical dimensions
  canvasZoom: number;
  onClose?: () => void;
  onResize?: (size: { width: number; height: number }) => void;
}
```

### Coordinate Translation Formulas

```
viewportX = canvasRect.left + pan.x + (canvasX * zoom)
viewportY = canvasRect.top  + pan.y + (canvasY * zoom)

canvasX = (viewportX - canvasRect.left - pan.x) / zoom
canvasY = (viewportY - canvasRect.top  - pan.y) / zoom
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | `canvasToViewport`, `viewportToCanvas` math | Vitest: known input/output pairs |
| Unit | Zoom attribute update logic | Vitest: mock container, verify width/height |
| Unit | VTE renderer fallback warning | Vitest: assert console.warn called |
| Integration | Canvas zoom -> terminal fit | Manual: observe cols/rows in DevTools |
| E2E | Drag terminal, zoom canvas, type in terminal | Playwright: full workflow |

## Migration / Rollback

No migration required — new feature only. Rollback plan:
- CanvasTerminal is self-contained; if it fails, canvas continues without terminal elements
- Feature flag disables terminal-on-canvas without removing the component
- Orphaned terminals stay alive server-side (PTY persists) until canvas reloads

## Open Questions

- [ ] Should canvas terminals auto-save session IDs for workspace restore?
- [ ] What's the default size for newly dropped terminals?
- [ ] Should terminal elements snap to grid when dragging?