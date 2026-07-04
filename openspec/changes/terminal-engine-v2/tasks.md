# Tasks: terminal-engine-v2

## Review Workload Forecast

Estimated changed lines: 3500–4500
400-line budget risk: High
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
Decision needed before apply: No

> Size exception pre-authorized; 9-phase change is accepted as large.

Per-phase changed lines (approximate): PR0 600, PR1 400, PR2 350, PR3 700, PR4 500, PR5 400, PR6 600, PR7 300, PR8 200.
Suggested split: 9 PRs, one per phase; PR1 and PR2 may be developed in parallel and both merge before PR3.

## Phase 0: VTE removal

- [x] 0.1 Delete `src-tauri/src/native_vte.rs`, `src-tauri/linux-bin/gtk_vte_smoke.rs`, `src/lib/terminal/nativeVteBridge.js`, `src/lib/terminal/nativeVteLayoutLifecycle.js`; drop `native:vte-smoke`; remove `zoha-vte`/`native_vte_*` commands from `Cargo.toml` and `src-tauri/src/lib.rs` (keep `gtk`/`webkit2gtk`/`javascriptcore`). Kept `cairo-rs`/`glib` because `native_browser.rs`/`native_window_host.rs` still need them. (L)
- [x] 0.2 Remove `vte-experimental` branches from `terminalRendererPreferences.js`, `TerminalTTY.jsx`, and `CanvasTerminal.jsx`; remove VTE native-sync helpers from `nativeLayoutSync.js` and `TerminalWorkspacesManager.jsx`; delete VTE tests. (L)

## Phase 1: Ring buffer + pub/sub

- [x] 1.1 Create `src/lib/terminal/terminalScrollbackStore.js` + tests: 2 MiB circular buffer, ptyOffset, append/subscribe/unsubscribe/snapshot. (M)
- [x] 1.2 Integrate store into `src/lib/terminal/ttyServer.js`: append output, broadcast `terminal:append` to v2 only, handle subscribe/unsubscribe without killing PTY; update `TerminalTTY.jsx` v2 to subscribe/render; add `ttyServer.v2.test.js`. (L)

## Phase 2: Backend source of truth

- [x] 2.1 Create `src/lib/terminal/oscCwdParser.js` + tests; inject `DEVHUB_SESSION_ID`/`DEVHUB_BLOCK_ID` env in `buildSessionSpawnConfig`; ship shell RC snippets that emit OSC 7. (M)
- [x] 2.2 Make `src/lib/terminal/ttyServer.js` the canonical termsize owner: store `cols`/`rows`, broadcast resize, send `ready` with termsize + cwd on subscribe; apply server termsize in `TerminalTTY.jsx` v2 and send resize requests; add concurrency tests. (M)

## Phase 3: Two-tier rehydration

- [x] 3.1 Add `xterm-addon-serialize@0.11.0` to `package.json` (matches existing `xterm`/`xterm-addon-*` family); store/serve `cache:term:full` snapshots in `ttyServer.js`; publish snapshots from `TerminalTTY.jsx` v2 after ≥100 KiB new output or 5 s, and on dispose/`beforeunload`. (M)
- [x] 3.2 Restore snapshot + delta + `heldData` queue in `TerminalTTY.jsx` v2 on mount; add rehydration-order tests and workspace-switch restore test. (L)

## Phase 4: Destroy-only-on-close

- [ ] 4.1 Create `src/lib/terminal/v2Graveyard.js` as dedicated hidden-surface registry; update `TerminalTTY.jsx` v2 unmount to send `unsubscribe`, skip dispose/GPU-release, and stash surface. (M)
- [ ] 4.2 Update `TerminalWorkspacesManager.jsx` to hide/restore/close surfaces via graveyard; ensure `ttyServer.js` unsubscribe does not start auto-kill. (L)

## Phase 5: Context-loss DOM fallback + LRU cap

- [ ] 5.1 Replace WebGL re-attach with degrade-to-DOM on context loss in `TerminalTTY.jsx` v2. (M)
- [ ] 5.2 Add global LRU cap N=12 in `v2Graveyard.js` and eviction trigger in `TerminalWorkspacesManager.jsx` (dispose oldest hidden xterm, keep PTY); add DOM-fallback and eviction tests. (M)

## Phase 6: Delete survivor recovery code

- [ ] 6.1 Remove `dispatchTerminalSurvivorRecover`, `SURVIVOR_RECOVER_DELAYS_MS`, `SWITCH_SURVIVOR_RECOVER_DELAYS_MS`, `scheduleSurvivorRecoverAfterClose` from `nativeLayoutSync.js` and `TerminalWorkspacesManager.jsx`. (M)
- [ ] 6.2 Remove `scheduleBoundedForceRepaint`, `scheduleBoundedFitRepaint`, `scheduleBoundedGpuRecover`, `handleSurvivorRecover`, lazy GPU release paths from `TerminalTTY.jsx`; delete `terminalPanelBridge.js` and call sites; remove v2 auto-kill grace timers from `ttyServer.js`. (L)

## Phase 7: opencode durable sessions

- [ ] 7.1 Create `src/lib/terminal/opencodeSessionRegistry.js`; extend `sessionStore.js` with durable fields; detect `opencode --session <id>` in `ttyServer.js`, mark `opencode-durable`, skip backend PTY restore on restart; frontend restore relaunches `opencode --session <id>`; add tests. (M)

## Phase 8: Doc cleanup

- [ ] 8.1 Update `docs/25_Terminal_Renderer_Robusto_Roadmap.md` and `docs/28_Correccion_Paneles_Terminal_Negros_2026-07-01.md` for xterm-only renderer and persistent PTY + rehydration; grep and fix stale VTE/grace-timer references. (M)
