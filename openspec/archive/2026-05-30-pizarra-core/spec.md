# Delta for pizarra-core

## ADDED Requirements

### Requirement: Pizarra Element Model

Every pizarra element MUST expose the following base interface:
- `id: string` -- unique identifier
- `type: 'agent' | 'terminal' | 'textbox' | 'rectangle' | 'ellipse' | 'line' | 'arrow'`
- `position: { x: number, y: number }` -- canvas logical coordinates (origin top-left)
- `size: { width: number, height: number }`
- `zIndex: number` -- stacking order
- `locked: boolean` -- prevents drag interactions when true
- `selected: boolean` -- visual selection state
- `data: object` -- type-specific payload

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

### Requirement: Coordinate System

The canvas MUST operate two distinct coordinate spaces:
1. **Canvas logical coordinates** -- infinite, unitless space where elements are positioned. Origin `(0, 0)` is top-left.
2. **Viewport coordinates** -- screen pixels relative to the canvas container top-left.

The system MUST provide transformation functions:
- `viewportToCanvas(vx: number, vy: number): { x, y }` -- converts screen coordinates to canvas coordinates
- `canvasToViewport(cx: number, cy: number): { x, y }` -- converts canvas coordinates to screen coordinates

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

### Requirement: Pan/Zoom via @use-gesture

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

### Requirement: Layer Management

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

### Requirement: Dock Integration

The pizarra MUST appear as a new tab labeled "pizarra" in `WorkspaceRightDock.jsx`. The tab list MUST include: browser, editor, swarm, zed, operator (if present), and **pizarra**.

The dock state in `rightDockState.js` MUST accept `activeTab: 'pizarra'` as a valid value. The sanitizer function in `rightDockState.js` SHALL be updated to include `'pizarra'` in the allowed `activeTab` values. The `maximizedView` union MUST also include `'pizarra'`.

When `activeTab === 'pizarra'`:
- The canvas component MUST be rendered inside the dock shell
- All other tab content areas MUST be hidden

When the user switches away from `pizarra`:
- The canvas state (elements, pan, zoom) SHOULD be preserved in memory for the session
- The canvas state MUST NOT be persisted to localStorage or the database in this phase

#### Scenario: Pizarra tab renders canvas

- GIVEN `dockState.activeTab === 'pizarra'`
- WHEN `WorkspaceRightDock` renders
- THEN the pizarra canvas is visible and all other tab content panels are hidden

#### Scenario: Switching away from pizarra hides canvas

- GIVEN `dockState.activeTab === 'pizarra'` and a canvas with elements
- WHEN `activeTab` changes to `'browser'`
- THEN the pizarra canvas is hidden but canvas state is retained in memory

#### Scenario: Dock state sanitizer accepts pizarra tab

- GIVEN `sanitizeRightDockState({ activeTab: 'pizarra' })` is called
- THEN the returned state has `activeTab: 'pizarra'`

---

### Requirement: Mode Switch Persistence

The system MAY persist the user's last active tab preference in `localStorage` under the existing dock storage key (no new key required).

The pizarra tab MUST be accessible by clicking its tab label. No keyboard shortcut is required in this phase.

#### Scenario: Pizarra tab is the last active tab on reload

- GIVEN the user clicked the pizarra tab, then reloaded the application
- WHEN `readRightDockState` is called with the stored state
- THEN `activeTab` is `'pizarra'`

---

### Requirement: Success Criteria

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

*This spec is a NEW capability. No existing behavior is modified.*
