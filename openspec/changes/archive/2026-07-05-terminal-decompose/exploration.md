# Exploration: terminal-decompose

## Current State

`src/components/TerminalTTY.jsx` is **9,228 lines** and `src/components/TerminalWorkspacesManager.jsx` is **7,517 lines** post-`terminal-engine-v2`. Both files are monolithic orchestrators that already import many small modules, but the bulk of the logic remains inline and tightly coupled to React refs and local state.

A prior refactor (`terminal-workspace-componentize`) extracted several satellite files (`renderWorkspacePanel.jsx`, `useWorkspaceWindowsController.js`, `useRightDockController.js`, `WorkspaceWindowTabBar.jsx`, `WorkspaceTerminalSurface.jsx`, `SwarmLaunchEntryPoint.jsx`, `useSwarmLaunchController.js`), but **the current `TerminalWorkspacesManager.jsx` does not import or use any of them** — it still keeps inline versions of the same logic. Those extracted modules are effectively orphaned or used only by other consumers, which means the componentize work was incomplete and the orchestrator re-grew around the old inline code.

The terminal-engine-v2 work landed rehydration, a v2 graveyard, and ring-buffer semantics, but it did **not** delete the legacy survivor-recovery apparatus. Legacy v1 panels still rely on it, and the recovery symbols requested for deletion are still reachable in the codebase.

## Affected Areas

- `src/components/TerminalTTY.jsx` — monolithic xterm.js lifecycle, renderer recovery, v2 session/rehydration, clipboard, wheel routing, layout-settled handling.
- `src/components/TerminalWorkspacesManager.jsx` — workspace/window state, dock, swarm, startup restore, Zed events, panel rendering, shortcuts.
- `src/lib/terminal/legacyTerminalSurvivorRecovery.js` — survivor recovery scheduling still in use for v1 panels.
- `src/lib/terminal/v2Graveyard.js` — hidden surface registry; keep and grow.
- `src/lib/terminal/terminalScrollbackStore.js` — ring buffer already extracted.
- `src/components/terminal/terminalRendererCapabilities.js` — renderer capability logic already extracted.
- `src/components/terminal/nativeLayoutSync.js` — layout-settled/window-visible dispatch already extracted.
- `src/lib/terminal/terminalPanelBridge.js` — short-lived bridge used on non-v2 unmount/remount.
- `src/components/terminal/components/renderWorkspacePanel.jsx` — already extracted but unused by TWM.
- `src/components/terminal/hooks/useWorkspaceWindowsController.js` — already extracted but unused by TWM.

## Phase 6 State (Critical)

**STILL PRESENT.** The requested Phase 6 deletion did not happen because legacy v1 panels still need the survivor-recovery path.

Symbols the user asked to verify:

| Symbol                              | Location                                                                      | Status                                      |
| ----------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------- |
| `scheduleSurvivorRecoverAfterClose` | `TerminalWorkspacesManager.jsx:224,3442,4168`                                 | STILL PRESENT                               |
| `handleSurvivorRecover`             | `TerminalTTY.jsx:6830`                                                        | STILL PRESENT                               |
| `scheduleBoundedForceRepaint`       | `TerminalTTY.jsx:3953,4758,4791,8472,8503`                                    | STILL PRESENT                               |
| `releaseWebglAddonForInactivePanel` | `TerminalTTY.jsx:3639,5379,5397,6817,6932,8472`                               | STILL PRESENT                               |
| `SURVIVOR_RECOVER_DELAYS_MS`        | `legacyTerminalSurvivorRecovery.js`                                           | STILL PRESENT                               |
| `SWITCH_SURVIVOR_RECOVER_DELAYS_MS` | `legacyTerminalSurvivorRecovery.js`, `TerminalWorkspacesManager.jsx:225,3449` | STILL PRESENT                               |
| `dispatchTerminalSurvivorRecover`   | `legacyTerminalSurvivorRecovery.js`                                           | STILL PRESENT                               |
| `DEFAULT_AUTO_KILL_GRACE_MS`        | `lib/terminal/ttyServer.js:147,153`                                           | STILL PRESENT (server-side auto-kill grace) |

The `terminal-engine-v2` flag bifurcates the code: v2 panels skip legacy survivor recovery via `usesLegacyTerminalSurvivorRecovery(isEngineV2)`, but v1 panels still execute the full recovery burst. Deleting these symbols now would regress v1 behavior and should only happen after v2 is the sole active path.

## TTY Concerns Map

Actual concerns in `TerminalTTY.jsx` (line ranges are approximate):

| Concern                                | Lines                           | Notes                                                                                                         |
| -------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Pure viewport / renderer helpers       | 90–1860                         | Mostly stateless. Many already exported and tested. Should move to `lib/terminal/` or stay in TTY as exports. |
| Native VTE stubs                       | 1984–2000                       | No-op placeholders after Phase 0 VTE removal. Safe to delete or collapse to a single object.                  |
| React state + refs initialization      | 1896–2130                       | ~100 refs/state vars. This is the tangled root.                                                               |
| Timer lifecycle management             | 2166–2262                       | `clearTimers`, `clearConnectDeferTimer`, etc. Generic; could live in a hook.                                  |
| xterm runtime boot / dispose           | 2263–2300, 7175–7625            | Creates `Terminal`, addons, resize observer. The core of the risky engine-class extraction.                   |
| Renderer addon attach / reattach       | 627–691, 3639–3800              | WebGL/Canvas attach, context-loss, release. Tightly coupled to refs.                                          |
| Viewport fit / resize                  | 3411–3457                       | `fitAndResize`, `sendResize`. Coupled to `wsRef`, `lastPtySizeRef`.                                           |
| Workspace show / hidden-output catchup | 1437–1446, 1587–1705, 4500–4600 | Soft reveal, catchup buffer, skip logic.                                                                      |
| Layout-settled / survivor recovery     | 8019–8511                       | The heaviest legacy recovery block.                                                                           |
| v2 connection / WebSocket              | 5785–6200                       | Session API fetch, WS open, subscribe/append frames.                                                          |
| v2 rehydration                         | 5918–5949, 5982–6007, 7270–7354 | Snapshot fetch, heldData, serialize addon.                                                                    |
| Output queue / throttle / sync output  | 6056–6189                       | Per-frame cap, synchronized output (DEC 2026). Distinct slice.                                                |
| TUI detection (grok/kimi/opencode)     | 6010–6047                       | Detects readiness from output. Tied to output write.                                                          |
| Clipboard / paste                      | 7100–7149, 8612–8642            | Native + xterm paste paths. React event handlers.                                                             |
| Context menu / copy                    | 8532–8611                       | React UI state.                                                                                               |
| Wheel routing                          | 8659–8792                       | Shell vs TUI wheel decisions.                                                                                 |
| Search event handling                  | 7686–7700                       | Small, can stay in thin view.                                                                                 |

## TWM Concerns Map

Actual concerns in `TerminalWorkspacesManager.jsx`:

| Concern                              | Lines                           | Notes                                                                                                    |
| ------------------------------------ | ------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Pure panel/workspace factory helpers | 288–917                         | Already mostly extracted to `utils/panelHelpers.js`, `utils/swarmRoleMeta.js`, etc.                      |
| `renderWorkspacePanel` inline JSX    | 919–1309                        | **Already extracted to `components/renderWorkspacePanel.jsx` but TWM does not import it.**               |
| Workspace/window state normalization | 1328–1420, 1816–1897            | Hydration from localStorage, counter randomization.                                                      |
| Persistence effects                  | 1816–1990                       | localStorage writes for state, renderer prefs, restore manifest.                                         |
| Right dock controller                | 1500–1539, many handlers        | **Extracted to `hooks/useRightDockController.js` but unused by TWM.**                                    |
| Swarm launch controller              | 1610–1630, 2184–2352, 5657–6042 | **Extracted to `hooks/useSwarmLaunchController.js` but unused by TWM.**                                  |
| Workspace windows controller         | 3790–3943, many handlers        | **Extracted to `hooks/useWorkspaceWindowsController.js` but unused by TWM.**                             |
| Startup restore                      | 2095–2352                       | Large async block; distinct slice.                                                                       |
| Panel split / close / rename         | 3552–4183, many helpers         | Workspace mutation logic.                                                                                |
| Zed event handlers                   | 6123–6343                       | Distinct slice, mostly dispatches.                                                                       |
| Keyboard shortcuts                   | 5571–5655                       | Could move to a hook.                                                                                    |
| Layout sync + survivor dispatch      | 3313–3468, 4152–4183            | Orchestrates lifecycle bursts and survivor recovery.                                                     |
| Surface registry reconcile           | 3140–3195, 5075–5518            | Pizarra/browser surface bookkeeping.                                                                     |
| Render / JSX assembly                | 6428–7517                       | Long but mostly structural. `WorkspaceWindowTabBar` and `WorkspaceTerminalSurface` extracted but unused. |

## Split Validation (Seed Plan vs Reality)

### TerminalTTY.jsx seed split

| Proposed file                        | Verdict             | Notes                                                                                                                                                                                                         |
| ------------------------------------ | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TerminalEngine.js` (headless class) | TANGLED / HIGH-RISK | Feasible only after refs are decoupled. ~100 refs/state vars touch xterm, addons, socket, fit, resize, output. Start with a hook wrapper, not a class.                                                        |
| `TerminalRehydrationController.js`   | CLEAN-EXTRACT       | v2 snapshot + heldData logic is already a bounded block. Needs a clean event contract with TTY.                                                                                                               |
| `TerminalV2Session.js`               | CLEAN-EXTRACT       | Connection + subscribe + frame decoding is a clean boundary, but it must expose imperative start/stop methods to the thin view.                                                                               |
| `v2Graveyard.js`                     | KEEP / GROW         | Already exists and works. TTY should keep importing it.                                                                                                                                                       |
| `TerminalViewModel.js`               | TANGLED             | Status, focus, agent TUI state, settings, clipboard are not one concern. Clipboard/context menu are React UI; agent detection is output-time; settings come from props. Split into smaller slices.            |
| `TerminalResizeSync.js`              | TANGLED             | Fit/resize is deeply coupled to `termRef`, `wsRef`, `lastPtySizeRef`, and TUI-active flags. Extraction needs a controller object passed refs or a hook.                                                       |
| `TerminalTTY.jsx` (thin view)        | UNDER-SIZED         | The seed underestimates remaining view code. With output queue, clipboard, wheel, context menu, search, and lifecycle effects, the thin view will still be ~1500–2000 lines unless more slices are extracted. |

### TerminalWorkspacesManager.jsx seed split

| Proposed file                               | Verdict                      | Notes                                                                                                                    |
| ------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `WorkspaceTerminalOrchestrator.js`          | TANGLED                      | The orchestrator is exactly the problem. This file would re-absorb most of the logic unless it is broken further.        |
| `useWorkspaceWindowsController.js`          | ALREADY EXTRACTED BUT UNUSED | Must first delete TWM's inline window functions and wire the existing hook.                                              |
| `WorkspaceRestoreCoordinator.js`            | MISSING / IN-LINE            | Startup restore logic is inline at L2095–2352. A coordinator module should be created.                                   |
| `WorkspaceLayoutState.js`                   | TANGLED                      | State + reducers are scattered across 20+ `useState` calls. Extracting them requires consolidation or a reducer pattern. |
| `TerminalWorkspacesManager.jsx` (thin view) | UNDER-SIZED                  | Same issue as TTY: render is long, and many event handlers are view-layer.                                               |

## Hidden Couplings

1. **Refs vs callbacks vs state.** `TerminalTTY.jsx` has ~100 refs that are read inside `useCallback` closures. Extracting any slice requires passing either the refs themselves or getter functions, which breaks React lint rules and can cause stale closures. The safest path is to extract controllers that receive refs as an object, or convert groups of related refs into a single `useRef({...})` bag.
2. **`initialCommand` threads through every slice.** Renderer decisions, TUI detection, output filtering, paste, focus, rehydration, and startup restore all read `initialCommand`. It cannot be cleanly owned by one slice.
3. **`isEngineV2` flag is read in ~30 places.** Every extraction must preserve the v1/v2 branch behavior until v1 is deleted.
4. **TWM's `workspacesRef` is read inside closures across all slices.** Any extracted hook that mutates workspaces needs the same ref pattern or a reducer.
5. **`renderWorkspacePanel` is exported as a function component but is invoked as a plain function.** The existing extracted file is imported by no one; reviving it is low-risk but requires wiring props from TWM.
6. **Survivor recovery and layout-settled events are global window events.** Extracting recovery logic into a module is easy; making it testable without a browser `window` is harder.

## Hook-to-Class Feasibility

Converting `TerminalTTY`'s xterm lifecycle from a hook cluster into a headless `TerminalEngine` class is **possible but should be the last extraction**, not the first.

Recommended intermediate steps before a class:

1. Group related refs into domain objects (`rendererRefs`, `sessionRefs`, `viewportRefs`, `lifecycleRefs`).
2. Extract pure helper functions first (already mostly done).
3. Extract `useTerminalEngine()` hook that returns `{ boot, dispose, fit, resize, sendInput, ... }` while still using refs internally.
4. Only then consider a class if the hook proves too large.

The waveterm blueprint (`termwrap.ts` headless + `term.tsx` thin view) is the target architecture, but DevHub's current code has the engine and view fused at the ref level. A direct class rewrite in one PR is too risky.

## Test Safety Net per Slice

| Slice                                   | Guard tests                                                                                                              |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Pure helpers in TTY                     | `TerminalTTY.test.js` (5,413 lines of helper tests)                                                                      |
| WebGL/Canvas renderer                   | `TerminalTTY.xterm-webgl.test.jsx`                                                                                       |
| v2 connection / rehydration / graveyard | `TerminalTTY.v2.test.jsx`, `TerminalTTY.rehydration.test.jsx`, `v2Graveyard.test.js`                                     |
| Output queue / sync output              | Covered indirectly by v2 tests; needs dedicated unit tests before extraction                                             |
| TUI detection                           | `opencodeReadyMarker.test.js`, `kimiReadyMarker.test.js`, `agentTuiMetadata.test.js`                                     |
| Workspace state / persistence           | `TerminalWorkspacesManager.test.js`, `TerminalWorkspacesManager.workspaceWindows.test.js`                                |
| Startup restore                         | `TerminalWorkspacesManager.startupRestore.test.jsx`, `startupRestoreCoordinator.test.js`, `startupRestoreRunner.test.js` |
| V2 graveyard integration                | `TerminalWorkspacesManager.v2graveyard.test.jsx`                                                                         |
| Shortcuts                               | `TerminalWorkspacesManager.shortcuts.test.jsx`, `workspaceShortcuts.test.js`                                             |
| Right dock                              | `TerminalWorkspacesManager.right-dock.test.jsx`                                                                          |
| Swarm launch                            | `useSwarmLaunchController` tests, `swarmLaunchWorkspace.test.js`, `TerminalWorkspacesManager.split-layout.test.jsx`      |
| Survivor recovery                       | `legacyTerminalSurvivorRecovery.test.js`, `nativeLayoutSync.test.js`, `terminalLifecycleSync.test.js`                    |

## Recommended Extraction Order (Lowest-Risk First)

### TerminalTTY.jsx

1. **Delete native VTE stubs** — safe no-op collapse (~20 lines).
2. **Extract pure helper exports** to `lib/terminal/` or keep in a thin `TerminalTTY.helpers.js` (no behavior change).
3. **Extract `useTerminalOutputQueue`** — output throttling, backlog, synchronized output. Clean boundary, testable in isolation.
4. **Extract `useTerminalClipboard`** — paste, context menu, copy. React-only slice.
5. **Extract `useTerminalWheelRouter`** — wheel event routing decisions.
6. **Extract `useTerminalV2Session`** — connection, subscribe, frame decoding, rehydration controller integration.
7. **Extract `useTerminalRendererController`** — WebGL/Canvas attach/reattach/context-loss, still using refs.
8. **Extract `useTerminalViewportSync`** — fit, resize, layout-show recovery.
9. **Final**: thin `TerminalTTY.jsx` plus optional `TerminalEngine` class refactor.

### TerminalWorkspacesManager.jsx

1. **First, finish `terminal-workspace-componentize`**: wire the already-extracted `renderWorkspacePanel.jsx`, `useWorkspaceWindowsController.js`, `useRightDockController.js`, `WorkspaceWindowTabBar.jsx`, `WorkspaceTerminalSurface.jsx`, and delete duplicate inline code.
2. **Extract startup restore** into `WorkspaceRestoreCoordinator.js`.
3. **Extract swarm launch controller** and wire the existing `useSwarmLaunchController.js`.
4. **Extract Zed event handlers** into `useZedWorkspaceEvents` hook.
5. **Extract keyboard shortcuts** into `useTerminalWorkspaceShortcuts` hook.
6. **Consolidate workspace state** into a reducer (`WorkspaceLayoutState.js`) or keep split by concern.
7. **Final**: thin `TerminalWorkspacesManager.jsx`.

## Additional Concerns the Seed Missed

1. **Output queue / synchronized output (DEC 2026)** is a distinct, testable slice in TTY.
2. **Clipboard + context menu** are React UI concerns, not a view-model.
3. **Wheel routing** depends on TUI detection state and deserves its own slice.
4. **Native VTE stubs** are dead weight that can be removed immediately.
5. **`terminal-workspace-componentize` artifacts are orphaned** — the biggest TWM decomposition opportunity is not extracting new files but wiring existing ones.
6. **Startup restore in TWM** is ~250 lines of async orchestration that is not in the seed plan.
7. **Surface registry reconcile** for pizarra/browser surfaces is ~450 lines in TWM.
8. **`useWorkspaceWindowsController.js` exists in two versions**: the extracted file (simpler) and TWM's inline functions (more feature-complete). They must be reconciled, not duplicated.
9. **Legacy survivor recovery cannot be deleted until v1 panels are gone.** The seed assumed Phase 6 was complete; it is not.

## Existing Modules That Should Stay/Grow vs Be Consolidated

| Module                                    | Recommendation                                                                                                                                                               |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `v2Graveyard.js`                          | **Keep and grow.** Already the canonical hidden surface registry.                                                                                                            |
| `terminalScrollbackStore.js`              | **Keep.** Ring buffer is server-side; do not fold into TTY.                                                                                                                  |
| `oscCwdParser.js` / `shellIntegration.js` | **Keep.** Already small, server-side concerns.                                                                                                                               |
| `opencodeSessionRegistry.js`              | **Keep.** Session discovery is independent.                                                                                                                                  |
| `nativeLayoutSync.js`                     | **Keep but shrink.** Only layout-settled/window-visible dispatch should remain; survivor constants should move to `legacyTerminalSurvivorRecovery.js` or be deleted with v1. |
| `workspaceAnimProps.js`                   | **Keep.** Animation logic stays outside components.                                                                                                                          |
| `terminalRendererCapabilities.js`         | **Keep and absorb more.** Renderer mode decisions already live here; TTY should delegate more.                                                                               |
| `terminalRendererPreferences.js`          | **Keep.** Per-panel/ws renderer prefs.                                                                                                                                       |
| `terminalPanelBridge.js`                  | **Delete when v1 dies.** Bridge is redundant once v2 rehydration/graveyard covers all paths.                                                                                 |
| `terminalLifecycleSync.js`                | **Keep but shrink with v1.** Burst phases are tied to survivor recovery; v2 path needs fewer/no bursts.                                                                      |

## Approaches

### Approach A: Finish componentize first, then decompose TTY

- **Pros:** Reuses the already-extracted TWM modules; closes the known "extracted but unused" gap documented in error coverage; lower risk for TWM.
- **Cons:** Does not reduce TTY size immediately.
- **Effort:** Medium.

### Approach B: Decompose TTY first, then finish TWM componentize

- **Pros:** TTY is the larger file; reducing it first gives the biggest line-count win.
- **Cons:** TTY has the riskiest couplings; a failed extraction there blocks everything.
- **Effort:** High.

### Approach C: Parallel low-risk extractions in both files

- **Pros:** Fastest line-count reduction; each slice is a small commit.
- **Cons:** Harder to keep tests green across both files simultaneously; merge conflicts likely.
- **Effort:** Medium-High.

## Recommendation

**Approach A**, with one exception: start TTY by extracting the truly safe slices (output queue, clipboard, wheel router) in parallel with TWM componentize wiring. Do **not** attempt the `TerminalEngine` class until the ref surface is decoupled.

The proposal should:

1. Explicitly scope Phase 6 survivor-recovery deletion as **out-of-scope** until v1 panels are removed.
2. List `terminal-workspace-componentize` as a prerequisite / merged concern.
3. Make the first work unit "wire existing extracted TWM modules and delete duplicate inline code."
4. Require a test gate after every extraction step (existing tests must pass).
5. Cap each commit at one extraction to honor `force-chained` / `feature-branch-chain`.

## Risks

1. **Phase 6 deletion assumption is wrong.** Deleting survivor recovery now would regress v1 panels.
2. **`useWorkspaceWindowsController` drift.** The extracted hook is not the same as TWM's inline code; wiring it may change window-switch behavior.
3. **Ref extraction in TTY introduces stale closures.** Must use ref bags or imperative controller objects, not naive prop drilling.
4. **v1/v2 branch divergence.** Any extracted slice must preserve both paths; tests only cover v2 heavily.
5. **Orphaned componentize modules may have bit-rotted.** They need to be re-read and updated before TWM uses them.
6. **Size targets are aggressive.** Getting every file ≤ 1000 lines may require more slices than the seed proposed.

## Ready for Proposal

**Yes, with caveats.** The next phase must:

- Decide whether to subsume/complete `terminal-workspace-componentize` into `terminal-decompose`.
- Confirm that Phase 6 survivor-recovery deletion is deferred.
- Choose the first 2–3 extraction work units from the recommended order above.
- Define the exact ref-passing contract for TTY extractions before any code moves.
