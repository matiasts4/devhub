# Spec: board-canvas

> **Source of truth**: promoted from `openspec/changes/pizarra-ux-overhaul/specs/board-canvas/spec.md` on 2026-06-01 (archive of pizarra-ux-overhaul Phase 1).
> **Status**: active. Owned by DevHub pizarra team.
> **Origin**: Pizarra UX Overhaul (Phase 1).
> **Move coverage**: Move 1 (drop the Konva grid, gate the env-driven texture), Move 5 first-mount polish, Move 6 (canvas root testid + jest RAF shim).
> **Stem rationale**: named `board-canvas` per orchestrator instruction. Does not duplicate or modify the existing `openspec/specs/pizarra-canvas/spec.md` — that spec covers the higher-level shape model, selection, and dock-tab integration; this spec covers the board surface rendering, first-mount behavior, and the test contract.

## Purpose

Define the visual surface, first-mount behavior, and test selector contract for the `PizarraCanvas` board surface so that the canvas no longer renders a hard Konva grid, never flashes a `LOADING CANVAS...` placeholder when Konva is healthy, exposes deterministic test hooks, and ships with a jest `requestAnimationFrame` shim that makes the drag-hook tests deterministic.

## Requirements

### Requirement 1: Solid canvas background with opt-in texture

The system MUST render the `PizarraCanvas` root wrapper with a solid `background: #1a1f2e` color. The system MUST NOT render a Konva `Line` grid inside the stage by default. The `gridSize` constant and the `for`-loop in the background grid layer (currently `PizarraCanvas.jsx` lines 294-319) MUST be removed.

The system MUST read `process.env.NEXT_PUBLIC_PIZARRA_GRID_TEXTURE` once at module scope. When the env value is truthy, the system MUST apply a CSS `background-image: radial-gradient(...)` to the canvas wrapper at 4% opacity. When the env value is falsy or unset (the default), the wrapper MUST remain a solid color with no background image.

The env flag is a build-time / dev-server configuration. The system MUST NOT expose the flag via any user-facing settings UI in Phase 1.

#### Scenario: No Konva grid lines by default

- GIVEN `NEXT_PUBLIC_PIZARRA_GRID_TEXTURE` is unset
- WHEN `PizarraCanvas` mounts and the stage is queried
- THEN the rendered stage MUST contain zero `Line` children
- AND the canvas wrapper's computed `background-color` MUST equal `#1a1f2e`
- AND the canvas wrapper MUST NOT have a `background-image` style

#### Scenario: Opt-in radial gradient texture when env flag is enabled

- GIVEN `NEXT_PUBLIC_PIZARRA_GRID_TEXTURE` is set to `"1"`
- WHEN `PizarraCanvas` mounts
- THEN the canvas wrapper's computed `background-image` MUST contain `radial-gradient`
- AND the canvas wrapper's computed `background-color` MUST still equal `#1a1f2e`
- AND the Konva stage MUST still contain zero `Line` children (the texture is CSS, not Konva)

#### Scenario: Env flag is read once at module scope

- GIVEN the env flag is read at module import time
- WHEN multiple `PizarraCanvas` instances mount in the same process
- THEN the env value MUST be evaluated exactly once
- AND subsequent mounts MUST use the cached value without re-reading `process.env`

### Requirement 2: No loading-canvas flash on healthy mount

The system MUST NOT render a visible `LOADING CANVAS...` placeholder when `PizarraCanvas` mounts successfully. The Konva-load placeholder (a `<div>` with text content matching `/loading canvas/i`) MUST render only when `konvaLoadError === true`.

The system SHOULD render an empty Konva `Stage` skeleton (no shapes, no Transformer, no grid) during the brief client-side mount window so that the surrounding container's geometry is stable.

#### Scenario: Healthy mount does not flash the loading placeholder

- GIVEN `PizarraCanvas` mounts and `konvaLoadError` remains `false`
- WHEN the mount completes
- THEN the wrapper MUST NOT contain any visible text matching `/loading canvas/i`
- AND the empty `Stage` MUST be the only Konva child rendered

#### Scenario: Konva load failure surfaces the loading placeholder

- GIVEN `PizarraCanvas` mounts and `konvaLoadError` becomes `true`
- WHEN the error state is set
- THEN the wrapper MUST contain a visible element with text matching `/loading canvas/i`
- AND the `Stage` MUST NOT be rendered

### Requirement 3: Brutalist tool-palette micro-states

The system MUST add explicit `hover` and `active` micro-states to `PizarraToolPalette` buttons. The hover state MUST be a border-color tint (no `transform: scale()`). The active (selected tool) state MUST be a 1px inset border using the existing accent color token.

The system MUST NOT introduce a new `transform` property on tool buttons (no scale, no translate).

#### Scenario: Hover state applies a border-color tint without transform

- GIVEN the tool palette renders with no tool active
- WHEN a tool button is hovered
- THEN its computed `border-color` MUST change from the default
- AND its computed `transform` MUST equal `none`

#### Scenario: Active tool renders a 1px inset accent border

- GIVEN `activeTool === 'rect'`
- WHEN the tool palette renders
- THEN the `rect` button MUST have a `1px` inset border in the accent color
- AND the other tool buttons MUST NOT have the accent border

### Requirement 4: Test selector contract for the canvas surface

The system MUST expose the following test selectors on stable, public nodes:

| Selector                             | Owner                                | Purpose                                       |
| ------------------------------------ | ------------------------------------ | --------------------------------------------- |
| `data-testid="pizarra-canvas"`       | `PizarraPane` root wrapper           | Mount target for integration tests            |
| `data-testid="pizarra-add-terminal"` | `PizarraToolPalette` terminal button | Drives the cascade test for terminal elements |
| `data-testid="pizarra-add-browser"`  | `PizarraToolPalette` browser button  | Drives the cascade test for browser elements  |

The system MUST register a `requestAnimationFrame` and `cancelAnimationFrame` shim in `jest.setup.js` (or the equivalent jest setup file in the repo) so that the drag hook tests are deterministic. The shim MUST default to the real browser-like `requestAnimationFrame` implementation and SHOULD fall back to a microtask scheduling shim when JSDOM is detected.

#### Scenario: Canvas root carries the pizarra-canvas testid

- GIVEN `PizarraPane` renders
- WHEN the root wrapper is queried by `[data-testid="pizarra-canvas"]`
- THEN the wrapper MUST be present in the DOM
- AND the wrapper MUST be the outer canvas container, not an inner element

#### Scenario: Tool palette buttons carry the add testids

- GIVEN `PizarraToolPalette` renders
- WHEN the terminal and browser buttons are queried
- THEN the terminal button MUST have `data-testid="pizarra-add-terminal"`
- AND the browser button MUST have `data-testid="pizarra-add-browser"`

#### Scenario: Jest setup registers requestAnimationFrame

- GIVEN the jest setup file is loaded
- WHEN a test calls `requestAnimationFrame(cb)`
- THEN `cb` MUST be invoked asynchronously
- AND the returned handle MUST be cancelable via `cancelAnimationFrame`

## Non-Goals

- Removing the `transform: scale(zoom)` wrapper rule (the pizarra-terminal-integration design rule forbids it; the live surface layer still pre-zooms bounds, so the wrapper's `transform: scale()` stays for Phase 1).
- Exposing the texture toggle as a user-facing setting.
- Multi-board support on the canvas (deferred to `pizarra-state-persistence`).
- Changing the canvas's outer color token (`#1a1f2e`).
- Re-introducing snap-to-grid (the grid was unused for snap; this change does not add snap).

## Test mapping

| Scenario                                                  | Test file                                                        | Test name                                                                   |
| --------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------- |
| No Konva grid lines by default                            | `src/components/pizarra/__tests__/PizarraCanvas.grid.test.jsx`   | `renders no Konva Line children when grid is disabled (default)`            |
| Opt-in radial gradient texture when env flag is enabled   | `src/components/pizarra/__tests__/PizarraCanvas.grid.test.jsx`   | `renders CSS background-image when env flag is enabled`                     |
| Env flag is read once at module scope                     | `src/components/pizarra/__tests__/PizarraCanvas.grid.test.jsx`   | `reads NEXT_PUBLIC_PIZARRA_GRID_TEXTURE exactly once across mounts`         |
| Healthy mount does not flash the loading placeholder      | `src/components/pizarra/__tests__/PizarraCanvas.grid.test.jsx`   | `does not render the loading placeholder when konvaLoadError is false`      |
| Konva load failure surfaces the loading placeholder       | `src/components/pizarra/__tests__/PizarraCanvas.grid.test.jsx`   | `renders the loading placeholder when konvaLoadError is true`               |
| Hover state applies a border-color tint without transform | `src/components/pizarra/PizarraToolPalette.test.jsx`             | `hover state changes border-color without transform`                        |
| Active tool renders a 1px inset accent border             | `src/components/pizarra/PizarraToolPalette.test.jsx`             | `active tool renders 1px inset accent border`                               |
| Canvas root carries the pizarra-canvas testid             | `src/components/pizarra/__tests__/PizarraPane.cascade.test.jsx`  | `PizarraPane root carries data-testid="pizarra-canvas"`                     |
| Tool palette buttons carry the add testids                | `src/components/pizarra/__tests__/PizarraPane.cascade.test.jsx`  | `tool palette exposes pizarra-add-terminal and pizarra-add-browser testids` |
| Jest setup registers requestAnimationFrame                | `src/components/pizarra/__tests__/usePizarraSurfaceDrag.test.js` | `jest setup provides requestAnimationFrame and cancelAnimationFrame`        |
