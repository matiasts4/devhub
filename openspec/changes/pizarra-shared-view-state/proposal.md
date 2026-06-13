# Proposal: pizarra-shared-view-state

## Intent

Today the right-dock in DevHub has two disjoint surface trees: **workspace** mode owns its own `TerminalTTY` and `WorkspaceBrowserPane` instances, and **pizarra** mode owns a completely separate set. Toggling `maximizedView: 'pizarra'` in TWM unmounts the workspace tree and mounts the pizarra tree, so every `TerminalTTY` calls `disposeXtermRuntime()`, every WebSocket closes, every XTerm rebuilds, and every browser pane re-navigates from scratch. The result is (a) Claude Code / OpenCode sessions that lose scrollback and cursor on every mode toggle, (b) browser context that does not survive, (c) a hard visual cut between modes, and (d) terminal flicker on every drag/resize click because `suspendNativeSurface={isDragging}` fires on mousedown. This change makes the terminal and browser surfaces in workspace and pizarra the **same running instances** with shared scrollback, introduces a multi-tab browser that follows that same surface, smooths the mode toggle with a fluid transition, and removes the resize/move flicker.

## Scope

### In Scope

- Lift `TerminalTTY` and browser pane out of mode-specific trees into shared singletons keyed by an explicit `surfaceId`.
- New `pizarra-browser-tabs` capability: each browser surface owns an ordered list of tabs (URL, label, closeable, current).
- New dockState model where workspace and pizarra share one set of panels (one terminal, one browser per `surfaceId`), pizarra only owns the additional freehand elements.
- Bidirectional `LiveSurfaceRegistry` so pizarra and TWM can both publish surface state and both read it.
- A `useModeTransition` orchestrator that runs a 220-340ms choreographed animation (cross-fade + slide + scale) when `maximizedView` flips, with XTerm surfaces never unmounting during the transition.
- Flicker fix: `suspendNativeSurface` decoupled from mousedown — only suspends while a real drag/resize is in progress (mousemove after mousedown, ends on mouseup).
- Supersede the "xterm.js only in canvas" rule from `canvas-terminal` and the "single tab per browser shape" rule from `board-browser-pane`.
- Feature flag `NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE` for staged rollout.
- Strict TDD: new behaviors covered by unit + integration tests before implementation.

### Out of Scope

- Anything owned by `pizarra-state-persistence` (freehand drawing canvas, localStorage shape model) — different feature, do not touch.
- Native VTE renderer changes outside the flicker decoupling; renderer contract stays the same.
- Cross-device session sync (still single-machine).
- Per-tab isolation (separate stacks per tab) — tabs share the pane's chromium process like a normal tab strip.
- Drag-out of pizarra surfaces into OS-level windows (already exists, no changes).
- Layout algorithm changes (cascade, grid, etc.) — purely surface sharing + animation.
- Undo/redo for freehand strokes (separate change).

## Capabilities

### New Capabilities

- `pizarra-shared-surfaces`: Terminal and browser surfaces that survive the workspace↔pizarra toggle unchanged. Same WebSocket, same XTerm buffer, same scrollback, same browser tab list.
- `pizarra-browser-tabs`: Multi-tab model for a single browser surface. Each tab carries `{ id, url, label, favicon, isActive, canClose }`. The pane renders a tab strip plus an active `<webview>`/iframe.
- `pizarra-mode-transition`: Choreographed animation between workspace and pizarra modes — easings/durations live in `surfaceMotion.js`, native VTE never unmounts during the transition.

### Modified Capabilities

- `canvas-terminal`: drop the "xterm.js only in canvas" rule. Native VTE is allowed inside `CanvasTerminal` provided the surface is registered as a shared surface and the flicker fix is active.
- `board-browser-pane`: drop the "no tab list, no + new tab affordance" rule. The browser pane chrome now includes a tab strip and a new-tab button when `tabs.length > 0` or when the surface is in `multiTab` mode.
- `terminal-panel-state`: dockState model promoted to a shared map keyed by `surfaceId`; pizarra contributes its own surfaceIds but the right-dock chrome reads from the same store the workspace uses.

## Approach

### Shared singletons + surface identity

A `SharedSurfacesProvider` mounted once at the workspace root owns the lifecycle of terminal and browser surfaces. Every consumer (TWM right-dock, `PizarraCanvas`, future Inspector) renders a `<SurfacePortal surfaceId="..." />` that attaches to the running instance via React portal keyed by `surfaceId`. TWM's `dockState` becomes a projection of the shared surfaces store: removing a surface from TWM only hides its dock entry, it does not unmount the running process. `TerminalTTY` accepts a `surfaceId` prop and registers itself with the provider on mount; on unmount it calls `releaseSurface(surfaceId, { keepAlive: true })` so the XTerm + WebSocket are preserved across React tree boundaries.

### Bidirectional registry

The existing `LiveSurfaceRegistry` (`src/lib/pizarra/useLiveSurfaceRegistry.js`) is a one-way TWM→registry bridge. We promote it to a `SharedSurfaceRegistry` with two channels: `registry.register(surfaceId, descriptor)` from pizarra (e.g. when a `CanvasTerminal` is dropped on the canvas, it registers itself so TWM's right-dock can offer a dock entry to focus it) and `registry.subscribe(surfaceId, callback)` consumed by TWM and pizarra to mirror focus, hide, and resize. The registry writes to `devhub_pizarra_surfaces_{projectId}_{workspaceId}` in localStorage so refresh keeps the same map. Disjoint writes are merged with last-write-wins keyed by `surfaceId + updatedAt`.

### dockState promotion

Today `usePizarraState` (a separate localStorage slice) holds pizarra's panel list and TWM's `dockState` holds workspace's. We collapse both into one `sharedDockState` slice with shape `{ surfaces: Record<surfaceId, SurfaceDescriptor>, focusedSurfaceId, maximizedView }`. `SurfaceDescriptor` is `{ id, type: 'terminal' | 'browser', title, position, size, nativePanelId, ownerMode: 'workspace' | 'pizarra' | 'both' }`. Workspace consumes it for the right-dock; pizarra consumes it for the canvas surface list. Migration: read the old `pizarra_state` + TWM `dockState` on first mount, merge into the new shape, write back, then forget the old keys.

### Animation orchestrator

`useModeTransition(maximizedView)` returns `{ phase: 'idle' | 'leaving' | 'entering', progress: 0..1 }`. On `maximizedView` change it enters `leaving` for 110ms (old chrome fades + slides out), then flips the React tree, then enters `entering` for 220ms (new chrome fades + slides in). Easings and durations come from the existing `surfaceMotion.js` tokens (`EASE_OUT`, `DUR.enter`, `DUR.base`). Native VTE panels stay on screen the whole time — only the React chrome is animated. The browser tab strip cross-fades, but the active `<webview>` does not reload.

### Flicker fix

`CanvasTerminal` and `PizarraBrowserSurface` change from `suspendNativeSurface={isDragging}` (where `isDragging` was set on mousedown) to `suspendNativeSurface={isLiveDragging}` (set on first mousemove after mousedown, cleared on mouseup). Resize handles get the same treatment. This means a normal click on a handle to select a surface no longer triggers the IPC round-trip to hide and re-show the native VTE panel. The native panel only suspends for the actual pixel movement, then reattaches on release — and reattach uses a `transform: translate3d` snap on the wrapper for one frame so the chrome catches up without flicker.

## Affected Areas

| Area                                                   | Impact   | Description                                                                                 |
| ------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------- |
| `src/components/workspace/SharedSurfacesProvider.jsx`  | New      | Root provider that owns shared terminal/browser surface lifecycles                          |
| `src/components/workspace/hooks/useSharedDockState.js` | New      | Hook backed by localStorage + cross-tab `storage` event                                     |
| `src/components/TerminalTTY.jsx`                       | Modified | Accept `surfaceId`, register with provider, never dispose on React unmount when `keepAlive` |
| `src/components/workspace/WorkspaceBrowserPane.jsx`    | Modified | Render multi-tab strip + active tab; share `surfaceId` with pizarra                         |
| `src/components/pizarra/CanvasTerminal.jsx`            | Modified | Subscribe to `surfaceId`; flicker fix on drag; allow native VTE                             |
| `src/components/pizarra/PizarraBrowserSurface.jsx`     | Modified | Same shared surface, tab strip, flicker fix                                                 |
| `src/lib/pizarra/useLiveSurfaceRegistry.js`            | Modified | Promote to `useSharedSurfaceRegistry` with bidirectional API                                |
| `src/lib/pizarra/surfaceMotion.js`                     | Modified | Add `useModeTransition` and shared tab-strip tokens                                         |
| `src/lib/dock/twmStore.js`                             | Modified | Read `sharedDockState`; remove pizarra duplicate                                            |
| `src/hooks/usePizarraState.js`                         | Modified | Stop owning panel list; delegate to `useSharedDockState` (state-shape fields kept)          |
| `src/components/control-room/rightDock/RightDock.jsx`  | Modified | Project surfaces from shared store; add tab strip chrome                                    |
| `openspec/specs/canvas-terminal/spec.md`               | Modified | Drop xterm-only rule                                                                        |
| `openspec/specs/board-browser-pane/spec.md`            | Modified | Allow tab strip                                                                             |
| `openspec/specs/terminal-panel-state/spec.md`          | Modified | Promote to shared model                                                                     |
| `openspec/specs/pizarra-shared-surfaces/spec.md`       | New      | Spec for shared surface identity + lifecycle                                                |
| `openspec/specs/pizarra-browser-tabs/spec.md`          | New      | Spec for tab list model + chrome                                                            |
| `openspec/specs/pizarra-mode-transition/spec.md`       | New      | Spec for transition choreography                                                            |

## Risks

| Risk                                                                            | Likelihood | Mitigation                                                                                               |
| ------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------- |
| Stale XTerm scrollback when surface is hidden by the inactive mode for too long | Medium     | Reattach preserves the full buffer; cap idle hide at 10 min, then offer "reconnect" toast                |
| localStorage quota overflow with many tab entries                               | Low        | Cap tabs per surface at 20; LRU-evict closed tabs older than 7 days                                      |
| Two consumers racing to write the same `surfaceId` in the registry              | Medium     | Single-writer pattern: workspace is the writer; pizarra publishes intents through `requestSurfaceUpdate` |
| Mode transition stutters if a user toggles rapidly                              | Medium     | Debounce `maximizedView` changes at 200ms; cancel in-flight transition if a new toggle arrives           |
| Native VTE panel reattach causes a one-frame chrome desync                      | Medium     | Wrapper uses `transform: translate3d` snap for 16ms; tested with Playwright video diff                   |
| Migration of existing localStorage leaves orphaned data                         | Low        | One-shot migration writes a `.bak` key before overwriting; old keys purged only after new state verified |
| `board-browser-pane` consumers depend on the no-tab contract                    | Low        | Add `tabsMode: 'single' \| 'multi'` opt-in; default remains single for non-pizarra consumers             |

## Rollback Plan

1. Set `NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE=false` — app boots in legacy disjoint mode using the old `usePizarraState` panel list and the old TWM `dockState`.
2. Revert `SharedSurfacesProvider`, `useSharedDockState`, `useSharedSurfaceRegistry`, `useModeTransition` to the previous API surface (feature-flag-gated, no behavior change when off).
3. Restore `TerminalTTY` and `WorkspaceBrowserPane` to mount/unmount with the React tree.
4. Re-enable `suspendNativeSurface={isDragging}` on mousedown (legacy behavior).
5. The `pizarra_state` and `devhub_pizarra_surfaces_*` localStorage keys are untouched by the migration; users keep their data even after rollback.
6. Spec changes are additive (the old "xterm-only" and "no tab list" rules re-apply in legacy mode because the new code paths are gated by the flag).

## Dependencies

- `xterm.js` + `FitAddon` (existing).
- Tauri's `WebviewWindow` IPC (existing, used for native VTE).
- `surfaceMotion.js` tokens (existing WIP, will be promoted to stable).
- React 18 `createPortal` (no new dep).
- Playwright (existing, for flicker video-diff tests).

## Success Criteria

- [ ] Toggle workspace↔pizarra: same Claude Code session keeps cursor and scrollback, no reconnect, no flash.
- [ ] Browser with 3 tabs: tab list visible in both modes, switching modes keeps the same active tab and URL.
- [ ] Mode toggle feels fluid: no hard cut, transition completes in 220-340ms, no jank on a mid-range laptop.
- [ ] Resize a terminal in pizarra: native VTE panel does not flicker on mousedown, only repositions smoothly during the drag.
- [ ] Drag a terminal to a new position: chrome does not flash; native panel reattaches without a visible gap.
- [ ] Refresh page after toggling modes: surfaces and tabs reappear in the same state.
- [ ] `pizarra-state-persistence` freehand drawing flow unchanged (regression-tested).
- [ ] `canvas-terminal` and `board-browser-pane` specs updated; `pizarra-shared-surfaces`, `pizarra-browser-tabs`, `pizarra-mode-transition` specs exist.
- [ ] Unit + integration tests for shared surface lifecycle, tab strip, mode transition, and flicker decoupling — all green.
- [ ] Feature flag `NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE` gates the new behavior; legacy path still works.
