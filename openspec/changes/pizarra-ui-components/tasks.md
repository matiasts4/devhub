# Tasks: pizarra-ui-components

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 430-520 |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Single PR — additive new feature, minimal risk |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: single-pr
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Notes |
|------|------|-------|
| 1 | Infrastructure + state wiring | package.json, theme.js, rightDockState.js, WorkspaceRightDock.jsx |
| 2 | Core canvas + shape model | shapeModel.js, shapeRenderers.jsx, PizarraCanvas.jsx |
| 3 | UI chrome + integration | PizarraToolPalette.jsx, PizarraPropertyInspector.jsx, PizarraPane.jsx, wiring |
| 4 | Testing | Unit tests for shapeRenderers, toolPalette, propertyInspector |

## Phase 1: Infrastructure (4 tasks)

- [ ] 1.1 Add `react-konva` and `konva` to `package.json` — use `dynamic(() => import(...), { ssr: false })` pattern for all Konva imports to prevent SSR initialization failures
- [ ] 1.2 Create `src/lib/pizarra/theme.js` — export JS constants mirroring CSS variables from `globals.css` (fill, stroke, strokeWidth, opacity defaults); includes `getComputedTheme()` that reads CSS custom properties client-side
- [ ] 1.3 Add `'pizarra'` to the `activeTab` whitelist in `src/components/workspace/rightDockState.js` — update `sanitizeRightDockState()` array and default branch logic
- [ ] 1.4 Add `'pizarra'` to the `maximizedView` whitelist in `src/components/workspace/rightDockState.js` — same pattern as activeTab

## Phase 2: Core Implementation (8 tasks)

- [ ] 2.1 Create `src/lib/pizarra/shapeModel.js` — export `createShape(type, props)` factory and `serializeShape(shape)` / `deserializeShape(json)` helpers; types: rect, circle, line, arrow, textbox
- [ ] 2.2 Create `src/lib/pizarra/shapeRenderers.jsx` — export per-shape Konva components: `RectRenderer`, `CircleRenderer`, `LineRenderer`, `ArrowRenderer`, `TextboxRenderer`; each accepts a shape object and renders via react-konva primitives
- [ ] 2.3 Build `src/components/pizarra/PizarraCanvas.jsx` — Konva.Stage with two Layer components (background grid + shapes); render all elements from state; attach Konva.Transformer to nodes matching `selectedElementIds`; expose `onShapeCreate` and `onShapeSelect` callbacks
- [ ] 2.4 Implement `pizarraState` reducer in `src/lib/pizarra/pizarraReducer.js` — actions: `ADD_ELEMENT`, `UPDATE_ELEMENT`, `DELETE_ELEMENT`, `SET_ACTIVE_TOOL`, `SET_TOOL_SETTINGS`, `SELECT_ELEMENTS`, `DESELECT_ALL`; export `usePizarraState()` hook wrapping `useReducer`
- [ ] 2.5 Wire shape creation drag flow: tool selected → `mousedown` on canvas records origin → `mousemove` updates live preview rectangle → `mouseup` calls `addElement(createShape(...))` → element appears on canvas
- [ ] 2.6 Wire element selection: `click` on shape calls `selectElement(id)` → `selectedElementIds` updated → Transformer attaches to node → Transformer overlay appears
- [ ] 2.7 Support Shift+click multi-select: append to `selectedElementIds`; Transformer attaches to all selected nodes as group
- [ ] 2.8 Wire `transformend` callback: read new attrs from Transformer node → dispatch `UPDATE_ELEMENT` → canvas re-renders with new position/size

## Phase 3: UI Chrome + Integration (5 tasks)

- [ ] 3.1 Build `src/components/pizarra/PizarraToolPalette.jsx` — Radix ToggleGroup with options: select, text, rect, circle, line, arrow; use Lucide icons (MousePointer, Type, Square, Circle, Minus, ArrowRight); styled with `btnSecondaryStyle` from morphology.js
- [ ] 3.2 Build `src/components/pizarra/PizarraPropertyInspector.jsx` — Radix Popover anchored to selected shape; includes fill (color input), stroke (color input), strokeWidth (Slider 0-20), opacity (Slider 0-1); cornerRadius slider for rect; text/fontSize/fontFamily fields for textbox
- [ ] 3.3 Build `src/components/pizarra/PizarraPane.jsx` — combines PizarraCanvas + PizarraToolPalette + PizarraPropertyInspector; uses `next/dynamic({ ssr: false })` for canvas; `usePizarraState()` hook provides state and dispatch
- [ ] 3.4 Wire PizarraPane into `src/components/workspace/WorkspaceRightDock.jsx` — add `isPizarraActive = dockState.activeTab === 'pizarra'` condition; render `<PizarraPane />` in a conditional div when active
- [ ] 3.5 Build `src/components/pizarra/PizarraInspector.jsx` (alias PizarraPropertyInspector) — ensure the Popover closes on Escape, updates canvas in real time as sliders are dragged

## Phase 4: Testing (3 tasks)

- [ ] 4.1 Write unit tests for `src/lib/pizarra/shapeModel.js` — cover `createShape` for all 5 types, `serializeShape` round-trip, `deserializeShape` with invalid input handling
- [ ] 4.2 Write unit tests for `PizarraToolPalette` interaction — ToggleGroup selects correct tool, dispatch fires with correct action payload
- [ ] 4.3 Write integration test for the draw-select-edit flow — simulate tool select → mousedown → mousemove → mouseup → element added to state; simulate click → selection updated → inspector appears

## Implementation Order

1. Infrastructure first (1.1-1.4) — no dependencies, safe to do first
2. Core (2.1-2.3) in order: shapeModel → shapeRenderers → PizarraCanvas (each builds on the previous)
3. State (2.4) before wiring tasks (2.5-2.8) which need the reducer
4. UI chrome (3.1-3.5) depends on canvas and state being ready
5. Testing (4.1-4.3) last — verifies all wiring end-to-end

## Next Step

Ready for `sdd-apply` — single PR, phased task groups above.