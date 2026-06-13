# Design: pizarra-motion-polish

## Context

`surfaceMotion.js` defines `SURFACE_ENTER_OPACITY_ONLY` + `EASE_OUT` + `DUR.*`. `useModeTransition` + `ModeTransitionShell` is the canonical workspace↔pizarra transition. `pizarraWheel.js` exports `shouldCanvasConsumeWheel`; `canvasViewport.js` exports `zoomAtPoint`. The spec is satisfied at the helper layer, but **consumers don't call the helpers**: `PizarraCanvas.jsx` does inline `setZoom`, the enter keyframes are imported but unused, two of three audit P0 fixes (circle center, live preview) are open, two `ModeTransitionShell` nodes render in lockstep, and `usePizarraModeTransition.js` is a compile-time bomb. This change wires helpers to call sites, closes audit P0, removes the orphan. Singletons + scrollback + registry → sibling `pizarra-shared-dock-state`.

## Goals / Non-Goals

**Goals**: single `ModeTransitionShell` owner (NFR-P03); wire `shouldCanvasConsumeWheel` in both wheel handlers (FR-P04); focal zoom via `zoomAtPoint` (FR-P05); apply `SURFACE_ENTER_OPACITY_ONLY` to inner frames (FR-P03); audit P0 — circle center + live preview (FR-P08); regression test for multi-select transformer; mount `<MotionConfig reducedMotion="user">` (NFR-P06); delete orphan.

**Non-Goals**: terminal noise filter, click strategy (Agente 1); `NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE` prod rollout; `SharedSurfacesProvider` / singleton / scrollback (sibling change); motion-token unification (Agente 4); Zed tools (Agente 2); swarm, undo/redo, PNG export; globals.css themes.

## Decisions

| #   | Choice                                                                                                                                                                             | Alternatives                                                                           | Rationale                                                                                                                                                                                      |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `ModeTransitionShell` owner = **`PizarraPane`** (inner). `WorkspaceRightDock` drops outer wrap.                                                                                    | (a) Outer dock. (b) New wrapper above both.                                            | Inner scopes `AnimatePresence` to pizarra content. Outer drags browser/editor/swarm panes through the transition even when not pizarra-active — two parallel phase machines. NFR-P03 explicit. |
| 2   | Both wheel handlers route through **`shouldCanvasConsumeWheel`**.                                                                                                                  | (a) Inline selector per handler. (b) Layer-specific helpers.                           | `canvasViewport.js:225-236` inlines a list that misses `.xterm`, `terminal-viewport-shell`. Helper is strict superset — one source of truth, one test.                                         |
| 3   | Focal-point math = `zoomAtPoint({ currentZoom, currentPan, deltaY, focalX, focalY, minZoom, maxZoom })`. Wheel converts `clientX → container-local` via `rect.left`.               | (a) Center-anchored. (b) Inline per handler.                                           | Helper exported + unit-tested. `nextPan = focal - (focal - pan) * (nextZoom / zoom)` keeps point under cursor pinned.                                                                          |
| 4   | Enter anim = `SURFACE_ENTER_OPACITY_ONLY` on **inner frame** at mount, `data-surface-state="entering"` for `DUR.enter` ms then drop.                                               | (a) Transform-bearing `SURFACE_ENTER_ANIMATION`. (b) Outer wrapper. (c) framer-motion. | All three desync the IPC-positioned native VTE / WebKitGTK content rect. `surfaceMotion.js` header documents the rule.                                                                         |
| 5   | Multi-select transformer: keep existing `useEffect`; regression test asserts call count = 1 + bbox encloses union.                                                                 | Per-renderer ref callbacks (audit anti-pattern).                                       | Fix already in `PizarraCanvas.jsx:125-138`. Lock with a test.                                                                                                                                  |
| 6   | Circle center = midpoint: `cx = (startX + pos.x)/2`, `cy = (startY + pos.y)/2`, `radius = sqrt(dx² + dy²)/2`. Renderer uses `x/y` as center.                                       | (a) Corner + bbox. (b) New `centerX/Y` fields.                                         | (a) Inconsistent with rect/line/arrow. (b) Breaking schema. Midpoint + half-diagonal uses existing schema.                                                                                     |
| 7   | Live preview: `handleMouseMove` dispatches `DRAW_UPDATE` reducer action mutating in-flight shape WITHOUT undo commit. `setDrawing(null)` only on `mouseup`.                        | (a) Commit per mousemove. (b) Local state + merge.                                     | (a) Pollutes undo. (b) Loses feedback on unrelated re-renders. Reducer draft in same store, filtered at mouseup.                                                                               |
| 8   | Migration gating: flag `devhub_pizarra_circle_migration_v1` in `localStorage`. Boot reads once → rewrite corner→midpoint → set flag + write `.bak`. Idempotent + failure-tolerant. | (a) Big-bang script. (b) No migration.                                                 | Same pattern as `pizarra-shared-view-state` Decision 9. (b) hostile.                                                                                                                           |
| 9   | Delete `usePizarraModeTransition.js` + test; add `__tests__/_deprecated.md` marker.                                                                                                | (a) Fix the import, wire scrim. (b) Keep both.                                         | Spec names `useModeTransition` as the ONLY production path. (a) re-opens closed decision.                                                                                                      |
| 10  | `MotionConfig reducedMotion="user"` mounts in `App.js` wrapping root.                                                                                                              | (a) `"always"`. (b) Lower wrapper. (c) Per-component hooks.                            | (a) Breaks tests stubbing `matchMedia`. (c) reinvents matchMedia per consumer. `"user"` lets explicit stubs win.                                                                               |
| 11  | `zed-aura-pulse` reduced-motion = 5-line `@media` block in `globals.css`.                                                                                                          | (a) Inline JSX. (b) Skip; framer-motion handles it.                                    | (b) `zed-aura-pulse` is CSS keyframe, not framer-motion — `MotionConfig` doesn't reach it.                                                                                                     |

## Data Flow

**Wheel** (post-change): `PizarraCanvas.onWheel` (non-passive) → `shouldCanvasConsumeWheel(event)` → true: `focalX = clientX - rect.left`, `next = zoomAtPoint(...)`, `setZoom(next.zoom); setPan(next.pan); preventDefault()`. False: return; xterm/browser scrolls. `CanvasViewportProvider` container listener (L225-236) follows the same path with the same helper.

**Enter animation**: `LiveSurfaceItem` mount → `ensureSurfaceMotionKeyframes()` (idempotent) → inner frame `style.animation = SURFACE_ENTER_OPACITY_ONLY`, `data-surface-state="entering"` → `setTimeout(DUR.enter)` drops both. Reduced motion: `@media` collapses keyframes to instant; `MotionConfig` honors OS pref tree-wide.

**Circle migration** (boot): read flag → `'done'` no-op → unset: `try { write .bak; rewrite corner→midpoint; flag='done' } catch { console.error; flag stays unset → retry }`.

## File Changes

| File                                                                        | Action           | Description                                                                                                                          |
| --------------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `PizarraCanvas.jsx`                                                         | Modify           | Wheel: helper + `zoomAtPoint`. Circle: midpoint + half-diagonal. `handleMouseMove` dispatches `DRAW_UPDATE`.                         |
| `canvasViewport.js`                                                         | Modify           | Replace inline selector (L225-236) with `shouldCanvasConsumeWheel`; focal via `zoomAtPoint`.                                         |
| `WorkspaceRightDock.jsx`                                                    | Modify           | Drop outer `<ModeTransitionShell>` (L132-141); remove unused `detectReducedMotionPref`.                                              |
| `CanvasTerminal.jsx`, `PizarraBrowserSurface.jsx`                           | Modify           | `SURFACE_ENTER_OPACITY_ONLY` on inner frame at mount; `data-surface-state="entering"` for `DUR.enter` ms. Outer wrapper un-animated. |
| `surfaceMotion.js`, `useModeTransition.js`                                  | Modify (docs)    | Expand 0ms-debounce comment linking to spec; JSDoc pointer on `MOTION_DRIVER`.                                                       |
| `usePizarraModeTransition.js` + test                                        | **Delete**       | Orphan, broken import, zero consumers.                                                                                               |
| `__tests__/_deprecated.md`                                                  | Create           | Marker pointing at `useModeTransition` as canonical.                                                                                 |
| `App.js`                                                                    | Modify           | `MotionConfig reducedMotion="user"` wrapping root. No new dep.                                                                       |
| `globals.css`                                                               | Modify (5 lines) | `@media (prefers-reduced-motion: reduce) { .zed-aura-pulse { animation: none; } }`.                                                  |
| `PizarraCanvas.livePreview.test.jsx`, `PizarraCanvas.circleCenter.test.jsx` | Create           | Live preview + circle center.                                                                                                        |
| `PizarraCanvas.wheel.test.jsx`, `ModeTransitionShell.wiring.test.jsx`       | Modify           | Wheel consumer + single-shell test #3.                                                                                               |
| `pizarra-shared-view-state.spec.ts` (e2e)                                   | Modify           | Enter anim on toggle; wheel routing + focal zoom.                                                                                    |

## Interfaces / Contracts

```js
// canvasViewport.js (existing, unchanged)
zoomAtPoint({ currentZoom=1, currentPan={x:0,y:0}, deltaY=0,
              focalX=0, focalY=0, minZoom=0.1, maxZoom=5 })
  → { zoom, pan: {x,y} }
// focalX/Y in container-local pixels; currentPan in pre-zoom canvas space.

// pizarraWheel.js (existing, unchanged)
shouldCanvasConsumeWheel(event) → boolean
// false = inner surface scrolls; true = canvas consumes as zoom.

// surfaceMotion.js (existing, unchanged)
SURFACE_ENTER_OPACITY_ONLY = "pizarraSurfaceEnterOpacity 340ms cubic-bezier(0.22, 1, 0.36, 1) both";

// App.js (new) — "user" so matchMedia stubs in tests win.
<MotionConfig reducedMotion="user">{existing tree}</MotionConfig>

// localStorage (new):
//   devhub_pizarra_circle_migration_v1       = "done"   (idempotent)
//   devhub_pizarra_circle_migration_v1.bak   = <JSON>   (written BEFORE mutation)
```

## Testing + Migration + Rollout

**Unit**: `PizarraCanvas.wheel.test.jsx` (helper false → no zoom/no preventDefault; true → focal zoom); `ModeTransitionShell.wiring.test.jsx` test #3 (`querySelectorAll.length === 1` AND inside `PizarraPane`); new `PizarraCanvas.circleCenter.test.jsx` (forward + reverse drag → midpoint + half-diagonal); new `PizarraCanvas.livePreview.test.jsx` (3× `mousemove` → intermediate geometry, no `onShapeCreate` until `mouseup`); new `pizarraCircleMigration.test.js` (first run mutates + sets flag + writes `.bak`; second run no-op; malformed JSON leaves flag unset); new `pizarraSurfaceEnterAnim.test.jsx` (stub `matchMedia` to `reduce`; enter resolves ≤ 50 ms).

**E2E**: `pizarra-shared-view-state.spec.ts` — inner frame `style.animation` contains `pizarraSurfaceEnterOpacity`; wheel on terminal scrolls, wheel on empty canvas at `(400,200)` zooms at cursor.

**Regression**: `grep -r usePizarraModeTransition src/` returns 0 matches outside `_deprecated.md`.

**Migration** (only persisted state this change mutates): flag `devhub_pizarra_circle_migration_v1` defaults unset → runs once on first boot. Backup to `.bak` BEFORE mutation. Mutation: `type==='circle' && radius!=null && width==null` → `{x: x+radius, y: y+radius, width: 2*radius, height: 2*radius}`. Idempotent. Failure-tolerant: errors caught + logged, flag stays unset → retry, user keeps old shapes. All other changes deploy-without-flag. Migration flag is per-user.

**Rollback**: revert outer shell, wheel + circle math, inner frame animation, `MotionConfig` mount; restore deleted files from git. Migration flag harmless if left set after rollback.

## Open Questions

None. `usePizarraModeTransition` deletion final. Focal-zoom placement final (one helper, both handlers). Circle migration gated + reversible.

## Risks

| Risk                                                                               | Likelihood         | Mitigation                                                                                                                                                                                            |
| ---------------------------------------------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Removing outer shell breaks wiring test #3                                         | High (intentional) | Rewrite test: exactly one shell inside `PizarraPane`. Run red-first.                                                                                                                                  |
| Focal zoom changes perceived panning on existing state                             | Medium             | Math preserves focal point. E2E: point at `(0.3, 0.4)` stays there after zoom.                                                                                                                        |
| Circle center fix causes one-time visual jump                                      | Medium             | Gated migration + `.bak` + failure tolerance. User sees old shapes intact on failure.                                                                                                                 |
| `MotionConfig` breaks tests stubbing `matchMedia`                                  | Medium             | `"user"` (not `"always"`) is no-op when matchMedia is not reduced. Existing tests pass.                                                                                                               |
| Deleting `usePizarraModeTransition` breaks unverified consumer                     | Low                | Grep confirms zero prod consumers. `_deprecated.md` marker.                                                                                                                                           |
| Enter anim flashes on HMR remount; `MotionConfig` SSR; token unification (NFR-P07) | Low                | `useEffect` keyed on `shape.id` drops class after `DUR.enter` ms. framer-motion already in `App.js`; `MotionConfig` is SSR-safe. 60ms `DUR` gap = deliberate domain split; Agente 4 owns unification. |
