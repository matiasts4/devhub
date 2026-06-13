# Proposal: pizarra-ui-components

## Intent

Build a white-board/pizarra canvas component for the DevHub workspace right dock. Users need to sketch system architectures, annotate mission diagrams, and visually map agent topologies without leaving the workspace context. The component will live as a new tab in the right dock alongside browser/editor/swarm/zed.

## Scope

### In Scope
- React-konva canvas with basic shape tools (rectangle, circle, line, arrow, textbox)
- Shape data model with identity, position, dimensions, stroke, fill, opacity
- Shape palette toolbar using ToggleGroup (Radix) with tool icons
- Selection handles with resize/move using Konva Transformer
- Property inspector panel using Popover (Radix) with Sliders for stroke width, opacity, fill
- Integration as new `pizarra` tab in right dock (`rightDockState.js`)
- Theme via CSS variable injection (Konva cannot read CSS variables natively)
- Brutalist chrome styling via morphology.js factories

### Out of Scope
- Export to PNG/SVG (deferred to future)
- Shape grouping/layers (deferred)
- Undo/redo history (deferred)
- Collaborative editing (future SWARM feature)

## Capabilities

### New Capabilities
- `pizarra-canvas`: Whiteboard canvas with shape drawing, selection, and property editing
- `pizarra-tool-palette`: Shape tool selection UI with toggle group
- `pizarra-inspector`: Property editor popover for selected shapes

### Modified Capabilities
- `right-dock-tabs`: Add `pizarra` as a valid tab value alongside browser/editor/swarm/zed

## Approach

**Stack**: react-konva + konva for canvas rendering; Radix primitives for UI chrome; morphology.js for styling.

**Canvas library choice**: react-konva — provides built-in hit testing, selection handles (Transformer), and multi-shape support. Pure SVG would require hand-rolling hit testing and transforms (high effort). Rough.js lacks transform infrastructure. Excalidraw is too heavy as a sub-component.

**SSR handling**: Dynamic import via `next/dynamic({ ssr: false })` to avoid server-side canvas initialization failures.

**Shape data model** (stored in component state, serialized to JSON):
```typescript
type ShapeType = 'rect' | 'circle' | 'line' | 'arrow' | 'textbox';

interface PizarraShape {
  id: string;           // nanoid
  type: ShapeType;
  x: number;            // canvas coordinates
  y: number;
  width?: number;       // rect/circle
  height?: number;      // rect
  radius?: number;      // circle
  points?: number[];    // line/arrow: [x1,y1,x2,y2]
  text?: string;        // textbox
  fill: string;         // hex or 'transparent'
  stroke: string;       // hex
  strokeWidth: number;  // pixels
  opacity: number;      // 0-1
  fontSize?: number;    // textbox only
  rotation?: number;    // degrees
}
```

**Shape palette UI**: ToggleGroup with Toggle items for select, rect, circle, line, arrow, textbox. Each Toggle uses a Lucide icon. Selected state via `data-state="on"` styling.

**Selection handles**: Konva Transformer attached to selected node. Shows resize anchors + rotation handle. Brutalist selection style via custom Transformer config matching codebase aesthetics (2px accent border, no rounded corners, hard shadow).

**Property inspector**: Popover anchored to canvas area (not the selected shape) containing:
- Fill color: native `<input type="color">` with morphology styling
- Stroke color: native `<input type="color">`
- Stroke width: Slider (Radix) 1-20px
- Opacity: Slider (Radix) 0-100%
- Font size (textbox only): Slider (Radix) 10-72px

**Theme injection**: Canvas layer reads theme constants from a `pizarraTheme.js` module that exports CSS variable values as JS constants, initialized once from `getComputedStyle(document.documentElement)`. Default palette matches `globals.css` `--accent-primary`, `--chrome-border-color`, etc.

**Right dock integration**:
1. Add `'pizarra'` to `activeTab` and `maximizedView` whitelist in `rightDockState.js` (line 124, 130)
2. Create `WorkspacePizarraPane.jsx` with dynamic import of canvas
3. Add conditional render in `WorkspaceRightDock.jsx` (line 74 pattern)
4. Tab icon: Lucide `Paintbrush` or `Layout`

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/components/workspace/rightDockState.js` | Modified | Whitelist `pizarra` in `activeTab` and `maximizedView` |
| `src/components/workspace/WorkspaceRightDock.jsx` | Modified | Add conditional render for pizarra tab |
| `src/components/workspace/WorkspacePizarraPane.jsx` | New | Container component with dynamic canvas import |
| `src/components/pizarra/PizarraCanvas.jsx` | New | Main canvas component (react-konva Stage/Layer) |
| `src/components/pizarra/ShapePalette.jsx` | New | ToggleGroup toolbar for shape tools |
| `src/components/pizarra/PizarraInspector.jsx` | New | Popover + Sliders for shape properties |
| `src/components/pizarra/shapes/` | New | Per-shape components: RectShape, CircleShape, etc. |
| `src/lib/pizarra/theme.js` | New | Theme constant bridge (CSS vars → JS) |
| `src/lib/pizarra/shapeModel.js` | New | Type definitions, default shapes, serialization |
| `package.json` | Modified | Add `react-konva`, `konva` |
| `src/chrome/morphology.js` | Consumed | Use existing factories for chrome styling |
| `src/components/ui/toggle-group.jsx` | Consumed | Shape palette base |
| `src/components/ui/popover.jsx` | Consumed | Inspector container |
| `src/components/ui/slider.jsx` | Consumed | Property sliders |
| `openspec/changes/pizarra-ui-components/` | New | Change folder with spec/design/docs |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| SSR canvas failure in Next.js | Low | Use `next/dynamic({ ssr: false })` for canvas components |
| Konva theme desync if globals.css changes | Low | Re-initialize theme constants on `storage` event and on mount |
| Large canvas performance degradation | Medium | Implement viewport culling; limit stage size to visible area |
| Right dock state migration on upgrade | Low | Additive change only; existing `browser/editor/swarm/operator/zed` tabs unaffected |

## Rollback Plan

1. Revert `package.json` to remove `react-konva` and `konva` dependencies
2. Remove `src/components/workspace/WorkspacePizarraPane.jsx`
3. Remove `src/components/pizarra/` directory entirely
4. Remove `'pizarra'` from `activeTab` and `maximizedView` whitelist in `rightDockState.js`
5. Remove conditional render in `WorkspaceRightDock.jsx`
6. Run `npm install` to prune unused dependencies
7. No database migrations required — state is ephemeral per session

## Dependencies

- `react-konva` (^18.x) — canvas rendering, shapes, transformers
- `konva` (^9.x) — core canvas library
- `nanoid` — shape ID generation (already in project, verify via package.json)
- Radix primitives: ToggleGroup, Toggle, Popover, Slider (already present)

## Success Criteria

- [ ] Pizarra tab visible in right dock when `activeTab` set to `'pizarra'`
- [ ] Rectangle, circle, line, arrow, textbox shapes can be drawn on canvas
- [ ] Shapes can be selected (click) and moved (drag)
- [ ] Shapes can be resized via Transformer handles
- [ ] Property inspector opens and edits fill, stroke, strokeWidth, opacity
- [ ] Theme colors match application chrome (accent-primary, borders, shadows)
- [ ] Canvas resizes correctly with right dock panel resizing
- [ ] No console errors during shape creation, selection, and property editing
- [ ] SSR-safe: canvas does not render on server; hydration works client-side

---

**Word count**: 421 (under 450 limit)
**Last updated**: 2026-05-30
**Phase**: proposal