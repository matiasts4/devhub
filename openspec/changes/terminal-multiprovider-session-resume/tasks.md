# Tasks: Terminal Multiprovider Session Resume

> Builds on `terminal-session-restore-post-reboot` (Phases 1–6 applied). Branch: current working branch.

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
