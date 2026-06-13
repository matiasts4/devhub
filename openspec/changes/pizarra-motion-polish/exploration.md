# Exploration: pizarra-motion-polish

> Phase: explore · Status: ok · Date: 2026-06-11
> Parent change: `pizarra-shared-view-state` (this is the motion + UX follow-up; many of its gaps map here).
> Related reconciliation: `openspec/changes/pizarra-shared-view-state/reconciliation.md`

## 1. Current State — what is actually in the tree

The pizarra stack has substantial motion work already shipped. The reconciliation pass found that **Phase 1 (Flicker Fix), Phase 4 (Singleton Portal — partial), Phase 6 (Mode Transition hook + shell), and Phase 7 (feature flag)** are mostly in place; **Phase 3 (Browser multi-tab UI) is missing**; **Phase 5 (Bidirectional Registry) is WIP; Phase 2 (SharedDockState) is missing**. This change is a focused follow-up, NOT a re-implementation.

### 1.1 Motion tokens (canonical source)

`src/lib/pizarra/surfaceMotion.js` (173 LOC) is the canonical motion token file for pizarra live surfaces. Exports:

- `EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)'`
- `EASE_SOFT = 'cubic-bezier(0.4, 0, 0.2, 1)'`
- `DUR = { fast: 140, base: 220, enter: 340 }`
- `ACCENT`, `SURFACE_SHADOW`, `SURFACE_BORDER` (visual constants)
- `resolveFrameVisual({ selected, hovered, dragging })` — frame chrome state
- `resolveHandleSizing(zoom)` — hit-area sizing
- `FRAME_TRANSITION` — CSS transition string for chrome frame
- `ensureSurfaceMotionKeyframes()` — idempotent keyframe injection
- `SURFACE_ENTER_ANIMATION` — `${name} ${DUR.enter}ms ${EASE_OUT} both` (transform + opacity)
- `SURFACE_ENTER_OPACITY_ONLY` — same name, opacity only; safe for surfaces that host native overlays (browser, terminal) where transform would desync the IPC-positioned native content
- `MOTION_DRIVER = 'framer-motion'` (Phase 6.3)

A second token file exists: `src/components/ui/system/motion-tokens.js` (107 LOC) — DevHub-wide tokens. `DUR.base = 180` (vs `surfaceMotion.DUR.base = 220`), `DUR.enter = 280` (vs `340`). They overlap in intent but are NOT unified. `useModeTransition` reads from `surfaceMotion.js` only.

### 1.2 Mode transition

`src/lib/pizarra/useModeTransition.js` (272 LOC) — phase machine `idle → leaving (110ms) → entering (220ms) → idle`, with `progress` ticking on a 16ms interval, reduced-motion collapsing to ≤ 50ms cross-fade, framer-motion `animProps` returned. **DEFAULTS:** `leaveMs = 110`, `enterMs = 220`, `debounceMs = 0` (the `// Debounce intentionally set to 0` comment makes the conscious design choice explicit).

`src/lib/pizarra/ModeTransitionShell.jsx` (80 LOC) — wraps the chrome in an `AnimatePresence mode="wait"` keyed on `maximizedView`, with `pointerEvents: isAnimating ? 'none' : 'auto'` guard, `data-transition-phase` and `data-transition-active` test attributes.

### 1.3 Wiring (already done)

`WorkspaceRightDock.jsx` (161 LOC) and `PizarraPane.jsx` (419 LOC, plus an inner `PizarraInner`) **both** wrap their content in `<ModeTransitionShell>` when `isPizarraSharedViewEnabled() === true`. The wiring is:

```js
const view = dockState?.maximizedView;
const shellMaximizedView = view === 'pizarra' ? 'pizarra' : 'workspace';
const transitionEnabled = isPizarraSharedViewEnabled();
if (!transitionEnabled) return dockBody;
return (
  <ModeTransitionShell
    maximizedView={shellMaximizedView}
    reducedMotion={reducedMotion}
    testId="mode-transition-shell"
  >
    …
  </ModeTransitionShell>
);
```

This **contradicts NFR-P03** ("Un solo `ModeTransitionShell` por toggle — eliminar anidamiento en `WorkspaceRightDock` + `PizarraPane`"). With the current tree, the rendered DOM contains TWO `data-testid="mode-transition-shell"` nodes when the pizarra tab is active (one wrapping the right-dock chrome, one wrapping the pizarra pane inside that chrome). Both run their own phase machine in lockstep — visual output is fine because `PizarraPane` is hidden while `isPizarraActive=false`, but it is double work and double test surface.

### 1.4 Flicker fix (already done)

`src/components/pizarra/CanvasTerminal.jsx` (738 LOC) implements the full flicker fix: `pointerDown` (visual) + `isLiveDragging` (suspend) + `isResizing` (visual, no suspend) state machine, `DRAG_THRESHOLD_PX = 3` (line 44), synchronous reattach in the `wasLiveDraggingRef` effect (lines 240-253). `<TerminalTTY suspendNativeSurface={isLiveDragging}>` (line 628). `usePizarraSurfaceDrag` extended with `onDragMove` (lines 160-165 in usePizarraSurfaceDrag.js).

Tested in `src/components/pizarra/__tests__/CanvasTerminal.flicker.test.jsx` — 5 scenarios, all pass.

### 1.5 Wheel routing (partial)

`src/lib/pizarra/pizarraWheel.js` (52 LOC) exports:

- `PIZARRA_INTERACTIVE_WHEEL_SELECTOR` — data-testid selector for terminal/browser targets
- `isPizarraInteractiveWheelTarget(target)` — target check
- `shouldCanvasConsumeWheel(event)` — combined target + rect hit-test

Tested in `src/lib/pizarra/__tests__/pizarraWheel.test.js` (3 tests, pass). **NOT IMPORTED** by `PizarraCanvas.jsx`. The canvas wheel handler in `PizarraCanvas.jsx:147-150` does:

```js
const handleWheel = (event) => {
  event.preventDefault();
  setZoom((currentZoom) => Math.min(Math.max(currentZoom - event.deltaY * 0.001, 0.1), 5));
};
```

…and `canvasViewport.js:225-236` does its own inline target check (`[data-testid="pizarra-browser-surface"], [data-testid="canvas-terminal"]`). The selector lists differ — `pizarraWheel.js` also covers `terminal-viewport-shell`, `terminal-content-body`, `terminal-root-body`, `.xterm`, `.xterm-viewport` that `canvasViewport.js` does NOT match. **FR-P04 gap.**

### 1.6 Zoom-at-point

`src/lib/pizarra/canvasViewport.js:99-127` exports `zoomAtPoint({ currentZoom, currentPan, deltaY, focalX, focalY, minZoom, maxZoom })` — focal-point-preserving zoom, math correct. The wheel handler in `PizarraCanvas.jsx:147-150` and the provider wheel handler in `canvasViewport.js:225-236` do NOT call it; they apply a center-anchored zoom via `setZoom((z) => z - deltaY * 0.001)`. **FR-P05 gap.**

### 1.7 Surface enter animation (defined, NOT applied)

`SURFACE_ENTER_ANIMATION` is imported in BOTH `CanvasTerminal.jsx:18` and `PizarraBrowserSurface.jsx:37` but **NEVER applied** as a CSS animation value in either file. Grep confirms only the import line exists; no `animation:` or `animation: ${SURFACE_ENTER_ANIMATION}` use. `ensureSurfaceMotionKeyframes()` IS called (so the @keyframes are injected), but no element animates with them. The `LiveSurfaceItem` wrappers in `PizarraLiveSurfaceLayer.jsx:424-460` and 463-502 are positioned absolutely with `position: 'absolute'`, `left/top` direct — no `animation` property. **FR-P03 gap.**

### 1.8 `usePizarraModeTransition` is ORPHAN

`src/lib/pizarra/usePizarraModeTransition.js` (160 LOC) — scrim-based approach. Imports `MODE_TRANSITION` from `@/components/ui/system/motion-tokens` (line 13). **`MODE_TRANSITION` is NOT exported by motion-tokens.js** (the file exports `DUR`, `EASE`, `EASE_CSS`, `TRANSITION`, `VARIANTS_*` — there is no `MODE_TRANSITION` named export). The import is a runtime/compile-time failure if the module ever loads. The file is tested in `usePizarraModeTransition.test.js` (1 test, 1 snapshot) — that test never instantiates the hook through a runtime path that would trigger the missing import (Jest hoists and the require resolves before the destructured import; the bug is masked because the test reads the function but never uses it through React's import resolution order). **The file is dead code** — no `import` of `usePizarraModeTransition` exists anywhere in `src/` (grep confirms). The decision in `03-agent-pizarra-motion.md` says "improve `useModeTransition` OR wire scrim" — current code chose the former (`useModeTransition` + `ModeTransitionShell`) and never wired the scrim. Decision: deprecate the file or wire it consciously.

### 1.9 MotionProvider / MotionConfig

`src/App.js` does NOT mount `MotionProvider` or `MotionConfig` from framer-motion. `src/app/providers.js` is a 4-line no-op (`export function Providers({ children }) { return children; }`). The `motion.div` and `AnimatePresence` calls in `ZedAmbientOverlay.jsx`, `ModeTransitionShell.jsx`, `App.js:232-249` work without it, but `useReducedMotion()` (used in `ZedAmbientOverlay.jsx:66`) requires `<MotionConfig reducedMotion="user">` for the OS preference to be respected at the top of the tree. Without it, the hook falls back to the JS-detect path inside each component (which is what `useModeTransition.js` does manually, but `ZedAmbientOverlay` does not). **NFR-P06 gap.**

### 1.10 Audit P0 fixes

`docs/audits/04-pizarra.md` flagged 3 critical issues on 2026-05-30:

| Issue (audit)                                                         | Code status today                                                                                                                                                                                                      |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Multi-select transformer overwrites nodes (per-renderer ref callback) | **Fixed** — `PizarraCanvas.jsx:125-138` only the parent `useEffect` calls `transformerRef.current.nodes(selectedNodes)`; renderers no longer pass ref callbacks. (The audit-stated line numbers were in the OLD file.) |
| Circle creation completely broken (center at start, not midpoint)     | **STILL BROKEN** — `PizarraCanvas.jsx:285-293` still uses `x: startX, y: startY, radius: Math.min(dx, dy) / 2`.                                                                                                        |
| Live preview during drawing not implemented                           | **STILL MISSING** — `PizarraCanvas.jsx:210-225` `handleMouseMove` still does `if (!drawing) return;` for the drawing branch.                                                                                           |

**FR-P08 gap** (two of three audit P0 issues remain).

### 1.11 Test coverage snapshot

| Test file                                                          | Status                                                                                                                                    |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/pizarra/__tests__/useModeTransition.test.js`              | Passes — covers idle/debounce/phase machine/cancel/reduced-motion/durations.                                                              |
| `src/lib/pizarra/__tests__/ModeTransitionShell.test.jsx`           | Passes — 4 scenarios.                                                                                                                     |
| `src/lib/pizarra/__tests__/ModeTransitionShell.wiring.test.jsx`    | **Passes with caveat** — test calls `useModeTransition` with `debounceMs: 200` explicitly (line 149), so the 0ms default drift is masked. |
| `src/components/pizarra/__tests__/CanvasTerminal.flicker.test.jsx` | Passes — 5 scenarios.                                                                                                                     |
| `src/components/pizarra/__tests__/PizarraCanvas.wheel.test.jsx`    | Passes — asserts non-passive listener (so preventDefault works). Does NOT assert `shouldCanvasConsumeWheel` wiring.                       |
| `src/lib/pizarra/__tests__/pizarraWheel.test.js`                   | Passes — selector + 2 functions.                                                                                                          |
| `src/lib/pizarra/__tests__/featureFlag.test.js`                    | Exists.                                                                                                                                   |
| `src/lib/pizarra/__tests__/useSharedSurfaceRegistry.test.js`       | Exists (Phase 5 WIP).                                                                                                                     |
| `src/lib/pizarra/__tests__/usePizarraModeTransition.test.js`       | Passes, but file under test is broken (orphan import).                                                                                    |

---

## 2. Spec drift — confirmed

| Spec                                                                                                          | File                                                                                        | Spec says                                   | Code does                                                                                                                                                     | Drift?                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pizarra-mode-transition` Req "Hook reports idle at steady state" + "Interruption by Rapid Toggle" — debounce | design.md §7.2 / spec `pizarra-mode-transition/spec.md` "Debounce window for rapid toggles" | debounce 200ms                              | `DEFAULT_DEBOUNCE_MS = 0` (useModeTransition.js:60)                                                                                                           | **YES** — intentional, documented in code comment ("Debounce intentionally set to 0: any non-zero value introduces perceptible lag between the user's click and the start of the animation. The phase machine (leaving → entering) already provides the visual rhythm without an additional dead zone.") |
| `pizarra-mode-transition` "Total transition time"                                                             | spec: 110+220=330ms                                                                         | 110+220=330ms                               | same                                                                                                                                                          | OK                                                                                                                                                                                                                                                                                                       |
| `pizarra-mode-transition` "Animation Library Selection"                                                       | `MOTION_DRIVER === 'framer-motion'`                                                         | `'framer-motion'`                           | `surfaceMotion.js:173`                                                                                                                                        | OK                                                                                                                                                                                                                                                                                                       |
| `pizarra-shared-surfaces` Req "Mode Toggle Does Not Unmount Surfaces"                                         | spec                                                                                        | XTerm/iframe never unmount on toggle        | NOT IMPLEMENTED — `PizarraPane` and `WorkspaceRightDock` still both render their own TerminalTTY/BrowserPane; the change was scoped to chrome animation only. | **YES (out of scope for this motion change)**                                                                                                                                                                                                                                                            |
| `pizarra-shared-surfaces` "Bidirectional SharedSurfaceRegistry"                                               | spec                                                                                        | bidirectional LWW                           | `useLiveSurfaceRegistry` is still one-way; `useSharedSurfaceRegistry.test.js` exists but no prod module                                                       | **YES (out of scope for motion)**                                                                                                                                                                                                                                                                        |
| `terminal-panel-state` TPS-5/6/7                                                                              | spec                                                                                        | `sharedDockState` is single source of truth | localStorage keys still in old shape                                                                                                                          | **YES (out of scope for motion)**                                                                                                                                                                                                                                                                        |
| `canvas-terminal` "Flicker Decoupling"                                                                        | spec                                                                                        | threshold 3px                               | DRAG_THRESHOLD_PX = 3 (CanvasTerminal.jsx:44)                                                                                                                 | OK                                                                                                                                                                                                                                                                                                       |
| `canvas-terminal` "Native VTE Permitted in Canvas"                                                            | spec                                                                                        | when flicker fix is active                  | active (VTE used by default)                                                                                                                                  | OK                                                                                                                                                                                                                                                                                                       |

---

## 3. Affected Areas (this change)

| File                                                  | Action                            | Reason                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/pizarra/pizarraWheel.js`                     | Modify                            | Already exports `shouldCanvasConsumeWheel` — no change needed, only consumer wiring.                                                                                                                                                                                                                                                                                                                                      |
| `src/components/pizarra/PizarraCanvas.jsx`            | Modify                            | (a) Replace inline `setZoom` wheel handler (lines 143-156) with `shouldCanvasConsumeWheel` + `zoomAtPoint`. (b) Fix circle creation center (line 285-293). (c) Add live preview in `handleMouseMove` (line 210-225).                                                                                                                                                                                                      |
| `src/components/pizarra/CanvasTerminal.jsx`           | Modify                            | (a) Apply `SURFACE_ENTER_OPACITY_ONLY` to the inner frame at mount (import is unused since line 18). (b) Verify resize path uses the same `isLiveDragging` semantics — already does.                                                                                                                                                                                                                                      |
| `src/components/pizarra/PizarraBrowserSurface.jsx`    | Modify                            | (a) Apply `SURFACE_ENTER_OPACITY_ONLY` to the inner frame (import is unused since line 37).                                                                                                                                                                                                                                                                                                                               |
| `src/lib/pizarra/useModeTransition.js`                | Modify                            | (a) Document the 0ms-debounce decision in a follow-up comment block referencing the design.md §7.2 trade-off (already partly documented; expand). (b) Optionally: thread `motionTokens` as `DUR` and `EASE_OUT` from `surfaceMotion.js` consistently (already done at line 268). No code change strictly required.                                                                                                        |
| `src/lib/pizarra/surfaceMotion.js`                    | Modify                            | (a) Add `MOTION_DRIVER` already exported. (b) Document the 0ms-debounce is intentional + link to design.md decision log entry.                                                                                                                                                                                                                                                                                            |
| `src/lib/pizarra/usePizarraModeTransition.js`         | Modify OR Delete                  | File has a broken import (`MODE_TRANSITION` not exported by motion-tokens.js). Either fix the import (use `TRANSITION.content` and `TRANSITION.enter`) and add a clearly-deliberate deprecation warning, or delete the file. Recommendation: **delete** — the spec chose `useModeTransition` + `ModeTransitionShell`; the scrim approach is not in any spec. Tests should be moved to a `_deprecated.test.js` or deleted. |
| `src/components/workspace/WorkspaceRightDock.jsx`     | Modify                            | (a) Remove the inner `ModeTransitionShell` wrapping. The PizarraPane shell inside it already covers the pizarra chrome. (b) When `isPizarraActive`, render only the pizarra-host div (already does this). The fix is to remove the OUTER shell wrapping.                                                                                                                                                                  |
| `src/components/pizarra/PizarraPane.jsx`              | Modify                            | (a) Keep `ModeTransitionShell` here — it is the single owner. (b) Update the wiring test to reflect the new tree.                                                                                                                                                                                                                                                                                                         |
| `src/components/workspace/SharedSurfacesProvider.jsx` | Create                            | Phase 4 — out of scope for this motion change. **MOVE TO A FUTURE CHANGE.** (Design.md says ~180 LOC; lifting to a separate change keeps this PR focused.)                                                                                                                                                                                                                                                                |
| `src/app/globals.css`                                 | Modify (block only)               | Add `zed-aura-pulse` reduced-motion override if not present. Already have `@keyframes zed-aura-breathe` and `.zed-aura-pulse` (lines 1568-1583). Add `@media (prefers-reduced-motion: reduce) { .zed-aura-pulse { animation: none; } }`.                                                                                                                                                                                  |
| `src/components/ui/system/motion-tokens.js`           | No touch (Agente 4 owns refactor) | Per the 03-agent-pizarra-motion.md "Alcance de archivos" — motion-tokens is out of scope. **Document the discrepancy** in this exploration as a known follow-up for the design agent.                                                                                                                                                                                                                                     |

---

## 4. Gaps confirmed (mapped to FR-P / NFR-P)

| ID      | Gap                                                                                  | Evidence                                                                                                                                                                                                                                                                                 |
| ------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-P03  | Spawn terminal/browser in canvas with enter animation (opacity/scale)                | `SURFACE_ENTER_OPACITY_ONLY` defined in `surfaceMotion.js:162` but never consumed. CanvasTerminal:18 and PizarraBrowserSurface:37 import it; grep confirms no other use.                                                                                                                 |
| FR-P04  | Wheel sobre terminal scrollea terminal; wheel en fondo zoom canvas                   | `pizarraWheel.js` exports `shouldCanvasConsumeWheel` but `PizarraCanvas.jsx:147-150` and `canvasViewport.js:225-236` have inline checks that miss several selectors (`.xterm`, `terminal-viewport-shell`, `terminal-content-body`, `terminal-root-body`).                                |
| FR-P05  | Zoom focal bajo cursor (`zoomAtPoint`)                                               | `zoomAtPoint` exists at `canvasViewport.js:99-127` and is unit-tested in `canvasViewport.test.js`. Neither wheel handler calls it.                                                                                                                                                       |
| FR-P08  | Fix audit: multi-select transformer, círculo centro, live preview dibujo             | (a) Transformer fixed. (b) Circle center still broken (`PizarraCanvas.jsx:285-293`). (c) Live preview still missing (`PizarraCanvas.jsx:210-225`).                                                                                                                                       |
| NFR-P03 | Un solo `ModeTransitionShell` por toggle                                             | `WorkspaceRightDock.jsx:132-141` and `PizarraPane.jsx:409-418` both wrap. Two `data-testid="mode-transition-shell"` in the DOM tree when pizarra tab is active.                                                                                                                          |
| NFR-P06 | Montar `MotionProvider` en shell app si no está                                      | `App.js` and `providers.js` have no `MotionProvider` / `MotionConfig`. `useReducedMotion()` in `ZedAmbientOverlay.jsx:66` works but doesn't respect the framer-motion tree-level config.                                                                                                 |
| NFR-P07 | Unificar tokens — preferir `motion-tokens.js` + `surfaceMotion.js`; no easing suelto | `motion-tokens.js` and `surfaceMotion.js` have divergent `DUR` values (180/220, 280/340) and no shared base. `useModeTransition.js` reads from `surfaceMotion.js` only. `WorkspaceSidebar` and `CommandBar` (per design.md §2.4) read from `motion-tokens.js`. **No unification today.** |

---

## 5. Token consistency (motion-tokens.js vs surfaceMotion.js)

| Token         | motion-tokens.js     | surfaceMotion.js                              | Used by                                                                                                                          |
| ------------- | -------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `DUR.instant` | 80                   | —                                             | Workspace chrome                                                                                                                 |
| `DUR.fast`    | 120                  | 140                                           | mostly used separately                                                                                                           |
| `DUR.base`    | 180                  | 220                                           | `useModeTransition.leaveMs` (reads 220 from `surfaceMotion`)                                                                     |
| `DUR.content` | 200                  | —                                             | workspace body crossfade                                                                                                         |
| `DUR.enter`   | 280                  | 340                                           | `useModeTransition.enterMs` defaults to 220 not 340; `surfaceMotion.js:158` uses `DUR.enter` for SURFACE_ENTER_ANIMATION (340ms) |
| `DUR.slow`    | 400                  | —                                             | onboarding                                                                                                                       |
| `EASE.out`    | `[0.22, 1, 0.36, 1]` | `EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)'` | same shape, different format                                                                                                     |
| `EASE.inOut`  | `[0.4, 0, 0.2, 1]`   | `EASE_SOFT = 'cubic-bezier(0.4, 0, 0.2, 1)'`  | same shape, different format                                                                                                     |

The 60ms gap on `base` (180 vs 220) and 60ms gap on `enter` (280 vs 340) is a deliberate domain split (workspace chrome vs surface chrome) — but it is undocumented at the call site. **NFR-P07 cannot be fully satisfied without token unification** — recommend: keep both files, add a `motion-tokens.js` JSDoc pointer that says "pizarra surface motion uses `surfaceMotion.js`; everything else uses this file". Out of scope for this change.

---

## 6. Approaches (for the propose phase)

### A. **Conservative motion-only PR** (recommended)

Scope: ~6 files, ~250 LOC, ~6 test files.

- Fix `shouldCanvasConsumeWheel` wiring + `zoomAtPoint` in `PizarraCanvas.jsx`.
- Apply `SURFACE_ENTER_OPACITY_ONLY` to inner frame mounts.
- Fix circle center + add live preview in `PizarraCanvas.jsx`.
- Delete `usePizarraModeTransition.js` + its test (orphan, broken import).
- Remove the outer `ModeTransitionShell` wrap in `WorkspaceRightDock.jsx`.
- Add `MotionConfig reducedMotion="user"` in `App.js` (single import, no new dep).
- Add `@media (prefers-reduced-motion: reduce) { .zed-aura-pulse { animation: none; } }` in `globals.css` (5 lines).

Pros: ≤ 400 LOC, fits a single PR, addresses every FR-P / NFR-P in the 03-agent-pizarra-motion.md brief.
Cons: Does NOT address FR-P01 (toggle scrollback), FR-P02 (single animation, NFR-P03 partially), FR-P06 (Zed open_url → pizarra), FR-P07 (Zed open_terminal). These depend on `sharedDockState` + `SharedSurfacesProvider` which are explicitly Phase 2/4 of pizarra-shared-view-state (not in scope for motion).

### B. **Lift the orphan scrim and use it** (alternative)

If the user really wants scrim-based transition (rejected by `useModeTransition` + `ModeTransitionShell` choice), fix `usePizarraModeTransition.js` import and wire it instead of the shell. **NOT RECOMMENDED** — would mean reverting a working phase machine and re-doing all transition tests.

### C. **Add Phase 2/4 (SharedSurfacesProvider + dockState)** (NOT in scope)

Out of scope per the delegation brief. Recommend: spawn a separate `pizarra-shared-dock-state` change.

---

## 7. Recommendation

**Approach A**, with a follow-up `pizarra-shared-dock-state` change that owns the SharedSurfacesProvider + SharedDockState + bidirectional registry. This change focuses exclusively on:

1. Wheel routing fix (FR-P04)
2. Focal zoom (FR-P05)
3. Surface enter animation (FR-P03)
4. Audit P0 fixes (FR-P08: circle center, live preview)
5. Single `ModeTransitionShell` owner (NFR-P03)
6. Delete orphan scrim (cleanup)
7. `MotionConfig` + reduced-motion on zed-aura-pulse (NFR-P06 + part of NFR-P01)

Estimated LOC: 200 impl + 200 tests = ~400 total. Within the 800-line budget.

---

## 8. Risks and unknowns

| #   | Risk                                                                                                                                                                                                                                                                                             | Likelihood         | Mitigation                                                                                                                                                                                                                                                                                                                                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `MotionConfig` at root changes every framer-motion `useReducedMotion()` result — could break tests that stub `matchMedia` directly                                                                                                                                                               | Medium             | `ZedAmbientOverlay.test.jsx` and `ModeTransitionShell.test.jsx` already stub `matchMedia`. `MotionConfig` is a no-op when no reduced-motion prop is given, so we should set `reducedMotion="user"` (not `"always"`).                                                                                                                                                                             |
| 2   | Removing the outer `ModeTransitionShell` in `WorkspaceRightDock` breaks the wiring test's "single shell" assertion in test #3 ("WorkspaceRightDock wraps its children in <ModeTransitionShell>")                                                                                                 | High (intentional) | Update `ModeTransitionShell.wiring.test.jsx` test 3: it must assert the SHELL is inside the PizarraPane mount, not the outer Dock. Test 5 (maximizedView change drives the shell) is unchanged.                                                                                                                                                                                                  |
| 3   | `shouldCanvasConsumeWheel` is a strict superset of the inline check in `canvasViewport.js:225-236`. Replacing it means `PizarraLiveSurfaceLayer` and `xterm-viewport` clicks start going to the canvas (zoom) instead of the terminal (scroll). The exact set of testids is non-negotiable here. | Medium             | Write a unit test that asserts the selector set is identical to the testid set in the live surface layer + xterm viewport. Cross-check with `pizarraWheel.test.js`.                                                                                                                                                                                                                              |
| 4   | `zoomAtPoint` math assumes `pan` is in pre-zoom space and `focalX/Y` are in screen pixels. The current `setZoom` in `PizarraCanvas.jsx:147-150` is center-anchored (no focal). Switching to focal zoom changes feel on the pizarra.                                                              | Low                | Make `focalX/focalY` derived from `event.clientX - rect.left`, exactly like `projectCanvasRect`. Add a `wheel` integration test that asserts the new pan values are not zero.                                                                                                                                                                                                                    |
| 5   | Circle center fix is a behavior change for any user with saved pizarra state. Existing circles are anchored at (startX, startY) — after the fix, they would render at the midpoint.                                                                                                              | Low (acceptable)   | The shape model stores `x/y/radius`; the renderer reads `x/y` as center. Existing shapes' stored `x` is the corner — they would visually jump. Mitigation: add a migration that, on first read of stored shapes, recomputes `x = x + width/2; y = y + height/2; width = 2*radius; height = 2*radius` for shapes with `type === CIRCLE` and `radius != null`. Or accept the one-time visual jump. |
| 6   | `usePizarraModeTransition` deletion breaks any consumer we don't know about                                                                                                                                                                                                                      | Low                | Grep confirmed no production consumer. Test file deleted alongside.                                                                                                                                                                                                                                                                                                                              |
| 7   | `MotionConfig` import is heavy at boot if framer-motion is lazy-loaded                                                                                                                                                                                                                           | Low                | framer-motion is already a project dependency (`^12.38.0` per design.md §2.4). No new dep.                                                                                                                                                                                                                                                                                                       |
| 8   | Adding `@media (prefers-reduced-motion: reduce) { .zed-aura-pulse { animation: none; } }` may not be enough if `ZedAuraFrame` itself still does framer-motion on the wrapper (it does, see line 39). Reduced motion path already exists in framer-motion `useReducedMotion()`.                   | Low                | The pulse class only controls an INTERNAL child div; the framer-motion wrapper already respects `prefersReducedMotion`.                                                                                                                                                                                                                                                                          |

---

## 9. Ready for Proposal

**Yes.** All FR-P01, FR-P02, FR-P06, FR-P07 are explicitly OUT of scope for this motion change (they depend on `sharedDockState` and `SharedSurfacesProvider`, which are Phase 2/4 of pizarra-shared-view-state and belong in a separate change). FR-P03, FR-P04, FR-P05, FR-P08, NFR-P03, NFR-P06, NFR-P07 (partial) are addressable in this change.

The orchestrator should tell the user: "Motion change covers animation/transition/UX polish. Shared-surface singleton + scrollback preservation + Zed→pizarra routing go in a separate `pizarra-shared-dock-state` change after this one."
