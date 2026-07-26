# Tasks: terminal-load-performance

> **Status note (2026-07-22, rework):** the first implementation pass marked everything complete with fabricated measurements. After review, dangerous changes were reverted and PRs were reimplemented. This file reflects the **verified** state. Details per PR in `apply-progress.md`; final numbers pending manual runtime measurement (see "Pending measurements" at the bottom).

## Review Workload Forecast

- Estimated changed lines (all phases): large → **must chain**
- 400-line budget risk: **High** for PR5 (keep-alive)
- Chained PRs: **Yes** — one branch per PR, stacked in order
- **Deviation:** work currently sits uncommitted in one working tree; split into per-PR branches at commit time.

### Suggested chain

1. **PR1** — OpenSpec + transition/resize instrumentation + baseline (no behavior change)
2. **PR2** — Dev cold start (xterm prefetch at app-shell + electron-up compile warm)
3. **PR3** — Backend/prod cold start (parallel sidecar/probes, async store, non-blocking restore)
4. **PR4** — Mount storm (activate-then-keep-alive, drop connect defers)
5. **PR5** — Total keep-alive (pizarra + v2 + overlay + manager re-render isolation)
6. **PR6** — TUI scroll integrity (resize guards, viewport preserve, kill Ctrl+L, burst collapse)
7. **PR7** — Re-baseline + docs close-out

---

## PR1 — Instrumentation + baseline

### T1.1 — OpenSpec artifacts

- [x] `openspec/changes/terminal-load-performance/proposal.md`
- [x] `openspec/changes/terminal-load-performance/design.md`
- [x] `openspec/changes/terminal-load-performance/tasks.md`
- [ ] Register milestone + per-PR tasks in DevHub (MCP/CLI) — **blocked: DevHub MCP not connected in the coordinating session**

### T1.2 — Transition marks

- [x] Add `workspace-switch-start/end`, `pizarra-exit-start/end`, `terminal-remount` counter to `src/lib/terminal/startupPerfMarks.js`
- [x] Wire emitters: `useWorkspacePanelLifecycle.js` (switch), `SharedTerminalSurface.jsx` (pizarra exit), `useTerminalEngine.js` boot (remount counter)
- [x] Backend spawn/restore durations in `ttyLog` (`src/lib/terminal/ttyServer.js`, events `WS_CONN`/`RESTORE`)
- [x] Persist through existing `POST /api/terminal/perf`

### T1.3 — Resize/scroll counters

- [x] `terminal-resize-sent` counter with `{cols, rows, prevCols, prevRows, hidden, tuiActive}` — wired in `fitTerminalViewport` / `nudgeTerminalPtyResize` (the only two PTY resize senders; PR6)
- [x] `terminal-scroll-jump` counter on viewport change after reveal (`restoreTerminalViewportAfterReveal`)
- [x] Unit tests (`startupPerfMarks.test.js` 9/9, `terminalScrollIntegrity.test.js` 8/8)

### T1.4 — Baseline capture (requires human running the app)

- [ ] 5 dev cold starts (Windows) → record measures
- [ ] 2 packaged cold starts → record measures
- [ ] Transition matrix with TUI open: count redundant resizes + remounts per transition
- [ ] Save to `data/logs/startup-perf/tlp-baseline.json`; note in `apply-progress.md`

**Exit:** instrumentation landed and tested; runtime baseline **pending human**.

---

## PR2 — Dev cold start

### T2.1 — App-shell prefetch

- [x] `@xterm` prefetch at `src/App.js` mount before `project-ready` — **already existed** (`App.js:146-152`); verified, no change needed
- [x] Kill-switch `devhub_terminal_warm=off` respected; Tier contract intact (no `Terminal.open` off-route)
- [x] Tier1 sidecar warm before `project-ready` — also already existed (`App.js:151`)

### T2.2 — Dev-server compile warm

- [x] `electron-up.cjs`: fire-and-forget warm after `waitFor('Next UI')`, before Electron spawn — routes corrected to `/api/terminal/session` + `/` (`/terminales` does not exist server-side; SPA uses hash routing)
- [x] Verify `.next/cache` persistence: `clearStaleNextDevLock` only deletes `.next/dev/lock`, cache survives restarts
- [x] Documented: the 16 s import is a first-ever-run / post-invalidation Turbopack compile, not a per-boot cost; the dynamic client chunk can only be compiled by the browser (App-mount prefetch overlaps it with project fetch)

**Exit:** warm corrected; measurement pending human cold start.

---

## PR3 — Backend/prod cold start

### T3.1 — Electron boot parallelism

- [x] `desktop/electron/main.js`: `ensureSidecar()` in parallel with `createMainWindow()`
- [x] `desktop/electron/sidecar.js`: progressive backoff `[50,100,150,250,250,500,500,1000,1000,1000]` (~4.8 s budget; exhaustion only warns, never kills the sidecar)
- [ ] Smoke: packaged window paints immediately — **pending human**

### T3.2 — Parallel port probes

- [x] `src/lib/devhub/sidecarRuntime.js`: parallel probes with preference order + short-circuit (no waiting on hung ports)
- [x] Unit tests (4 new: preference, short-circuit, null, no unhandled rejections)

### T3.3 — Session store

- [x] `src/lib/terminal/sessionStore.js`: **sync default preserved** (durability contract), opt-in `{debounce:true}` coalescing, flush-on-exit hooks guarded against HMR listener stacking, tmp+rename atomicity intact
- [x] Regression: `ttyServer.restoreEphemeral.test.js` back to green (first pass broke it with async-by-default)

### T3.4 — Restore

- [x] `ttyServer.js` `restoreSessions()`: `createSession({skipSave})` → exactly **1 disk write** per restore run (tested); zombie deletes persist correctly. Parallel spawn dropped deliberately (sync API is a test contract; spawn cost is small vs disk IO)
- [x] `sidecar-backend/sessionSpawn.js`: memoized `resolveWindowsShell()`
- [x] Frontend `startupRestoreRunner`: priority by real `activeWorkspaceId` (wired from `WorkspaceRestoreCoordinator`); previous version sorted by a nonexistent panel prop
- [x] Tests: restoreEphemeral 9/9, startupRestoreCoordinator 5/5, startupRestoreRunner 8/8

**Exit:** green; packaged smoke pending human.

---

## PR4 — Mount storm

### T4.1 — Activate-then-keep-alive

- [x] `useActivatedWorkspaceIds.js` (new): first paint mounts only active workspace; first activation mounts; never unmounts after. `resolveRenderWorkspaceIds` renders the newly active workspace in the same commit
- [x] `WorkspaceRenderAssembly.jsx`: shell filter via the hook (first pass referenced an undefined variable → crash; reverted and reimplemented)
- [x] Tests: hook 6/6; inactive workspaces mount nothing until activated; `workspaceCloseRemount` suite updated to new semantics

### T4.2 — Connect defers

- [x] `shouldDeferTerminalConnectUntilViewportFitted`: visible panels with non-degenerate dimensions connect immediately (no 1800 ms defer); hidden/degenerate panels keep the defer
- [x] `waitForVisibleDimensions`: early-exit verified already present (`useTerminalViewportSync.js:110-112`)
- [x] Regression tests: TerminalTTY defer test added

**Exit:** green; first-paint mounts 1 workspace of terminals instead of N.

---

## PR5 — Total keep-alive

### T5.1 — Pizarra

- [x] Decision recorded: direct↔singleton remount **stays** (permanent-singleton reverts a deliberate design choice; hidden-direct risks two live WS per panel). Remount is now symptom-free: no overlay, no `connecting` state, immediate reconnect, live server-side reattach
- [ ] Portal re-target without any remount — **dropped by design decision** (see `apply-progress.md` PR5). pizarra-instant-enter follow-up: the remount still happens, but it is now _invisible_ — churn coalescing (A1), verified repaint retry (A2), retimed fades + Konva preload (A4) and the instant viewport ghost (A5) cover the remount window.

### T5.2 — V2 keep-alive on tab switch

- [x] `terminalKeepalivePolicy.js` + `shouldMountWorkspaceTerminal`: v2 panels stay mounted (hidden) like v1 when enabled
- [x] Graveyard demoted to memory-pressure valve / real closes

### T5.3 — Overlay + state persistence

- [x] `terminalConnectedOnceRegistry.js`: `hasConnectedOnce` persists per panelId across remounts (cap 200 FIFO, cleared on real panel close) → full-screen overlay only on true first boot; `isInitializing` branch also suppressed on remount
- [x] WebGL context retained across hide/show (pre-existing v1 behavior, now also on the v2 keep-alive path)
- [x] Kill-switch `devhub_terminal_keepalive=off`; WebKitGTK default off

### T5.4 — Manager re-render isolation

- [x] First pass moved `panelConnectionStateById` to a ref → stale badges; **reverted**. The equality guard in `setPanelConnectionStateById` already prevents no-op re-renders; deeper isolation (per-panel subscription) deemed not worth the refactor

**Exit:** green (policy 7/7, registry 4/4, graveyard suite extended, overlay test). Manual QA matrix pending human.

---

## PR6 — TUI scroll integrity

### T6.1 — Root-cause confirmation

- [x] Discovery: the zero-delta resize guard **already existed** in `fitTerminalViewport` / `nudgeTerminalPtyResize` (the only two PTY resize senders); first pass left telemetry and viewport-restore as dead code
- [ ] Counter-based confirmation in real runtime — pending human (needs perf flag + transition matrix)

### T6.2 — Resize guards

- [x] Guard verified present in both senders; `trackPtyResizeSent` telemetry wired (sent + suppressed-redundant, with `source`/`hidden`/`tuiActive` where reachable)
- [x] `useTerminalV2Session.js`: `lastPtySizeRef` reset on `onopen` → first resize after reconnect always re-syncs the server
- [x] Tests: zero-delta suppressed, first send passes, real delta flows, post-reconnect passes

### T6.3 — Viewport preservation

- [x] `restoreTerminalViewportAfterReveal` (new, pure): scrollback readers land back where they were on reveal; `terminal-scroll-jump` counter on real jumps; at-bottom users stay at bottom
- [x] Server Ctrl+L reattach redraw removed; client relies on existing snapshot/history replay paths — **visual TUI QA pending human**
- [ ] Collapse churn bursts `[80,180,340]` / `[120,180,340,500]` + 48-frame polling — **deferred** (with the guard, zero-delta resizes no longer reach the PTY; burst collapse is a separate risky refactor). Partially superseded 2026-07-25 by the sin-parpadeo gates (see apply-progress.md "Sin-parpadeo"): deferred bursts now re-evaluate skip conditions at fire time and stop at the first verified tick, and survivor/pizarra/OS-resume repaints are gated on geometry + GPU state, so clean transitions schedule ~0 nudges without collapsing the legacy timers

**Exit:** green (`terminalScrollIntegrity.test.js` 8/8). QA matrix pending human.

---

## PR7 — Re-baseline + close-out

- [ ] Full re-baseline (5 dev + 2 packaged + transition matrix) — pending human
- [x] `AGENTS.md` updated (keep-alive model + `devhub_terminal_keepalive` flag)
- [ ] Note `terminal-engine-v2` status (complete) in its pending docs — minor, not blocking
- [x] Honest `apply-progress.md` + `verify-report.md` (fabricated numbers removed; pre-existing failures documented)
- [x] Pre-existing test failure fixed: `useTerminalWorkspaceShowRecovery.test.js` mock ctx

---

## Definition of done (program)

- [ ] SLO table in proposal.md met or deviations documented — **pending manual measurement**
- [x] Kill-switches work (`devhub_terminal_warm`, `devhub_terminal_keepalive`)
- [x] WebKitGTK default does not enable total keep-alive
- [x] No agent TUI pre-spawn introduced
- [x] No test regressions vs HEAD (pre-existing failures documented in verify-report)
- [ ] Baseline vs final numbers published — pending human

## Pending measurements (human, with the app running)

1. 5 dev cold starts → `data/logs/startup-perf/tlp-baseline.json` + post-change numbers
2. 2 packaged cold starts
3. Transition matrix ×20 with TUIs open: redundant-resize counter = 0, scroll corruption = 0, remount counter stable
4. Smoke: v2 tab switch keeps panel mounted; `devhub_terminal_keepalive=off` rollback; pizarra exit without overlay
5. RSS before/after with keep-alive on
