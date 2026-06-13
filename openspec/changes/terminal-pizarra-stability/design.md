# Design: terminal-pizarra-stability

> Source of truth: `proposal.md`, `exploration.md`. Companion A.1 map produced by the explore sub-pass (see §A.1).

## 0. Approach overview

Serialize the four lifecycles in dependency order. Cheap/contained fixes first (A.5, A.4, A.0), then the contained-but-medium IPC + GPU work (A.3, A.2), then the high-risk singleton (A.1), then rollout (B). Everything that touches the shared-view code path stays behind `isPizarraSharedViewEnabled()` so production is unaffected until B.

```
A.0 telemetry ─┬─> A.5 opacity-only (ship first, fluidity)
               ├─> A.4 dispose guard (low risk)
               ├─> A.3 IPC serialize ──┐
               ├─> A.2 GPU release ────┼─> A.1 portal singleton ──> B rollout
               └────────────────────── ┘
```

---

## A.5 — Opacity-only mode transition (FIRST, low risk)

### Decision
`useModeTransition` must return opacity-only `animProps`. Remove `y: 16` and `scale: 0.96`.

### Rationale
The shell wraps a tree containing native VTE (`PizarraPane.paneBody → CanvasTerminal → TerminalTTY`). `surfaceMotion.js` forbids transforming such wrappers because the native widget is positioned in absolute screen coords via IPC and does not follow CSS transforms — producing the visible "jump"/desync on toggle. The workspace side is already opacity-only (`getWorkspaceAnimProps`, `getRightDockAnimProps({isFullscreen})`), so opacity-only also makes both sides consistent.

### Shape (non-reduced motion)
```
initial:  { opacity: 0 }
animate:  { opacity: 1 }
transition: { duration: enterMs / 1000, ease: [0.22, 1, 0.36, 1] }
```
Reduced-motion branch already opacity-only — unchanged. The phase machine (leaving 110ms → entering 220ms) and `progress` ticking are unchanged; only the visual channel changes.

### Tests
`src/lib/pizarra/__tests__/useModeTransition.test.js` — update any assertion that expects `y`/`scale` in `animProps` to assert opacity-only. Keep phase-machine/duration/reduced-motion assertions.

### Follow-up (not now)
Richer chrome motion (slide/scale) becomes safe only after A.1 moves surfaces into the provider hidden layer (outside the animated subtree). At that point a chrome-only scrim can carry slide/scale without touching the native surface. Documented as a forward pointer; not implemented here.

---

## A.4 — Dispose hardening guard (low risk, additive)

### Decision
Add `isDisposingRef` (boolean ref) set `true` at the top of `disposeXtermRuntime` and cleared at the end. Every queued callback that can run after teardown begins (the `fit()` rAF, focus handler, paste handler, resize observer callback, ws onmessage) checks `isDisposingRef.current` and bails early.

### Rationale
Current teardown relies on snapshot+null of refs; an explicit guard is clearer and directly testable against the WebKitGTK `_renderer.value.handleResize` race already documented in code.

### Renderer-switch ordering
`TerminalTTY.jsx:3169` does `disposeXtermRuntime()` then `setXtermBootNonce(n+1)`. Verify the boot effect keyed on the nonce does not start until the dispose has fully run (it runs synchronously in the same effect, so order is fine — add a guard assertion test rather than reorder).

### Tests
New case in `TerminalTTY.xterm-webgl.test.jsx`: enqueue a `fit()` rAF, call dispose, flush timers → assert no throw and `fit()` not invoked post-dispose.

---

## A.0 — Telemetry + baseline (parallel, low risk)

### Decision
Define a structured lifecycle event schema written to `data/logs/terminal-debug.log`:
```
{ ts, panelId, surfaceId, sessionId, renderer, event, reason, isVisible, refCount, cols, rows }
```
Events to standardize: `boot`, `dispose`, `webgl-release`, `webgl-reattach`, `canvas-release`, `native-sync`, `fit-skip`, `portal-activate`, `portal-hide`.

### Baseline doc
`docs/errores/03-terminal-canvas-glyph-corruption/baseline-metrics.md`: crash rate per scenario from the repro matrix (1 panel / 3 splits) × (workspace-switch / pizarra-toggle / window-resize) × (webgl / canvas / vte) × (dev Chrome / `.deb`). Record dispose-count-per-toggle (the headline metric A.1 must drive to 0).

---

## A.3 — Serialize native IPC sync (medium risk, contained)

### Decision
`schedulePostLayoutNativeSync` (and the `notifyNativeLayoutSettled` caller) become a small **serialized queue with priority**:
- While a mode transition is animating (`useModeTransition.isAnimating`), enqueue `panel-group-layout` / `popup-avoid-rects` syncs and apply them when the transition reaches `idle`.
- `pizarra-mode-enter`/`pizarra-mode-exit` reattach is **deferred to `idle`** so the VTE rect target is the final layout, not an intermediate frame. During the animating window, the native VTE is suspended (hidden) so it cannot paint against a stale rect.
- Idempotent bounds: `setNativeVtePanelVisibility` with an unchanged rect must not re-trigger repaint (dedupe by last-applied rect).

### Wiring
- `nativeLayoutSync.js`: add a queue abstraction + a `flushOnIdle()` entry; keep the existing immediate+rAF+settle for non-transition reasons.
- `TerminalWorkspacesManager.jsx:3210-3256`: route `pizarra-mode-enter/exit` through the deferred path; pass transition state.
- `TerminalTTY.jsx:4569-4582`: the `pizarra-mode-enter/exit` handler reattaches/syncs only at `idle`.

### Risk + mitigation
Deferring could leave the VTE in the old position visibly mid-transition → suspend (hide) it during `isAnimating`, reattach at `idle`. Safety timeout if `idle` never arrives (transition cancelled).

### Tests
Unit test the queue: enter during panel-group-layout → assert ordering and a single final reattach. Manual: window resize during pizarra enter → terminal does not vanish.

---

## A.2 — GPU release on all hide paths (medium risk)

### Decision
1. When the portal's host is not the active target (post-A.1), the projected `TerminalTTY` receives `isVisibleInLayout=false`, so the existing `shouldReleaseWebglRendererOnLayoutHide` / `shouldReleaseCanvasRendererOnLayoutHide` path fires.
2. On show (re-projection), reattach with `clearAtlas: true` via the existing `tryReattachWebglAddon` / `needsViewportSyncOnShowRef` machinery.
3. Platform policy: on WebKitGTK (`.deb`) with 2+ panels, prefer demoting hidden panels to DOM renderer (no atlas to corrupt). Decision recorded; trade-off is slower reactivation — measure with A.0 before committing.

### Tests
Hide webgl panel → assert `releaseWebglAddonForInactivePanel`; show → assert reattach with `clearAtlas`. Extend split (3-panel) regression.

---

## A.1 — Terminal surface singleton (HIGH risk)

### Goal
Replace "unmount in workspace + mount in pizarra" with a single `TerminalTTY` mounted once in `SharedSurfacesProvider`'s hidden layer and projected via `SurfacePortal` to whichever host (workspace dock or pizarra canvas) is active. The mode toggle moves the active-target pointer — XTerm DOM, WebSocket, scrollback, and native VTE are untouched.

### Hard prerequisites (from the explore sub-pass, see `apply-progress.md` once produced)
1. **One stable `surfaceId`.** Audit and align: workspace `TerminalTTY` `id`, `CanvasTerminal` `terminalId`, WebSocket `sessionId`, native VTE `panelId`. They must resolve to the same key for a given session. This is the make-or-break item.
2. **Both hosts inside the provider subtree.** Confirm the workspace dock host and pizarra canvas host are descendants of the `SharedSurfacesProvider` at `TerminalWorkspacesManager.jsx:5959` so one portal can project to either.
3. **keepAlive semantics.** Mode toggle → `release(keepAlive: true)` (refcount down, descriptor survives). Explicit close → `releaseSurface(keepAlive: false)` → `onSurfaceDestroy` → real dispose.

### Edit sequence (to finalize after the map lands)
1. Introduce `surfaceId` derivation helper; align the 4 ids.
2. Replace direct `TerminalTTY` mount in the workspace panel with `SharedTerminalSurfaceRegistrar` (once) + `SharedTerminalSurfacePortal hostId="workspace-dock"`.
3. Replace `CanvasTerminal`'s own `TerminalTTY` mount with `SharedTerminalSurfacePortal hostId="pizarra-canvas"`.
4. Delete `deferLiveSurfaceToPizarra` as an unmount mechanism; the inactive host keeps a registered-but-inactive portal.
5. On host switch, emit a single deferred native-VTE rect sync (via A.3) after re-projection.

### Risks
- Refcount leak from surfaceId mismatch → permanent refCount=2, never destroyed. Mitigation: invariant test over N toggles.
- One-frame native VTE flicker on re-projection. Mitigation: A.3 suspend→reposition→reattach.
- Focus handoff between hosts. Mitigation: `setActiveSurfaceId` on host activation.

### Gating
All A.1 wiring stays behind `isPizarraSharedViewEnabled()`. Flag OFF = current behavior.

---

## B — Rollout (out of scope to implement now)

B.1 staged flag (dev ON → staging explicit ON after green suite/E2E → prod explicit ON after `.deb` protocol + A.0 metrics green). B.2 promote `sharedDockState` to single source of truth, resolving the `surfaceId` divergence permanently and deprecating `useLiveSurfaceRegistry`.

---

## Token consistency note (NFR-P07, deferred)

`motion-tokens.js` (180/280) vs `surfaceMotion.js` (220/340) remain split by domain (workspace chrome vs surface chrome). Not unified here; add a JSDoc cross-pointer only. Out of scope.
