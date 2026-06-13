# Audit Report: Pizarra / Canvas Whiteboard

**Audited**: 2026-05-30
**Auditor**: Workflow — 4 sub-agents, 163k tokens
**Status**: 🔴 Critical bugs found

---

## Files Analyzed

| File                                                  | Purpose                              |
| ----------------------------------------------------- | ------------------------------------ |
| `src/components/pizarra/PizarraCanvas.jsx`            | Main canvas component (Konva)        |
| `src/components/pizarra/CanvasTerminal.jsx`           | Terminal embedded in canvas          |
| `src/components/pizarra/CanvasViewportContext.jsx`    | Viewport state (pan/zoom)            |
| `src/components/pizarra/PizarraPane.jsx`              | Panel layout container               |
| `src/components/pizarra/PizarraElement.jsx`           | Base wrapper for whiteboard elements |
| `src/components/pizarra/PizarraPropertyInspector.jsx` | Property editor panel                |
| `src/components/pizarra/PizarraToolPalette.jsx`       | Drawing tool palette                 |
| `src/components/pizarra/elements/ShapeElement.jsx`    | Shape renderer (rect, circle, line)  |
| `src/components/pizarra/elements/TextboxElement.jsx`  | Text box element                     |

---

## 🔴 CRITICAL — Multi-Select Transformer Overwrites Nodes

**File**: `src/components/pizarra/PizarraCanvas.jsx`

The transformer ref is passed to ALL selected shapes. Each shape's ref callback **overwrites** the transformer nodes instead of appending:

```jsx
// Per-renderer ref callback — OVERWRITES, not appends:
ref={(node) => {
  if (isSelected && transformerRef && node) {
    transformerRef.nodes(node);  // OVERWRITES
  }
}}

// With 3 selected shapes, React renders in some order:
// nodes([A]) → nodes([B]) → nodes([C])
// Only C gets transformer anchors!
```

**Impact**: Multi-selection cannot actually transform multiple shapes simultaneously. Only the last rendered shape gets visible transform anchors.

**Root cause**: The parent's `useEffect` already correctly maps `selectedElementIds` to nodes and calls `transformerRef.current.nodes(selectedNodes)`. The per-renderer ref callbacks are **redundant and actively harmful** — they race to overwrite the nodes array.

---

## 🔴 CRITICAL — Circle Creation Completely Broken

**File**: `src/components/pizarra/PizarraCanvas.jsx` — `handleMouseUp`

```jsx
const dx = Math.abs(pos.x - startX);
const dy = Math.abs(pos.y - startY);
shape = createShape(type, {
  x: startX, // center X = startX (WRONG — start is corner, not center)
  y: startY, // center Y = startY
  radius: Math.min(dx, dy) / 2, // inscribed in square, ignores aspect ratio
});
```

`x` and `y` are set to `startX` and `startY` — the **start point of the drag**. In Konva Circle, `(x, y)` is the **center** of the circle. So when the user drags from corner to corner, the circle center is at the start corner, not the midpoint.

**Example**: Drag from `(0,0)` to `(100, 50)`:

- Center: `(0, 0)` (the start point)
- Radius: `min(100, 50) / 2 = 25`
- Circle extends from `(-25, -25)` to `(25, 25)` — nowhere near the endpoint

**Impact**: Circle placement is completely wrong. Users cannot place circles where they intend.

---

## 🔴 CRITICAL — Live Preview During Drawing Not Implemented

**File**: `src/components/pizarra/PizarraCanvas.jsx`

```jsx
const handleMouseMove = useCallback(
  (e) => {
    if (!drawing) return;
    // Nothing happens — no live preview
  },
  [drawing]
);
```

`handleMouseMove` is connected but does nothing when `drawing`. The user drags to create a shape but **cannot see it until mouseup**. This is poor UX — users expect to see a preview of what they're drawing.

**Impact**: Drawing shapes is a blind interaction until completion.

---

## 🟠 High — Grid Non-Functional as Coordinate Reference

**File**: `src/components/pizarra/PizarraCanvas.jsx`

The grid is pre-generated once from fixed `width`/`height` constants:

```jsx
const cols = Math.ceil(width / gridSize) + 1; // e.g., 26 for width=800
const rows = Math.ceil(height / gridSize) + 1; // e.g., 19 for height=600
```

The grid never pans or scales with the viewport. When `pan=(x:500, y:200)` at `zoom:0.5`, the grid visually shifts but still references the original `[0, 800] × [0, 600]` canvas region.

Additionally, grid `strokeWidth={1}` (pixel value) scales visually with zoom — inconsistent line thickness at different zoom levels.

**Impact**: Grid is purely decorative. Users cannot use it to determine their logical canvas position.

---

## 🟡 Medium — Line Drawing Math Unnecessarily Convoluted

**File**: `src/components/pizarra/PizarraCanvas.jsx`

```jsx
points: [
  Math.max(0, startX - Math.min(startX, pos.x)),   // always 0 — confusing
  Math.max(0, startY - Math.min(startY, pos.y)),   // always 0
  Math.abs(pos.x - startX),                         // width
  Math.abs(pos.y - startY),                         // height
],
```

`Math.max(0, startX - Math.min(startX, pos.x))` simplifies to `0` always (since `startX >= Math.min(startX, pos.x)`). While the result is visually correct (draws the diagonal of the bounding box), the intermediate computation is confusing and serves no purpose.

---

## 🟡 Medium — Renderer `onTransformEnd` Is Dead Code

**File**: All shape renderers

Each renderer defines:

```jsx
onTransformEnd={(e) => {
  return { x, y, width, height, rotation, scaleX, scaleY };
}}
```

But `handleTransformEnd` in `PizarraCanvas` receives `e.target` and handles all updates. The return value is **completely discarded**. Dead code that misleads maintenance.

---

## 🟡 Medium — Transformer Anchors at 1:1 Scale Even When Stage Scaled

When viewport is zoomed (e.g., `zoom: 0.5`), the Konva Transformer anchors still appear at 1:1 pixel size — they look disproportionately large relative to the shapes. Transformer should respect viewport scale for consistent anchor sizing.

---

## Missing Features (Not Bugs — Feature Gaps)

1. **Undo/Redo** — not yet implemented
2. **Element locking** — cannot lock elements from accidental moves
3. **Grid snap / guides** — no snap-to-grid or alignment guides
4. **Selection bounding box** — multi-select doesn't show bounding container
5. **Keyboard shortcuts** — Delete key, Ctrl+A, Ctrl+Z not wired
6. **Zoom to fit / zoom to selection**
7. **Layer ordering** — no z-index management

---

## Architecture Strengths

- **Clean viewport context** — `CanvasViewportContext` provides pan/zoom state cleanly
- **Dynamic Konva import** via `dynamic(() => import(...), { ssr: false })` — correct SSR handling
- **@use-gesture/react integration** for pan/zoom gestures
- **Shape abstraction** — clean separation between element types
- **Property inspector** — separate panel for editing selected element properties
- **Test coverage** — PizarraToolPalette tests, pizarraFlow tests

---

## Recommendations

1. **Fix transformer multi-select** — remove per-renderer ref callbacks that overwrite nodes; rely solely on parent's `useEffect` with proper node mapping
2. **Fix circle creation** — set center to midpoint of drag: `x: (startX + pos.x) / 2, y: (startY + pos.y) / 2` and use `radius: Math.sqrt(dx² + dy²) / 2` or constrain properly
3. **Implement live preview** in `handleMouseMove` to update preview shape
4. **Fix grid** to be a proper coordinate reference or remove it (decorative grid with no navigational purpose is misleading)
5. **Clean up line drawing math** — use `Math.min`/`Math.max` directly without the confusing `Math.max(0, ...)` wrapper
6. **Remove dead onTransformEnd returns** in renderers
7. **Scale transformer anchors** with viewport zoom level
8. **Add undo/redo** via command pattern
