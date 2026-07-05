# TerminalTTY Remap — remaining inline extraction targets

> Working note. Read-only mapping for the `feature/terminal-decompose` branch.
> Source file: `src/components/TerminalTTY.jsx`.
> Actual measured length: **3,904 lines** (the 3,613 figure in planning docs is stale; the file grew after the last extraction pass).

## Current state

`TerminalTTY.jsx` is now mostly:

1. Imports (~245 lines).
2. A large ref/state declaration block (~300 lines).
3. Several ref-bag assemblies (`outputRefs`, `lifecycleRefs`, `rendererRefsBag`, `sessionRefs`, `viewportRefs`, then `viewportCtxRef`, `rendererCtxRef`, `connectCtxRef`, `engineCtxRef`).
4. Calls to already-extracted hooks (`useTerminalOutputQueue`, `useTerminalClipboard`, `useTerminalWheelRouter`, `useTerminalV2Session`, `useTerminalRendererController`, `useTerminalViewportSync`, `useTerminalWorkspaceShowRecovery`, `useTerminalLayoutChurnRecovery`, `useTerminalEngine`).
5. A number of **still-inline** concerns listed below.
6. The JSX render tree (~313 lines, L3591–3903).

The prior decompose already removed:

- `NATIVE_VTE_STUBS` + probe plumbing (moved to `nativeVteNoopStubs.js`).
- `useTerminalOutputQueue`, `useTerminalClipboard`, `useTerminalWheelRouter`, `useTerminalV2Session`, `useTerminalRendererController`, `useTerminalEngine`.
- `useTerminalViewportSync` + split-out `useTerminalWorkspaceShowRecovery` + `useTerminalWorkspaceShowRecoveryViewportSync` + `useTerminalLayoutChurnRecovery`.

Survivor-recovery symbols are **preserved in-place or already moved into `useTerminalLayoutChurnRecovery` / `useTerminalWorkspaceShowRecovery`**; this plan does not propose deleting them.

---

## Remaining inline concerns that can be extracted

### 1. `useTerminalRendererState` — renderer capability / WebGL fallback state

- **TTY lines:** L372–426 (capability + view-model + operational mode computation) and L827–904 (WebGL probe effect, fallback demotion effect, `handleSwitchToXterm`, `handleRetryProbe`).
- **Responsibility:** Probe/detach WebGL, compute `rendererCapabilities` / `rendererViewModel` / `operationalRendererMode`, surface WebGL→xterm demotion banner, retry probe, switch to xterm.
- **Refs/props read:** `requestedRendererMode`, `visibleTerminalPanelCount`, `runtimePlatform` → `resolvedRuntimePlatform`, `nativeVteProbeResult`, `nativeVteOpenFailure`, `webglProbeResult`, `webglFallback`; `requestedRendererModeRef`, `effectiveRendererModeRef`, `operationalRendererModeRef`.
- **Test safety net:** `terminalRendererCapabilities.xterm-webgl.test.js`, `terminalRendererCapabilities.test.js`, `TerminalTTY.xterm-webgl.test.jsx`, `TerminalTTY.v2.test.jsx`.
- **Feasibility:** **CLEAN**. Self-contained state + derived values; only returns `{ operationalRendererMode, rendererViewModel, rendererCapabilities, webglFallback, webglProbeResult, handleSwitchToXterm, handleRetryProbe }`.
- **Est. reduction:** ~110–130 lines in TTY + import cleanup.

---

### 2. `useTerminalInitialCommandLifecycle` — initial command / swarm / agent-ready dispatch

- **TTY lines:** L1213–1536 (`resolveSwarmTmuxSessionName`, `notifyAgentReady`, `notifyOpencodeReady`, `notifyViewportReady`, `skipRedundantInitialCommandSend`, `restoreInitialCommandDispatchGuard`, `resolveInjectCommand`, `sendInitialCommandIfReady`, `scheduleInitialCommandAfterViewport`).
- **Responsibility:** Resolve swarm tmux session names; post `/api/terminal/opencode-ready` and `/api/terminal/viewport-ready`; guard against redundant initial command sends; decide whether/when to inject the launch command (including swarm launch wrappers and recovery commands).
- **Refs/props read:** `id`, `initialCommand`, `swarmContext`; `resolveSwarmTmuxSessionName` (internal), `sessionReattachedRef`, `serverReadyReceivedRef`, `viewportFitConfirmedRef`, `projectionReadyRef`, `panelCreatedAtRef`, `wsRef`, `transportRef`, `hasSentInitialCommand`, `initialCommandConnectSnapshotRef`, `initialCommandDelayScheduledRef`, `initialCommandDelayTimerRef`, `initialCommandProjectionRetryTimerRef`, `hasConnectedOnceRef`, `isEngineV2Ref`, `isGrokSessionRef`, `isGrokTuiReadyRef`.
- **Test safety net:** `TerminalTTY.test.js` (initial command tests), `TerminalTTY.v2.test.jsx`, `TerminalTTY.singleton.test.jsx`, `panelInitialCommandLifecycle` unit tests.
- **Feasibility:** **MEDIUM**. High ref surface but the logic is isolated; the hook can take a `ctxRef` bag and return `{ sendInitialCommandIfReady, scheduleInitialCommandAfterViewport, notifyAgentReady, notifyViewportReady, restoreInitialCommandDispatchGuard }`.
- **Est. reduction:** ~310–330 lines.

---

### 3. `useTerminalNativeVteLifecycle` — native VTE probe / open / hide / resize / focus

- **TTY lines:**
  - Constants L265–270 (`MAX_NATIVE_VTE_PROBE_RETRIES`, `ENABLE_NATIVE_VTE`).
  - Callbacks L948–966 (`closeNativeLease`), L994–1010 (`hideNativeLease`), L1128–1141 (`handleNativeLeaseCommandError`), L1175–1211 (`showNativeLease`, `resizeNativeLease`, `showAndResizeNativeLease`).
  - Effects L1674–1748 (probe), L1750–1881 (open), L1883–1948 (bounds-recovery retry), L1950–1998 (visibility hide), L1998–2023 (renderer-change hide), L2187–2325 (workspace sync / restore / focus / resize), L2326–2338 (focus), L2339–2403 (resize observer).
- **Responsibility:** All native GTK/VTE surface orchestration. Mostly dead code in production (`ENABLE_NATIVE_VTE === false` outside tests) but still executed in test mode.
- **Refs/props read:** `id`, `cwd`, `initialCommand`, `requestedRendererMode`, `isActivePanel`, `isVisibleInLayout`, `suspendNativeSurface`, `nativeSurfacePolicy`, `runtimePlatform`, `autoFocus`; `nativeLeaseRef`, `nativeVteOpened` state/setter, `nativeVteOpenFailure` state/setter, `nativeVteProbeResult` state/setter, `nativeVteProbeAttempt`/`nativeVteRecoveryAttempt`, `nativeVteProbeRetryCountRef`, `nativeVteProbeRetryTimerRef`, `nativeVteProbeRetryDelayRef`, `shouldRetryNativeVteProbeRef`, `hideTimerRef`, `containerRef`, `nativePlaceholderRef`, `connectRef`, `sessionClosingRef`, `isDisposingRef`, `isVisibleInLayoutRef`, etc.
- **Test safety net:** `TerminalTTY.test.js`, native VTE layout lifecycle tests, `TerminalWorkspacesManager` native surface tests.
- **Feasibility:** **TANGLED but mostly dead**. Largest single chunk (~700 lines). Because `ENABLE_NATIVE_VTE` is false at runtime, production risk is low; test risk is the main concern. Should be extracted as one hook that receives a big `ctxRef` bag and returns `{ closeNativeLease, hideNativeLease, showAndResizeNativeLease, handleNativeLeaseCommandError }` plus internal effects.
- **Est. reduction:** ~680–720 lines.

---

### 4. `useTerminalRendererMigration` — WebGL ↔ Canvas migration on split count changes

- **TTY lines:** L2062–2185 (two `useLayoutEffect`s + one `useEffect` for canvas reattach).
- **Responsibility:** When split geometry changes, migrate between WebGL and Canvas renderers without remounting PTY; keep canvas on visible split siblings; re-attach canvas when a panel becomes visible again.
- **Refs/props read:** `isActivePanel`, `isVisibleInLayout`, `operationalRendererMode`, `visibleTerminalPanelCount`; `termRef`, `webglAddonRef`, `canvasAddonRef`, `isActivePanelRef`, `isVisibleInLayoutRef`, `operationalRendererModeRef`, `visibleTerminalPanelCountRef`, `prevVisibleTerminalPanelCountRef`, `tryReattachWebglAddonRef`, `tryReattachCanvasAddonRef`, `releaseWebglAddonForInactivePanel`, `releaseCanvasAddon`, `fitAndResize`, `connectPendingUntilFitRef`, `isDisposingRef`.
- **Test safety net:** `TerminalTTY.xterm-webgl.test.jsx`, `TerminalTTY.v2.test.jsx`, renderer controller tests.
- **Feasibility:** **MEDIUM**. Tightly coupled to renderer refs but already has a dedicated responsibility; can take `rendererCtxRef`-style bag.
- **Est. reduction:** ~120–140 lines.

---

### 5. `useTerminalWorkspaceShowRecovery` — extend the existing hook to absorb the inline layout-show effect

- **TTY lines:** L2787–3016 (the large `useLayoutEffect` that handles `isVisibleInLayout` / `isWorkspaceShellVisible` transitions, soft GPU reveal, layout churn, bounded recovery scheduling).
- **Responsibility:** Already split into `useTerminalWorkspaceShowRecovery` + `useTerminalWorkspaceShowRecoveryViewportSync`, but the **top-level dispatch effect** is still inline. Move the entire effect into `useTerminalWorkspaceShowRecovery`.
- **Refs/props read:** `isVisibleInLayout`, `isWorkspaceShellVisible`, `operationalRendererMode`, `shouldUseNativeRenderer`, `nativeVteOpened`, `autoFocus`; most of `viewportCtxRef` already assembled above it.
- **Test safety net:** `useTerminalWorkspaceShowRecovery.test.js`, `TerminalTTY.v2.test.jsx`, `TerminalTTY.rehydration.test.jsx`, `TerminalTTY.xterm-webgl.test.jsx`.
- **Feasibility:** **MEDIUM**. The hook already exists; we are just moving the remaining dispatch effect into it. Keeps the survivor-recovery path intact.
- **Est. reduction:** ~220–240 lines.

---

### 6. `useTerminalPanelActivationRecovery` — panel becomes active (false→true) recovery

- **TTY lines:** L3180–3242.
- **Responsibility:** Recover viewport/WebGL when `isActivePanel` flips false→true; attach GPU renderer if needed; call `reactivateTerminalViewport`; focus TUI if `autoFocus`.
- **Refs/props read:** `isActivePanel`, `autoFocus`, `operationalRendererMode`, `shouldUseNativeRenderer`; `termRef`, `webglAddonRef`, `canvasAddonRef`, `containerRef`, `fitRef`, `tuiSessionActiveRef`, `prevIsActivePanelRef`, `tryReattachWebglAddonRef`, `tryReattachCanvasAddonRef`, `reactivateTerminalViewportRef`, `syncTerminalViewportOnWorkspaceShow`, `hiddenOutputCatchupPendingRef`.
- **Test safety net:** `TerminalTTY.xterm-webgl.test.jsx`, `TerminalTTY.v2.test.jsx`, `useTerminalRendererController.test.js`.
- **Feasibility:** **CLEAN**. Small, isolated, event-driven.
- **Est. reduction:** ~60–70 lines.

---

### 7. `useTerminalAutoReconnect` — exponential-backoff reconnect

- **TTY lines:** L3244–3289.
- **Responsibility:** Schedule `reconnect()` when disconnected/error, reset counter on stable connection or when `autoFocus` flips to true.
- **Refs/props read:** `autoFocus`, `connectionState`, `initError`, `id`, `reconnect`.
- **Test safety net:** `TerminalTTY.test.js`, `TerminalTTY.v2.test.jsx`.
- **Feasibility:** **CLEAN**. Pure orchestration.
- **Est. reduction:** ~45–55 lines.

---

### 8. `useTerminalWindowEventRouter` — `resize` / `focus` / `pageshow` / `visibilitychange`

- **TTY lines:** L3291–3461.
- **Responsibility:** Restore native surface after app resume; dispatch viewport reactivation on window focus/pageshow/visibilitychange; repaint inactive siblings; handle window resize; queue native VTE probe retry.
- **Refs/props read:** `isActivePanel`, `isVisibleInLayout`, `autoFocus`, `id`; `requestedRendererModeRef`, `isVisibleInLayoutRef`, `nativeLeaseRef`, `showAndResizeNativeLease`, `queueNativeVteProbeRetry`, `disposeWebglAddonForContextLoss`, `webglAddonRef`, `syncTerminalViewportOnWorkspaceShowRef`, `scheduleInactiveViewportRepaint`, `sendResize`, `fitAndResize`, `needsViewportSyncOnShowRef`, `isDisposingRef`, `termRef`, `tuiSessionActiveRef`, `reactivateCoalesceTimerRef`.
- **Test safety net:** `TerminalTTY.test.js`, `TerminalTTY.v2.test.jsx`, `TerminalTTY.rehydration.test.jsx`.
- **Feasibility:** **MEDIUM**. Lots of refs but no JSX; good `ctxRef` candidate.
- **Est. reduction:** ~160–180 lines.

---

### 9. `useTerminalSessionExit` — session exit detection + overlay recovery click

- **TTY lines:** L1012–1075 (`applyTerminalSessionExit`), L1077–1096 (mount effect that restores persisted exit), L2453–2490 (native exit / native runtime event listeners), L3564–3577 (`handleSessionRecoveryClick`), plus `sessionExitReason` state.
- **Responsibility:** Parse and persist panel session exit reasons, write exit overlay copy into xterm, handle `devhub:terminal-exit` / `devhub:terminal-native-vte-event`, and drive the recovery/reconnect button.
- **Refs/props read:** `id`, `initialCommand`, `setConnectionState`, `shouldUseNativeRenderer`; `termRef`, `containerRef`, `nativePlaceholderRef`, `nativeLeaseRef`, `setSessionExitReason`, `processExitedRef`, `tuiSessionActiveRef`, `isGrokSessionRef`, `grokTuiReadyRef`, `tuiSessionFooterConfirmedRef`, `requestedRendererModeRef`, `connectionStateRef`, `reconnect`, `onActivatePanel`.
- **Test safety net:** `TerminalTTY.test.js`, `agentSessionExit` unit tests, `TerminalTTY.v2.test.jsx`.
- **Feasibility:** **MEDIUM**. Cross-cuts connection state and native VTE, but the boundary is clear.
- **Est. reduction:** ~90–110 lines.

---

### 10. `useTerminalViewportPointer` — mouse-down zone detection + TUI mouse injection

- **TTY lines:** L3481–3542.
- **Responsibility:** On viewport mouse down, detect transcript vs input zone, activate panel, focus terminal, optionally send a mouse-press sequence for TUI (Grok/Kimi).
- **Refs/props read:** `id`, `initialCommand`, `shouldUseNativeRenderer`, `nativeVteOpened`, `onActivatePanel`; `termRef`, `viewportShellRef`, `isGrokSessionRef`, `grokTuiReadyRef`, `kimiReadyNotifiedRef`, `tuiSessionActiveRef`, `tuiSessionFooterConfirmedRef`, `lastPointerZoneRef`, `wsRef`, `transportRef`, `isVisibleInLayoutRef`.
- **Test safety net:** `TerminalTTY.test.js`, `TerminalTTY.v2.test.jsx`, wheel-router tests.
- **Feasibility:** **CLEAN**. Single event handler.
- **Est. reduction:** ~60–70 lines.

---

### 11. `useTerminalStatusState` — derived status label / overlays

- **TTY lines:** L3544–3589 (derived booleans + `exitOverlayCopy` + `statusLabel`).
- **Responsibility:** Compute whether to show viewport, loading overlay, status overlay, build exit copy, and the connection status label.
- **Refs/props read:** `isInitializing`, `initError`, `connectionState`, `hasConnectedOnce`, `sessionExitReason`, `initialCommand`, `webglFallback`, `requestedRendererMode`, `shouldUseNativeRenderer`.
- **Test safety net:** `TerminalTTY.test.js`, `TerminalSettingsModal.test.jsx`.
- **Feasibility:** **CLEAN**. Pure derived state.
- **Est. reduction:** ~45–55 lines.

---

### 12. `useTerminalFontSize` — local font size adjustment

- **TTY lines:** L2671–2698.
- **Responsibility:** Persist and apply A-/A+ font size changes to xterm.
- **Refs/props read:** `FONT_SIZE_KEY`, `fontSize` state setter; `termRef`, `fitRef`, `isDisposingRef`.
- **Test safety net:** `TerminalTTY.test.js`.
- **Feasibility:** **CLEAN**. Tiny; can be folded into a small hook.
- **Est. reduction:** ~25–30 lines.

---

### 13. `useTerminalSearchAndZedInput` — global search + zed input listeners

- **TTY lines:** L3132–3166.
- **Responsibility:** Listen for `devhub:terminal-search` and `devhub:zed-terminal-input`, route to search addon or paste input.
- **Refs/props read:** `id`; `searchRef`, `wsRef`, `transportRef`.
- **Test safety net:** `TerminalTTY.test.js`.
- **Feasibility:** **CLEAN**.
- **Est. reduction:** ~35–40 lines.

---

### 14. `useTerminalScrollPreserve` — save/restore viewport scroll on visibility changes

- **TTY lines:** L3463–3479.
- **Responsibility:** Save `viewportY` when hidden, restore when shown, scroll to bottom if active.
- **Refs/props read:** `isVisibleInLayout`, `isActivePanel`, `initialCommand`; `termRef`, `lastViewportYRef`.
- **Test safety net:** `TerminalTTY.test.js`, `TerminalTTY.v2.test.jsx`.
- **Feasibility:** **CLEAN**.
- **Est. reduction:** ~15–20 lines.

---

## Proposed extraction order (lowest-risk first, 3–4 slices)

The goal is to keep TTY shrinking and tests green (modulo the 14 pre-existing terminal-engine-v2 reds). Order is chosen so each slice has a small blast radius and the big, tangled native-VTE slice comes only after the surrounding surface area has been cleared.

### Slice 1 — “Renderer + status + pointer” (low-risk surface cleanup)

Extract:

1. `useTerminalRendererState` (L372–426, L827–904) — CLEAN.
2. `useTerminalStatusState` (L3544–3589) — CLEAN.
3. `useTerminalFontSize` (L2671–2698) — CLEAN.
4. `useTerminalViewportPointer` (L3481–3542) — CLEAN.
5. `useTerminalScrollPreserve` (L3463–3479) — CLEAN.
6. `useTerminalSearchAndZedInput` (L3132–3166) — CLEAN.

- **Estimated TTY reduction:** ~390–450 lines.
- **Why first:** No survivor-recovery code, no native VTE, no initial-command logic. Mostly derived state + small handlers. Easy to verify with existing tests.

### Slice 2 — “Panel lifecycle + reconnect + window events”

Extract:

1. `useTerminalPanelActivationRecovery` (L3180–3242) — CLEAN.
2. `useTerminalAutoReconnect` (L3244–3289) — CLEAN.
3. `useTerminalWindowEventRouter` (L3291–3461) — MEDIUM.

- **Estimated TTY reduction:** ~270–310 lines.
- **Why second:** These are event-driven lifecycle concerns with clear boundaries; they sit just above the JSX and are easy to isolate once Slice 1 removed the adjacent handlers.

### Slice 3 — “Initial command + agent/swarm lifecycle”

Extract:

1. `useTerminalInitialCommandLifecycle` (L1213–1536) — MEDIUM.
2. `useTerminalSessionExit` (L1012–1075, L1077–1096, L2453–2490, L3564–3577) — MEDIUM.

- **Estimated TTY reduction:** ~400–450 lines.
- **Why third:** Medium risk because of ref coupling, but behavior is well-covered by tests. Doing it after Slice 1/2 means fewer adjacent inline effects to reason about.

### Slice 4 — “Native VTE lifecycle” (the big one)

Extract:

1. `useTerminalNativeVteLifecycle` (L265–270, L948–966, L994–1010, L1128–1141, L1175–1211, L1674–2325, L2339–2403) — TANGLED.

- **Estimated TTY reduction:** ~680–720 lines.
- **Why last:** Largest, most tangled block. By the time we reach it, surrounding code has been moved out, so the `ctxRef` bag is well-defined and the production runtime path is unchanged because `ENABLE_NATIVE_VTE` is false outside tests.

### Optional Slice 5 — “Renderer migration + workspace-show dispatch”

If Slice 1–4 does not land ≤1000:

1. `useTerminalRendererMigration` (L2062–2185) — MEDIUM.
2. Move the remaining layout-show effect into `useTerminalWorkspaceShowRecovery` (L2787–3016) — MEDIUM.

- **Estimated TTY reduction:** ~340–380 lines.
- **Note:** This overlaps with already-extracted hooks, so it is better treated as a follow-up cleanup rather than part of the 3–4 slice plan.

---

## Thin-view floor estimate

What is **irreducible** in `TerminalTTY.jsx`?

- Imports (after cleanup): ~120–140 lines.
- Prop destructuring + ref/state declarations: ~280–320 lines.
- Ref-bag assemblies (`outputRefs`, `lifecycleRefs`, `rendererRefsBag`, `sessionRefs`, `viewportRefs`, then four `ctxRef.current = {...}` blocks): ~300–350 lines.
- Hook call sites (`useTerminalOutputQueue`, `useTerminalClipboard`, `useTerminalWheelRouter`, `useTerminalRendererController`, `useTerminalViewportSync`, `useTerminalWorkspaceShowRecovery`, `useTerminalLayoutChurnRecovery`, `useTerminalV2Session`, `useTerminalEngine`, plus the new hooks): ~80–120 lines.
- Runtime-phase / `shouldBootXterm` / `shouldUseNativeRenderer` computation: ~30–40 lines.
- JSX render tree (container, title bar, viewport shell, overlays, context menu): ~313 lines.

**Estimated minimum floor: ~1,050–1,150 lines.**

That means hitting **≤1,000 lines** is aggressive and likely requires:

- Aggressive import cleanup (move almost every import that is only used by an extracted hook).
- Collapsing some ref-bag assembly boilerplate (e.g. assemble bags programmatically or by merging smaller bags).
- Possibly extracting the `connectCtxRef` / `engineCtxRef` assembly into helper builders, although that starts to hurt readability.

---

## Achievable target

- **Aggressive but possible:** ~950–1,000 lines after all slices + import cleanup + ctxRef-assembly tightening.
- **Honest, safe target:** ~1,000–1,100 lines. The remaining ~100 lines are the cost of keeping the component as the orchestration root.
- **If ≤1,000 is hard-committed:** do Slices 1–5, then audit every import line and ref-bag property assignment for redundancy. Expect the final file to be very thin — mostly declarations + hook calls + JSX.

---

## Survivor-recovery guardrails

The following symbols **must not be deleted** (they may be moved, but behavior must be preserved):

- `legacyTerminalSurvivorRecovery.js` import.
- `scheduleSurvivorRecoverAfterClose` (imported/used in `TerminalWorkspacesManager.jsx`).
- `handleSurvivorRecover`, `scheduleBoundedForceRepaint`, `releaseWebglAddonForInactivePanel`, `SURVIVOR_RECOVER_DELAYS_MS`, `dispatchTerminalSurvivorRecover`, `DEFAULT_AUTO_KILL_GRACE_MS`.

Current status: these are already inside `useTerminalLayoutChurnRecovery.js` and `useTerminalWorkspaceShowRecovery.js`. The remap above does not touch them.

---

## Risk summary

| Risk                                                                                | Mitigation                                                                                                      |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Native VTE tests break because the dead-code extraction misses an effect dependency | Keep `ENABLE_NATIVE_VTE` branch intact; run the full `TerminalTTY.test.js` suite after Slice 4.                 |
| Initial command no longer sends on v2 reconnect                                     | Cover with `TerminalTTY.v2.test.jsx` and `TerminalTTY.rehydration.test.jsx` after Slice 3.                      |
| Window-event extraction loses `pageshow` / `visibilitychange` ordering              | Verify with `TerminalTTY.rehydration.test.jsx` and manual window-restore scenario.                              |
| Ref-bag destructuring at render violates contract                                   | Each new hook must read `ctxRef.current.*` inside callbacks/effects, never destructure refs in the render body. |
| Survivor-recovery path accidentally removed                                         | Code-review gate: grep the symbols above before any slice is merged.                                            |

---

## Recommended next step

Proceed to **Slice 1** (`useTerminalRendererState`, `useTerminalStatusState`, `useTerminalFontSize`, `useTerminalViewportPointer`, `useTerminalScrollPreserve`, `useTerminalSearchAndZedInput`). It is the lowest-risk, highest-confidence path and immediately shrinks TTY by ~400 lines.
