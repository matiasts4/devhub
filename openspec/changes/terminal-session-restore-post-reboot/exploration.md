# Exploration: terminal TUI session restore (post-reboot hardening)

**Branch constraint:** all implementation stays on `feature/terminal-decompose` (no branch switch).

**Product decisions (2026-07-05):**

- Keep current UX: reopen panel count + relaunch TUIs on app open (no master “disable recovery”).
- Improve **session-specific** resume for Grok, Kimi/KimiCode, OpenCode — faster and without double-injection into live TUIs.
- Preferences stay **global** (`devhub_terminal_restore_prefs`).
- Primary settings surface: **terminal gear** (`TerminalRestoreSettingsModal`); global Ajustes is out of scope for now.

---

## Current State

### Two parallel restore paths (root of past bugs)

| Path                         | When                                                            | What happens                                                                                                                                             |
| ---------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Layout hydrate**        | `useWorkspaceBootstrapEffect` reads `terminalStateStorageKey`   | Workspaces/panels/`initialCommand`/`cwd` reappear; `bootPanelIdsRef` captures hydrated panel IDs.                                                        |
| **B. Startup restore queue** | Once per cold page load (`shouldRunStartupRestoreThisPageLoad`) | `WorkspaceRestoreCoordinator` → `buildStartupRestorePlan` → `dispatchStartupRestoreQueue` → `applyPanelRelaunchCommand` (+ optional `#recovery-*` bump). |

**Path A** drives `TerminalTTY` via `initialCommand`: on WebSocket ready, `useTerminalInitialCommandLifecycle.sendInitialCommandIfReady` resolves inject command (`resolveTerminalInjectCommand` for OpenCode session ids) and sends it to the PTY.

**Path B** only relaunches `RESUME_OPENCODE_SESSION`, `PROCESS_ORPHAN`, `RESTORE_SHELL_EMERGENT`. Commands are built via `buildOpenCodeResumeCommand` (misnamed — also returns plain `grok`/`kimi` when that is the panel command).

When **both** run for the same panel on cold start, the failure mode reported in production appears: layout/TUI mounts, first inject succeeds, then startup restore bumps `initialCommand` → second inject into an **already running** OpenCode/Grok TUI → crash/garbled state.

### Guards that exist today (partial)

- `panelInitialCommandLifecycle.js` — per-panel dispatch map; skips redundant OpenCode/Grok/swarm wrapper sends; **`isRecoveryRelaunch` bypasses skip** (`#recovery-*` suffix).
- `resolveConnectInitialCommandState` — remount with live PTY sets `hasSentInitialCommand` if lifecycle record exists.
- `sessionReattachedRef` — skips inject when reattach detected.
- `shouldBlockLateInitialCommandSend` — blocks inject after connect if command changed late.
- `handleRelaunchPanel` — ignores events with `reason === 'panel-relaunch'` (but `applyPanelRelaunchCommand` still mutates workspace state before emitting).
- Startup skip when panel not in `bootPanelIdsRef`.
- Mutex: `devhub_opencode_restore_in_progress` + wait on generic mutex before OpenCode queue.

Gaps: path A first send and path B relaunch are **not serialized**; `#recovery-*` defeats redundancy checks; `onPanelLive` does **not** set `sessionReattached` / lifecycle flags on the TTY side.

### Provider / session taxonomy today

| TUI             | `inferPanelSessionKind` | Cold runtime empty → typical plan action                                                       | Durable session id | List/resume API                     |
| --------------- | ----------------------- | ---------------------------------------------------------------------------------------------- | ------------------ | ----------------------------------- |
| **OpenCode**    | `opencode`              | `RESUME_OPENCODE_SESSION` if `opencodeSessionId`                                               | Yes                | `/api/opencode/sessions` + adapters |
| **Grok**        | `generic`               | Often `TERMINATED` (`no-runtime-evidence`) — not shell-ephemeral (`isTuiLaunchCommand` blocks) | No                 | None in `resumableSessionAdapters`  |
| **Kimi**        | `generic`               | May qualify as `RESTORE_SHELL_EMERGENT` (not in `isTuiLaunchCommand` list)                     | No                 | None                                |
| **Swarm**       | `swarm`                 | `REATTACH_LIVE_TERMINAL` (tmux)                                                                | tmux name          | N/A                                 |
| **Plain shell** | `generic`               | `RESTORE_SHELL_EMERGENT` when cwd present                                                      | N/A                | N/A                                 |

**Observed “good” behavior for Grok:** `grok` from persisted `initialCommand` (path A), not durable session resume. **Goal:** add real session resume where CLIs support it without breaking path A.

### Gear / restore preferences vs code

- `RestoreSection` in `TerminalRestoreSettingsModal` — persistence **works**.
- `buildStartupRestorePlan` applies `auto | manual | off` via `resolveEffectiveRestorePolicy` — **works for relaunch gating**.
- `seedSuspendedOpenCodePanels` only pre-flags **OpenCode** for manual/off — **Grok/Kimi/generic manual does not get suspended seed** (UX mismatch vs modal copy).
- Modal tab **“Terminal”** embeds `TerminalSettingsSection` and **duplicates** restore selects; **Restauración** tab should remain canonical.
- Swarm policy UI exists; restore path is reattach-first — manual/off semantics underspecified.

### Test debt

- `tasks.md` Phase 3.3–3.5 (Playwright cold reload) still open.
- `terminal-decompose` extracted `useWorkspaceBootstrapEffect` + `WorkspaceRestoreCoordinator`; tests: `TerminalWorkspacesManager.startupRestore.test.jsx`, `startupRestoreCoordinator.policyGating.test.js`.

---

## Affected Areas

- `src/lib/terminal/startupRestoreCoordinator.js` — plan actions; TUI vs shell classification; policy gating.
- `src/lib/terminal/startupRestoreRunner.js` — queue; **OpenCode-centric command builder** needs per-kind resume.
- `src/components/workspace/WorkspaceRestoreCoordinator.js` — orchestration; `seedSuspended*`; `onPanelLive`.
- `src/components/terminal/hooks/useWorkspaceBootstrapEffect.js` — hydrate vs startup timing.
- `src/components/terminal/hooks/useTerminalInitialCommandLifecycle.js` — inject vs `#recovery` relaunch.
- `src/lib/terminal/panelInitialCommandLifecycle.js` — redundancy rules.
- `src/components/terminal/TerminalTTY.helpers.js` — connect / late-command guards.
- `src/components/terminal/hooks/useTerminalV2Session.js` — `sessionReattachedRef`.
- `src/lib/terminal/restorePolicyResolver.js` — kind inference; inject resolution.
- `src/lib/agentSessions/resumableSessionAdapters.js` — OpenCode-only today.
- `src/lib/terminal/opencodeSessionDiscovery.js` — catalog pattern for other providers.
- `src/components/TerminalRestoreSettingsModal.jsx` — dedupe UI; align copy.
- `src/lib/terminal/restorePreferences.js` — global prefs contract.
- `src/components/TerminalWorkspacesManager.jsx` — `applyPanelRelaunchCommand`.
- `src/components/terminal/hooks/useWorkspaceEventBridge.js` — relaunch events.
- `tests/e2e/terminal-session-restore-post-reboot.spec.ts` — e2e contract.

Deferred: `src/views/Ajustes.jsx` + `devhub:terminal-settings-in-ajustes`.

---

## Approaches

1. **Single orchestrator gate (recommended MVP)** — per-panel phase: `hydrated → runtime-probed → (skip | reattach | inject-once)`. Startup queue must not relaunch if path A already dispatched the same normalized command or runtime is live. Extend `panelInitialCommandLifecycle` or cold-load session flags.
   - Pros: fixes double-injection directly.
   - Cons: ordering tests; must not break manual revive.
   - Effort: **Medium**

2. **Provider adapter expansion** — Grok/Kimi/KimiCode list+resume APIs (when verified), persist session ids, upgrade `initialCommand` like OpenCode.
   - Pros: true session resume.
   - Cons: external CLI dependency; per-provider effort.
   - Effort: **High** (phased after 1)

3. **Startup-only OR hydrate-only inject** — disable one path entirely.
   - Cons: breaks sidecar reattach — **not recommended alone**.

---

## Recommendation

- **Phase A:** Approach 1 — serialize inject, wire `REATTACH_LIVE` / `onPanelLive` to TTY skip; tighten `#recovery` rules; finish e2e 3.3–3.5.
- **Phase B:** Approach 2 — providers one-by-one; extend `inferPanelSessionKind` (explicit `kimi`); gear copy reflects reality.
- **Gear:** canonical `RestoreSection`; remove duplicate restore block from modal Terminal tab; fix or document suspended overlay for generic/manual.

Continue in-place on `openspec/changes/terminal-session-restore-post-reboot` on branch `feature/terminal-decompose`.

---

## Risks

- Over-tight gating blocks manual “Continuar sesión”.
- Kimi misclassified as shell-ephemeral spawn.
- Swarm policy vs reattach semantics confuse users.
- Grok without session API: copy must say “relaunch TUI” until resume exists.
- Branch concurrency with other agents on `terminal-decompose`.

---

## Ready for Proposal

**Yes.** Update `proposal.md` + spec for anti-double-injection, provider roadmap, gear alignment; then `design.md` (phase state machine) and phased `tasks.md` on this branch.
