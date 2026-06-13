# Pizarra Canvas Specification

## Purpose

Define the whiteboard/pizarra canvas component for the DevHub workspace right dock. Users can sketch system architectures, annotate mission diagrams, and visually map agent topologies without leaving the workspace context.

---

## Requirements

### Requirement: Canvas Library Decision — react-konva

The system MUST use react-konva as the canvas rendering engine for all whiteboard drawing operations. The canvas MUST be dynamically imported client-side only (SSR: false) to prevent server-side initialization failures. All shape rendering, hit testing, and transformer support MUST be provided by Konva.js primitives.

The canvas stage MUST receive theme values as JavaScript constants (not CSS variables), bridged from the application's CSS variable system via a theme initialization module.

#### Scenario: Canvas renders client-side only

- GIVEN the user navigates to the pizarra tab
- WHEN the page is server-rendered or statically loaded
- THEN the canvas component does NOT attempt to initialize a Konva Stage
- AND the Konva Stage initializes only after the component mounts in the browser
- AND no console errors or hydration mismatches occur

#### Scenario: Theme colors injected as JS constants

- GIVEN the pizarra canvas initializes
- WHEN it reads shape stroke/fill defaults
- THEN those values are resolved from a JavaScript theme module
- AND the module reflects the current CSS variable values from globals.css
- AND the canvas does NOT read CSS variables directly

---

### Requirement: Shape Data Model

The system MUST support a shape data model with the following concrete types: `rect`, `circle`, `line`, `arrow`, `textbox`. Every shape MUST include an `id` (unique string), `type` (shape type discriminator), `x` and `y` (canvas coordinates), and common visual properties (`fill`, `stroke`, `strokeWidth`, `opacity`, `rotation`).

Shape-type-specific properties are defined as follows:
- `rect`: `width`, `height`, `cornerRadius`
- `circle`: `radius`
- `line`: `points` as a 4-element array `[x1, y1, x2, y2]`
- `arrow`: `points` as a 4-element array `[x1, y1, x2, y2]`, `fill` for arrowhead
- `textbox`: `text`, `fontSize`, `fontFamily`, `width` (for wrapping)

The shape model MUST be serializable to and from JSON.

#### Scenario: Shapes maintain identity across operations

- GIVEN a shape is created on the canvas
- WHEN the shape is moved, resized, or its properties are edited
- THEN the shape retains its original `id`
- AND the shape can be serialized to JSON without data loss

---

### Requirement: Shape Creation via Drag

The system MUST allow users to create a shape by selecting a tool and dragging on the canvas. For `rect`, the drag delta MUST define `width` and `height`; for `circle`, the drag delta MUST define `radius` as half the smaller delta dimension; for `line` and `arrow`, the drag delta MUST define both endpoint coordinates in `points`. Negative drag deltas MUST be normalized so the shape renders with positive width/height.

Textbox creation MUST place the element at the click origin with a default size, immediately entering edit mode.

#### Scenario: Rectangle drawn via drag

- GIVEN the user clicks the rectangle tool
- WHEN the user clicks and drags on the canvas to define a bounding box
- THEN a `rect` shape is added to the canvas with the defined `x`, `y`, `width`, `height`
- AND the shape adopts the current default fill, stroke, and strokeWidth from tool settings
- AND the shape is immediately selected after creation

#### Scenario: Arrow drawn via drag

- GIVEN the user clicks the arrow tool
- WHEN the user clicks and drags from point A to point B
- THEN an `arrow` shape is added with `points: [x1, y1, x2, y2]`
- AND the arrowhead fill matches the shape's stroke color

---

### Requirement: Shape Selection and Transformer Handles

The system MUST provide selection handles on the currently selected shape via a Konva Transformer component. Selection MUST be activated by clicking a shape in select mode. The Transformer MUST show resize handles on all corners and edges, and a rotation handle above the top-center anchor.

When a shape is selected, its visual properties (fill, stroke) MUST NOT change; only the Transformer overlay is added.

The selected shape MUST have its `zIndex` bumped so it renders above all other shapes.

Multi-select MUST be supported via Shift+click, which adds the clicked shape to the current selection. The Transformer MUST attach to all selected shapes as a group.

#### Scenario: Single shape selected

- GIVEN the select tool is active and the canvas contains at least one shape
- WHEN the user clicks a shape
- THEN the shape becomes selected
- AND a Transformer overlay appears around it
- AND the shape moves to the top z-index layer

#### Scenario: Multi-select via Shift+click

- GIVEN the select tool is active and at least two shapes exist
- WHEN the user Shift+clicks a second shape
- THEN both shapes remain selected
- AND the Transformer encompasses both shapes as a group
- AND resizing affects both shapes proportionally

---

### Requirement: Shape Property Editing

When a shape is selected, the system MUST allow editing of its visual properties: `fill` color, `stroke` color, `strokeWidth` (pixels), and `opacity` (0-1). For `rect` shapes, `cornerRadius` MUST also be editable. For `textbox` shapes, `text` content, `fontSize`, and `fontFamily` MUST be editable.

Property changes MUST update the canvas shape in real time as the user adjusts controls.

#### Scenario: Fill color changed via inspector

- GIVEN a shape is selected
- WHEN the user changes the fill color in the property inspector
- THEN the shape's fill updates immediately on the canvas
- AND the shape's data model reflects the new color value

---

### Requirement: Right Dock — Pizarra Tab

The system MUST recognize `'pizarra'` as a valid value for the `activeTab` state in `rightDockState.js`, alongside the existing `browser`, `editor`, `swarm`, and `zed` tabs.

When `activeTab === 'pizarra'`, the WorkspaceRightDock component MUST render the pizarra canvas pane. When a different tab is active, the pizarra pane MUST NOT be rendered.

#### Scenario: Pizarra tab renders canvas

- GIVEN the user has the pizarra tab active in the right dock
- WHEN the WorkspaceRightDock renders
- THEN the pizarra canvas pane is visible
- AND the canvas is initialized with the current theme defaults

#### Scenario: Switching away from pizarra tab unmounts canvas

- GIVEN the user is on the pizarra tab with the canvas rendered
- WHEN the user switches to a different tab
- THEN the pizarra pane is unmounted
- AND no canvas state is retained after unmount (ephemeral per session)

---

### Requirement: Right Dock Active Tab Whitelist

The `activeTab` and `maximizedView` state in `rightDockState.js` MUST accept `'pizarra'` as a valid enumerated value in addition to the previously supported tab identifiers.

#### Scenario: Pizarra tab is a valid activeTab value

- GIVEN `rightDockState.js` defines the activeTab type
- WHEN `activeTab` is set to `'pizarra'`
- THEN no validation errors occur
- AND the pizarra pane renders in the right dock

#### Scenario: Switching from zed to pizarra tab

- GIVEN the right dock is on the `zed` tab
- WHEN the user switches to the `pizarra` tab
- THEN the pizarra pane replaces the zed pane
- AND the previously active tab is unaffected

---

---

### Requirement: Pizarra Element Model (from pizarra-core)

Every pizarra element MUST expose the following base interface:
- `id: string` — unique identifier
- `type: 'agent' | 'terminal' | 'textbox' | 'rectangle' | 'ellipse' | 'line' | 'arrow'`
- `position: { x: number, y: number }` — canvas logical coordinates (origin top-left)
- `size: { width: number, height: number }`
- `zIndex: number` — stacking order
- `locked: boolean` — prevents drag interactions when true
- `selected: boolean` — visual selection state
- `data: object` — type-specific payload

The system SHALL support element types with the following data payloads:
- `agent`: `{ agentId: string, label: string, status: 'idle' | 'running' | 'done' }`
- `terminal`: `{ terminalId: string, label: string }`
- `textbox`: `{ content: string, fontSize: number, color: string }`
- `rectangle | ellipse | line | arrow`: `{ stroke: string, fill: string, strokeWidth: number }`

#### Scenario: Create a textbox element

- GIVEN no elements exist on the canvas
- WHEN the user double-clicks an empty canvas area
- THEN a new textbox element is created at the click position with default size `200x50`, z-index `1`, and `{ content: '', fontSize: 16, color: '#ffffff' }`

#### Scenario: Select an element

- GIVEN a textbox element at position (100, 100) with `selected: false`
- WHEN the user clicks the element
- THEN `selected` becomes `true`, and all other elements have `selected: false`

#### Scenario: Locked element is not draggable

- GIVEN a rectangle element with `locked: true`
- WHEN the user attempts to drag the element
- THEN the element position remains unchanged

---

### Requirement: Coordinate System (from pizarra-core)

The canvas MUST operate two distinct coordinate spaces:
1. **Canvas logical coordinates** — infinite, unitless space where elements are positioned. Origin `(0, 0)` is top-left.
2. **Viewport coordinates** — screen pixels relative to the canvas container top-left.

The system MUST provide transformation functions:
- `viewportToCanvas(vx: number, vy: number): { x, y }` — converts screen coordinates to canvas coordinates
- `canvasToViewport(cx: number, cy: number): { x, y }` — converts canvas coordinates to screen coordinates

The transformation MUST use current pan offset `(offsetX, offsetY)` and zoom `scale`:
- `canvasToViewport(cx, cy) = { x: cx * scale + offsetX, y: cy * scale + offsetY }`
- `viewportToCanvas(vx, vy) = { x: (vx - offsetX) / scale, y: (vy - offsetY) / scale }`

On canvas creation, the initial state MUST be: `offsetX = 0`, `offsetY = 0`, `scale = 1.0`.

#### Scenario: Convert click position to canvas coordinates

- GIVEN a canvas with `offsetX = 100`, `offsetY = 200`, `scale = 2.0`
- WHEN a user clicks at screen position `(300, 400)`
- THEN `viewportToCanvas(300, 400)` returns `{ x: 100, y: 100 }`

#### Scenario: Zoomed element renders at correct screen position

- GIVEN an element at canvas position `(50, 50)` with `scale = 0.5`, `offsetX = 0`, `offsetY = 0`
- WHEN the canvas renders
- THEN the element's `left` CSS property is `25px` and `top` is `25px`

---

### Requirement: Pan/Zoom via @use-gesture (from pizarra-core)

The canvas container MUST use `@use-gesture/react` to handle the following gestures:

**Zoom (wheel):**
- `Ctrl + wheel`: zoom toward cursor position
- Plain wheel: zoom toward cursor position (without Ctrl)
- Zoom factor per tick: `1.1` (10% increase per scroll step)
- Zoom range MUST be clamped to `[0.1, 4.0]`

**Pan (drag):**
- Mouse drag on empty canvas area pans the canvas
- Drag on a locked element does NOT pan the canvas
- Drag on an unlocked element moves the element instead of panning

**Pinch-to-zoom (touch):**
- Two-finger pinch MUST zoom toward the pinch center
- Zoom range applies to pinch gestures

**Gesture state:** The gesture handler MUST maintain `{ x: offsetX, y: offsetY, zoom: scale }`.

The canvas container MUST call `e.stopPropagation()` on wheel events to prevent parent scroll containers from consuming the event.

#### Scenario: Zoom in with Ctrl+wheel

- GIVEN a canvas with `scale = 1.0`, `offsetX = 0`, `offsetY = 0`; cursor is at viewport `(400, 300)`
- WHEN the user presses Ctrl and scrolls up
- THEN `scale` becomes approximately `1.1`, and the point under the cursor remains at the same viewport position

#### Scenario: Pan by dragging empty canvas

- GIVEN a canvas with `offsetX = 0`, `offsetY = 0`
- WHEN the user drags from viewport `(200, 200)` to `(250, 220)` on an empty area
- THEN `offsetX` becomes `50` and `offsetY` becomes `20`

#### Scenario: Dragging element does not pan canvas

- GIVEN an element at canvas position `(100, 100)` and an empty area to its right
- WHEN the user starts dragging the element and then drags to the right
- THEN `offsetX` and `offsetY` remain unchanged, and the element position updates

#### Scenario: Zoom clamped at maximum

- GIVEN a canvas with `scale = 3.9`
- WHEN the user zooms in beyond the max threshold
- THEN `scale` is clamped to `4.0` and does not exceed it

---

### Requirement: Layer Management (from pizarra-core)

Each element MUST have a `zIndex: number` property. The system MUST assign z-indices according to the following rules:

1. **Initial z-index**: New elements receive `maxZIndex + 1` where `maxZIndex` is the highest `zIndex` among current elements (default `0`).
2. **Selection raises z-index**: When an element is selected, its z-index MUST be raised to `maxZIndex + 1`.
3. **Bring-to-front**: A context menu action "Bring to front" MUST set the element's `zIndex` to `maxZIndex + 1`.
4. **Send-to-back**: A context menu action "Send to back" MUST set the element's `zIndex` to `minZIndex - 1`.
5. **Layer groups** (reserved ranges, for future use):
   - Selection overlay: `zIndex >= 10000`
   - Default elements: `zIndex < 10000`

The system SHALL render elements sorted by ascending `zIndex`. Elements with higher z-index appear on top.

#### Scenario: New element renders above existing elements

- GIVEN canvas has two textboxes with z-indices `1` and `2`
- WHEN a new rectangle is created
- THEN the rectangle's initial z-index is `3`

#### Scenario: Selecting an element brings it to front

- GIVEN a canvas with elements at z-indices `1`, `2`, `3`
- WHEN the user selects the element at z-index `1`
- THEN that element's z-index becomes `4`

#### Scenario: Bring-to-front raises selected element

- GIVEN a canvas with an element at z-index `2` (not the highest)
- WHEN the user right-clicks the element and selects "Bring to front"
- THEN the element's z-index becomes `maxZIndex + 1`

---

### Requirement: Mode Switch Persistence (from pizarra-core)

The system MAY persist the user's last active tab preference in `localStorage` under the existing dock storage key (no new key required).

The pizarra tab MUST be accessible by clicking its tab label. No keyboard shortcut is required in this phase.

#### Scenario: Pizarra tab is the last active tab on reload

- GIVEN the user clicked the pizarra tab, then reloaded the application
- WHEN `readRightDockState` is called with the stored state
- THEN `activeTab` is `'pizarra'`

---

### Requirement: Success Criteria (from pizarra-core)

All of the following MUST be true before the feature is considered complete:

| ID | Criterion | Verification |
|----|-----------|--------------|
| SC-1 | Pizarra tab appears in the right dock tab bar | Manual: click tab, canvas renders |
| SC-2 | Canvas renders at `offsetX=0, offsetY=0, scale=1.0` | Console: check initial state |
| SC-3 | Pan gesture moves viewport correctly | Manual: drag empty canvas, elements move inversely |
| SC-4 | Zoom (wheel) changes scale within `[0.1, 4.0]` | Manual: scroll, observe scale in React DevTools |
| SC-5 | Elements are draggable via Framer Motion | Manual: drag element, position updates |
| SC-6 | Mode switch toggles visibility correctly | Manual: switch tabs, canvas hides/shows |
| SC-7 | No console errors on any interaction | Automated: `console.error` count = 0 during test scenarios |
| SC-8 | Right dock sanitizer accepts `'pizarra'` activeTab | Unit test: `sanitizeRightDockState({ activeTab: 'pizarra' }).activeTab === 'pizarra'` |

The system MUST NOT break existing dock tab functionality. Switching between all existing tabs (browser, editor, swarm, zed, operator) MUST continue to work without regression.

---

## Acceptance Summary

| Requirement | Covered | Scenario Count |
|-------------|---------|----------------|
| Canvas Library Decision — react-konva | Yes | 2 |
| Shape Data Model | Yes | 1 |
| Shape Creation via Drag | Yes | 2 |
| Shape Selection and Transformer Handles | Yes | 2 |
| Shape Property Editing | Yes | 1 |
| Right Dock — Pizarra Tab | Yes | 2 |
| Right Dock Active Tab Whitelist | Yes | 2 |
| Pizarra Element Model | Yes | 3 |
| Coordinate System | Yes | 2 |
| Pan/Zoom via @use-gesture | Yes | 4 |
| Layer Management | Yes | 3 |
| Mode Switch Persistence | Yes | 1 |
| Success Criteria | Yes | 8 |

**Total**: 14 requirements, 33 scenarios.