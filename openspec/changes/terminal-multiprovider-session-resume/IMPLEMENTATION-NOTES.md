# Implementation Notes — Terminal Multiprovider Session Resume (as-built)

Consolidated handover doc for resuming any part of this work. Read this BEFORE
touching the restore pipeline; `proposal.md` covers intent + CLI contracts and
`tasks.md` (phases 1–9) is the chronological log of what was fixed and why.

## 1. Current state (2026-07-27, app 0.1.9)

Verified working in the installed app:

- Full app restart with `kimi` and `qodercli` sessions open → both resume their
  exact prior conversation (user-verified field test).
- Typed-launch binding for kimi, qodercli, grok: type the CLI in a shell panel →
  the binder correlates the on-disk session → resume command persisted.
- grok resume verified in dev e2e (not yet field-tested in the installed app).
- No external console windows on Windows after the `windowsHide` sweep.

## 2. End-to-end flow

1. **Launch & bind** (session is born)
   - User types `qodercli`/`kimi`/`grok` in a shell panel (or a launch preset runs).
   - Sidecar detects the typed launch → starts the **binder**:
     `sidecar-backend/server.js` (`AGENT_SESSION_BINDABLE_TYPES = {kimi, codex, grok, qodercli}`)
     → `sidecar-backend/agentSessionBinder.cjs` (CJS twin of
     `src/lib/terminal/agentSessionBinder.js` — ESM, used by `src/lib/terminal/ttyServer.js`).
   - The binder polls the provider's on-disk session store, correlates by cwd,
     emits `<provider>-session-detected`. Explicit pre-assigned ids (grok/qoder
     `--session-id`) broadcast immediately instead.
   - Client persists the resume command: `TerminalWorkspacesManager` →
     `applyPanelRelaunchCommand` (state + localStorage), logged as
     `agent-run-persisted`.
   - Grok gotcha: grok only creates its session dir after the FIRST user prompt,
     so the binder re-arms on `timeout` settle (sidecar `server.js`) — a 30s
     one-shot binder misses late sessions.

2. **Shutdown → boot → hydrate**
   - Workspace state lives in localStorage (`devhub_terminal_state:<projectId>`)
     in TWO copies: `workspaces` tree and `workspaceWindows`. Hydration merges
     them per panel — the window copy can carry stale `initialCommand: null` and
     must NOT win over a fresher workspace-tree command
     (`src/components/terminal/models/workspaceStateModel.js` +
     `src/components/terminal/utils/panelHelpers.js`; phase 6 bug).
   - Logged as `boot-hydration-parsed` / `boot-hydration-complete`.

3. **Plan**
   - `src/lib/terminal/startupRestoreCoordinator.js` builds actions from the
     manifest + runtime snapshot (`src/lib/swarm/runtimeStatus.js`):
     `resume-agent-session` / `reattach-live-terminal` / `process-orphan` /
     `terminated` / `quota-blocked`.
   - Logged as `startup-restore-begin`, `restore-prefs-read`, `startup-restore-plan`.

4. **Dispatch**
   - `src/lib/terminal/startupRestoreRunner.js` `dispatchStartupRestoreQueue`
     (bounded concurrency) → `resolvePanelStartupInjectIntent` (skip guards) →
     logs `startup-restore-dispatch` → `onRelaunch` in
     `src/components/workspace/WorkspaceRestoreCoordinator.js` →
     `applyPanelRelaunchCommand(..., {bumpCommand:false, emitEvent:true})`.
   - For `restore-ready`/`reattach-live-terminal` panels it emits
     `devhub:panel-startup-reattach` (see invariant I2 — this is the racy one).

5. **Inject** (the fragile part, hardened in 0.1.9)
   - `src/components/terminal/hooks/useTerminalV2Session.js` `connect()`:
     session API (`src/app/api/terminal/session/route.js`: SIDECAR_PORT probe →
     production sidecar port file → in-process `ensureTTYServer` → production
     `recoverProductionSidecar`) → WS open → server `ready`.
   - `src/components/terminal/hooks/useTerminalInitialCommandLifecycle.js`
     `sendInitialCommandIfReady()` gates IN ORDER: initialCommand && !hasSent →
     redundant-lifecycle skip → serverReadyReceived → !sessionReattached →
     viewportFitConfirmed → ws OPEN → projection → orchestrator intent →
     late-command-change block → `ws.send({type:'input', data: cmd+'\r'})` →
     logs `initial-command-sent` + `markPanelInitialCommandDispatched`.

## 3. Hard invariants (each cost a field failure)

- **I1 — `ready.reattached` is the ONLY authoritative "session is live" signal.**
  Planner heuristics (`alive-without-sockets`) and connect-attempt state are
  racy by construction: after a cold boot every "alive" pty is an empty shell
  created by the panel's own reconnect attempts.
- **I2 — Injection is gated on `ready`, so any dispatch record created before
  `ready` is stale.** Never mark `hasSentInitialCommand`/lifecycle records on a
  connect that hasn't seen `ready` (phase 8 fix A: `readyEverReceived` gate in
  `resolveConnectInitialCommandState`).
- **I3 — The `panelInitialCommandLifecycle` Map dies on page reload.** Records
  are same-mount proof only; genuine cross-reload protection comes from the
  server (`ready.reattached=true` on a surviving pty).
- **I4 — The sidecar keeps ptys alive across page reloads.** Reattach without
  re-typing is CORRECT then (control case). "Cold boot" e2e therefore requires
  restarting the dev sidecar, not just the page.
- **I5 — Detached/parent-less console spawns need `windowsHide: true`** or the
  packaged app shows stray external console windows (phase 9).
- **I6 — ESM/CJS twins must stay in sync**: `agentSessionBinder.js` ↔
  `sidecar-backend/agentSessionBinder.cjs` (packaged sidecar can't import ESM
  `src/`). Parity suite: `src/lib/terminal/__tests__/sidecarTtyServerParity.test.js`.

## 4. Failure modes fixed (symptom → cause → fix)

| Phase | Symptom | Root cause | Fix |
| ----- | ------- | ---------- | --- |
| 6 | Plan `terminated/no-runtime-evidence` after reboot | hydration adopted stale window copy with `initialCommand: null` | per-panel ws↔window merge in BOTH copies |
| 6 | Binder dead in installed app | packaged sidecar lazy-imported ESM `src/` path, silent `.catch(() => null)` | CJS twin statically required |
| 7 | Typed `qodercli`/`grok` never persisted resume | binder only knew kimi/codex | qoder/grok scanners + unified typed-launch branch |
| 7 | grok bind missed when user waits >30s | grok writes session dir after first prompt | re-arm binder on timeout settle |
| 8 | Empty terminals after app restart; ZERO `initial-command-*` logs | 3 racing latches (see below) | readyEverReceived gate + deferred reattach latch + retry ladder |
| 9 | External "PowerShell" windows | spawns without `windowsHide` | 7 spots in `src/app/api/**` |

Phase 8 latches, concretely:
1. `resolveConnectInitialCommandState` latched `hasSentInitialCommand=true` on
   ANY reconnect just because `initialCommand` existed — even pre-`ready`, when
   the command provably never reached a pty.
2. `devhub:panel-startup-reattach` handler latched unconditionally on the
   planner's `alive-without-sockets` degradation (now `shouldDeferStartupReattachLatch`
   — latch only with a dispatch record or server-confirmed reattach, else log
   `startup-reattach-deferred`).
3. A single post-ready `sendInitialCommandIfReady()` attempt could die silently
   on later gates (viewport fit / projection) — now a bounded retry ladder
   (750ms→12s, logged as `initial-command-retry`).

## 5. Diagnostics

Logs (installed app: `~/.devhub/logs/`; dev stack: `~/.devhub-dev/logs/`):

- `terminal-restore.jsonl` — client trail (via `/api/terminal/restore-log`,
  sendBeacon+batch). Events to grep a boot window with:
  `boot-hydration-parsed` → `startup-restore-begin` → `startup-restore-plan` →
  `startup-restore-dispatch` → `startup-reattach-deferred` / `initial-command-retry` /
  `initial-command-sent` (+ `initial-command-skipped/blocked` with reasons).
- `sidecar-terminal.jsonl` — backend trail: `sidecar-startup`,
  `pty-session-created`, `agent-session-detected-broadcast`,
  `terminal-input-send` (the definitive proof the pty received the command).
- A HEALTHY cold-boot resume shows: plan(resume-agent-session) → dispatch →
  (deferreds ok) → `initial-command-sent` → `terminal-input-send`. If you see
  dispatch but no `initial-command-sent`, the injection was latched — check for
  missing `startup-reattach-deferred` or a skipped/blocked reason.

Process triage on Windows (stray windows, orphan servers):
`Get-CimInstance Win32_Process` parent-chain mapping of
node/powershell/conhost/cmd; pty sessions show `conhost --headless`.

## 6. Verification harness (`.research/`)

Dev stack (decoupled from the installed app, profile `~/.devhub-dev`):
`.research/start-dev-sidecar.bat` (sidecar :4001) + `.research/start-dev-next.bat`
(Next :3100, `scripts/next-dev.cjs` sets `DEVHUB_HOME=~/.devhub-dev`,
`SIDECAR_PORT=4001`).

Scripts (Playwright, persistent profile `.research/pw-profile`):

- `e2e_seed_state.cjs "<cmd>" full` — seed panel p1 with a resume command
  (`none` = clean shell; `full` replicates the real persisted payload incl. the
  window-copy null). `… x read` reads back.
- `e2e_reboot_a.cjs` / `e2e_reboot_b.cjs` — live bind then reboot-cycle check.
- `e2e_bind_check.cjs` — typed-launch bind verification (qodercli/grok).
- `e2e_boot_race_verify.cjs` — fires 32 premature `devhub:panel-startup-reattach`
  events during boot, then asserts `startup-reattach-deferred` +
  `initial-command-sent` + visible TUI restore.
- Project URL for the seeded profile:
  `http://localhost:3100/#/project/c5defdd3-9680-490b-828f-caaaf22c6b41/terminales`.

Gotchas:

- Restart the dev sidecar between runs (I4) or you test warm-reattach, not cold boot.
- Real session ids per provider must match the cwd (`~/.kimi-code/sessions/wd_devhub_*/`,
  `~/.qoder/projects/<slug>/`, `~/.grok/sessions/<enc-cwd>/`).
- Windows jest baseline: 5 suites/10 tests fail on node-pty env
  (`ttyServer*`, `sessionStore`, `agentHooks`) + 1 pre-existing TerminalTTY
  mount failure — always compare against baseline via `git stash`, not zero-fail.

## 7. Release process

- `rm -rf dist/electron/*` (ONE active version policy — see
  `desktop/electron/BUILDING.md`), then
  `pnpm build && pnpm build:sidecar && pnpm electron:build -c.extraMetadata.version=<v>`.
- Feed: `pnpm electron:feed` serves `dist/electron/` at `http://127.0.0.1:9100/devhub`;
  the installed app self-updates on restart while the feed is alive. A stale feed
  process holding :9100 is fine — it serves from disk per request.
- After meaningful edits: `graphify update .` (AST-only, no API cost).

## 8. Open items

- grok typed-launch restore: dev-verified, not field-tested in the installed app.
- Chat→terminal text leak: text typed in a chat field landed in a shell panel's
  prompt (seen on p9265) — separate key-routing bug, uninvestigated.
- `terminal-auto-reconnect-scheduled` storm logs `attempt:0` repeatedly during
  backend-slow boots (counter resets on each brief `connected`), cosmetic but noisy.
- Possible planner hardening (not needed after 0.1.9, revisit if reattach
  misfires return): don't degrade `resume-agent-session` → `reattach-live-terminal`
  when the panel has a persisted initialCommand with no delivery evidence.
- Hidden-workspace panels don't reconnect until visible; their resume injects on
  first reveal (by design, but visible in logs as delayed).
