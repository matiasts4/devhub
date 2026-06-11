# Tasks: pizarra-motion-polish

> **Strict TDD** is ACTIVE. Every task follows RED (failing test) → GREEN (minimal impl) → REFACTOR. Test runner: `npm test`. Test framework: jest (next test). Each top-level task ≤ 130 LOC net.
>
> **Scope boundary**: this change is the consolidation pass — wire helpers to call sites, dedupe shell, close audit P0 (circle center + live preview), apply enter anim, mount `MotionConfig`, delete orphan, document flag. Terminal singleton / scrollback / sharedDockState promotion (Phase 4) and the 4.5/4.6/4.7 TerminalTTY wiring belong to a sibling change `pizarra-shared-dock-state` (deferred per `reconciliation.md`).

---

## Review Workload Forecast

- Total estimated LOC: **~720** (impl ~430 + tests ~290)
- Files touched: **18** (modified: 12, deleted: 2, new: 4)
- 400-line budget risk: **Medium** — comfortable single PR with no chained splits
- Chained PRs recommended: **No** — single PR per `single-pr` delivery, low coordination surface
- Decision needed before apply: **No** — within `single-pr` budget; orchestrator may proceed

### Suggested Work Units

| Unit | Goal                                           | Likely PR                                            | Notes                                                                                              |
| ---- | ---------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 1    | Single `tasks.md` artifact + reconciliation    | (none — this artifact)                               | Plan-level only; no code change                                                                    |
| 2    | All 10 implementation tasks (P-MP-1 → P-MP-10) | Single PR to `feature/terminal-renderer-xterm-webgl` | One review surface; checkout safe; flag `NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE` left as documented |

---

## 1. Reconcile `pizarra-shared-view-state/tasks.md`

- ID: **P-MP-1**
- Estimate: 60 LOC (docs only — no impl, no test)
- Files: `openspec/changes/pizarra-shared-view-state/tasks.md`
- Steps:
  1. RED: N/A (this is a docs reconciliation; not gated by a test).
  2. GREEN: apply the `reconciliation.md` diff — mark 9 tasks DONE (`1.1–1.8, 2.1–2.4, 2.6, 2.8, 3.2–3.4, 3.5, 3.7, 4.3, 4.4, 4.11, 5.1–5.7, 6.1–6.3, 6.5–6.7, 7.1–7.3, 7.8, 7.11`), mark 4 DEFERRED (`4.5, 4.6, 4.7, 7.6` — all depend on Agente 1 terminal noise filter stability), SPLIT 11 tasks out to `pizarra-shared-dock-state` (`3.6, 3.9, 4.1, 4.2, 4.8, 4.9, 4.10, 6.8, 7.4, 7.5, 0.3`), REWORD 5 (`2.5, 2.7, 3.1, 6.4, 7.4, 7.5`), REMOVE 3 (Phase 1 absorbed by `pizarra-drag-resize-polish`; Phase 6 absorbed by `pizarra-ux-overhaul`; `usePizarraModeTransition` orphan deletion is **P-MP-2** below).
  3. REFACTOR: add a header block "Reconciliation status" with link to `reconciliation.md` and the `pizarra-motion-polish` mapping.
- Acceptance: `openspec/changes/pizarra-shared-view-state/tasks.md` has a "Reconciliation" header; each `[ ]` checkbox is either marked DONE, DEFERRED, SPLIT, REWORD, or REMOVED with a one-line rationale.
- Verification: `grep -c "^- \[ \]" openspec/changes/pizarra-shared-view-state/tasks.md` returns 0 (no unchecked items remain).

---

## 2. Delete orphan `usePizarraModeTransition`

- ID: **P-MP-2**
- Estimate: 25 LOC (15 impl + 10 test)
- Files: `src/lib/pizarra/usePizarraModeTransition.js` (delete), `src/lib/pizarra/__tests__/usePizarraModeTransition.test.js` (delete), `src/lib/pizarra/__tests__/_deprecated.md` (new), `CHANGELOG.md` (note)
- Steps:
  1. RED: write `src/lib/pizarra/__tests__/_deprecated.md` as a 5-line pointer noting the deletion, then write a one-line regression test in a new `usePizarraOrphan.test.js` that does `expect(() => require('@/lib/pizarra/usePizarraModeTransition')).toThrow(/Cannot find module/)`. Run `npm test -- --testPathPattern=usePizarraOrphan` — RED.
  2. GREEN: `git rm src/lib/pizarra/usePizarraModeTransition.js src/lib/pizarra/__tests__/usePizarraModeTransition.test.js`. Re-run `usePizarraOrphan.test.js` — GREEN.
  3. REFACTOR: add `CHANGELOG.md` entry: "Removed orphan `usePizarraModeTransition` (broken `MODE_TRANSITION` import, zero production consumers — see `pizarra-motion-polish` design §1.8)."
- Acceptance: `git grep "usePizarraModeTransition" -- src/` returns only `_deprecated.md`. `usePizarraOrphan.test.js` passes.
- Verification: `npm test -- --testPathPattern=usePizarraOrphan` green; `grep -r "usePizarraModeTransition" src/ | grep -v _deprecated.md` returns 0.

---

## 3. Dedupe `ModeTransitionShell` (single owner)

- ID: **P-MP-3**
- Estimate: 80 LOC (30 impl + 50 test)
- Files: `src/components/workspace/WorkspaceRightDock.jsx`, `src/lib/pizarra/__tests__/ModeTransitionShell.wiring.test.jsx`
- Steps:
  1. RED: rewrite test #3 in `ModeTransitionShell.wiring.test.jsx`. Mount both `WorkspaceRightDock` AND `PizarraPane` in the same DOM with `dockState.maximizedView === 'pizarra'`. Assert `document.querySelectorAll('[data-testid="mode-transition-shell"]').length === 1`. Assert the lone shell is a descendant of `[data-testid="pizarra-canvas"]` (or the pizarra chrome root) — NOT of `[data-testid="workspace-right-dock"]`. Run `npm test -- --testPathPattern=ModeTransitionShell.wiring` — RED (currently 2).
  2. GREEN: in `WorkspaceRightDock.jsx:132-141`, drop the outer `<ModeTransitionShell>` wrap; return `dockBody` directly when `transitionEnabled` is true. The pizarra-side shell in `PizarraPane.jsx:409-418` stays as the single owner. Remove unused `ModeTransitionShell` import + the `detectReducedMotionPref` helper that the wrap was the only consumer of. Re-run the test — GREEN.
  3. REFACTOR: update test #4 to assert that with flag OFF, zero `[data-testid="mode-transition-shell"]` nodes appear (already true). Add a small comment in `PizarraPane.jsx:336` referencing the single-owner decision (design §1).
- Acceptance: `document.querySelectorAll('[data-testid="mode-transition-shell"]').length === 1` after a workspace→pizarra toggle; the lone shell is inside `PizarraPane`.
- Verification: `npm test -- --testPathPattern=ModeTransitionShell.wiring` green.

---

## 4. Wire wheel routing via `shouldCanvasConsumeWheel` (PizarraCanvas)

- ID: **P-MP-4**
- Estimate: 70 LOC (30 impl + 40 test)
- Files: `src/components/pizarra/PizarraCanvas.jsx`, `src/components/pizarra/__tests__/PizarraCanvas.wheel.test.jsx`
- Steps:
  1. RED: in `PizarraCanvas.wheel.test.jsx`, add two scenarios:
     - `wheel event on a hovered terminal surface (target closest .xterm) → setZoom NOT called, event.defaultPrevented stays false`
     - `wheel event on empty canvas (target = wrapper) → setZoom called with focal-aware delta`
       Mock `shouldCanvasConsumeWheel` from `@/lib/pizarra/pizarraWheel` so we can return false for the terminal case. Run `npm test -- --testPathPattern=PizarraCanvas.wheel` — RED.
  2. GREEN: in `PizarraCanvas.jsx:140-156`, rewrite `handleWheel`:
     ```
     const handleWheel = (event) => {
       if (!shouldCanvasConsumeWheel(event)) return;  // inner surface scrolls
       event.preventDefault();
       const next = zoomAtPoint({ currentZoom: zoom, currentPan: pan, deltaY: event.deltaY,
                                   focalX: event.clientX - wrapperRef.current.getBoundingClientRect().left,
                                   focalY: event.clientY - wrapperRef.current.getBoundingClientRect().top });
       setZoom(next.zoom);
       setPan(next.pan);
     };
     ```
     Import `shouldCanvasConsumeWheel` from `@/lib/pizarra/pizarraWheel` and `zoomAtPoint` from `@/lib/pizarra/canvasViewport`. Re-run — GREEN.
  3. REFACTOR: pull `getBoundingClientRect()` into a single `const rect = wrapperRef.current.getBoundingClientRect()` for clarity.
- Acceptance: wheel over `.xterm` does not change zoom; wheel over empty canvas applies focal zoom.
- Verification: `npm test -- --testPathPattern=PizarraCanvas.wheel` green.

---

## 5. Wire wheel routing in `canvasViewport.js` provider

- ID: **P-MP-5**
- Estimate: 40 LOC (15 impl + 25 test)
- Files: `src/lib/pizarra/canvasViewport.js`, `src/lib/pizarra/__tests__/canvasViewport.test.js`
- Steps:
  1. RED: in `canvasViewport.test.js`, add a test that asserts the inline `useEffect` wheel handler at `canvasViewport.js:225-236` calls `shouldCanvasConsumeWheel(event)` (mocked) — when the helper returns false, no `setZoom` call. Run `npm test -- --testPathPattern=canvasViewport` — RED.
  2. GREEN: replace the inline `event.target.closest('[data-testid="pizarra-browser-surface"], [data-testid="canvas-terminal"]')` at lines 227-229 with a single `shouldCanvasConsumeWheel(event)` import. Use the same `zoomAtPoint` focal math as **P-MP-4** (extract a shared helper or inline — both handlers stay consistent). Re-run — GREEN.
  3. REFACTOR: comment at the top of the `useEffect` stating the selector source of truth is now `pizarraWheel.js`.
- Acceptance: `canvasViewport.js` no longer contains `event.target.closest(...)` for the wheel selector; both wheel handlers in the repo go through `shouldCanvasConsumeWheel`.
- Verification: `npm test -- --testPathPattern=canvasViewport` green; `grep -n "event.target.closest" src/lib/pizarra/canvasViewport.js` returns 0 matches.

---

## 6. Surface enter animation

- ID: **P-MP-6**
- Estimate: 90 LOC (35 impl + 55 test)
- Files: `src/components/pizarra/CanvasTerminal.jsx`, `src/components/pizarra/PizarraBrowserSurface.jsx`, `src/components/pizarra/__tests__/pizarraSurfaceEnterAnim.test.jsx` (new)
- Steps:
  1. RED: in a new `pizarraSurfaceEnterAnim.test.jsx`, render a `CanvasTerminal` mock that exposes the inner frame ref. Assert the inner frame's `style.animation` contains `pizarraSurfaceEnterOpacity`. Then render a `PizarraBrowserSurface` mock and assert the same. Then assert the positioned OUTER wrapper has no `animation` style. Run `npm test -- --testPathPattern=pizarraSurfaceEnterAnim` — RED.
  2. GREEN: in `CanvasTerminal.jsx:18`, change `import { SURFACE_ENTER_ANIMATION }` to `import { SURFACE_ENTER_OPACITY_ONLY }`. Apply `style={{ animation: SURFACE_ENTER_OPACITY_ONLY, ... }}` to the **inner frame** div (the one hosting the chrome shadow/border, not the positioned wrapper). Add a `data-surface-state="entering"` attribute to that inner frame. After `DUR.enter` ms (340ms), drop both via a `useEffect` keyed on mount. Same change in `PizarraBrowserSurface.jsx:37`. Re-run — GREEN.
  3. REFACTOR: extract the enter-animation effect into a small `useSurfaceEnterAnimation()` hook at `src/lib/pizarra/useSurfaceEnterAnimation.js` so both files share the timing logic.
- Acceptance: new surfaces have `data-surface-state="entering"` and an opacity-only animation at mount; the positioned wrapper never animates; reduced-motion collapses to ≤ 50ms (per `surfaceMotion.js` `@media` block).
- Verification: `npm test -- --testPathPattern=pizarraSurfaceEnterAnim` green.

---

## 7. Audit P0 — circle center + live preview + transformer lock-in

- ID: **P-MP-7**
- Estimate: 110 LOC (45 impl + 65 test)
- Files: `src/components/pizarra/PizarraCanvas.jsx`, `src/lib/pizarra/pizarraReducer.js`, `src/components/pizarra/__tests__/PizarraCanvas.circleCenter.test.jsx` (new), `src/components/pizarra/__tests__/PizarraCanvas.livePreview.test.jsx` (new), `src/lib/pizarra/__tests__/pizarraReducer.test.js`
- Steps:
  1. RED:
     - `PizarraCanvas.circleCenter.test.jsx`: mock `handleMouseUp` to simulate `mousedown (100, 200)` → `mouseup (300, 400)` with `activeTool === 'circle'`. Assert the created shape has `x === 200, y === 300, radius ≈ 141.421`. (Currently fails — circle is created with `x = startX, y = startY, radius = min(dx,dy)/2 = 100`.)
     - `PizarraCanvas.livePreview.test.jsx`: simulate `mousedown (50, 50)` → `mousemove (120, 90)` (no mouseup). Assert an in-flight rectangle preview is rendered at `(50, 50, w:70, h:40)`. Simulate a second `mousemove (150, 110)` and assert the preview updates to `(50, 50, w:100, h:60)`. Assert `onShapeCreate` is NOT called until `mouseup`. Run `npm test -- --testPathPattern="PizarraCanvas\.(circleCenter|livePreview)"` — RED.
     - `pizarraReducer.test.js`: add a test for a new `DRAW_UPDATE` action that mutates the in-flight shape WITHOUT pushing to `state.elements` (it's tracked in component-local `drawing` state, so the reducer test is for the equivalent commit path).
  2. GREEN:
     - Circle math at `PizarraCanvas.jsx:285-293`:
       ```
       const cx = (startX + pos.x) / 2;
       const cy = (startY + pos.y) / 2;
       const radius = Math.sqrt(dx*dx + dy*dy) / 2;
       shape = createShape(SHAPE_TYPES.CIRCLE, { x: cx, y: cy, radius, ...toolSettings });
       ```
     - Live preview: in `handleMouseMove` (line 210-225), after the `!drawing` early-return, dispatch a local `setPreviewShape({ x, y, w, h, radius })` state update. Render the preview via a thin overlay layer positioned in container-local coords. Do NOT call `onShapeCreate`. On `mouseup`, call `onShapeCreate` with the FINAL geometry and `setDrawing(null)`.
     - `pizarraReducer.js`: add `PIZARRA_ACTIONS.DRAW_UPDATE` (used by the live-preview path if/when it lifts to the reducer; for now it's local component state).
  3. REFACTOR: extract the live-preview rendering into a small `<ShapePreviewOverlay>` component at `src/components/pizarra/ShapePreviewOverlay.jsx` for testability.
- Acceptance: circles stored at midpoint + half-diagonal radius; live preview updates on every `mousemove`; no `onShapeCreate` until `mouseup`; multi-select transformer still encloses the union of selected shapes (lock-in test asserts the `transformerRef.current.nodes(...)` call happens exactly once per selection change — see existing code at `PizarraCanvas.jsx:125-138`).
- Verification: `npm test -- --testPathPattern="PizarCanvas\.(circleCenter|livePreview)|pizarraReducer"` green.

---

## 8. Mount `<MotionConfig reducedMotion="user">` at root

- ID: **P-MP-8**
- Estimate: 30 LOC (10 impl + 20 test)
- Files: `src/App.js`, `src/lib/pizarra/__tests__/MotionConfigRoot.test.jsx` (new)
- Steps:
  1. RED: in a new `MotionConfigRoot.test.jsx`, render `<App>` (or the root component tree) inside a tiny harness. Stub `window.matchMedia` to return `{ matches: false }` (no reduced motion). Read `useReducedMotion()` from a child component using `react-test-renderer` or a custom hook consumer. Assert the hook returns `false` (i.e. `'never'`). Run `npm test -- --testPathPattern=MotionConfigRoot` — RED (currently the project has no `MotionConfig` mounted at root, so `useReducedMotion()` falls back to the default `null` path).
  2. GREEN: in `src/App.js`, wrap the root `<HashRouter>` (or the outermost `<App>` JSX) in `<MotionConfig reducedMotion="user">`. No new dependency — `framer-motion` `^12.38.0` is already a dep. Re-run — GREEN.
  3. REFACTOR: add a comment linking to NFR-P06 and `pizarra-motion-polish` design decision #10.
- Acceptance: `useReducedMotion()` consumers in `ZedAmbientOverlay.jsx` (and future motion consumers) respect OS preference at the tree level; existing tests that stub `matchMedia` continue to pass (since `"user"` is a no-op when matchMedia is not reduced).
- Verification: `npm test -- --testPathPattern="MotionConfigRoot|ZedAmbientOverlay"` green.

---

## 9. Circle shape migration (one-shot, gated, .bak)

- ID: **P-MP-9**
- Estimate: 80 LOC (40 impl + 40 test)
- Files: `src/lib/pizarra/circleMigration.js` (new), `src/lib/pizarra/__tests__/circleMigration.test.js` (new)
- Steps:
  1. RED: in a new `circleMigration.test.js`, mock `localStorage` (jsdom-backed). Scenarios:
     - First run with legacy `{ type: 'circle', x: 100, y: 200, radius: 50, width: null, height: null }` → after `migrateCircleShapes(payload)` returns new payload `{ x: 150, y: 250, radius: 50, width: 100, height: 100 }`. `localStorage['devhub_pizarra_circle_migration_v1']` === `'done'`. `localStorage['devhub_pizarra_circle_migration_v1.bak']` contains the original payload JSON.
     - Second run (flag === `'done'`) → no mutation, no `.bak` overwrite.
     - Malformed JSON in storage → returns the original payload (intact), `console.error` called, flag stays unset for retry.
     - Only circles are touched — rectangles, lines, arrows left untouched. Run `npm test -- --testPathPattern=circleMigration` — RED.
  2. GREEN: implement `src/lib/pizarra/circleMigration.js`:

     ```
     export const CIRCLE_MIGRATION_FLAG = 'devhub_pizarra_circle_migration_v1';
     export const CIRCLE_MIGRATION_BAK = 'devhub_pizarra_circle_migration_v1.bak';

     export function migrateCircleShapes(payload, storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
       if (!storage || storage.getItem(CIRCLE_MIGRATION_FLAG) === 'done') return payload;
       try {
         storage.setItem(CIRCLE_MIGRATION_BAK, JSON.stringify(payload));
       } catch (e) { /* ignore — non-fatal */ }
       let next;
       try {
         next = (Array.isArray(payload) ? payload : []).map((shape) => {
           if (!shape || shape.type !== 'circle' || shape.radius == null) return shape;
           if (shape.width != null && shape.height != null) return shape; // already migrated
           return { ...shape, x: shape.x + shape.radius, y: shape.y + shape.radius,
                    width: 2 * shape.radius, height: 2 * shape.radius };
         });
       } catch (e) {
         console.error('[pizarra] circle migration failed:', e);
         return payload; // failure-tolerant: leave shapes intact
       }
       try { storage.setItem(CIRCLE_MIGRATION_FLAG, 'done'); } catch (e) { /* ignore */ }
       return next;
     }
     ```

     Export `runCircleMigration()` (no-arg convenience that reads `localStorage` and calls the pure helper). Re-run — GREEN.

  3. REFACTOR: integrate the call site. The PizarraPane mount path (where `usePizarraState` reads persisted shapes) calls `runCircleMigration()` once on mount. Add a small comment block linking the spec §"One-Time Migration".

- Acceptance: legacy circle shapes re-anchored to midpoint; flag set; `.bak` written; failure-tolerant.
- Verification: `npm test -- --testPathPattern=circleMigration` green.

---

## 10. E2E transition test + flag staging docs

- ID: **P-MP-10**
- Estimate: 35 LOC (15 impl + 20 test)
- Files: `tests/e2e/pizarra-shared-view-state.spec.ts`, `src/lib/pizarra/featureFlag.js`, `src/lib/pizarra/__tests__/featureFlag.test.js`
- Steps:
  1. RED: in `featureFlag.test.js`, add a test that asserts a JSDoc-level contract: the exported `featureFlag.js` module includes a comment block documenting the rollout stages for `NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE`:
     - `dev` (default ON)
     - `staging` (explicit ON via env var)
     - `prod` (default OFF; explicit ON only after Agente 1 stable + sign-off)
       Assert the module source contains the strings `'dev:'`, `'staging:'`, `'prod:'` in the comment. Run `npm test -- --testPathPattern=featureFlag` — RED.
       In `pizarra-shared-view-state.spec.ts`, add a new test: with flag ON, drop a new terminal surface via the pizarra API; assert the inner frame's `style.animation` contains `pizarraSurfaceEnterOpacity`. Run `npx playwright test tests/e2e/pizarra-shared-view-state.spec.ts -g "enter animation"` — RED.
  2. GREEN:
     - In `featureFlag.js`, expand the header comment to include a "Rollout stages" table mapping `dev | staging | prod` to default + override env values. No behavior change — comments only.
     - In the Playwright spec, add the enter-animation test using `page.evaluate` to read the inner frame's `style.animation`. Re-run — GREEN.
  3. REFACTOR: cross-link from `featureFlag.js` to `docs/delegation/00-shared-context.md` (dependency table).
- Acceptance: feature flag has documented staging; E2E enter-animation test green.
- Verification: `npm test -- --testPathPattern=featureFlag` green; `npx playwright test tests/e2e/pizarra-shared-view-state.spec.ts` green (or at minimum the new scenario).

---

## Final Summary

### Task count

| ID        | Title                                        | Files        | LOC est.     |
| --------- | -------------------------------------------- | ------------ | ------------ |
| P-MP-1    | Reconcile shared-view-state/tasks.md         | 1            | 60 (docs)    |
| P-MP-2    | Delete orphan usePizarraModeTransition       | 4            | 25           |
| P-MP-3    | Dedupe ModeTransitionShell                   | 2            | 80           |
| P-MP-4    | Wire wheel routing (PizarraCanvas)           | 2            | 70           |
| P-MP-5    | Wire wheel routing (canvasViewport provider) | 2            | 40           |
| P-MP-6    | Surface enter animation                      | 3            | 90           |
| P-MP-7    | Circle center + live preview                 | 5            | 110          |
| P-MP-8    | Mount MotionConfig at root                   | 2            | 30           |
| P-MP-9    | Circle shape migration                       | 2            | 80           |
| P-MP-10   | E2E + flag staging docs                      | 3            | 35           |
| **Total** | **10 tasks**                                 | **18 files** | **~720 LOC** |

### Phase organization

| Phase                   | Tasks           | Focus                                                            |
| ----------------------- | --------------- | ---------------------------------------------------------------- |
| Phase 1: Reconciliation | P-MP-1          | Docs only — apply `reconciliation.md`                            |
| Phase 2: Cleanup        | P-MP-2          | Delete orphan                                                    |
| Phase 3: Shell dedupe   | P-MP-3          | Single ModeTransitionShell owner                                 |
| Phase 4: Wheel + zoom   | P-MP-4, P-MP-5  | Wire `shouldCanvasConsumeWheel` + `zoomAtPoint` in both handlers |
| Phase 5: Surfaces       | P-MP-6          | Enter animation on inner frames                                  |
| Phase 6: Audit P0       | P-MP-7, P-MP-9  | Circle center, live preview, migration                           |
| Phase 7: Root + docs    | P-MP-8, P-MP-10 | MotionConfig + E2E + flag docs                                   |

### Implementation order

```
P-MP-1 → P-MP-2 → P-MP-3 → P-MP-4 + P-MP-5 (parallel) → P-MP-6 → P-MP-7 → P-MP-8 → P-MP-9 → P-MP-10
```

- P-MP-1 is a docs task; can run alongside P-MP-2.
- P-MP-2 is independent (delete + 1 test).
- P-MP-3 dedupes the shell; P-MP-4 and P-MP-5 depend on each other through the wheel helper but are independently testable.
- P-MP-6 (enter anim) and P-MP-7 (audit P0) are both consumers of `surfaceMotion.js` and `shapeModel.js`; sequential to avoid merge conflicts in `PizarraCanvas.jsx`.
- P-MP-8 (`MotionConfig`) is independent but should land before the E2E test (P-MP-10) so the e2e sees the root provider mounted.
- P-MP-9 (migration) is independent of P-MP-7 (circle math) but should land after P-MP-7 so the migration handles the new geometry produced by the fix.

### Strict TDD — RED tests to write FIRST

| Task    | Test file                                                                          | Purpose                                                        |
| ------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| P-MP-2  | `usePizarraOrphan.test.js` (new)                                                   | require() throws after deletion                                |
| P-MP-3  | `ModeTransitionShell.wiring.test.jsx` (rewrite test #3)                            | exactly one shell, inside PizarraPane                          |
| P-MP-4  | `PizarraCanvas.wheel.test.jsx` (extend)                                            | `shouldCanvasConsumeWheel` routing                             |
| P-MP-5  | `canvasViewport.test.js` (extend)                                                  | provider also routes via helper                                |
| P-MP-6  | `pizarraSurfaceEnterAnim.test.jsx` (new)                                           | inner frame animation + `data-surface-state`                   |
| P-MP-7  | `PizarraCanvas.circleCenter.test.jsx` + `PizarraCanvas.livePreview.test.jsx` (new) | midpoint + live preview                                        |
| P-MP-8  | `MotionConfigRoot.test.jsx` (new)                                                  | `useReducedMotion()` honors root                               |
| P-MP-9  | `circleMigration.test.js` (new)                                                    | first run mutates + sets flag; re-runs no-op; failure-tolerant |
| P-MP-10 | `pizarra-shared-view-state.spec.ts` (e2e) + `featureFlag.test.js` (extend)         | enter anim + rollout doc strings                               |

### Risk areas

| Risk                                                              | Mitigation                                                                                  |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `MotionConfig` at root changes every `useReducedMotion()` result  | `"user"` is no-op when matchMedia is not reduced; existing `matchMedia`-stubbing tests pass |
| Focal-zoom math changes perceived panning on existing state       | Math preserves focal point; E2E verifies (0.3, 0.4) stays put                               |
| Circle center fix causes one-time visual jump on stored shapes    | P-MP-9 gated migration + `.bak` + failure tolerance                                         |
| Removing outer shell breaks existing wiring test                  | Rewrite test #3 in same change (RED→GREEN)                                                  |
| `usePizarraModeTransition` deletion breaks an unverified consumer | Grep + `_deprecated.md` pointer; zero prod consumers found                                  |

### Review Workload Forecast (final)

- Total estimated LOC: **~720** (impl ~430 + tests ~290)
- Files touched: **18** (modified: 12, deleted: 2, new: 4)
- 400-line budget risk: **Low** — single PR; no chained splits needed
- Chained PRs recommended: **No**
- Decision needed before apply: **No** — within `single-pr` budget; orchestrator may proceed

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: single-pr
400-line budget risk: Low

### Next Step

Ready for **sdd-apply**. All tests have explicit RED→GREEN structure. Each task has a single file or one logical unit of work. The branch `feature/terminal-renderer-xterm-webgl` already carries the `pizarra-shared-view-state/reconciliation.md` untracked file; the apply phase will stage the new `tasks.md` along with the 10 task implementations in a single reviewable diff.
