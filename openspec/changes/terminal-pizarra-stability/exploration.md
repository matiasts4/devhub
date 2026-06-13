# Exploration — terminal-pizarra-stability

> Phase: explore · Status: ok · Date: 2026-06-12
> Author: stability analysis pass (consolidates `docs/errores/03-*`, `docs/delegation/03-agent-pizarra-motion.md`, `pizarra-shared-view-state/*`, `pizarra-motion-polish/exploration.md`, `terminal-tui-interaction/*`).
> Scope: WHY terminals crash during movement/transitions and WHY animations are fragile. Re-based against the CURRENT tree (most of `pizarra-motion-polish` has already landed — see §4).

---

## 1. Problem statement (user words)

> "se crashea tanto las terminales… cuesta tanto configurar correctamente las cosas para animaciones, transiciones, paso de vista normal a pizarra… siempre se crashea al estar en movimiento."

The crash is **not** a single bug. It is a **race between four independent clocks** that all advance during movement / view transition:

```
Clock 1: PTY            — writes TUI frames continuously (OpenCode/grok Ink)
Clock 2: React          — mount / unmount / re-render on mode toggle
Clock 3: GPU atlas      — xterm-addon-webgl / -canvas glyph cache
Clock 4: Native IPC     — GTK VTE bounds pushed via CustomEvent (devhub:native-vte-workspace-sync)
```

Each crossing of two clocks produces a distinct symptom:

| Crossing | Symptom | Evidence |
|---|---|---|
| PTY × GPU | grey blocks, glyph "explosion" | `docs/errores/03-*/02-causas-raiz.md` §1 |
| React × GPU | hard crash `_renderer.value.handleResize` undefined | `TerminalTTY.xterm-webgl.test.jsx` |
| React × IPC | terminal vanishes / flicker on drag | `CanvasTerminal.flicker.test.jsx` |
| IPC × GPU | chrome desyncs from native widget | `surfaceMotion.js` header |

**Governing principle:** you cannot "fix the animation" without first **serializing the clocks**. Phase order (below) is therefore non-negotiable: late phases rely on invariants the early phases establish.

---

## 2. Verified root causes (current code)

### RC-1 — Dual terminal tree: unmount/remount on every pizarra toggle (P0, the worst)

`src/components/TerminalWorkspacesManager.jsx`:

```
const pizarraOwnsLiveSurfaces =
  effectiveRightDockState.visible &&
  effectiveRightDockState.maximized &&
  effectiveRightDockState.maximizedView === 'pizarra';   // ~line 2519
```

When `true`:
- Workspace panel renders an empty placeholder via `deferLiveSurfaceToPizarra` (`renderWorkspacePanel.jsx:219`) → **`TerminalTTY` unmounts** → `disposeXtermRuntime()` closes the WebSocket, destroys xterm, releases the GPU atlas.
- Pizarra mounts a **brand-new** `TerminalTTY` in `CanvasTerminal.jsx:628`.

This unmount→dispose→remount runs **during** the ~330ms animated transition. It is the direct cause of: lost scrollback, broken sessions, GPU corruption, WebKitGTK dispose crashes.

The fix infrastructure **already exists but is unwired**: `SharedSurfacesProvider` (mounted at `TerminalWorkspacesManager.jsx:5959`), `SurfacePortal.jsx`, `SharedTerminalSurface.jsx`. Grep: **zero production call sites** (tests only).

### RC-2 — GPU atlas keeps painting while panel is hidden (P0)

`docs/errores/03-*/02-causas-raiz.md` §1. `shouldReleaseWebglRendererOnLayoutHide` IS wired (`TerminalTTY.jsx:3860`), but it only fires when the panel stays **mounted-but-hidden** (`prevVisible && !isVisible`). In the pizarra toggle the panel UNMOUNTS (RC-1) so the release path never runs — the full dispose runs instead, which is precisely the crash-prone path on WebKitGTK with 2+ panels (`.deb`).

### RC-3 — Concurrent native-IPC layout triggers stomp each other (P0 in pizarra)

`src/components/terminal/nativeLayoutSync.js` + `TerminalWorkspacesManager.jsx:3210-3256`. All layout triggers funnel through one bus and one `schedulePostLayoutNativeSync` (immediate + 1 rAF + 16ms settle), with a single `layoutSettleCleanupRef` that cancels the previous schedule:

```
notifyNativeLayoutSettled('workspace-switch')
notifyNativeLayoutSettled('pizarra-mode-enter' | 'pizarra-mode-exit')   // fires IMMEDIATELY on toggle
notifyNativeLayoutSettled('panel-group-layout')  // 32ms debounce
dispatchNativeVteWorkspaceSync('popup-avoid-rects')
```

If a window resize lands **during** a pizarra toggle, the second trigger cancels the first and the VTE is positioned for the wrong layout. The `pizarra-mode-enter/exit` sync fires immediately (line ~3244) instead of waiting for the transition to reach `idle`, so the native widget is re-positioned against an intermediate (scaled/translated) rect.

### RC-4 — Mode transition transforms a tree that contains native surfaces (P0 fluidity)

`useModeTransition.js` returns `animProps` with `scale: 0.96` + `y: 16`:

```
initial: { opacity: 0, y: 16, scale: 0.96 },
animate: { opacity: 1, y: 0, scale: 1 },
```

`ModeTransitionShell` applies these to a `motion.div` that wraps `PizarraPane`'s `paneBody` → `PizarraInner` → `CanvasTerminal` → `TerminalTTY` → **native VTE**. This directly violates `surfaceMotion.js`'s explicit rule:

> "Transforming/animating the React WRAPPER would desync the chrome from the native surface."

The workspace side is already opacity-only (`getWorkspaceAnimProps`, `getRightDockAnimProps({isFullscreen})`). The pizarra shell is the only place still applying scale/translate to a native-surface-bearing tree. The flag is **ON by default in dev**, so every dev toggle hits this. Strong candidate for "salta/se rompe al estar en movimiento".

### RC-5 — Dispose race residue (hard crash)

`disposeXtermRuntime` (`TerminalTTY.jsx:1567-1665`) is defensively ordered, but relies on null-checks rather than an explicit "disposing" guard. A queued `fit()` rAF or focus/paste handler can still fire mid-teardown. The renderer-switch effect (`:3169`) does `disposeXtermRuntime()` + `setXtermBootNonce(n+1)` near-simultaneously.

### RC-6 — Click contract on TUIs (functional, NOT a crash)

`terminal-tui-interaction/design.md`: `filterTerminalInputForSession(null, data)` strips SGR clicks unconditionally; `buildTerminalMousePressSequence` has no call sites; sidecar parity test (NFR-T02) missing. Included for completeness; tracked under `terminal-tui-interaction`.

---

## 3. Why animations are "hard to configure"

| Issue | Status |
|---|---|
| Three motion token files (`motion-tokens.js` 180/280, `surfaceMotion.js` 220/340, `workspaceAnimProps.js`) | Divergent, undocumented split (NFR-P07 partial) |
| Transform applied to native-surface wrapper (RC-4) | **Still present** |
| IPC sync fired mid-transition (RC-3) | **Still present** |
| Double `ModeTransitionShell` | ✅ Fixed (single owner in PizarraPane) |
| `MotionConfig reducedMotion="user"` | ✅ Present (`MotionProvider` in `App.js:380`) |
| Orphan `usePizarraModeTransition` | ✅ Deleted |

---

## 4. What is ALREADY done (re-based 2026-06-12)

Most of `pizarra-motion-polish` has landed. Verified in current tree:

- **C.1 single `ModeTransitionShell` owner** — `WorkspaceRightDock.jsx:38-44` removed the outer wrap; `PizarraPane.jsx:430` is the single owner.
- **C.2 MotionConfig** — `MotionProvider` (`reducedMotion ?? 'user'`) mounted at `App.js:380`.
- **C.3 wheel routing + focal zoom** — `PizarraCanvas.jsx:158-197` uses `shouldCanvasConsumeWheel` + `zoomAtPoint`; even adds pan-vs-zoom modifier semantics.
- **C.4 orphan removed** — `usePizarraModeTransition.js` no longer exists.
- **C.5 audit P0** — circle center midpoint + `Math.sqrt` radius (`PizarraCanvas.jsx:290-297`); live preview via `previewShape` (`:270-320`).
- **FR-P03 surface enter animation** — `useSurfaceEnterAnimation` applied in both `CanvasTerminal.jsx:512` and `PizarraBrowserSurface.jsx:558` (opacity-based, correct).

**Conclusion:** the discrete motion-polish items are DONE. The remaining fluidity gains now come from RC-3 and RC-4 (transition correctness) and RC-1/RC-2 (not unmounting terminals) — i.e. the deep stability work, which is also the deepest fluidity fix.

---

## 5. Remaining work (this change)

| ID | Work | RC | Risk | Owner |
|---|---|---|---|---|
| A.0 | Lifecycle telemetry + repro baseline | all | Low | — |
| A.1 | Wire terminal surface singleton (kill unmount-on-toggle) | RC-1 | **High** | terminales |
| A.2 | GPU release on all hide paths (incl. portal-hidden) | RC-2 | Medium | terminales |
| A.3 | Serialize native IPC sync; defer to transition `idle` | RC-3 | Medium | terminales+pizarra |
| A.4 | Dispose hardening guard | RC-5 | Low | terminales |
| A.5 | Opacity-only transition (no transform on native-surface tree) | RC-4 | Low | pizarra |
| B.1 | Staged feature-flag rollout | — | High | coord |
| B.2 | `sharedDockState` single source of truth | RC-1 | Medium | coord |
| D | (optional) alacritty texture renderer for pizarra | — | — | research |

A.5 is the safest immediate fluidity win and the first to implement. A.1 is the highest-value crash fix and the highest risk; it is mapped by a dedicated exploration sub-pass (see `design.md §A.1`).

---

## 6. Cross-phase dependency note

A.5 (opacity-only) and A.1 (portal singleton) interact: once surfaces live in the provider's hidden layer (A.1) they are OUTSIDE the animated subtree, so scale/translate on the chrome scrim would again be safe. Until then (A.5) opacity-only is the correct, surface-safe choice. Do A.5 now; revisit richer chrome motion only after A.1.
