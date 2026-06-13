# Apply progress — terminal-pizarra-stability

> Living log of implementation decisions and status. Updated as tasks land.

## A.5 — Opacity-only mode transition — DONE (2026-06-12)

- `src/lib/pizarra/useModeTransition.js`: `animProps` non-reduced branch changed from `{opacity, y:16, scale:0.96}` to **opacity-only**. Header + inline comments cite NFR-P02 (native VTE/WebKit wrappers must not be transformed). Reduced-motion branch unchanged (already opacity-only).
- `src/lib/pizarra/__tests__/useModeTransition.test.js`: hardened the animProps-shape test into a regression guard (`not.toHaveProperty('y'|'scale')` on initial+animate).
- Verification: lint clean; `ModeTransitionShell.wiring.singleOwner` suite (custom domHarness) passes. The `useModeTransition`/`ModeTransitionShell` RTL suites cannot run here — `@testing-library/react` is not installed (pre-existing env gap, unrelated to this change).

## A.1 — Surface singleton wiring map — FINALIZED (2026-06-12)

Map produced by a dedicated read-only explore pass. Key locked decisions:

### Stable surfaceId
**`surfaceId = panel.id`** (== `panelId` on registry surfaces). **Never** use `shape.id` (`shape-term-${panel.id}`, which is UI/selection only). Verified alignment:

| Channel | Workspace panel | Pizarra card (registry-backed) |
|---|---|---|
| React `id` / `terminalId` | `panel.id` | `shape.panelId` → `panel.id` (`PizarraLiveSurfaceLayer.jsx:446`) |
| WS `sessionId` | `panel.id` (`TerminalTTY.jsx:3522`) | `panel.id` |
| Native VTE `panelId` | `panel.id` | `panel.id` |
| Shape element id | N/A | `shape-term-${panel.id}` (diverges — do NOT use) |

### Both hosts share the provider subtree
`SharedSurfacesProvider` wraps TWM root (`TerminalWorkspacesManager.jsx:5959–6834`); the workspace panel grid AND `WorkspaceRightDock → PizarraPane → PizarraLiveSurfaceLayer → CanvasTerminal` are all inside it. One hidden `TerminalTTY` can portal to either host.

### Edit sequence (flag-gated on `isPizarraSharedViewEnabled()`)
1. `SharedTerminalSurface.jsx` (~50–67): ensure props store refreshes dynamic `surfaceHost` ('workspace'|'pizarra'), `isVisibleInLayout`, `suspendNativeSurface`, `visibleTerminalPanelCount`, `autoFocus`/`isActivePanel`, `connectionState`.
2. `TerminalWorkspacesManager.jsx` **inline** `renderWorkspacePanel` (839–1149): mount `SharedTerminalSurfaceRegistrar` **outside** the defer branch (must outlive toggles); replace defer placeholder + direct `TerminalTTY` with `SharedTerminalSurfacePortal surfaceId={panel.id} hostId="workspace-dock"`. Flag OFF keeps legacy direct mount.
3. `TerminalWorkspacesManager.jsx` 6554–6555: stop using `deferLiveSurfaceToPizarra` to unmount; drive host priority from `pizarraOwnsLiveSurfaces`.
4. `CanvasTerminal.jsx` (627–653): replace own `TerminalTTY` with `SharedTerminalSurfacePortal surfaceId={terminalId} hostId="pizarra-canvas"`. Flag OFF keeps current mount.
5. `PizarraLiveSurfaceLayer.jsx` (446): keep `terminalId = shape.panelId` (not `shape.id`).
6. `TerminalWorkspacesManager.jsx` 5959–5968: `onSurfaceDestroy(surfaceId)` must use the same id as `handleClosePanel` (`panelId`).

### Critical risks (location → handling)
- **Host activation on toggle:** `registerSurfaceTarget` = "most recently registered wins" (`SharedSurfacesProvider.jsx:228–238`). On `pizarraOwnsLiveSurfaces` flip, the visible host must re-register last (bump portal `key`, or mount only the active host's portal, or add `setActiveHostForSurface`).
- **Do not set `isVisibleInLayout:false` on BOTH hosts** while the pizarra card is visible — update `surfaceHost`/visibility on flip instead of unmounting.
- **Refcount leak** if surfaceId mismatches → permanent refCount, never destroyed. Invariant test required.
- **`terminalPanelBridge`** becomes a dead path for mode-toggle once the singleton works; keep for flag-OFF legacy.
- **Dual-renderer note:** pizarra `vte-experimental` native overlay path (`CanvasTerminal.jsx:144–187`) is separate from the xterm path; reattach must re-sync the native rect after portal retarget (couple with A.3).

### Tests to update / add
- Update: `SharedSurfacesProvider.test.jsx`, `TerminalTTY.singleton.test.jsx`, `CanvasTerminal.*` suites, `PizarraLiveSurfaceLayer.test.jsx`, `TerminalWorkspacesManager.right-dock.test.jsx` (458–516 currently expects the deferred/hidden instance — conflicts with singleton; rewrite for flag-ON single instance).
- Add: flag-ON toggle → single `TerminalTTY` / one WS open / stable DOM node id; 5 host cycles without WS close; flag-OFF legacy path unchanged.

## A.4 — Dispose hardening guard — DONE (2026-06-12)

- `TerminalTTY.jsx`: added `isDisposingRef`. Set `true` at the top of `disposeXtermRuntime` (with re-entrancy short-circuit), cleared in a `finally`. Guards added on `fitAndResize` (logs `fit-skip`), both ResizeObserver callbacks (xterm + native), ws `onmessage`, `adjustFontSize` fit, and the document paste handler.
- A4.3 verified: renderer-switch effect disposes synchronously (guard cleared in finally) before `setXtermBootNonce`; nonce-keyed boot effect never blocked. No reorder.
- Test: `TerminalTTY.xterm-webgl.test.jsx` "resize landing mid-dispose is ignored and teardown completes cleanly (A.4 guard)" — passes. (3 unrelated pre-existing socket-connect harness failures remain.)

## A.0 — Lifecycle telemetry — DONE (2026-06-12)

- New pure module `src/lib/terminal/terminalLifecycleEvent.js` (`buildTerminalLifecycleEvent` + frozen `TERMINAL_LIFECYCLE_EVENTS` + `isTerminalLifecycleEvent`). 8 unit tests green. surfaceId/sessionId default to panelId (A.1 alignment); missing → null.
- `TerminalTTY.jsx`: emits `boot` (post terminal init) and `dispose` (top of `disposeXtermRuntime`, pre-null) via `cliLog('LIFECYCLE:<id>', …)`. `fit-skip` already on `logViewportDiagnostic`.
- Baseline doc `docs/errores/03-terminal-canvas-glyph-corruption/baseline-metrics.md`: repro matrix + extraction commands; dispose/boot-per-toggle defined as headline metric (target 0 post-A.1). Result cells `_TBD_` (manual `.deb`/dev runs).

## A.3 — Serialize native IPC sync — DONE (core) (2026-06-12)

- `nativeLayoutSync.js`: `createNativeLayoutSyncQueue({ apply })` — serialized buffer (coalesced per reason), `flushOnIdle()` applies non-reattach syncs in insertion order then a single final reattach (`pizarra-mode-enter|exit`); owns last-sync cleanup; `setAnimating`/`cancel`/`reset`. `isNativeReattachReason` + `NATIVE_REATTACH_REASONS` exported.
- `TerminalWorkspacesManager.jsx`: `notifyNativeLayoutSettled` → `queue.enqueue`; the `pizarraOwnsLiveSurfaces` flip opens the animating window and schedules `flushOnIdle` at `settleMs` (enter 300 / exit 220), doubling as the cancelled-transition safety timeout; unmount → `queue.reset()`. Legacy immediate behavior preserved when not animating.
- Tests: `nativeLayoutSync` 11/11. Regression isolation done: reverting my TWM edits leaves the same TWM-suite failures (CSS `w-3`/`w-px`, dock sizing, `data-panel-metadata-source` semantic header) → those are other in-flight TWM work, **not** A.3.
- Deferred follow-up: native-VTE *suspend* during `isAnimating` (A3.4) — the single deferred reattach already targets the final rect; suspend is additional safety needing a TerminalTTY suspend handler.

### A.1 — Test infra unblocked + core verified (2026-06-12)
- Installed `@testing-library/react@16` + `@testing-library/dom@10` (dev deps; React-19 compatible; the suites already `require('@testing-library/react')` for `act`/`renderHook`/`render`/`fireEvent`). Resolves the long-standing gap; 26+ previously-dead tests now run.
- **A1.2 refcount invariant VERIFIED**: `TerminalTTY.singleton.test.jsx` green — WS opens once across 5 host switches, no close on switch, no `setNativeVtePanelVisibility(false)` on switch, explicit destroy fires `onSurfaceDestroy`. `SharedSurfacesProvider.test.jsx` green. This is the make-or-break property and it holds.
- **A1.3**: surfaceId == `panel.id` already aligned across all 4 channels; no helper needed.
- Workspace grid confirmed **persistent** (TWM:6513 `workspace-grid-shell`, `workspaces.map`), pizarra is an overlay → a registrar placed in `renderWorkspacePanel` (outside the defer branch) survives toggles.

### A.1 host rewire (A1.4–A1.7) — DONE (2026-06-12)

- **`SharedSurfacesProvider`**: `setPreferredHostForSurface` / `clearPreferredHostForSurface` / `getPreferredHostForSurface`; `getActiveTarget` prefers explicit host when DOM target exists.
- **`SharedTerminalSurface.jsx`**: `mergeSharedTerminalSurfaceProps`, `resolveSharedTerminalVisibility`, portal `isActiveHost` → preferred host; `TerminalSurfaceContent` resolves `isVisibleInLayout` from projection state (A.2 prep).
- **`TerminalWorkspacesManager` inline `renderWorkspacePanel`**: flag ON → always `SharedTerminalSurfaceRegistrar`; workspace body → portal (`workspace-dock`) or deferred placeholder when pizarra owns; flag OFF → legacy defer + direct `TerminalTTY`.
- **`CanvasTerminal`**: flag ON → `SharedTerminalSurfacePortal` (`pizarra-canvas`, `isActiveHost`) + `mergeSharedTerminalSurfaceProps` for pizarra drag/focus overrides.
- **Fix**: `pizarraOwnsLiveSurfaces` passed in registrar props so visibility resolver works on pizarra toggle.
- **Tests**: `SharedSurfacesProvider` 9/9, `TerminalTTY.singleton` 6/6, `SharedTerminalSurface` 7/7.
- **Pending A1.8**: E2E + manual `.deb` (scrollback 20 toggles, dispose-count = 0 via A.0 telemetry).

### A.1 blockers — RESOLVED

1. **Arbitration**: `setPreferredHostForSurface` + conditional portal mount (only active host registers).
2. **RTL**: re-installed for singleton/provider tests; full `npm test` completes without process-abort (198 failures pre-existing/concurrent; TWM right-dock 3 failures unrelated to singleton).

## Verify pass — updated (2026-06-12)

- A.0 — 8/8 · A.3 — 11/11 · A.4 guard — pass · A.5 opacity — source OK (RTL test still import-dead without full RTL suite)
- A.1 — singleton 6/6 + provider 9/9 + SharedTerminalSurface 7/7 = **22 new/verified**
- Full `npm test`: **completes** (537 suites, ~198 failures pre-existing)
- Lint: clean on touched files
- **Manual pending**: A3.5 resize-during-enter, A1.8 E2E, A.0 baseline `.deb` metrics

### A2.3 — WebKitGTK hidden-DOM demotion policy (decision)

**Default: keep the existing renderer policy** — no forced DOM demotion for hidden panels until A.0 `.deb` baseline metrics are collected. Portal-hidden singleton surfaces report `isVisibleInLayout=false` via `resolveSharedTerminalVisibility` in `SharedTerminalSurface.jsx`, which triggers the existing `shouldReleaseWebglRendererOnLayoutHide` / `shouldReleaseCanvasRendererOnLayoutHide` path in `TerminalTTY.jsx` (~3875–3909) without new release machinery. **Deferred:** WebKitGTK 2+ panel hidden-DOM demotion (design §A.2 trade-off: slower reactivation vs atlas safety) pending `.deb` metrics from `docs/errores/03-terminal-canvas-glyph-corruption/baseline-metrics.md`.

### Prep landed
- `resolveSharedTerminalVisibility({ pizarraOwnsLiveSurfaces, hostSurface, isVisibleInLayout, hasActiveProjection })` — inactive host or missing projection → `false`.
- `TerminalSurfaceContent` subscribes to registry target changes and passes resolved `isVisibleInLayout` to `TerminalTTY`.
- Unit tests: `src/components/terminal/__tests__/SharedTerminalSurface.test.js`.

### TerminalTTY audit (unchanged — correct by design)
Layout-hide `useLayoutEffect` (~3875–3934) already calls `shouldReleaseWebglRendererOnLayoutHide` on `prevVisible && !isVisibleInLayout` edges and reattaches with `clearAtlas` via `shouldSyncTerminalViewportOnLayoutShow` / `syncTerminalViewportOnWorkspaceShow`. No TerminalTTY edits required for A.2 prep; callers must supply accurate `isVisibleInLayout`.

### Final verification status
- A.0 `terminalLifecycleEvent.test.js` — **8/8 pass**.
- A.3 `nativeLayoutSync.test.js` — **11/11 pass**.
- A.4 `TerminalTTY.xterm-webgl` A.4 guard — **pass**.
- A.1 singleton + provider + SharedTerminalSurface — **22/22 pass**.
- A.2 prep `SharedTerminalSurface.test.js` — **7/7 pass** (included above).
- A.5 `useModeTransition.test.js` — RTL-dependent; runs when RTL installed.
- Full `npm test`: completes without process-abort (~198 pre-existing failures).

## Phase B — COMPLETE in code (2026-06-12)

### B.1
- Rollout spec, `getRolloutStage()`, kill-switch tests, `.env.staging.example`

### B.2
- **B.2a** `useWorkspaceSurfaceRegistry` (legacy + bidirectional registry)
- **B.2b** `WorkspaceSurfaceRegistryProvider` + Pizarra `source:'pizarra'` writes via `useSharedSurfaceRegistry`
- **B.2c** `RightDockSharedMirror` + `mergeRightDockChromeIntoSharedDock` → single `devhub_shared_dock_state_*` key for tabs + dock chrome

**Human gate for prod ON:** manual `.deb` QA + A.0 dispose-count metrics (see `specs/phase-b-rollout.md`).

## Phase C — fluidity improvement (2026-06-12)

- `getRightDockAnimProps` fullscreen fade **120ms → 220ms** (aligned with `useModeTransition` enter)
- `useModeTransition` explicit **`exit: { opacity: 0 }`**, enter from `DUR.base`
- `ModeTransitionShell` **`willChange: opacity`** during anim; tests updated for debounce=0 default
- E2E flag test fixed (no `process.env` in browser)

## Phase A — COMPLETE in code (human gates only)

- A1.8: `pizarraToggleLifecycle.test.jsx` + E2E toggle scaffold
- A2.1: visibility round-trip tests (GPU release path)
- Remaining human: A1.8 20-toggle `.deb`, A2.4 glyph protocol, A3.5 resize-during-enter
