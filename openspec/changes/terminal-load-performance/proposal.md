# Proposal: terminal-load-performance

## Intent

Cut **measured and perceived** terminal latency across the whole lifecycle — cold start (dev + packaged), first panel, workspace/window switches, pizarra enter/exit — and eliminate the **TUI scroll corruption** that happens during those transitions. Continues `startup-latency-reoptimization` (Phases 1–3 landed: perf marks, warm tiers, state prefetch).

## Why now

Measured baseline (`data/logs/startup-perf/latest.json`, 2026-07-22, Electron/Windows dev):

- `xterm-core-import` = **16.1 s** (cold Turbopack compile of `@xterm/*` + terminal route chunks) — dominant cold cost.
- `terminales → first-panel-interactive` = 16.3 s, while `interactive → ws-connected` = 63 ms and `ws → first-pty-byte` = 210 ms. **PTY spawn and WS are not the warm-path problem.**
- Warm tiers start at ~13.1 s (`project-ready`); users navigate to `/terminales` at ~3.7 s — warm is **too late**.

Runtime symptoms reported by operators:

1. Terminals take too long on first app load.
2. "Conectando…" overlay appears when switching workspace/window and when returning from pizarra — caused by real unmount/remount of `TerminalTTY` (pizarra direct↔singleton transition, `renderWorkspacePanel.jsx:642-693`; v2 tab-switch unmount, `renderWorkspacePanel.jsx:424-425`), which resets `hasConnectedOnce` (`TerminalTTY.helpers.js:81-88`).
3. **Scroll breaks** in terminals with TUIs open after workspace switch / pizarra transitions — suspected resize/SIGWINCH storms (`useTerminalLayoutChurnRecovery.js:795-802`, `useTerminalWorkspaceShowRecovery.js:498-797`, `useTerminalViewportSync.js:589-595`) and the forced Ctrl+L redraw 30 ms after reattach (`ttyServer.js:2078-2084`).

## Scope

### In scope

1. **Transition instrumentation**: workspace-switch / pizarra-exit marks, remount counter, resize-to-PTY counters `{cols, rows, delta, hidden, tuiActive}` (PR1).
2. **Dev cold start**: xterm prefetch at app-shell start, Turbopack compile warm from `electron-up.cjs`, cache persistence audit (PR2).
3. **Packaged/backend cold start**: sidecar parallel to window creation, parallel port probes, async coalesced `sessionStore`, non-blocking parallel `restoreSessions`, cached Windows shell resolution (PR3).
4. **Mount storm**: activate-then-keep-alive for inactive workspaces; remove connect defers for visible panels (PR4).
5. **Total keep-alive**: no `TerminalTTY` unmount on pizarra enter/exit or v2 tab switch; `hasConnectedOnce` survives; WebGL context retained; manager re-render isolation (PR5).
6. **TUI scroll integrity**: dimension-guarded resizes, no fit while hidden, viewport preservation, remove forced Ctrl+L, collapse churn bursts (PR6).
7. Re-baseline vs SLOs; close-out docs (PR7).

### Out of scope

- `terminal-engine-v2` feature work — it is **complete** (docs pending); this change consumes its contracts (graveyard, snapshot/replay, subscribe) as landed infrastructure.
- Swarm launch / director startup strategy.
- Bundle-splitting of the whole app shell (separate follow-up if metrics demand).
- Deps Waves C/D (Jest, majors) from the previous change — untouched here.
- Native VTE Tauri host (`alacritty_terminal_host.rs`) — separate path, not modified.

## Capabilities

### New capabilities

- `terminal-transition-marks`: perf marks/counters for workspace/pizarra transitions, remounts, and redundant resizes.
- `terminal-keepalive-policy`: total keep-alive model with `devhub_terminal_keepalive` kill-switch and WebKitGTK gate.
- `tui-scroll-integrity`: dimension-guarded resize + viewport preservation contract.

### Modified capabilities

- `terminal-warm-tiers`: prefetch moves from post-`project-ready` idle to app-shell start; adds dev-server compile warm.
- `workspace-layout-terminal-mount`: activate-then-keep-alive replaces eager all-workspace mount; pizarra no longer remounts surfaces.
- `session-restore`: backend restore becomes parallel + non-blocking; frontend queue becomes priority-based.

## Approach (summary)

Measure transitions first → warm earlier (dev) and parallelize boot (prod) → mount only what's visible → never unmount what's alive → guard resizes so TUIs keep their scroll. Every PR is independently shippable behind existing or new kill-switches, with marks re-baselined between PRs.

## Assumptions

1. `terminal-engine-v2` is done; its graveyard/snapshot contracts are stable and reusable.
2. Keep-alive memory cost is bounded by existing panel limits (6 Zed / 12 manual per workspace, `workspaceTerminalLimits.js`).
3. The v2 graveyard remains as a memory-pressure valve, not the normal hide path.
4. The 16 s import is a dev-only Turbopack compile cost; packaged builds do not pay it (verified by comparing dev vs packaged baselines in PR1).

## Affected areas

| Area                                                                                                     | Impact   | Description                                                  |
| -------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------ |
| `src/lib/terminal/startupPerfMarks.js`                                                                   | Modified | Transition marks + resize counters                           |
| `src/App.js`                                                                                             | Modified | Warm triggers move to app-shell start                        |
| `src/lib/terminal/terminalWarmPolicy.js`                                                                 | Modified | New scheduling; keep prefetch contract                       |
| `desktop/electron/main.js`, `sidecar.js`                                                                 | Modified | Sidecar parallel to window creation                          |
| `desktop/electron/scripts/electron-up.cjs`                                                               | Modified | Turbopack compile warm before Electron spawn                 |
| `src/lib/devhub/sidecarRuntime.js`, `src/app/api/terminal/session/route.js`                              | Modified | Parallel port probes                                         |
| `src/lib/terminal/sessionStore.js`                                                                       | Modified | Async coalesced saves                                        |
| `src/lib/terminal/ttyServer.js`                                                                          | Modified | Parallel non-blocking restore; remove Ctrl+L reattach redraw |
| `sidecar-backend/sessionSpawn.js`                                                                        | Modified | Cached Windows shell resolution                              |
| `WorkspaceRenderAssembly.jsx`, `renderWorkspacePanel.jsx`                                                | Modified | Activate-then-keep-alive; pizarra without remount            |
| `SharedTerminalSurface.jsx`, `SurfacePortal.jsx`                                                         | Modified | Portal re-target without React remount                       |
| `useTerminalViewportSync.js`, `useTerminalLayoutChurnRecovery.js`, `useTerminalWorkspaceShowRecovery.js` | Modified | Resize guards, burst collapse, viewport preservation         |
| `TerminalWorkspacesManager.jsx`                                                                          | Modified | connectionState re-render isolation                          |

## Risks

| Risk                                                  | Likelihood | Mitigation                                                                                  |
| ----------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------- |
| WebKitGTK crash from total keep-alive (offscreen GPU) | Med        | Linux gate like Tier 3; `devhub_terminal_keepalive=off`; packaged Linux QA before PR5 close |
| Memory growth (all terminals always mounted)          | Med        | Existing panel caps; RSS metric in PR5; v2 graveyard as pressure valve                      |
| App-shell jank from earlier warm                      | Med        | Prefetch is network/compile only, no `Terminal.open`; ≤10 % app-shell regression gate       |
| Parallel PTY restore degrades individual spawns       | Low        | Concurrency cap 4; restore never blocks the session endpoint                                |
| Resize guard drops legitimate resizes                 | Med        | Guard only skips zero-delta resizes; window ResizeObserver deltas still flow; PR6 tests     |
| Removing Ctrl+L leaves dirty TUI after reattach       | Low        | Replace with local xterm repaint; manual TUI QA matrix                                      |

## Rollback

- `localStorage.devhub_terminal_keepalive=off` → current unmount-on-hide behavior (PR5).
- `localStorage.devhub_terminal_warm=off` → disables all warm work (existing, PR2).
- PRs are chained but independently revertible; each lands behind flags with tests green.

## Success metrics (SLOs)

| Metric                                       | Baseline today                | Target                             |
| -------------------------------------------- | ----------------------------- | ---------------------------------- |
| Dev: `/terminales` → first-panel-interactive | ~16.3 s                       | ≤ 4 s                              |
| Dev: xterm import after app boot             | 16.1 s                        | ≤ 2 s                              |
| Pizarra exit → terminal usable               | full remount + overlay        | ≤ 150 ms, no overlay, no reconnect |
| Workspace tab switch (v2)                    | remount + overlay             | ≤ 100 ms, no overlay, no reconnect |
| TUI scroll corruption on transitions         | intermittent                  | 0 in QA matrix ×20                 |
| Redundant resize to PTY (no cols/rows delta) | occurs on transitions         | 0                                  |
| Packaged: launch → window visible            | sidecar serial (~6.5 s worst) | immediate window, sidecar parallel |
| WebKitGTK packaged crash rate                | ~0                            | stays ~0                           |

## Next

Review with human → PR1 (instrumentation + baseline) on a dedicated branch → chained PRs per `tasks.md`.
