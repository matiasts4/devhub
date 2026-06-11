# Proposal: pizarra-motion-polish

## Intent

The pizarra's motion layer has drifted from spec. `surfaceMotion.js` defines `SURFACE_ENTER_*` keyframes, a `useModeTransition` hook, and a `ModeTransitionShell` — but the wiring is duplicated (`WorkspaceRightDock` + `PizarraPane` both wrap their content), the wheel handler in `PizarraCanvas.jsx` does an inline zoom that bypasses the `shouldCanvasConsumeWheel` selector and the focal-point `zoomAtPoint` math, and two of three audit-flagged P0 issues (circle center, live preview) remain open. This change is the consolidation pass that makes the pizarra's workspace↔canvas toggle, surface enter animation, wheel/zoom routing, and shape-drawing fixes match the spec — without re-doing the shared-surface singleton work that depends on Agente 1 (terminales).

## Scope

### In Scope

- Dedupe `ModeTransitionShell` — single owner is `PizarraPane` (inner); remove the outer wrap from `WorkspaceRightDock.jsx`.
- Wire `shouldCanvasConsumeWheel` in `PizarraCanvas.wheel` handler; replace inline center-anchored `setZoom` with `canvasViewport.zoomAtPoint` (focal zoom under cursor).
- Apply `SURFACE_ENTER_OPACITY_ONLY` to inner frame mounts in `CanvasTerminal.jsx` and `PizarraBrowserSurface.jsx` (imports are unused).
- Audit P0 fixes: multi-select transformer (already fixed; lock-in test), circle center calculation, live preview during shape drag in `PizarraCanvas.jsx`.
- Reconcile `useModeTransition` 0ms-debounce decision in `surfaceMotion.js` comments and link to `pizarra-mode-transition` spec §7.2 (or update spec — document chosen path).
- Delete orphan `usePizarraModeTransition.js` + its test (broken `MODE_TRANSITION` import, zero production consumers, redundant with `useModeTransition` + `ModeTransitionShell`).
- Mount `<MotionConfig reducedMotion="user">` at the workspace shell so `useReducedMotion()` in framer-motion consumers (`ZedAmbientOverlay.jsx`, etc.) respects the OS preference at the tree level.
- Add `prefers-reduced-motion` override in `globals.css` for `.zed-aura-pulse` (sibling, low-risk 5-line CSS block).
- Lock-in tests: single-shell assertion (testid count), wheel routing decision, focal zoom math, surface enter animation, reduced-motion collapse.
- Cross-reference `pizarra-shared-dock-state` — the new sibling change that owns the 11 SPLIT tasks from the reconciliation (singleton, scrollback, registry, TWM promotion).

### Out of Scope

- `NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE` production rollout (stays off until Agente 1 stable) — coordinated with Agente 1 only for the dev/staging flag.
- `SharedSurfacesProvider`, `SurfacePortal`, `useSharedDockState`, terminal/browser singleton, scrollback preservation (Phase 4 of `pizarra-shared-view-state`) — all SPLIT to `pizarra-shared-dock-state`.
- `useLiveSurfaceRegistry` shim deprecation and bidirectional registry work — already DONE; only touch if a wire breaks.
- Motion-token unification between `motion-tokens.js` and `surfaceMotion.js` (Agente 4 owns design tokens).
- `terminalNoiseFilter.js`, mouse click strategy, terminal TUI work (Agente 1).
- `src/lib/asistente/tools/**` and Zed tool implementations (Agente 2).
- Swarm/orchestration, undo/redo pizarra, PNG export.
- Refactor of `globals.css` themes (Agente 4).

## Capabilities

### New Capabilities

- `pizarra-motion-polish`: consolidation pass for animation/transition correctness — dedupe shells, wire wheel routing, apply surface enter keyframes, close the audit P0 gaps for circle center and live preview, mount `MotionConfig`, and remove the orphan scrim. Each item maps to a req+scenario in the delta spec.

### Modified Capabilities

- `pizarra-mode-transition`: clarify the 0ms-debounce decision (or update `pizarra-mode-transition/spec.md` to match code); document the conscious choice in `surfaceMotion.js`. The motion timing (110ms leaving + 220ms entering) matches the spec; only the debounce-window value diverges and that is intentional.
- `canvas-terminal`: lock in the multi-select transformer fix as a tested contract; add live-preview-during-drag scenario; add circle-center scenario.
- `pizarra-flicker-decoupling`: no spec change — flicker fix is already DONE (Phase 1). This change only strengthens the regression net (testid count for the shell, single-owner assertion).

## Approach

### Wheel routing and focal zoom

`PizarraCanvas.jsx` (lines 143-156) has an inline `setZoom` that does not check the target. Replace it with:

1. Call `shouldCanvasConsumeWheel(event)` from `pizarraWheel.js` — if the event is over a terminal/browser/xterm viewport, return early and let the inner surface scroll.
2. Otherwise compute `focalX/focalY` as `event.clientX - rect.left`, `event.clientY - rect.top`, and call `canvasViewport.zoomAtPoint({ currentZoom, currentPan, deltaY, focalX, focalY, minZoom: 0.1, maxZoom: 5 })`. The helper is already exported and unit-tested.
3. Same handler used in `canvasViewport.js:225-236` — replace its inline selector list with `shouldCanvasConsumeWheel` so the two paths can't drift.

### Surface enter animation

`SURFACE_ENTER_OPACITY_ONLY` is the safe choice for native-VTE surfaces (transform would desync IPC-positioned panels). Apply it as `animation: ${SURFACE_ENTER_OPACITY_ONLY}` on the inner frame div in `CanvasTerminal.jsx` and `PizarraBrowserSurface.jsx`. `ensureSurfaceMotionKeyframes()` is already called at module scope, so the `@keyframes` are present.

### Single `ModeTransitionShell` owner

`WorkspaceRightDock.jsx:132-141` wraps the dock body in `<ModeTransitionShell>`. `PizarraPane.jsx:409-418` wraps again inside that. With pizarra active, the DOM has two `[data-testid="mode-transition-shell"]` nodes. Drop the OUTER wrap in `WorkspaceRightDock`; keep the INNER one in `PizarraPane`. Update `ModeTransitionShell.wiring.test.jsx` test #3 ("single shell per toggle" — assert exactly one testid in the rendered tree).

### Audit P0 — circle center and live preview

`PizarraCanvas.jsx:285-293` creates a circle with `(x, y) = (startX, startY)` and `radius = min(dx, dy) / 2`. Fix: `(x, y) = (startX + dx / 2, startY + dy / 2)`. Existing stored shapes have `x` at the corner — the renderer will see a one-time visual jump. Mitigation: one-time migration on shape load that recomputes `x = x + radius, y = y + radius` for shapes with `type === 'circle'` and `radius != null`. The migration runs once, is gated on a localStorage flag `devhub_pizarra_circle_migration_v1`, and writes a `.bak` key.

`handleMouseMove` in `PizarraCanvas.jsx:210-225` early-returns on `!drawing`. Add a branch that updates the in-flight shape's `width/height/x/y` (or `radius` for circle) so the user sees a live outline as they drag. Add a unit test in `PizarraCanvas.livePreview.test.jsx` that simulates `mousedown → mousemove → mouseup` and asserts intermediate state.

### Mount `MotionConfig`

In `App.js` (or `providers.js`), add `<MotionConfig reducedMotion="user">` wrapping the tree. No new dep — framer-motion is already a project dep (`^12.38.0`). `useReducedMotion()` inside `ZedAmbientOverlay.jsx:66` and any future motion consumer will now respect the OS preference at the root.

### Orphan cleanup

`usePizarraModeTransition.js` imports `MODE_TRANSITION` from `@/components/ui/system/motion-tokens`, which does not export that name — runtime/compile-time failure. No production consumer. Delete the file and its test (`usePizarraModeTransition.test.js`). Add a `_DEPRECATED.md` note in the `__tests__` dir pointing to `useModeTransition` as the canonical path.

### Reduced-motion on `zed-aura-pulse`

Add 5 lines in `globals.css`:

```css
@media (prefers-reduced-motion: reduce) {
  .zed-aura-pulse {
    animation: none;
  }
}
```

Out of `pizarra-motion-polish`'s primary scope (it lives in `ZedAmbientOverlay`), but the 5-line block is trivially safe and the delegation brief listed it under NFR-P01.

### Cross-reference to `pizarra-shared-dock-state`

The reconciliation pass found 11 tasks that belong in a separate change (Phase 4 TerminalTTY singleton, partial Phase 2 dockState promotion, browser tab list in pizarra, etc.). This proposal does not absorb them — it acknowledges the split and leaves them to `pizarra-shared-dock-state`, which Agente 3 will own after this motion change lands.

## Affected Areas

| Area                                                                   | Impact                  | Description                                                                                                                    |
| ---------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `src/components/pizarra/PizarraCanvas.jsx`                             | Modified                | Wheel handler rewrite (routing + focal zoom). Circle creation fix. Live preview in `handleMouseMove`.                          |
| `src/components/pizarra/CanvasTerminal.jsx`                            | Modified                | Apply `SURFACE_ENTER_OPACITY_ONLY` to inner frame.                                                                             |
| `src/components/pizarra/PizarraBrowserSurface.jsx`                     | Modified                | Apply `SURFACE_ENTER_OPACITY_ONLY` to inner frame.                                                                             |
| `src/components/workspace/WorkspaceRightDock.jsx`                      | Modified                | Remove the outer `<ModeTransitionShell>` wrap (NFR-P03 dedupe).                                                                |
| `src/components/pizarra/PizarraPane.jsx`                               | Modified                | No new wiring — single-owner shell stays here.                                                                                 |
| `src/lib/pizarra/canvasViewport.js`                                    | Modified                | Replace inline selector list at lines 225-236 with `shouldCanvasConsumeWheel` import.                                          |
| `src/lib/pizarra/surfaceMotion.js`                                     | Modified                | Expand the 0ms-debounce comment block; link to spec §7.2.                                                                      |
| `src/lib/pizarra/useModeTransition.js`                                 | Modified (docs only)    | Add a header comment referencing the 0ms-debounce decision log.                                                                |
| `src/lib/pizarra/usePizarraModeTransition.js`                          | **Removed**             | Orphan, broken import, zero consumers.                                                                                         |
| `src/lib/pizarra/__tests__/usePizarraModeTransition.test.js`           | **Removed**             | Test for orphan; deletion follows the file.                                                                                    |
| `src/App.js` (or `src/app/providers.js`)                               | Modified                | Mount `<MotionConfig reducedMotion="user">` at the shell.                                                                      |
| `src/app/globals.css`                                                  | Modified (5-line block) | `prefers-reduced-motion` override for `.zed-aura-pulse`.                                                                       |
| `src/components/pizarra/__tests__/PizarraCanvas.livePreview.test.jsx`  | New                     | Drag → assert intermediate `width/height/radius` updates before mouseup.                                                       |
| `src/components/pizarra/__tests__/PizarraCanvas.circleCenter.test.jsx` | New                     | Asserts circle stored with midpoint center.                                                                                    |
| `src/lib/pizarra/__tests__/PizarraCanvas.wheel.test.jsx`               | Modified                | Add scenario: `shouldCanvasConsumeWheel` returns false → wheel reaches terminal; returns true → focal zoom applied.            |
| `src/lib/pizarra/__tests__/ModeTransitionShell.wiring.test.jsx`        | Modified                | Test #3 asserts EXACTLY one `[data-testid="mode-transition-shell"]` in the rendered tree.                                      |
| `tests/e2e/pizarra-shared-view-state.spec.ts`                          | Modified                | Add scenario: toggle workspace→pizarra while a new terminal spawns; assert enter animation runs (visual regression or testid). |
| `openspec/changes/pizarra-shared-view-state/tasks.md`                  | Modified                | Apply the diff from `reconciliation.md` (Phase 4 deferred; Phase 6 marked DONE with wiring-fix forward-pointer).               |
| `openspec/changes/pizarra-shared-dock-state/`                          | New (sibling change)    | Owns the 11 SPLIT tasks. Spawned after this change lands.                                                                      |

## Risks

| Risk                                                                                                                                          | Likelihood         | Mitigation                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Removing the outer `ModeTransitionShell` breaks `ModeTransitionShell.wiring.test.jsx` test #3 (it currently asserts the shell wraps the dock) | High (intentional) | Update the test to assert EXACTLY one `[data-testid="mode-transition-shell"]` is present in the tree, located inside `PizarraPane`. Run the test red-first before the change.                                                                                                                                                                                                                                                       |
| Focal zoom changes user-perceived panning on existing pizarra state                                                                           | Medium             | The math preserves the focal point (point under cursor stays under cursor at the new zoom). The only visible difference is when the cursor is off-center. Add an E2E test that asserts a known point at (0.3, 0.4) of the canvas stays at (0.3, 0.4) after a wheel zoom.                                                                                                                                                            |
| Circle center fix causes a one-time visual jump on existing stored shapes                                                                     | Medium             | Add a one-shot migration gated on `devhub_pizarra_circle_migration_v1`. Old shapes with `radius != null` get `x += radius; y += radius; width = 2*radius; height = 2*radius`. A `.bak` localStorage key is written before migration. After migration runs, the flag is set and the migration never re-runs. If the migration fails, the app still boots (no throw) and the user sees the old (intact, just visually-offset) shapes. |
| `MotionConfig` at root changes every framer-motion `useReducedMotion()` result — could break tests that stub `matchMedia` directly            | Medium             | Existing tests already stub `matchMedia` (`ZedAmbientOverlay.test.jsx`, `ModeTransitionShell.test.jsx`). `MotionConfig reducedMotion="user"` is a no-op when `matchMedia` is not reduced-motion; it does not force `reducedMotion="always"`.                                                                                                                                                                                        |
| Deleting `usePizarraModeTransition.js` breaks an unverified consumer                                                                          | Low                | Grep confirmed zero `import` of `usePizarraModeTransition` in `src/` outside the test file.                                                                                                                                                                                                                                                                                                                                         |
| Token unification (NFR-P07) is not fully addressed                                                                                            | Low (acceptable)   | The 60ms `DUR` gap between `motion-tokens.js` and `surfaceMotion.js` is documented as a deliberate domain split (workspace chrome vs surface chrome). Add a JSDoc pointer in `motion-tokens.js` referencing `surfaceMotion.js` for pizarra surfaces. The full unification is Agente 4's call.                                                                                                                                       |

## Rollback Plan

1. Revert `WorkspaceRightDock.jsx` to wrap in `<ModeTransitionShell>` (re-introduce the outer shell).
2. Revert `PizarraCanvas.jsx` wheel handler to inline `setZoom` (lines 143-156) and circle center to `(startX, startY)`.
3. Revert `CanvasTerminal.jsx` and `PizarraBrowserSurface.jsx` to not apply `SURFACE_ENTER_OPACITY_ONLY`.
4. Revert `App.js` / `providers.js` `MotionConfig` mount.
5. Remove the new test files (`PizarraCanvas.livePreview.test.jsx`, `PizarraCanvas.circleCenter.test.jsx`).
6. Restore `usePizarraModeTransition.js` and its test from `git` (the file is in the prior commit).
7. Migration is read-only — the localStorage flag `devhub_pizarra_circle_migration_v1` is harmless if left set; users who rolled back keep the new geometry.
8. The `MotionConfig` change is reversible without feature flag (no migration concerns).

## Dependencies

- `framer-motion` `^12.38.0` (existing — for `MotionConfig`, `useReducedMotion`).
- `surfaceMotion.js` tokens (existing — for `SURFACE_ENTER_OPACITY_ONLY`, `EASE_OUT`, `DUR`).
- `pizarraWheel.js` (existing — `shouldCanvasConsumeWheel`).
- `canvasViewport.js` (existing — `zoomAtPoint`).
- Feature flag `NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE` (existing, stays at `true` in dev, `false` in prod per delegation).

## Coordination

- Agente 1 (terminales): `NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE` production rollout is BLOCKED until Agente 1 is stable. This change does not touch `terminalNoiseFilter.js` or terminal IPC.
- Agente 2 (Zed tools): no dependency. This change does not touch `src/lib/asistente/tools/**`.
- Agente 4 (diseño): motion-token unification is deferred. `motion-tokens.js` JSDoc pointer is in scope.
- Sibling change `pizarra-shared-dock-state` (to be spawned by the orchestrator after this one lands): owns the 11 SPLIT tasks from `reconciliation.md`. This change is the gating prerequisite for stable scrollback preservation.

## Success Criteria

- [ ] Exactly one `[data-testid="mode-transition-shell"]` node in the DOM after a workspace→pizarra toggle (asserted by `ModeTransitionShell.wiring.test.jsx` test #3).
- [ ] Wheel over a terminal surface scrolls the terminal; wheel on empty canvas zooms at the cursor (focal point). E2E scenario in `pizarra-shared-view-state.spec.ts`.
- [ ] New surfaces enter with the defined `SURFACE_ENTER_*` keyframes (opacity-only). Visual diff ≤ 5% from baseline; unit test asserts `animation` style is set.
- [ ] `prefers-reduced-motion: reduce` collapses the mode transition to ≤ 50ms; `.zed-aura-pulse` has no animation. Asserted in `useModeTransition.test.js` and a CSS regression test.
- [ ] Circle center stored at midpoint (not corner). Migration is one-shot, gated, with `.bak` key.
- [ ] Live preview during shape drag updates intermediate `width/height/radius` before mouseup. `PizarraCanvas.livePreview.test.jsx` passes.
- [ ] `usePizarraModeTransition.js` deleted; grep confirms no orphan import.
- [ ] `<MotionConfig reducedMotion="user">` mounted in shell; `useReducedMotion()` consumers in `ZedAmbientOverlay.jsx` honor OS preference.
- [ ] E2E `pizarra-shared-view-state.spec.ts` green; new transition scenario added if missing.
- [ ] Unit + integration tests green. Lint clean. No new console warnings.
- [ ] `[git:checkpoint]` left in DevHub MCP with `commit=<sha>` and test status.
