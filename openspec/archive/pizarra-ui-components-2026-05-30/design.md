# Design: pizarra-ui-components

## Technical Approach

Implement a whiteboard canvas component as a new tab in the workspace right dock, using react-konva for rendering with client-side dynamic import to handle SSR. Shape data flows through a single `pizarraState` reducer, with Konva Transformer for selection and Radix primitives for UI chrome. Theme injection bridges CSS variables to JS constants via a dedicated module.

## Architecture Decisions

### Decision: Canvas Library - react-konva over pure SVG

**Choice**: react-konva + konva for canvas rendering
**Alternatives considered**: Pure SVG (requires hand-rolling hit testing and transforms), Rough.js (lacks transform infrastructure), Excalidraw (too heavy as sub-component)
**Rationale**: Built-in hit testing, Transformer component for selection handles, multi-shape support, active maintenance. React wrapper provides declarative API matching codebase patterns.

### Decision: SSR Handling - Dynamic Import

**Choice**: `next/dynamic({ ssr: false })` for all Konva components
**Alternatives considered**: isMounted guard (causes hydration flicker), no SSR flag (insufficient for Next.js 13+)
**Rationale**: Next.js handles SSR-safe code splitting automatically. Prevents server-side Konva Stage initialization failures while maintaining clean client-side hydration.

### Decision: Tool Palette - ToggleGroup with Lucide icons

**Choice**: Existing `@radix-ui/react-toggle-group` with `btnSecondaryStyle` from morphology.js
**Alternatives considered**: Custom radio group (deviation from patterns), external icon library (lucide-react already installed)
**Rationale**: Leverages existing UI primitives. Brutalist styling via morphology factories matches application chrome.

### Decision: Property Inspector - Popover anchored to canvas

**Choice**: Radix Popover with Slider components for numeric properties
**Alternatives considered**: Side panel (too much real estate), inline editing (clutters canvas)
**Rationale**: Non-intrusive, follows existing Radix patterns in codebase, allows quick property changes without switching context.

## Data Flow

```
User clicks tool → activeTool state → mousedown on canvas
    ↓
createShape() generates shape with defaults from theme
    ↓
addElement(shape) → pizarraState.elements (immutable update)
    ↓
Konva Stage re-renders with new shape in elements layer
    ↓
User clicks shape → selectedElementIds state → Transformer attaches
    ↓
PropertyInspector reads selected shape from state → Popover with Sliders
    ↓
User adjusts slider → updateElement(id, { property: value }) → state update → canvas re-renders
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/components/pizarra/PizarraPane.jsx` | Create | Container with dynamic canvas import, tab visibility |
| `src/components/pizarra/PizarraCanvas.jsx` | Create | Konva Stage/Layer with shape rendering and Transformer |
| `src/components/pizarra/PizarraToolPalette.jsx` | Create | ToggleGroup toolbar for shape tools |
| `src/components/pizarra/PizarraInspector.jsx` | Create | Popover + Sliders for shape property editing |
| `src/lib/pizarra/theme.js` | Create | CSS variable bridge to JS constants |
| `src/lib/pizarra/shapeModel.js` | Create | Type definitions, default factory, serialization |
| `src/lib/pizarra/shapeRenderers.jsx` | Create | Per-shape Konva components (Rect, Circle, Line, Arrow, Textbox) |
| `src/components/workspace/rightDockState.js` | Modify | Add 'pizarra' to activeTab and maximizedView whitelist |
| `src/components/workspace/WorkspaceRightDock.jsx` | Modify | Add isPizarraActive condition and conditional render |
| `package.json` | Modify | Add react-konva, konva dependencies |

## Interfaces / Contracts

```javascript
// Shape data model (stored in pizarraState.elements array)
type ShapeType = 'rect' | 'circle' | 'line' | 'arrow' | 'textbox';

interface PizarraShape {
  id: string;           // nanoid, unique per shape
  type: ShapeType;      // discriminator
  x: number;            // canvas coordinates (top-left origin)
  y: number;
  // Type-specific properties:
  width?: number;       // rect
  height?: number;      // rect
  radius?: number;      // circle
  points?: number[];    // line/arrow: [x1, y1, x2, y2]
  text?: string;        // textbox
  fontSize?: number;    // textbox
  // Common visual properties:
  fill: string;         // hex or 'transparent'
  stroke: string;       // hex
  strokeWidth: number;  // pixels
  opacity: number;      // 0-1
  rotation?: number;    // degrees
  cornerRadius?: number;// rect
}

// PizarraState shape (wrapped with selection metadata)
interface PizarraState {
  elements: PizarraShape[];
  selectedElementIds: string[];
  activeTool: 'select' | 'text' | 'rect' | 'circle' | 'line' | 'arrow';
  activeToolSettings: {
    fill: string;
    stroke: string;
    strokeWidth: number;
  };
}
```

## Component Structure

```
PizarraPane
└── dynamic(() => import('./PizarraCanvas'), { ssr: false })
    ├── Konva.Stage (full container size)
    │   ├── Konva.Layer (background - grid pattern)
    │   ├── Konva.Layer (shapes)
    │   │   └── shapeRenderers map over elements
    │   └── Konva.Transformer (attached to selectedElementIds nodes)
    ├── PizarraToolPalette (position: absolute, top-left)
    └── PizarraInspector (Popover, visible when selection non-empty)
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | Shape factory functions, theme extraction | Jest with mock CSS variables |
| Unit | PizarraReducer pure functions | Unit tests for addElement, updateElement, deleteElement |
| Integration | Tool palette → canvas → shape creation | RTL with mock Konva Stage |
| E2E | Full draw-select-edit flow | Playwright in browser context |

## Migration / Rollout

No migration required. This is an additive feature:
- State is ephemeral per session (no persistence)
- No database schema changes
- Existing tabs (browser, editor, swarm, zed) unaffected
- Rollback: remove package.json deps, delete pizarra directory, revert rightDockState.js changes

## Open Questions

- [x] Canvas viewport culling for performance (defer to future if shapes exceed 100) — completed in initial build
- [x] Export to PNG/SVG (deferred to future phase) — out of scope
- [x] Undo/redo history (deferred) — out of scope

---

**Phase**: design
**Archived**: 2026-05-30