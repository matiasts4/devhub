# Delta for pizarra-canvas

## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Right Dock Active Tab Whitelist

(Previously: Right dock supported only `browser`, `editor`, `swarm`, `operator`, `zed` as valid `activeTab` values)

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

**Phase**: spec
**Archived**: 2026-05-30