# Proposal: terminal-pizarra-stability

## Intent

Eliminate terminal crashes, glyph corruption, lost scrollback, and fragile/janky transitions that occur **while moving** — dragging surfaces, zooming/panning the pizarra canvas, switching workspaces, and toggling between the normal workspace view and the pizarra (canvas) view. The work serializes four concurrent lifecycles (PTY, React, GPU atlas, native VTE IPC) so that motion no longer races teardown, and makes the workspace↔pizarra transition surface-safe and fluid.

This change consolidates and re-bases the prior `pizarra-motion-polish`, `pizarra-shared-view-state`, and `terminal-tui-interaction` work against the current tree (most discrete motion-polish items already landed) and focuses the remaining effort on the actual crash causes.

## Scope

### In Scope
- **A.5 (start here):** make the workspace↔pizarra mode transition opacity-only so it never transforms a tree containing native VTE/WebKit surfaces (fixes desync/jump on toggle).
- **A.1:** wire the existing-but-unused terminal surface singleton (`SharedSurfacesProvider` + `SurfacePortal` + `SharedTerminalSurface`) so a single `TerminalTTY` survives the mode toggle instead of being unmounted in workspace and re-mounted in pizarra. Remove `deferLiveSurfaceToPizarra` as an unmount mechanism.
- **A.2:** ensure GPU (webgl/canvas) atlas is released on **every** hide path, including the new "portal-hidden" state, and cleanly reattached with `clearAtlas` on show.
- **A.3:** serialize the native-VTE layout-sync bus so concurrent triggers (workspace-switch, pizarra-enter/exit, panel-group-layout, popup-avoid-rects) cannot stomp each other; defer the pizarra enter/exit reattach until the transition reaches `idle`.
- **A.4:** add an explicit "disposing" guard to `disposeXtermRuntime` so queued callbacks bail out during teardown.
- **A.0:** structured lifecycle telemetry + a reproduction baseline so every fix has measurable before/after.

### Out of Scope (tracked elsewhere / later)
- **B.1/B.2:** production rollout of `NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE` and `sharedDockState` promotion — gated on A being stable (`docs/delegation/00-shared-context.md`).
- **A.6 / RC-6:** TUI click contract (`terminal-tui-interaction`).
- **D:** `alacritty_terminal` texture renderer for pizarra (`docs/ALTERNATIVE_TERMINAL_VIEWS_RESEARCH.md`) — only if A+B prove insufficient for VTE↔browser z-fighting.
- Undo/redo, export PNG, grid-as-coordinate-reference (pizarra audit feature gaps).

## Affected Areas

| Area | Impact | Files |
|---|---|---|
| Mode transition | Opacity-only; surface-safe | `src/lib/pizarra/useModeTransition.js`, `ModeTransitionShell.jsx`, tests |
| Terminal singleton | No unmount on toggle | `TerminalWorkspacesManager.jsx`, `renderWorkspacePanel.jsx`, `CanvasTerminal.jsx`, `SharedTerminalSurface.jsx` |
| GPU lifecycle | Release on all hides | `TerminalTTY.jsx` |
| Native IPC | Serialized + deferred | `nativeLayoutSync.js`, `TerminalWorkspacesManager.jsx`, `TerminalTTY.jsx` |
| Dispose | Guarded teardown | `TerminalTTY.jsx` |
| Telemetry | Structured lifecycle log | `TerminalTTY.jsx`, `data/logs/`, `docs/errores/03-*` |

## Rollback

Each item is independently revertible. A.1/A.2/A.3 changes that touch the shared-view path remain behind `isPizarraSharedViewEnabled()` (default OFF in prod). A.5 is a small animProps change revertible by restoring the `y`/`scale` keys. A.4 is additive (guard flag). If any item regresses, the feature flag OFF path reproduces pre-change behavior.

## Success Criteria

| Criterion | Target | Instrument |
|---|---|---|
| Dispose calls per pizarra toggle | 0 | A.0 telemetry |
| Glyph corruption (3 panels, 10 min, `.deb`) | 0 | `docs/26_TERM-01` protocol |
| Hard crash `_renderer.handleResize` | 0 | suite + manual |
| Scrollback preserved over 20 toggles | 100% | E2E `pizarra-shared-view-state.spec.ts` |
| `data-testid="mode-transition-shell"` in DOM | exactly 1 | wiring test |
| Native VTE desync during transition | 0 | manual + visual |
| Transition feel | smooth opacity cross-fade, ≤50ms reduced-motion | manual + `useModeTransition.test.js` |
