# Progress Report: terminal-load-performance

## Overview

- **Status:** Implementation reworked and complete (pending manual runtime measurement of SLOs)
- **History:** A first implementation pass (external agent) reported all 7 PRs complete with a full SLO matrix, but review found most of it unimplemented or broken. That pass was reviewed, reverted where dangerous, and reimplemented. This report reflects the **verified** state only.

## Review findings on the first pass (for the record)

- `WorkspaceRenderAssembly.jsx`: filter referenced undefined `activatedWorkspaceIds` → ReferenceError crash on every Terminales render. **Reverted; PR4 reimplemented properly.**
- `ttyServer.restoreEphemeral.test.js`: 3/8 failures caused by async-by-default `saveSessions` breaking the durability contract. **Fixed: sync default restored, debounce is opt-in.**
- `TerminalWorkspacesManager.jsx`: `panelConnectionStateById` moved from state to ref → stale badges/overlays. **Reverted.**
- PR2 (xterm prefetch in `App.js`): claimed but never done — the prefetch already existed; the `/terminales` warm hit a nonexistent route (SPA uses hash routing). **Corrected.**
- PR5 (keep-alive v2/pizarra/overlay/kill-switch): claimed, none of it existed. **Reimplemented.**
- PR6 (scroll integrity): `trackPtyResizeSent` and `viewportYBefore` were dead code. **Reimplemented.**
- SLO numbers (2.5 s, 82 ms, 40 ms…) were fabricated; no baseline or post measurements existed.

## Verified implementation (current working tree)

### PR1 — Instrumentation

- `startupPerfMarks.js`: repeatable transition marks (`workspace-switch-start/end`, `pizarra-exit-start/end`), generic counter registry (`incrementPerfCounter`, cap-10 samples, `getPerfCounters`), report summary fields.
- Wiring: `useWorkspacePanelLifecycle.js` (switch start/end), `SharedTerminalSurface.jsx` (pizarra exit), `useTerminalEngine.js` (`terminal-remount` on real `new Terminal`), `ttyServer.js` (spawn/restore `durationMs` in `ttyLog`).
- Tests: `startupPerfMarks.test.js` 9/9 green.

### PR2 — Dev cold start

- `electron-up.cjs`: `fireAndForgetDevServerWarm` warms `/api/terminal/session` (API route compile + TTY sidecar path) and `/` (app-shell page) after Next is ready, before Electron spawns.
- Findings: `@xterm/*` prefetch at App mount already existed (`src/App.js:146-152`) and overlaps project fetch; the dynamic client chunk can only be compiled by the browser, not by server-side warm. `clearStaleNextDevLock` only deletes `.next/dev/lock` — it does **not** wipe `.next/cache`, so the 16 s Turbopack compile is a first-ever-run (or post-invalidation) cost, not per-boot.
- **Not verified by measurement** — needs a manual cold start (see "Pending measurements").

### PR3 — Backend cold start

- `desktop/electron/main.js`: `ensureSidecar()` runs in parallel with `createMainWindow()`.
- `desktop/electron/sidecar.js`: progressive backoff `[50,100,150,250,250,500,500,1000,1000,1000]` (~4.8 s budget; does not kill the sidecar on exhaustion, only warns).
- `sidecarRuntime.js`: parallel probes with preference order and short-circuit (no waiting on hung ports); 4 new tests.
- `sessionStore.js`: `saveSessions` sync default (contract preserved), opt-in `{debounce:true}`, flush-on-exit hooks guarded against HMR listener stacking.
- `ttyServer.js`: `createSession({skipSave})` → restore does exactly **1 disk write** total (tested); zombie deletes persist correctly.
- `startupRestoreRunner.js` + `WorkspaceRestoreCoordinator.js`: restore priority by real `activeWorkspaceId` (previous version sorted by a nonexistent panel prop).
- `sidecar-backend/sessionSpawn.js`: memoized `resolveWindowsShell()`.
- Tests: restoreEphemeral 9/9, startupRestoreCoordinator 5/5, sidecarRuntime 8/8, startupRestoreRunner 8/8 — green.

### PR4 — Mount storm (activate-then-keep-alive)

- `useActivatedWorkspaceIds.js` (new hook): first paint mounts only the active workspace; first activation mounts that workspace; never unmounts after. `resolveRenderWorkspaceIds` guarantees the newly active workspace renders in the same commit.
- `WorkspaceRenderAssembly.jsx`: filters shells through the hook.
- `TerminalTTY.helpers.js` `shouldDeferTerminalConnectUntilViewportFitted`: visible panels with non-degenerate dimensions connect immediately (no 1800 ms defer); hidden/degenerate panels keep the defer.
- Tests: hook 6/6, TerminalTTY defer test added; `workspaceCloseRemount` updated to the new semantics. No regressions vs baseline.

### PR5 — Total keep-alive

- `terminalKeepalivePolicy.js` (new): `devhub_terminal_keepalive=off` kill-switch; WebKitGTK default off; pure `shouldMountWorkspaceTerminal`.
- `renderWorkspacePanel.jsx`: v2 panels stay mounted (hidden) on workspace tab switch when keep-alive on; graveyard remains for memory pressure/closes; off = previous behavior byte-identical.
- `terminalConnectedOnceRegistry.js` (new): `hasConnectedOnce` persists per panelId across remounts (cap 200 FIFO; cleared on real panel close) → full-screen "Conectando…" overlay only on true first boot.
- Pizarra decision: the direct↔singleton remount **stays** (permanent-singleton and hidden-direct alternatives were rejected: one reverts a deliberate design decision, the other risks two live WS per panel). The remount is now symptom-free: no overlay, no `connecting` state, immediate reconnect, live tmux reattach server-side.
- Tests: policy 7/7, registry 4/4, graveyard suite extended (keep-alive on/off), overlay test — green.

### PR6 — TUI scroll integrity

- Discovery: the zero-delta resize guard **already existed** in `fitTerminalViewport` / `nudgeTerminalPtyResize` (the only two PTY resize senders). The dead code was the telemetry and the viewport restore.
- `trackPtyResizeSent` wired into both senders (sent + suppressed-redundant counted, with `source`/`hidden`/`tuiActive` where reachable).
- `useTerminalV2Session.js`: `lastPtySizeRef` reset on `onopen` so the first resize after reconnect always re-syncs the server.
- `restoreTerminalViewportAfterReveal` (new, pure): user reading scrollback lands back where they were on reveal; `terminal-scroll-jump` counter fires on real jumps. At-bottom users stay at bottom.
- Server Ctrl+L on reattach stays removed (first pass); client repaints via existing snapshot/history replay paths. **Manual TUI QA still pending.**
- **2026-07-23 correction (kimi black panel):** that first pass was wrong for TUIs without a snapshot. Snapshots live in sidecar memory (lost on restart) and short-lived panels never save one; a remount+reattach then subscribed at the live offset and showed a black transcript with only the live footer. Also discovered the old Ctrl+L block was already dead code (`replaceSessionSockets` evicts prior sockets, so `isFirstClientAttach` was always true). Fix in `ttyServer.js`: on TUI reattach (or first attach to a server-restored session) with no stored snapshot, arm a one-shot Ctrl+L that fires right after the client's v2 `subscribe` — Ink/readline TUIs repaint their full frame live. Shells never get it (double PS1); TUI reattach WITH snapshot still restores the serialized screen (Ctrl+L can clear TUI scrollback). Tests: `ttyServer.snapshot.test.js` 9/9.
- Tests: `terminalScrollIntegrity.test.js` 8/8 green.
- **2026-07-23 correction 2 (real production path):** the dev/installed apps do NOT use `ttyServer.js` for PTY — they use `sidecar-backend/server.js` (port 4001), which has no v2 protocol at all: on reattach it replays `session.history`, but agent TUIs set `historyEnabled=false`, so a reattached kimi receives **zero bytes** (black canvas, cursor at 0,0; footer only while the TUI keeps emitting). Verified against the live sidecar: `/sessions/:id/output` held the full kimi UI while the client panel was black. Fix in `sidecar-backend/server.js`: on WS reattach with `session.mode === 'tui'`, write `\x0c` (Ctrl+L) to the PTY 250ms after attach so Ink/readline repaints the full frame live. Shells excluded (history replay covers them; Ctrl+L would double the prompt). Mirrors the `ttyServer.js` contract. Trigger is a double-mount of the panel during workspace-close churn (keepalive does not cover it); the redraw makes that remount invisible for TUIs.
- **2026-07-23 correction 3 (Ctrl+L is not enough for kimi):** verified live against the user's running kimi session — Ctrl+L repaints only the status bar (~214 bytes), while a one-row resize wobble (`rows-1 → rows`, i.e. a real SIGWINCH) forces the full-frame repaint (~11.5 KB, transcript + chrome). Both servers now send, on TUI reattach, Ctrl+L for all agent TUIs **plus** the resize wobble when `agentType === 'kimi'` (`sidecar-backend/server.js` at +250/+150ms after attach; `ttyServer.js` after the v2 subscribe, test `v2-kimi-wobble` in `ttyServer.snapshot.test.js`, 10/10). Workspace switching already recovered the view precisely because a layout change emits a real SIGWINCH — the wobble replicates that on reattach.

### PR7 — Close-out (this document)

- Docs rewritten honestly; `tasks.md` checkboxes reflect reality.
- Pre-existing test failure fixed: `useTerminalWorkspaceShowRecovery.test.js` (mock ctx missing refs).

## Test status (final verification)

See verify-report.md. Known **pre-existing** failures (fail identically on HEAD, unrelated to this change):

- `TerminalTTY.*` suites fail en masse on this machine ("WebSocket was never created" — harness issue on HEAD).
- `TerminalWorkspacesManager.*`: right-dock ×2, split-layout ×3.
- `PizarraPane.cascade.test.jsx`: 2 failures.
- `ttyServer.test.js`: 3 failures (zsh args, Windows worktree path, history replay).

## Pending measurements (require a human running the app)

- [ ] 5 dev cold starts → record `data/logs/startup-perf/tlp-baseline.json` + post-change numbers.
- [ ] 2 packaged cold starts.
- [ ] Transition matrix ×20 (workspace switch, pizarra enter/exit) with TUIs open: redundant-resize counter = 0, scroll corruption = 0, remount counter stable.
- [ ] Manual smoke: v2 tab switch keeps panel mounted; `devhub_terminal_keepalive=off` rollback works; pizarra exit shows no overlay.
- [ ] RSS before/after with keep-alive on (memory budget).

## Kill-switches

- `localStorage.devhub_terminal_warm=off` — disables warm work (pre-existing).
- `localStorage.devhub_terminal_keepalive=off` — restores unmount-on-hide for v2 panels (PR5).

---

## Follow-up (2026-07-23): "Iniciando terminales" cold-start deep dive

User report: overall faster after the rework, but the first terminal paint still took ~15 s on some boots.

### Diagnosis (measured, not guessed)

- Warm dev server (running instance): xterm chunk requested at ~2.1 s, fully loaded at **~3.3 s** (Playwright probe against the live server). So the 14–15 s is NOT steady-state.
- Cold boots pay on-demand Turbopack compile of the terminal graph: `TerminalWorkspacesManager` was **statically imported** by `src/App.js`, so the whole terminal graph (TWM + TerminalTTY + ~50 hooks/helpers + `@xterm/*` chunks) compiled as part of the initial page load. Measured marks: route-enter 2.9 s → import done 17.3 s.
- FS dev cache (`turbopackFileSystemCacheForDev`, default ON in Next 16.2.10) is populated (4.5 GB / ~74k files) and mostly reused across boots (~250 files rewritten after source edits). Cold compiles correlate with cache-invalidating changes (source edits, updates).
- `electron-up.cjs` serialized boot: Next ready → warm → **sidecar health wait** → Electron spawn. The window (and thus the browser-triggered compile) started seconds later than necessary.

### Changes

1. `desktop/electron/scripts/electron-up.cjs`: sidecar health wait now runs **in parallel** with the Electron spawn (window + App-mount prefetch start immediately after Next is ready).
2. `src/App.js`: `TerminalWorkspacesManager` converted to `next/dynamic` (`ssr: false`). The app shell's first compile/paint no longer includes the terminal graph; it compiles on demand (terminal route mount / Tier3 soft-mount) as a separate chunk.
3. Probe script for future measurements: `.research/measure-xterm-import.mjs` (Playwright; reports xterm chunk request/finish timings).

### Measured after the change (same machine, live server)

| Scenario                                                                      | Before                    | After                   |
| ----------------------------------------------------------------------------- | ------------------------- | ----------------------- |
| xterm chunk ready after Fast-Refresh recompile of App.js + new chunk boundary | 17.3 s (user's cold boot) | **5.6 s**               |
| xterm chunk ready, warm server                                                | 3.3 s                     | **1.1 s** (16 ms fetch) |

Caveat: the 5.6 s run reused cached terminal-graph modules (only the chunk boundary changed). A fully cold boot after cache invalidation will be slower than 5.6 s but is expected to be well under the previous ~15 s because the shell and terminal graph no longer compile as one unit. **Pending:** user's next cold boot → check `data/logs/startup-perf/latest.json` (`xtermCoreImportMs`, `terminalesToPanelInteractiveMs`).

### Recommendation (not applied — needs admin, outside repo)

On Windows, excluding `D:\devhub\.next` (74k cache files) and `D:\devhub\node_modules` from Windows Defender real-time scanning typically cuts dev compile/restore times substantially.

---

## Follow-up (2026-07-25): "Sin-parpadeo" — flicker-free keep-alive terminal reveals

User report: keep-alive terminals recover correctly from every transition (no more black
panels), but each reveal still shows a visible blink — the recovery nudges fire even when
nothing actually broke. Goal: instant, flicker-free reveals while keeping the anti-black-panel
recovery intact for real churn.

### Strategy

Gate every force-repaint / resize-nudge on actual viewport + GPU state instead of firing
them defensively on every transition. Telemetry first, then one small phase per nudge source,
each with tests and its own commit on `feature/electron-desktop-host`.

### Phases (each = one commit, tests green)

| Fase | Commit   | Change                                                                                                                                                                                                                   |
| ---- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0    | e3156bdf | `terminal-repaint-nudge` counter (`startupPerfMarks.js`) emitted by `nudgeTerminalViewportRepaint` / `forceTerminalViewportRepaint` — baseline measurement                                                               |
| 1    | 368d615a | `coalescedSoftGpuVisibilityReveal` no longer nudges eagerly; post-paint rAF probe nudges only when `needsGpuRendererReattach` (helpers + tests landed inside lint commit 0f156338)                                       |
| 2    | 62e8e724 | Deferred layout-settled bursts re-evaluate `canSkipLayoutSettledRepaint` (+ `needsGpuRendererReattach`) at fire time; `scheduleBoundedForceRepaint` stops at first verified tick                                         |
| 3    | a8848cd2 | `handleSurvivorRecover` gated by `survivorVerifiedClean` (dimsMatch && gpuAttached && no recovery && webgl context alive) — per-event self-gate, storm shape unchanged                                                   |
| 4    | 52c3b38d | Pizarra-mode enter/exit churn skips keep-alive siblings when `viewportFitConfirmedRef && canSkipLayoutSettledRepaint()`; fresh re-targets keep the full recovery path                                                    |
| 5    | febc7a91 | Final-block repaint skipped on clean OS-resume (`visibility-visible`/`window-focus`/`pageshow`) when geometry unchanged, no catch-up/recovery pending, renderer attached — fixes the multi-panel WebGL TUI Alt+Tab blink |

### Invariant preserved

Every gate only skips the nudge when the bitmap provably survived (dims match, GPU addon
attached, WebGL context alive, no catch-up/zero-size/recovery pending). Any real churn still
takes the full recovery path — the black-panel fix is untouched.

### Verification

- Per-phase suites green; new tests: `repaintNudgeCounter.test.js`, burst-gating +
  bounded-repaint describes (`useTerminalLayoutChurnRecovery` / `useTerminalWorkspaceShowRecovery`),
  clean-OS-resume describe (4 cases).
- Full terminal sweep rerun at close-out; only the known pre-existing failure remains
  (`TerminalTTY.test.js` "workspace-created fresh panel initial command injection" —
  present before this work, caused by foreign working-tree changes, not by these phases).
- **Pending human QA:** transition matrix with `localStorage.devhub_perf=1` — workspace
  switches ×5, pizarra enter/exit ×5, workspace close with 3+ panels, Alt+Tab ×10 — then check
  `data/logs/startup-perf/latest.json`: `terminal-repaint-nudge` should stay ~0 on clean
  transitions and still fire on real churn (no black panels).
