# pizarra-canvas-audit-p0 Specification

## Purpose

Close the three P0 issues flagged in `docs/audits/04-pizarra.md` that affect shape drawing and multi-select on the pizarra canvas: (1) multi-select transformer anchor correctness, (2) circle center calculation, (3) live preview during shape drag. Also define a one-time migration for stored circle shapes so existing users do not see a visual jump.

---

## Requirements

### Requirement: Multi-Select Transformer Anchors

When multiple shapes are selected, the Konva `Transformer` SHALL display a single dashed border + 8 anchor handles that enclose the union of the selected shapes' bounds. Anchor positions SHALL be recomputed whenever the selected set or the underlying shapes' geometry change.

#### Scenario: Transformer recalculates on group change

- GIVEN a `PizarraCanvas` with two selected rectangles `r1` (50,50,100,100) and `r2` (300,300,80,80)
- WHEN the selection becomes `[r1, r2]`
- THEN `transformerRef.current.nodes(selectedNodes)` SHALL be called once
- AND the rendered transformer bbox SHALL enclose the union `(50, 50, 330, 330)`
- AND exactly 8 anchor handles SHALL be visible at the bbox corners + edge midpoints

#### Scenario: Anchor bounds refresh after edit

- GIVEN `r1` is resized from `(50,50,100,100)` to `(50,50,200,200)` via a transformer drag
- WHEN `handleTransformEnd` commits the new bounds
- THEN on the next render the transformer bbox SHALL re-enclose `(50, 50, 330, 330)` updated for the new `r1` size

#### Scenario: Single-node transformer still works

- GIVEN exactly one shape is selected
- WHEN the transformer renders
- THEN the dashed border + 8 anchors SHALL be positioned around the single shape's bounds
- AND no `AnimatePresence` or extra wrapper SHALL be added

---

### Requirement: Circle Stored as Midpoint Center + Half-Diagonal Radius

When the user draws a circle on the canvas, the persisted shape SHALL be stored with the circle's center at the bounding-box midpoint and `radius` equal to half the diagonal of the drag rectangle.

#### Scenario: Circle created from drag

- GIVEN the circle tool is active
- WHEN the user `mousedown` at canvas `(100, 200)` and `mouseup` at canvas `(300, 400)`
- THEN the persisted shape SHALL have `x: 200` (midpoint), `y: 300` (midpoint)
- AND `radius` SHALL equal `sqrt((300-100)^2 + (400-200)^2) / 2 = 141.421...`
- AND the shape type SHALL be `CIRCLE`

#### Scenario: Renderer uses x/y as center

- GIVEN a persisted circle with `x: 200, y: 300, radius: 141.421`
- WHEN the renderer reads the shape
- THEN it SHALL place the circle center at canvas `(200, 300)`
- AND the visual bounding box SHALL be `(58.6, 158.6, 282.8, 282.8)`

#### Scenario: Negative drag direction

- GIVEN the user `mousedown` at `(300, 400)` and `mouseup` at `(100, 200)`
- WHEN the circle is persisted
- THEN `x: 200, y: 300` (midpoint, same as forward drag)
- AND the radius SHALL be the same `141.421`

---

### Requirement: Live Preview During Shape Draw

While the user is dragging with a shape tool active, the in-flight shape's geometry SHALL be visible in real time (not just on mouseup). The preview SHALL update on every `mousemove` event before the drag completes.

#### Scenario: Rectangle drag shows live outline

- GIVEN the rectangle tool is active
- WHEN the user `mousedown` at `(50, 50)` and `mousemove` to `(120, 90)` (before `mouseup`)
- THEN an in-flight rectangle preview SHALL be rendered at `(50, 50)` with `width: 70`, `height: 40`
- AND the preview SHALL update on every subsequent `mousemove` event
- AND the preview SHALL be cleared on `mouseup` (replaced by the committed shape)

#### Scenario: Circle drag shows live radius

- GIVEN the circle tool is active
- WHEN the user `mousedown` at `(100, 200)` and `mousemove` to `(160, 240)` (before `mouseup`)
- THEN an in-flight circle preview SHALL be rendered with center at the midpoint `(130, 220)` and radius derived from the drag diagonal
- AND the preview SHALL update on every subsequent `mousemove` event

#### Scenario: Live preview uses intermediate (not final) state

- GIVEN a drag is in progress
- WHEN `handleMouseMove` fires with intermediate coordinates
- THEN the in-flight shape's `width` / `height` / `x` / `y` / `radius` SHALL match the current pointer position
- AND NOT the final `mouseup` coordinates (those are committed at the end of the drag)

#### Scenario: Preview does not commit prematurely

- GIVEN a drag is in progress
- WHEN `handleMouseMove` fires
- THEN `onShapeCreate` SHALL NOT be called
- AND `setDrawing(null)` SHALL NOT be called
- AND the persisted `elements` list SHALL NOT include the in-flight shape

---

### Requirement: One-Time Migration of Stored Circle Shapes

When the app loads, it SHALL run a one-time migration over persisted pizarra shapes. For shapes with `type === 'circle'` and a non-null `radius` whose `x, y` represent the bounding-box corner (legacy encoding), the migration SHALL re-anchor the shape so `x, y` become the midpoint and `width, height` become `2 * radius`.

The migration SHALL be:

- Gated on the localStorage flag `devhub_pizarra_circle_migration_v1` (default unset → run once).
- Bounded: it SHALL touch only shapes with `type === 'circle'`.
- Idempotent: setting the flag to `'done'` SHALL prevent re-running.
- Backed up: the original payload SHALL be written to `devhub_pizarra_circle_migration_v1.bak` before any mutation.
- Failure-tolerant: a migration exception SHALL NOT prevent the app from booting.

#### Scenario: First run migrates legacy circles

- GIVEN the localStorage flag `devhub_pizarra_circle_migration_v1` is NOT set
- AND a persisted shape `{ type: 'circle', x: 100, y: 200, radius: 50, ... }` exists (legacy encoding where `x, y` is the corner)
- WHEN the migration runs
- THEN the shape SHALL be re-encoded as `{ type: 'circle', x: 150, y: 250, radius: 50, width: 100, height: 100, ... }`
- AND the flag SHALL be set to `'done'`
- AND the original payload SHALL be written to `devhub_pizarra_circle_migration_v1.bak`

#### Scenario: Re-runs are no-ops

- GIVEN the localStorage flag `devhub_pizarra_circle_migration_v1 === 'done'`
- WHEN the migration runs
- THEN no shape SHALL be mutated
- AND no `.bak` key SHALL be written (the previous `.bak` is preserved)

#### Scenario: Migration failure does not crash the app

- GIVEN the persisted payload is malformed and triggers a `JSON.parse` error during migration
- WHEN the migration runs
- THEN the app SHALL still render the pizarra
- AND the user SHALL see the old (intact, visually-offset) circles
- AND the error SHALL be logged to `console.error`
- AND the localStorage flag SHALL remain unset (allowing a retry on next reload)

#### Scenario: Migration only touches circles

- GIVEN the persisted payload contains rectangles, lines, and one circle
- WHEN the migration runs
- THEN only the circle's `x, y, width, height` SHALL be mutated
- AND every other shape SHALL be left untouched
