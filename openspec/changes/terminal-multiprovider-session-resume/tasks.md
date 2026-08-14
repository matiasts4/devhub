# Tasks: Terminal Multiprovider Session Resume

> Builds on `terminal-session-restore-post-reboot` (Phases 1–6 applied). Branch: current working branch.
> **Resuming this work? Read `IMPLEMENTATION-NOTES.md` first** — as-built architecture, invariants, failure-mode map, diagnostics and verification harness (covers phases 6–9 field lessons).

## Phase 1: Session catalog (scanners + routes + adapters)

- [x] 1.1 `src/lib/agentSessions/sessionDirScanners.js` — kimi/grok fs scanners, qoder CLI-list scanner, codex best-effort scanner; never-throw, `homeDir` override for tests
- [x] 1.2 `src/lib/agentSessions/sessionsRouteHandler.js` + routes `src/app/api/{kimi,grok,codex,qoder}/sessions/route.js` (opencode-route contract: timeout, envelope, dedupe, `?cwd=`, cap)
- [x] 1.3 Adapters: kimi/grok durable; codex/qoder durable; `buildResumeCommand` + `buildContinueCommand`; `getResumableSessionAdapters()` returns all durable providers
- [x] 1.4 Tests: scanners (tmp fixtures), routes (success/empty/malformed/cwd/cap), adapters (resume/continue/dedupe)

## Phase 2: Per-panel session-id binding

- [x] 2.1 Pre-assign `grok --session-id <uuid>` / `qodercli --session-id <id>` in launch presets (`WorkspaceTerminalSetupModal`, Grid Launcher)
- [x] 2.2 `src/lib/terminal/agentSessionBinder.js` — spawn-time fs correlation (kimi, codex) → `<provider>-session-detected` WS event + `agentSessionId` in sessionStore
- [x] 2.3 Frontend: generalize `opencode-session-detected` handling (`useWorkspaceEventBridge.js`, `terminalSessionFlush.js`) to all providers; grok id regex in `agentTuiMetadata.shared.js`
- [x] 2.4 Tests: binder correlation, pre-assign command building, frontend normalization

## Phase 3: Restore pipeline generalization

- [x] 3.1 `restorePolicyResolver.js` — kinds kimi/grok/codex/qoder; per-provider id extraction; provider-aware `resolveTerminalInjectCommand`
- [x] 3.2 `restorePreferences.js` — schema `{opencode,kimi,grok,codex,qoder,swarm,generic}` + `restoreOnReboot` (default true); back-compatible read
- [x] 3.3 `startupRestoreCoordinator.js` — `RESUME_AGENT_SESSION` action (provider + id); fallbacks: cwd discovery → continue → relaunch
- [x] 3.4 `startupRestoreRunner.js` — provider-built relaunch commands; master-switch short-circuit; single-inject orchestration preserved
- [x] 3.5 Swarm post-reboot fix — runtime snapshot lists live tmux sessions; reattach only when alive; else policy-gated terminated/suspended
- [x] 3.6 Tests: resolver kinds, prefs migration + master flag, plan per provider, runner commands, swarm-without-tmux

## Phase 4: Settings modal

- [x] 4.1 `TerminalRestoreSettingsModal.jsx` RestoreSection — master switch + extended per-kind selects + copy
- [x] 4.2 `TerminalSettingsSection.jsx` — extended kinds in Ajustes block
- [x] 4.3 `TerminalSettingsModal.jsx` (suspended panel) — provider label + adapter-built resume CTA
- [x] 4.4 Tests: modal suites

## Phase 5: Verify

- [x] 5.1 All targeted Jest suites green — consolidated run: 1329 passed / 19 failed, identical to the pre-change baseline (Windows/node-pty env failures in `ttyServer*`, `sessionStore`, `agentHooks`; verified with `git stash` comparison)
- [ ] 5.2 Manual smoke: kimi panel → app restart → conversation resumed; grok panel idem; master off → nothing restored (requires a real app restart — pending on the user)
- [x] 5.3 `graphify update .`

## Phase 6: Production hardening + restore diagnostics (2026-07-26, post field test)

Root causes found after the first installed-app test: packaged sidecar lazy-imported the ESM binder from a non-existent `src/` path (silent `.catch(() => null)` → binder disabled in production); sidecar had no file logging at all; client restore trail lived only in sessionStorage (lost on restart).

- [x] 6.1 `sidecar-backend/agentSessionBinder.cjs` — CJS twin statically required by `sidecar-backend/server.js` (loud log on require failure); fixes the packaged-binder bug
- [x] 6.2 `sidecar-backend/sidecarLog.cjs` — sidecar JSONL file logging to `$DEVHUB_HOME/logs/sidecar-terminal.jsonl` (12 wired events, 2MB rotation)
- [x] 6.3 `src/app/api/terminal/restore-log/route.js` + `src/lib/terminal/restoreDiagnostics.js` — client restore events persisted to `<logs>/terminal-restore.jsonl` (batch + sendBeacon); `logTerminalSession` now forwards everything
- [x] 6.4 Instrumentation: binder lifecycle (ttyLog + sidecar), `provider-session-detected`, `agent-run-persisted`, `flush-terminal-persistence`, `restore-prefs-read`, `startup-restore-dispatch`
- [x] 6.5 Tests: 4 new suites (27 tests) green; touched areas green; pre-existing Windows failures re-verified via git stash
- [x] 6.6 Dev-mode verification loop with real logs (task 5.2 fast path). Root cause found via `terminal-restore.jsonl`: `normalizeWorkspaceWindows` adopted the stale persisted window columns (`initialCommand: null`) over the fresher workspace tree at hydration, wiping every resume command at boot → plan `terminated/no-runtime-evidence`. Fixed with a per-panel ws↔window merge in BOTH copies (`src/components/terminal/models/workspaceStateModel.js` — the live import — and `src/components/terminal/utils/panelHelpers.js`). Verified end-to-end in dev (sidecar :4001 + Next :3100, seeded A2-shape localStorage): plan `resume-agent-session` for kimi (`agent-session-resume-needed`), grok/qoder (`agent-session-continue-fallback`), codex (`agent-session-resume-needed`). Regression tests: `src/components/terminal/models/__tests__/workspaceStateModel.windows.test.js` + 2 cases in `src/components/__tests__/panelHelpers.test.js`
- [x] 6.7 Rebuild installer + installed-app verification (0.1.7: kimi resume verified by the user in the installed app)

## Phase 7: Typed-launch binder support for qodercli/grok (2026-07-27)

Field test after 0.1.7: kimi resumed, but typing `qodercli`/`grok` by hand in a shell panel never persisted a resume command — the binder only knew kimi/codex scanners, and the sidecar only attempted binding for those types.

- [x] 7.1 Session formats verified on disk: qoder `~/.qoder/projects/<slug>/<uuid>/state.json` (`workspaceDirectories` exact-match, resume `qodercli --resume <uuid>`); grok `~/.grok/sessions/<encodeURIComponent(cwd)>/<uuid>/summary.json` (`info.cwd` exact-match, resume `grok --resume <uuid>`)
- [x] 7.2 `findNewQoderSession` + `findNewGrokSession` scanners added to `src/lib/terminal/agentSessionBinder.js` and the CJS twin `sidecar-backend/agentSessionBinder.cjs`; registered as `qodercli`/`grok`
- [x] 7.3 Wiring: `AGENT_SESSION_BINDABLE_TYPES = {kimi, codex, grok, qodercli}` in both `src/lib/terminal/ttyServer.js` and `sidecar-backend/server.js`; unified typed-launch branch (explicit id → broadcast, else binder) incl. the qodercli TUI-output detection path
- [x] 7.4 Grok late-creation fix: grok only writes its session dir after the FIRST user prompt (probe-verified: dir appears ~1s after the prompt, never at TUI boot), so a 30s one-shot binder missed it whenever the user waited >30s. `sidecar-backend/server.js` now re-arms `session._agentSessionBinderStarted` on `timeout` settle so the next input re-triggers the binder (ESM ttyServer already re-armed via the 32s in-flight marker reset)
- [x] 7.5 Binder tests extended (qoder/grok fixtures: unique/ambiguous/no-cwd/stale/dir-name fallback, typed-launch polling); 37/37 green, sidecar parity suite green, wide suites = Windows baseline
- [x] 7.6 Dev e2e verified against real CLIs (`.research/e2e_bind_check.cjs`): typed `qodercli` → bound in 6s → persisted `qodercli --resume 06a32125-…`; typed `grok` + first prompt → bound → persisted `grok --resume 019fa478-…`. Reboot-cycle: full dev-stack restart with grok state → hydration reads the resume command → plan `resume-agent-session` (sessionKind grok) → sidecar input `grok --resume 019fa478-…` dispatched into the fresh pty
- [ ] 7.7 Rebuild installer (0.1.8) + installed-app verification for qodercli/grok typed launches

### Harness gotchas worth remembering (dev e2e)

- The sidecar keeps pty sessions alive across page reloads, so a "clean shell" localStorage seed does NOT give a clean shell — restart the dev sidecar (`POST :4001/shutdown` + relaunch) before each typed-launch bind check or the typed CLI lands inside the previous TUI.
- `e2e_seed_state.cjs` argv[2]: pass `none` for a null initialCommand (empty string falls back to the kimi default).

## Phase 8: Boot-race fix — resume lost when the backend is slow (2026-07-27, post 0.1.8 field test)

Field test after 0.1.8: binder + dispatch chain verified green, but on a real app restart the planner dispatched the resume (18:41:48) while the terminal backend took ~83s to accept connections. Sockets flapped pre-`ready`; when the ptys finally came alive (empty shells) the planner degraded to `reattach-live-terminal` (`alive-without-sockets`) and the client latched the command as sent — resume silently dropped. Client log window showed ZERO `initial-command-sent/skipped/blocked` events (silent gates).

Root causes (three independent latches, all raced the real injection):

1. `resolveConnectInitialCommandState` reconnect branch latched `hasSentInitialCommand = Boolean(dispatched) || Boolean(initialCommand)` on ANY reconnect — even when no socket had ever reached `ready`, so the command provably never reached a PTY. Fixed with a `readyEverReceived` gate (`TerminalTTY.helpers.js`): pre-ready flapping now clears the stale lifecycle and retries as fresh.
2. The `devhub:panel-startup-reattach` handler latched unconditionally on the planner's say-so. Right after a cold boot every "alive" PTY is an empty shell created by the panel's own reconnect attempts, so the latch killed the pending resume. Fixed with `shouldDeferStartupReattachLatch` (`useTerminalInitialCommandLifecycle.js`): latch only with proof of a live/dispatched session (dispatch record or server-confirmed reattach); otherwise defer to the authoritative `ready.reattached` signal and log `startup-reattach-deferred`.
3. After a fresh `ready`, a single `sendInitialCommandIfReady()` attempt could die silently on later gates (viewport fit, projection). Fixed with a bounded retry ladder (`useTerminalV2Session.js`: 750ms/1.5s/3s/6s/12s, logged as `initial-command-retry`), self-terminating on send/reattach/socket-close/dispose.

- [x] 8.1 `resolveConnectInitialCommandState({readyEverReceived})` + `shouldDeferStartupReattachLatch` helpers (`src/components/terminal/TerminalTTY.helpers.js`)
- [x] 8.2 `readyEverReceivedRef` + `initialCommandRetryTimerRef` refs wired through `TerminalTTY.jsx` connect ctx
- [x] 8.3 `useTerminalV2Session.js`: sticky ready flag, gated reconnect state, retry ladder after fresh `ready`, ladder cleanup in `stopV2Session`
- [x] 8.4 `useTerminalInitialCommandLifecycle.js`: deferred startup-reattach latch + `startup-reattach-deferred` persisted log
- [x] 8.5 Tests: 4 new cases in `TerminalTTY.test.js` (pre-ready reconnect retries; defer/latch branches); full run = Windows baseline only (6 suites/11 tests: 5 node-pty suites + 1 pre-existing mount failure, both verified pre-existing via `git stash`)
- [x] 8.6 Dev e2e (`.research/e2e_boot_race_verify.cjs`, sidecar :4001 + Next :3100, seeded `kimi --session session_c9d50e44-…`): fired 32 premature `panel-startup-reattach` events during boot → 2× `startup-reattach-deferred` logged → `initial-command-sent` → sidecar `terminal-input-send` → kimi TUI booted with the session visibly restored. Warm-reattach control (sidecar kept the pty): correctly re-attached WITHOUT re-typing the command
- [x] 8.7 Rebuild installer (0.1.9) + installed-app verification: full app restart with kimi + qodercli sessions open → both resume — VERIFIED by the user 2026-07-27 ("se logró restaurar las sesiones de kimi y qoder a la perfección")

### Harness gotcha (dev e2e, this phase)

- Verifying "cold boot" requires restarting the dev sidecar too — if the sidecar survives, the panel genuinely re-attaches to the leftover pty (`ready.reattached=true`) and no injection happens by design. That control run doubles as the no-double-typing regression check.

## Phase 9: Stray external console windows on Windows (2026-07-27)

User report: external "PowerShell" windows opening outside the app, related to the terminal/restore functionality. Root cause: `child_process` spawns without `windowsHide: true` — on Windows a detached child always gets a visible console, and a non-detached console child whose parent has no console (the packaged Next server runs hidden) gets one too.

- [x] 9.1 `src/app/api/terminal/session/route.js` — `recoverProductionSidecar()` spawned the sidecar `detached` without `windowsHide`: a persistent visible console window whenever sidecar recovery fired (app restart / sidecar unreachable — the exact restore path). Most likely what the user saw.
- [x] 9.2 `src/app/api/agents/launch/route.js` — detached `opencode` engine launch (`.cmd` shim → visible cmd window).
- [x] 9.3 `src/app/api/agenthub/supervisor/snapshot/route.js` — polling `execSync`s (`pgrep`, `tmux list-sessions`, `git worktree list`) flashed a console on every snapshot.
- [x] 9.4 `src/app/api/agenthub/operations/health/route.js` — `git worktree list` execSync flash.
- [x] 9.5 `src/app/api/agenthub/chat/route.js` — `opencode run` spawn popped a visible console per chat call.
- [x] 9.6 Verified not-culprits already hidden: node-pty ConPTY sessions (`conhost --headless`), Electron sidecar/packaging spawns, swarm process scans (`EncodedCommand` — `windowsHide` present since 4bb260a1), quota sensors, git fs routes.
- [x] 9.7 Tests: 11 suites / 43 tests green on all touched routes (spawn assertions use `objectContaining`, no test changes needed).
