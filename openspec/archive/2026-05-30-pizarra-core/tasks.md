# Tasks: pizarra-core

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1400 (7 new files + 2 modified + tests) |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Single PR -- all tasks are tightly coupled |
| Delivery strategy | exception-ok |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Medium

---

## Phase 1: Infrastructure

- [ ] 1.1 Add `@use-gesture/react` to `package.json` (framer-motion already present)

---

## Phase 2: Implementation

- [ ] 2.1 Create `src/lib/pizarra/canvasViewport.js` -- export `{ canvasToViewport, viewportToCanvas }` utilities and `CanvasViewportProvider` component with `{ offsetX, offsetY, scale, zoom, pan }` state
- [ ] 2.2 Create `src/components/pizarra/PizarraElement.jsx` -- base element wrapper; Framer Motion `drag` calls `onPositionChange`; skips drag when `locked: true`; combines element position + viewport transform
- [ ] 2.3 Create `src/components/pizarra/PizarraToolPalette.jsx` -- tool buttons (select, text, rect, circle, line, arrow); exposes `activeTool` via prop or internal state
- [ ] 2.4 Create `src/components/pizarra/PizarraCanvas.jsx` -- main canvas; `useGesture` handler for pan (drag on background) and zoom (wheel, pinch); updates `offsetX/offsetY/scale`; renders children via `CanvasViewportContext`; stops wheel propagation to parent scroll
- [ ] 2.5 Create `src/components/pizarra/PizarraPane.jsx` -- container combining `PizarraCanvas`, `PizarraToolPalette`, and `PizarraElement` children; manages element list state; handles element creation on canvas double-click
- [ ] 2.6 Create `src/components/pizarra/elements/TextboxElement.jsx` -- editable text element; double-click to edit content
- [ ] 2.7 Create `src/components/pizarra/elements/ShapeElement.jsx` -- renders rectangle, ellipse, line, arrow via SVG; uses `data.stroke`, `data.fill`, `data.strokeWidth`
- [ ] 2.8 Add `'pizarra'` to `sanitizeRightDockState` in `src/components/workspace/rightDockState.js` -- add to `activeTab` allowlist and `maximizedView` allowlist
- [ ] 2.9 Import `PizarraPane` in `src/components/workspace/WorkspaceRightDock.jsx`; add `isPizarraActive` flag; render `PizarraPane` when `dockState.activeTab === 'pizarra'`

---

## Phase 3: Testing

- [ ] 3.1 Write `src/components/pizarra/__tests__/canvasViewport.test.js` -- unit tests for `canvasToViewport` and `viewportToCanvas` with cases: (0,0) offset; non-zero offset; scale != 1; zoom clamped at 0.1 and 4.0
- [ ] 3.2 Write `src/components/workspace/__tests__/rightDockState.test.js` -- unit test: `sanitizeRightDockState({ activeTab: 'pizarra' })` returns `{ activeTab: 'pizarra' }`
- [ ] 3.3 Write `src/components/pizarra/__tests__/PizarraCanvas.test.js` -- unit test: initial state `offsetX=0, offsetY=0, scale=1.0`; zoom clamped to [0.1, 4.0]
