# TWM Remap: Remaining Inline Extraction Targets

> **Read-only mapping task for `TerminalWorkspacesManager.jsx` on `feature/terminal-decompose`.**  
> Goal: identify every remaining inline concern that can be extracted behavior-preservingly and produce a line-range plan to reach a thin view ≤1000 lines.

## Current State

`src/components/TerminalWorkspacesManager.jsx` is **5,155 lines** as of this audit (the 4,730 figure from the prior summary appears to be a net count after an earlier partial pass; the file on disk is 5,155).

Already-extracted modules that are wired in:

- `useWorkspaceLayoutState` (L135, used L375-379)
- `useRightDockController` (L135, used L579-601)
- `useWorkspaceWindowsController` (L135, used L603-634)
- `useSwarmLaunchController` (L136, used L2579-2654)
- `useZedWorkspaceEvents` (L137, used L3508-3525)
- `useTerminalWorkspaceShortcuts` (L138, used L3527-3539)
- `renderWorkspacePanel` (L140, exported L325, invoked inside `renderWorkspacePanelSlot` at L4941-5010)
- `workspaceStateModel.js` + `swarmRoleModel.js` (L77, L78)

Despite those extractions, the file still contains large inline blocks. The remaining inline logic falls into three layers:

1. **Bootstrap / hydration / persistence** (~320 lines)
2. **Panel/workspace lifecycle, focus, navigation, split/close** (~900 lines)
3. **Window event bridge + surface registry** (~800 lines)
4. **Right-dock measurement + live bounds** (~400 lines)
5. **Workspace/window creation, removal, grid, swarm provisioning** (~610 lines)
6. **Render assembly (`renderWorkspaceWindowBar` + main JSX)** (~880 lines)

That is roughly **3,910 lines of extractable code**. After extraction, the thin view should be **~600-900 lines** (imports, state declarations, hook wiring, minimal derived values, and ref sync).

> **Honest assessment:** reaching ≤1000 lines in TWM requires **6-8 slices**, not 4-5. The four biggest slices remove ~2,400 lines and still leave ~2,700. Five slices only work if we group multiple concerns into larger meta-hooks, which increases risk.

---

## Extraction Targets (Precise Line Ranges)

### Slice 1: `useWorkspaceBootstrapEffect`

| Field                        | Value                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Name**                     | `useWorkspaceBootstrapEffect`                                                                                                                                                                                                                                                                                                                                                                                       |
| **Line range**               | 562-884 (with 636-653, 655-671, 673-693, 695-707, 709-791, 793-824, 826-839, 841-861, 863-866, 868-884)                                                                                                                                                                                                                                                                                                             |
| **Responsibility**           | Mount-time bootstrap: counter randomization (TIC-2), deferred heavy-surface readiness, Next.js dev-overlay suppression, maximize persistence + toggle event, localStorage hydration of workspaces/windows/prefs, T5 displayName migration, flush helper, and the three persistence effects (state, renderer prefs, restore manifest).                                                                               |
| **Refs / props read**        | `storage`, `projectId`, `terminalStateStorageKey`, `restoreManifestStorageKey`, `isVisible`, `workspacesRef` (read only, L785), `wsCounterRef`, `colCounterRef`, `panelCounterRef`, `windowCounterRef`, `terminalHydrationReadyRef`, `bootPanelIdsRef`, `hasRunStartupRestoreRef`, `deferHeavySurfacesUntilPaint`, `heavySurfacesReady`, `isMaximized`. Reads `workspaces` and `workspacesRef` for hydrate/migrate. |
| **Test safety net**          | `TerminalWorkspacesManager.test.js` (displayName migration), `TerminalWorkspacesManager.counterRandomization.test.jsx`, `TerminalWorkspacesManager.startupRestore.test.jsx` (hydration path), `TerminalWorkspacesManager.workspaceWindows.test.js` (window hydrate), `TerminalWorkspacesManager.right-dock.test.jsx` (dock hydrate).                                                                                |
| **Feasibility**              | **CLEAN** — pure sequence of effects, no JSX, only reads refs and localStorage. The flush helper is used elsewhere, so it should be returned from the hook.                                                                                                                                                                                                                                                         |
| **Estimated line reduction** | ~280-320 lines (effects + helper)                                                                                                                                                                                                                                                                                                                                                                                   |

### Slice 2: `useWorkspacePanelLifecycle`

| Field                        | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Name**                     | `useWorkspacePanelLifecycle`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **Line range**               | 1745-2210, 2840-3011, 3280-3456                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **Responsibility**           | Panel lifecycle orchestration: `markPanelsClosing`, `syncPanelLifecycleLayout`, `resolveActiveWindowPanelIds`, workspace-switch effect, window-switch effect, pizarra-mode layout-settled, panel-group layout handler, internal-split drag handler, dock drag handlers, panel focus/navigation helpers (`navigateToPanel`, `switchWorkspace`, `togglePanelFocus`, `clearPanelFocusMode`, `pulsePanelNavigation`), `applyTerminalNavigationAction`, `handleSplit`, `handleClosePanel`, and the double-shortcut close-panel logic. |
| **Refs / props read**        | Heavy `workspacesRef` reader across mutating callbacks (L2037, L2041, L2053, L2067, L2082, L2134, L2135, L2151, L2157, L2177, L2183, L2199, L2851, L2935, etc.). Also reads `activeWsIdRef`, `activePanelIdsRef`, `activeWindowIdsRef`, `workspaceWindowsRef`, `focusedPanelByWorkspaceRef`, `panelsClosingRef`, `panelNavPulseTimeoutRef`, `panelLayoutDebounceRef`, `isDraggingInternalSplit`, `isDraggingDock`, `activePanelId`, `activeWorkspace`, `activeWsId`, `workspaceWindows`, `isVisible`.                            |
| **Test safety net**          | `TerminalWorkspacesManager.split-layout.test.jsx` (split/close), `TerminalWorkspacesManager.shortcuts.test.jsx` (navigation), `TerminalWorkspacesManager.workspaceWindows.test.js` (switch), `TerminalWorkspacesManager.workspaceCloseRemount.test.jsx` (close), `TerminalWorkspacesManager.panel-subtabs.test.jsx` (focus/window), `TerminalWorkspacesManager.right-dock.test.jsx` (dock drag).                                                                                                                                 |
| **Feasibility**              | **TANGLED** — this is the highest-risk slice. It mutates workspaces, reads `workspacesRef` everywhere, and is tightly coupled to native sync callbacks and `scheduleTerminalLifecycleSync`. Recommended to split into two passes: (a) focus/navigation/switch, (b) split/close.                                                                                                                                                                                                                                                  |
| **Estimated line reduction** | ~700-750 lines                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

### Slice 3: `useWorkspaceEventBridge`

| Field                        | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Name**                     | `useWorkspaceEventBridge`                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Line range**               | 3894-4380                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Responsibility**           | Window event listeners: `devhub:run-agent`, `devhub:swarm-launch-materialized`, `devhub:opencode-session-detected`, `devhub:terminal-exit`, `devhub:swarm-launch-wrapper-sent`, `devhub:relaunch-panel`, `devhub:terminal-settings-modal-requested`, `devhub:manual-revive-requested`. Also owns `failPendingReopen` helper.                                                                                                                                      |
| **Refs / props read**        | Reads `workspacesRef` heavily (L3971, L4001, L4100, L4137, L4145, L4301). Also `activeWsId`, `activeWsIdRef`, `activePanelIdsRef`, `activePanelId`, `storage`, `projectId`, `terminalStateStorageKey`, `pendingReopenPanelsRef`, `relaunchInFlightRef`, `panelsClosingRef`, `applyPanelRelaunchCommand`, `handleClosePanel`, `handleSplit`, `createWorkspaceForSwarmLaunchRequests`, `enqueueSwarmLaunchRequest`, `persistAgentRunMetadata`, `failPendingReopen`. |
| **Test safety net**          | `TerminalWorkspacesManager.test.js` (run-agent launchOrigin gate), `TerminalWorkspacesManager.startupRestore.test.jsx` (session detection), `TerminalWorkspacesManager.reopen.test.jsx` (relaunch/fail), `TerminalWorkspacesManager.split-layout.test.jsx` (swarm materialized), `TerminalWorkspacesManager.staleIdentity.test.jsx`.                                                                                                                              |
| **Feasibility**              | **CLEAN** — event listeners are a clean boundary. The hook returns nothing; it registers effects. Must pass stable callbacks to avoid re-registering.                                                                                                                                                                                                                                                                                                             |
| **Estimated line reduction** | ~460-490 lines                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

### Slice 4: `useWorkspaceSurfaceRegistry`

| Field                        | Value                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Name**                     | `useWorkspaceSurfaceRegistry`                                                                                                                                                                                                                                                                                                                                                     |
| **Line range**               | 3541-3852                                                                                                                                                                                                                                                                                                                                                                         |
| **Responsibility**           | Pizarra/browser surface registry lifecycle: hook setup, `isDedicatedBrowserSurface`, `registryAddSurface`, `registryRemoveSurface`, `registryUpdateSurface`, `registryValue` memo, and the reconcile effect that builds terminal/browser surfaces from workspace windows.                                                                                                         |
| **Refs / props read**        | Reads `activeWorkspace`, `workspaceWindows`, `activeWindowIds`, `browserWindowStates`, `terminalRendererPreferences`, `registry` (from `useWorkspaceSurfaceRegistry` hook), `handleSplit`, `handleClosePanel`, `closeWorkspaceBrowserWindow`, `handleSetPanelRenderer`, `effectiveRightDockState`. Reads `workspacesRef` indirectly through `activeWorkspace`/`workspaceWindows`. |
| **Test safety net**          | `useWorkspaceSurfaceRegistry.test.js`, `TerminalWorkspacesManager.right-dock.test.jsx` (pizarra/browser), `TerminalWorkspacesManager.panel-subtabs.test.jsx`, `TerminalWorkspacesManager.v2graveyard.test.jsx`.                                                                                                                                                                   |
| **Feasibility**              | **CLEAN** — self-contained registry logic. Already partially extracted as the hook; this block wires it into TWM. The reconcile effect is a bounded unit.                                                                                                                                                                                                                         |
| **Estimated line reduction** | ~290-320 lines                                                                                                                                                                                                                                                                                                                                                                    |

### Slice 5: `useWorkspaceRightDockSync`

| Field                        | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Name**                     | `useWorkspaceRightDockSync`                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **Line range**               | 1122-1187, 1240-1464                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **Responsibility**           | Right-dock live synchronization: drag-state global listeners, `activeSwarmLaunchSummary`, `useSwarmBusSnapshot`, `swarmDelegatedRoleKeys`, `effectiveRightDockState`, pizarra-active dispatch, `nudgeBrowserNativeLive`, `applyLiveRightDockBounds`, derived dock flags (`isFullscreenBrowser`, `pizarraOwnsLiveSurfaces`, `hideRightDockPanel`, `dockLayerVisible`), `rightDockLayerStyle`, and eager measured-bounds sync effects.                            |
| **Refs / props read**        | `rightDockState`, `rightDockMeasuredBounds`, `hasMountedRightDock`, `isDraggingDock`, `setIsDraggingDock`, `workspaceGridAreaRef`, `rightDockPlaceholderRef`, `rightDockLayerRef`, `isDraggingDockRef`, `applyLiveRightDockBoundsRef`, `syncRightDockMeasuredBoundsRef`, `pendingDockSizeRef`, `nudgeBrowserNativeLiveRef`, `activeWsIdRef`, `activeWorkspace`, `projectId`, `storage`, `effectiveRightDockState`, `heavySurfacesReady`, `browserWindowStates`. |
| **Test safety net**          | `TerminalWorkspacesManager.right-dock.test.jsx` (extensive), `TerminalWorkspacesManager.panel-subtabs.test.jsx` (path chip).                                                                                                                                                                                                                                                                                                                                    |
| **Feasibility**              | **CLEAN/MEDIUM** — mostly derived state and effects, but refs are mutated (`nudgeBrowserNativeLiveRef.current`, `applyLiveRightDockBoundsRef.current`, `syncRightDockMeasuredBoundsRef.current`). The pattern is already used; keep it.                                                                                                                                                                                                                         |
| **Estimated line reduction** | ~380-420 lines                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

### Slice 6: `useWorkspaceLifecycle`

| Field                        | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Name**                     | `useWorkspaceLifecycle`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **Line range**               | 2240-2530, 2656-2779                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **Responsibility**           | Workspace/window creation and removal: `createWorkspaceWithTerminalCount`, `addWorkspace`, `removeWorkspace`, `handleApplyGrid`, `persistAgentRunMetadata`, `materializeSwarmWorkerInPlace`, and the lazy worker-provision poll effect.                                                                                                                                                                                                                                                                                                                                                          |
| **Refs / props read**        | Heavy `workspacesRef` reader (L2682, etc.). Also `activeWsId`, `activeWsIdRef`, `activePanelIdsRef`, `activeWindowIdsRef`, `workspaceWindowsRef`, `focusedPanelByWorkspaceRef`, `wsCounterRef`, `colCounterRef`, `panelCounterRef`, `windowCounterRef`, `swarmLaunchScheduledTimersRef`, `pendingSwarmLaunchByLaunchIdRef`, `materializedSwarmLaunchIdsRef`, `swarmProjectionBurstCleanupRef`, `consumedUiProvisionKeysRef`, `projectId`, `cwd`, `storage`, `workspaces`, `workspaceWindows`, `activeWindowIds`, `swarmControlSnapshot`, `syncActiveWindowSnapshot`, `syncPanelLifecycleLayout`. |
| **Test safety net**          | `TerminalWorkspacesManager.test.js`, `TerminalWorkspacesManager.workspaceWindows.test.js`, `TerminalWorkspacesManager.workspaceCloseRemount.test.jsx`, `TerminalWorkspacesManager.split-layout.test.jsx`, `TerminalWorkspacesManager.staleIdentity.test.jsx`, `TerminalWorkspacesManager.counterRandomization.test.jsx`, swarm-related tests.                                                                                                                                                                                                                                                    |
| **Feasibility**              | **TANGLED** — `removeWorkspace` is one of the longest functions and touches survivor-recovery scheduling. `persistAgentRunMetadata` touches `localStorage` directly. `materializeSwarmWorkerInPlace` touches network. Recommended split: (a) create/remove/grid, (b) swarm provisioning + metadata.                                                                                                                                                                                                                                                                                              |
| **Estimated line reduction** | ~580-620 lines                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

### Slice 7: `useWorkspaceNativeSync`

| Field                        | Value                                                                                                                                                                                          |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Name**                     | `useWorkspaceNativeSync`                                                                                                                                                                       |
| **Line range**               | 1649-1743                                                                                                                                                                                      |
| **Responsibility**           | Native surface sync payload builder and dispatchers: `buildNativeWorkspaceSyncDetail`, `notifyNativeWorkspaceSurfaceSync`, `notifyNativeLayoutSettled`.                                        |
| **Refs / props read**        | `activeWindowIds`, `activeWsId`, `focusedPanelByWorkspace`, `getAllPanelIds`, `isVisible`, `workspaceWindows`, `workspaces`. Reads current workspace state (not `workspacesRef`).              |
| **Test safety net**          | `TerminalWorkspacesManager.workspaceWindows.test.js`, `TerminalWorkspacesManager.workspaceCloseRemount.test.jsx`, `TerminalWorkspacesManager.right-dock.test.jsx`, `nativeLayoutSync.test.js`. |
| **Feasibility**              | **CLEAN** — pure payload builder + thin dispatch wrappers.                                                                                                                                     |
| **Estimated line reduction** | ~90-100 lines                                                                                                                                                                                  |

### Slice 8: `useWorkspaceRenderAssembly`

| Field                        | Value                                                                                                                                                                                                                                                                                              |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Name**                     | `useWorkspaceRenderAssembly`                                                                                                                                                                                                                                                                       |
| **Line range**               | 3013-3195, 4435-5155                                                                                                                                                                                                                                                                               |
| **Responsibility**           | The remaining JSX assembly: `renderWorkspaceWindowBar` closure and the main render block (top tab bar, window switcher, action buttons, grid area, right-dock layer, modals, Zed overlay).                                                                                                         |
| **Refs / props read**        | Reads nearly all state and callbacks from TWM. This is the final thin-view boundary; the component will receive the bulk of its props from the hook/computed values returned by earlier slices.                                                                                                    |
| **Test safety net**          | All TWM test suites, especially `TerminalWorkspacesManager.right-dock.test.jsx`, `TerminalWorkspacesManager.panel-subtabs.test.jsx`, `TerminalWorkspacesManager.reopen.test.jsx`, `TerminalWorkspacesManager.split-layout.test.jsx` (the four pre-existing red suites — must not regress further). |
| **Feasibility**              | **CLEAN** — pure JSX assembly. The closure handlers can become props. `renderWorkspacePanelSlot` is already a function; `renderWorkspaceWindowBar` should become a standalone component or hook-returned renderer.                                                                                 |
| **Estimated line reduction** | ~820-880 lines from TWM (the extracted file will be ~850-950 lines).                                                                                                                                                                                                                               |

### Small / Foldable Slices

These are small enough to fold into nearby slices or extract as micro-hooks:

| Name                         | Lines     | Responsibility                                                                     | Feasibility | Suggested fold target                                   |
| ---------------------------- | --------- | ---------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------- |
| `usePanelRename`             | 422-468   | `startPanelRename`, `commitPanelRename`, `updateEditingValue`, `cancelPanelRename` | CLEAN       | `useWorkspacePanelLifecycle` or standalone              |
| `useTauriWindowControls`     | 4382-4430 | `getTauriWindow`, maximize state, minimize/maximize/close handlers                 | CLEAN       | `useWorkspaceRenderAssembly` (titlebar)                 |
| `useResumableSessionActions` | 3206-3278 | `reopenOpenCodeSession`, `removeReopenRun`                                         | CLEAN       | `useWorkspaceEventBridge` (reopen events)               |
| `useWorkspaceTabDrag`        | 2781-2838 | Workspace tab reorder drag handlers                                                | CLEAN       | `useWorkspaceLifecycle` or `useWorkspaceRenderAssembly` |

---

## `workspacesRef` Read Surface

The audit flag is correct: `workspacesRef.current` is read inside mutating callbacks across many slices. The following slices read it:

- `useWorkspaceBootstrapEffect` (L785 — hydrate fallback)
- `applyPanelRelaunchCommand` (L908) — can move with `useWorkspaceEventBridge` or `useWorkspacePanelLifecycle`
- `useWorkspacePanelLifecycle` (many lines) — highest density
- `useWorkspaceLifecycle` (`removeWorkspace`, `materializeSwarmWorkerInPlace`)
- `useWorkspaceEventBridge` (opencode/relaunch handlers)
- `useWorkspaceSurfaceRegistry` (indirectly via `activeWorkspace`)

**Ref-bag contract:** pass `workspacesRef` as a stable ref object. Extracted hooks must read `.current` inside callbacks/effects and never destructure at render time. This matches the TTY ref-bag contract already in the design.

---

## Survivor-Recovery and v1 Constraints

The following symbols are **out-of-scope for deletion** (per behavior contract):

- `filterLegacySurvivorPanelIds`
- `scheduleSurvivorRecoverAfterClose`
- `SWITCH_SURVIVOR_RECOVER_DELAYS_MS`
- `PANEL_LIFECYCLE_REASONS.WORKSPACE_SWITCH`
- `isEngineV2` branches

Any extraction that touches these must preserve them exactly. Slices 2 and 6 contain survivor-recovery calls; they must remain reachable.

---

## Recommended Extraction Order (Lowest-Risk First)

| Order | Slice                         | Risk         | Why First                                                                       |
| ----- | ----------------------------- | ------------ | ------------------------------------------------------------------------------- |
| 1     | `useWorkspaceNativeSync`      | CLEAN        | Pure helper; no state mutation; establishes sync contract used by later slices. |
| 2     | `useWorkspaceRightDockSync`   | CLEAN/MEDIUM | Self-contained derived-state + effects; only touches dock refs.                 |
| 3     | `useWorkspaceSurfaceRegistry` | CLEAN        | Registry logic already has its own hook; this block is wiring.                  |
| 4     | `useWorkspaceEventBridge`     | CLEAN        | Event listeners are a clean boundary; returns nothing.                          |
| 5     | `useWorkspaceBootstrapEffect` | CLEAN        | Pure mount effects; reduces file by ~300 lines early.                           |
| 6     | `useWorkspaceLifecycle`       | TANGLED      | Creation/removal is big and risky; do after bootstrap is stable.                |
| 7     | `useWorkspacePanelLifecycle`  | TANGLED      | Highest risk; do after lifecycle slice is proven.                               |
| 8     | `useWorkspaceRenderAssembly`  | CLEAN        | Final thin-view step; depends on all earlier slices.                            |

This order gets TWM to ≤1000 lines **after slice 8**. Slices 1-4 remove ~1,100 lines (file ~4,050). Slices 5-7 remove ~1,600 lines (file ~2,450). Slice 8 removes ~850 lines, leaving **~1,600 → ~750-900 lines** in TWM (imports + hook calls + minimal orchestration).

> **If forced to 4-5 slices:** combine 1+5 (`useWorkspaceBootstrapEffect` including native sync), 2 (`useWorkspaceRightDockSync`), 3+4 (`useWorkspaceEventBridge` including surface registry), 6+7 (`useWorkspaceLifecycle` including panel lifecycle), 8 (`useWorkspaceRenderAssembly`). That is 5 meta-slices but mixes concerns and increases regression risk.

---

## Thin-View Floor Estimate

After extracting all 8 slices, the irreducible TWM floor is approximately:

| Section                                                                                | Lines              |
| -------------------------------------------------------------------------------------- | ------------------ |
| Imports                                                                                | ~300               |
| Build marker + exports                                                                 | ~30                |
| Component signature + basic refs/state                                                 | ~80                |
| Hook wiring (layout, dock, windows, swarm, Zed, shortcuts, bootstrap, lifecycle, etc.) | ~120               |
| Small derived values (`activeWorkspace`, `activePanelId`, etc.)                        | ~60                |
| Ref sync block (L1466-1471)                                                            | ~10                |
| Return of `useWorkspaceRenderAssembly` JSX root                                        | ~20                |
| **Total thin-view floor**                                                              | **~620-720 lines** |

The **render block itself is reducible**: `renderWorkspaceWindowBar` and the main JSX can move to `WorkspaceRenderAssembly.jsx`. The closure-based `renderWorkspacePanelSlot` is already a function; only the outer assembly remains. If render is kept inline, the floor is **>1000 lines** (~620 floor + ~880 render = ~1,500). Therefore, **extracting the render assembly is mandatory** to hit the target.

**Achievable target:** TWM ≤ **900-1000 lines** if all 8 slices are extracted. With only 4-5 slices, TWM remains **>1500 lines**.

---

## Risks

1. **`workspacesRef` stale closures** — any extracted hook that reads `workspacesRef.current` inside a callback must receive the ref object, not a destructured snapshot.
2. **Survivor-recovery regression** — slices 2 and 6 contain `scheduleSurvivorRecoverAfterClose`; must preserve v1 paths.
3. **Pre-existing red test suites** — `right-dock`, `panel-subtabs`, `reopen`, `split-layout` are already red; no new failures allowed.
4. **Orphan module drift** — `useWorkspaceSurfaceRegistry` already exists; the reconcile block must match its expectations.
5. **Render assembly coupling** — moving the main JSX requires threading many callbacks; risk of prop explosion. Consider a context or a single `renderProps` object.

---

## Recommendation

Proceed with **8 slices**, not 4-5. The first four are low-risk and should be stacked as the next PRs after any in-flight work. `useWorkspaceRenderAssembly` is the only path to a ≤1000-line TWM; keep it as the final slice.

Ready for proposal: **Yes**, with the caveat that the slice count must be 6-8 to hit the line target.
