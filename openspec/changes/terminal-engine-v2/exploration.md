# Exploration: terminal-engine-v2

## Current State

DevHub's terminal already lives in a **Tauri + Node sidecar + xterm.js** world. The seed's architectural decisions (stay on Tauri, stay on Node, xterm-only) are mostly _already true in production_:

- `vte-experimental` is disabled as a selectable renderer (`terminalRendererPreferences.js:26` `LEGACY_VTE_ENABLED = false` in production). The active renderer list is `['xterm', 'xterm-webgl', 'canvas']`.
- The "Option B" keep-alive model from `docs/28_Correccion_Paneles_Terminal_Negros_2026-07-01.md` is already committed: workspaces stay mounted with `opacity: 0` (`workspaceAnimProps.js:79-126`), GPU addons are **not** released when a workspace is hidden (`shouldReleaseWebglRendererOnLayoutHide` in `TerminalTTY.jsx:1754`), and the PTY sidecar keeps a 1-hour grace timer after the last socket closes (`ttyServer.js:139`, `ttyServer.js:1720`).
- The black-panel symptom is currently **papered over** by survivor recovery, not eliminated. `TerminalTTY.jsx` carries a build marker `2026-07-04-window-switch-tui-safe-recover-v2` and a large recovery apparatus:
  - `scheduleWorkspaceShowRecovery` (`TerminalTTY.jsx:4537`)
  - `scheduleBoundedForceRepaint` (`TerminalTTY.jsx:3788`)
  - `scheduleBoundedFitRepaint` (`TerminalTTY.jsx:3827`)
  - `scheduleBoundedGpuRecover` (`TerminalTTY.jsx:3903`)
  - `releaseWebglAddonForInactivePanel` (`TerminalTTY.jsx:3512`)
  - `handleWebglContextLoss` (`TerminalTTY.jsx:3694`)
  - `SURVIVOR_RECOVER_DELAYS_MS` in `nativeLayoutSync.js:36`
- The PTY sidecar (`ttyServer.js`) broadcasts filtered output directly as WebSocket `type: 'output'` messages. There is **no ring buffer**, **no pub/sub**, **no backend-side canonical termsize**, **no OSC 7 cwd parsing**, and **no `SerializeAddon`** rehydration cache.
- Session persistence already classifies sessions into `opencode-durable`, `pty-durable`, and `shell-ephemeral` (`sessionStore.js:93`) and `opencode` already supports `--session` relaunch.
- Pizarra canvas terminals use the same `TerminalTTY` component, either through `SharedTerminalSurfacePortal` when `isPizarraSharedViewEnabled()` is on (dev default) or as a direct `TerminalTTY` mount when off (prod default).

## Affected Areas

- `src/components/TerminalTTY.jsx` (8705 lines) — recovery code to delete, WebGL context-loss path to replace, rehydration/subscription logic to add behind `terminal-engine-v2` flag.
- `src/components/TerminalWorkspacesManager.jsx` (7899 lines) — orchestrates workspace/window switches and survivor recovery dispatches.
- `src/components/terminal/nativeLayoutSync.js` (426 lines) — survivor recovery constants and scheduling; VTE-specific native sync functions live here too.
- `src/lib/terminal/terminalLifecycleSync.js` (283 lines) — lifecycle burst phases tied to recovery.
- `src/lib/terminal/ttyServer.js` (1920 lines) — PTY host; must gain ring buffer, pub/sub, canonical termsize, OSC 7 cwd parsing, and explicit unsubscribe-vs-close semantics.
- `src/lib/terminal/sessionStore.js` (192 lines) — persisted session shape; may need ptyoffset/termsize fields for rehydration.
- `src/lib/terminal/terminalSessionFlush.js` (176 lines) — frontend persistence; may need to include v2 cache metadata.
- `src/components/terminal/SharedTerminalSurface.jsx` (368 lines) — singleton arbitration between workspace-dock and pizarra-canvas hosts; conflicts with a "graveyard" hidden-host model.
- `src/components/pizarra/CanvasTerminal.jsx` (827 lines) — still imports `nativeVteBridge` and has a `vte-experimental` branch that must be removed even though the path is unused.
- `src/lib/terminal/terminalPanelBridge.js` (28 lines) — currently used to pass buffered output across unmount/remount; overlaps with future rehydration.
- `src/lib/terminal/agentTuiMetadata.shared.js` (148 lines) and `ttyServer.js` — agent detection; must keep working when output moves from direct broadcast to ring-buffer events.
- `src-tauri/src/native_vte.rs` (2805 lines), `src/lib/terminal/nativeVteBridge.js` (235 lines), `src-tauri/linux-bin/gtk_vte_smoke.rs`, `src-tauri/Cargo.toml:41-47` VTE/native deps, `src-tauri/src/lib.rs:14,27-29,903-910` VTE command registrations.
- `src/components/TerminalTabsManager.jsx` (195 lines) — independent tab strip not part of the workspace panel model; needs explicit scope decision.
- `docs/25_Terminal_Renderer_Robusto_Roadmap.md`, `docs/28_Correccion_Paneles_Terminal_Negros_2026-07-01.md` — significant drift to fix.

## Approaches

Because the architectural decisions are **locked**, this exploration does not compare renderers, backends, or languages. The only viable approach is:

1. **Implement waveterm's contracts on top of the existing Tauri + Node stack.**
   - **Pros:** Eliminates the root cause of black panels (dispose/recreate cycle) instead of papering over it; reuses proven contracts; keeps the current build/runtime stack.
   - **Cons:** Large surface area; requires a long-lived feature flag and panel-by-panel migration; some recovery code must remain until the new path is proven.
   - **Effort:** High.

## Additional Coupling the Seed Missed

1. **`CanvasTerminal.jsx` still imports `nativeVteBridge`**. Lines 13-18 import `openNativeVtePanel`, `raiseNativeVtePanel`, etc., and line 113/135 keeps a `vte-experimental` branch. Phase 0 must clean this file, not just delete the VTE backend files.
2. **`SharedTerminalSurface` is gated by `isPizarraSharedViewEnabled()`**. In dev the singleton portal path is active; in production the direct `TerminalTTY` mount path is still active. A v2 graveyard/LRU model must account for both paths or the pizarra-shared-view rollout must be completed first.
3. **`terminalPanelBridge.js` buffers hidden output across unmount/remount**. With a ring buffer + rehydration, this bridge becomes redundant, but `TerminalTTY.jsx:2377` and `TerminalTTY.jsx:5553` still rely on it. Removing it requires replacing its semantics with the rehydration cache.
4. **`TerminalTabsManager.jsx` is not a workspace panel**. Each tab is an independent `TerminalTTY` with its own WebSocket. The LRU graveyard model does not naturally apply unless v2 explicitly includes it.
5. **`useWorkspaceWindowsController` does not manage terminal panels in separate Tauri webviews**. The V1/V2/V3 "windows" are in-app React layouts; `WebviewWindow` is only used for the right-dock browser. The seed's concern about cross-webview sidecar stream sharing is mostly a no-op for terminals.
6. **`native_browser.rs` uses GTK/WebKitGTK/JavaScriptCore**. Phase 0 cannot remove `gtk`, `webkit2gtk`, or `javascriptcore` from `Cargo.toml`; only `zoha-vte`, `cairo-rs`, and the explicit `glib` dependency (if unused elsewhere) can go.
7. **`ttyServer.js` auto-kills PTYs after the last socket closes**. The 1-hour grace timer (`ttyServer.js:1735`) means a hidden panel that stays hidden for >1 hour will lose its process. "Destroy-only-on-close" needs an explicit sidecar "unsubscribe but keep alive" message, not just a socket close.
8. **Agent detection uses server-side filtered output**. `ttyServer.js` runs `applyAgentTuiDetection` and `detectAgentState` on filtered output. If ring-buffer events ever move filtering to the client, detection breaks. Filtering must stay server-side.

## Dependency Chain Validation

The 9-phase order is **mostly correct**, with these refinements:

- **Phase 0 (VTE removal) is independent** and can be the first slice. Note the GTK/WebKitGTK caveat above.
- **Phase 1 (ring buffer + pub/sub) and Phase 2 (backend source of truth) are independent of each other** but both are prerequisites for Phase 3. They can be developed in parallel.
- **Phase 3 (two-tier rehydration) requires Phase 1 + Phase 2.** It needs both the ring buffer for deltas and the canonical termsize/OSC metadata.
- **Phase 4 (destroy-only-on-close) requires Phase 3.** Without rehydration, showing a hidden panel after the renderer was torn down would require the old recovery code again. It also needs a new sidecar unsubscribe API.
- **Phase 5 (context-loss→DOM + LRU) can be built alongside Phase 4** but must land before Phase 6.
- **Phase 6 (delete recovery code) must be the last implementation phase**, only after Phase 4/5 are stable in real Tauri builds.
- **Phase 7 (durable sessions) can happen any time after Phase 4.** Limiting scope to `opencode` is strongly recommended.
- **Phase 8 (doc cleanup) is final.**

Recommended order: `0 → (1 || 2) → 3 → (4 + 5) → 6 → 7 → 8`.

## Risks per Phase

- **Phase 0:** Removing `zoha-vte`/`cairo-rs`/`glib` and `native_vte.rs` is straightforward, but `lib.rs` command registrations must be removed carefully. `CanvasTerminal.jsx` VTE imports must also be removed. **Do not** remove `gtk`/`webkit2gtk`/`javascriptcore`.
- **Phase 1:** Switching from direct `output` events to `append` events requires a v2 subscriber path in the frontend while keeping the v1 path for non-v2 panels. Risk of duplicated output or missed output if both paths overlap. Detection/filtering must remain server-side.
- **Phase 2:** Making the backend the canonical source of termsize changes the resize handshake. The client currently sends `{ type: 'resize', cols, rows }` and the server applies it (`ttyServer.js:1690`). Moving authority to the server means the client requests a size and the server stores/applies it; initial mount race conditions are likely. OSC 7 cwd parsing depends on the user's shell emitting OSC 7; DevHub will need an injection strategy (env var, shell snippet, or wrapper).
- **Phase 3:** `xterm-addon-serialize` is not currently in `package.json`. Serializing after every 100 KiB processed may be CPU-heavy for busy terminals. Temp-resizing to the cached termsize during replay can flicker. `heldData` buffering delays live output until `loaded=true`; needs a timeout fallback.
- **Phase 4:** Without an explicit unsubscribe API, hiding a panel closes its WebSocket and starts the 1-hour auto-kill timer. The "graveyard" model conflicts with `SharedTerminalSurface`, which only allows one `TerminalTTY` per surfaceId. A hidden-host registry or separate surfaceId is needed.
- **Phase 5:** Per-terminal WebGL context-loss DOM fallback requires safe addon dispose/load. The LRU cap must distinguish "mounted visible", "mounted hidden (graveyard)", and "closed" states; evicting a hidden panel must not kill its PTY.
- **Phase 6:** Deleting survivor recovery before the new path is proven in installed Tauri builds will regress black panels. This should be gated by the v2 flag and only removed after e2e/QA sign-off.
- **Phase 7:** Hermes/Grok do not expose stable session ids. "Durable" sessions for them can only mean re-invoking the same command, which is not real durability. Scope should be `opencode` first.
- **Phase 8:** Docs 25/28 describe VTE as opt-in and Option B as committed, respectively. Updates must be careful not to contradict the current production state.

## Test Infrastructure

- **Unit/Integration:** `npm test` runs Jest 27.5.1 (`package.json:99`).
  - `src/components/__tests__/TerminalTTY.test.js` (5413 lines) — mostly pure helpers; will survive but needs new tests for v2 helpers.
  - `src/components/__tests__/TerminalTTY.xterm-webgl.test.jsx` — WebGL fallback tests.
  - `src/components/__tests__/TerminalTabsManager.test.js`, `TerminalTabsManager.motion.test.js`.
  - Many `TerminalWorkspacesManager.*.test.*` files.
  - `src/components/terminal/__tests__/nativeLayoutSync.test.js` (239 lines) — tests survivor recovery and VTE sync functions; will need updates as VTE/native code is removed.
  - `src/lib/terminal/__tests__/terminalLifecycleSync.test.js` (254 lines) — burst-phase tests.
  - `src/lib/terminal/__tests__/*` — session store, ttyServer, agent detection, etc.
  - `tests/unit/terminal-*` — docs/spec compliance tests.
- **E2E:** `npm run test:e2e` runs Playwright.
  - `tests/e2e/terminal-session-restore-post-reboot.spec.ts`
  - `tests/e2e/06_zed_open_terminal.spec.ts`
- **New tests needed:** ring buffer eviction, pub/sub subscribe/unsubscribe, OSC 7 parsing, rehydration replay order, canonical termsize, context-loss DOM fallback, LRU eviction, unsubscribe-does-not-kill-PTY.

## Open Questions for the Proposal

1. **LRU cap N:** Waveterm uses 10 _tabs_. DevHub splits can show multiple panels per workspace. Should N be global (e.g., 8-12 mounted xterm surfaces) or per-workspace? What is the initial value?
2. **Ring buffer size:** 2 MiB per session as in waveterm? Should the same cap apply to the `cache:term:full` snapshot, or is the snapshot independent?
3. **OSC 7 shell integration:** Inject only environment variables (e.g., `DEVHUB_TERMINAL_ID`) and rely on the user's shell, or ship per-shell RC snippets, or wrap the shell?
4. **Durable session scope:** `opencode` only for v2, with hermes/grok deferred? Or attempt best-effort synthesis for all agents?
5. **Pizarra canvas terminal:** In-scope for v2 from day one, or kept on the legacy path until the pizarra-shared-view rollout is complete?
6. **Feature flag shape:** Build-time `NEXT_PUBLIC_TERMINAL_ENGINE_V2` (panel creation chooses path) vs runtime per-panel flag? Panel-by-panel migration strongly suggests a runtime flag stored on the panel or workspace.

## Recommendation

Proceed to `sdd-propose`. The seed plan is directionally correct, but the proposal must:

- Make Phase 0 the first reviewable slice and explicitly call out the GTK/WebKitGTK retention.
- Keep Phase 1 and Phase 2 parallelizable.
- Treat Phase 3-5 as a single tightly-coupled design block rather than three fully independent deliveries.
- Defer Phase 6 until Phase 4/5 are verified in installed Tauri builds.
- Explicitly scope Phase 7 to `opencode` durable sessions and defer hermes/grok.
- Decide the six open questions above before task breakdown.

## Ready for Proposal

**Yes.** The codebase has been verified and the seed plan has been refined. The next phase should produce a proposal with explicit decisions on the open questions, a phased delivery plan, and a rollback strategy for each slice.
