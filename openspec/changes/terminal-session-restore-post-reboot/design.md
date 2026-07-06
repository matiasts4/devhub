# Design: Terminal Session Restore Post Reboot (Phase 2)

## Technical Approach

Phases 1–2 delivered bounded OpenCode catalog + Reopen/History. Phase 2 (this design) adds a **cold-start inject orchestrator** so layout hydrate and startup restore cannot both push PTY input into the same live TUI, then aligns **gear** settings and **TUI taxonomy** (Grok/Kimi/OpenCode/Swarm) for faster, correct resume.

**Branch:** `feature/terminal-decompose`.

## Architecture Decisions

| Decision             | Options                                           | Choice                                            | Rationale                                           |
| -------------------- | ------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------- |
| Inject authority     | TTY-only; restore-only; **shared resolver**       | Shared `resolvePanelStartupInjectIntent`          | Single place to prevent OpenCode double-inject bug  |
| `#recovery-*` suffix | Always bump on startup; **manual only**           | Manual revive + explicit user actions only        | Recovery suffix currently defeats redundancy guards |
| Kimi classification  | generic shell-ephemeral; **TUI kind `kimi`**      | Explicit TUI kind                                 | Avoids wrong `RESTORE_SHELL_EMERGENT` path          |
| Grok session resume  | Fake session ids; **relaunch until CLI verified** | Relaunch `grok` via hydrate; adapter later        | Matches user-approved current UX                    |
| Restore settings UI  | Ajustes + gear; **gear Restauración only**        | Gear canonical; strip duplicate from Terminal tab | Product decision                                    |
| Prefs scope          | per-project; **global**                           | `devhub_terminal_restore_prefs`                   | Product decision                                    |

## Cold Start Sequence

```text
App visible + client loaded
  -> Hydrate workspaces from terminalStateStorageKey
  -> bootPanelIdsRef := hydrated panel ids
  -> (defer) until terminalHydrationReadyRef if persisted state expected

runStartupRestore (once per cold page load)
  -> fetch runtime-diagnostics snapshot
  -> optional OpenCode discovery patch manifest
  -> buildRestoreManifestFromWorkspaceState(restorePreferences)
  -> buildStartupRestorePlan(manifest, runtime)
  -> FOR each relaunch action:
        intent := resolvePanelStartupInjectIntent(panel, action, runtime, lifecycle)
        IF intent.skip -> no applyPanelRelaunchCommand
        ELSE applyPanelRelaunchCommand (no #recovery on auto startup)

Parallel: each TerminalTTY connect
  -> resolveConnectInitialCommandState (remount guard)
  -> on server ready + viewport fit:
        intent := resolvePanelStartupInjectIntent(...)
        IF intent.skip OR sessionReattached -> mark sent, no PTY write
        ELSE send normalized command once; markPanelInitialCommandDispatched

onPanelLive / REATTACH_LIVE -> set panel lifecycle + TTY sessionReattached (new wiring)
```

## Panel Inject State Machine

```text
                    ┌─────────────┐
                    │  HYDRATED   │
                    └──────┬──────┘
                           │ runtime probe
              ┌────────────┼────────────┐
              v            v            v
        ┌──────────┐ ┌──────────┐ ┌─────────────┐
        │ REATTACH │ │ INJECT   │ │ SKIP/OFF    │
        │ (alive)  │ │ ONCE     │ │ manual/off  │
        └──────────┘ └──────────┘ └─────────────┘
              │            │
              └─────┬──────┘
                    v
              ┌──────────┐
              │ STABLE   │  (no second auto inject)
              └──────────┘
```

## New Module (proposed)

| Module                                          | Responsibility                                                                                                 |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `src/lib/terminal/startupInjectOrchestrator.js` | `normalizeInjectCommand`, `resolvePanelStartupInjectIntent`, cold-load session id in `sessionStorage` optional |

Integrate into:

- `startupRestoreRunner.dispatchStartupRestoreQueue` — skip `onRelaunch` when intent satisfied; use per-action command builder (rename `buildOpenCodeResumeCommand` usage to `buildStartupResumeCommand(action, panel)`).
- `useTerminalInitialCommandLifecycle.sendInitialCommandIfReady` — call resolver before send.
- `WorkspaceRestoreCoordinator.onPanelLive` — dispatch `devhub:panel-startup-reattach` or set lifecycle via existing debug bus.

## Provider Phases (B)

| Provider        | Phase A (this change)         | Phase B follow-up                           |
| --------------- | ----------------------------- | ------------------------------------------- |
| OpenCode        | Orchestration + e2e           | Session id stability, discovery race fixes  |
| Grok            | `grok` once via hydrate       | Adapter + API when CLI list/resume verified |
| Kimi / KimiCode | TUI kind + no shell-ephemeral | Adapter when verified                       |
| Swarm           | Reattach only (unchanged)     | Policy copy in gear                         |
| Hermes          | Excluded durable              | Unchanged                                   |

## File Changes (Phase A apply)

| File                                                                  | Action                                                  |
| --------------------------------------------------------------------- | ------------------------------------------------------- |
| `src/lib/terminal/startupInjectOrchestrator.js`                       | **Create**                                              |
| `src/lib/terminal/startupInjectOrchestrator.test.js`                  | **Create** RED first                                    |
| `src/lib/terminal/startupRestoreRunner.js`                            | Modify dispatch + command builder                       |
| `src/lib/terminal/startupRestoreCoordinator.js`                       | Kimi in `isTuiLaunchCommand`; plan tweaks               |
| `src/lib/terminal/restorePolicyResolver.js`                           | `inferPanelSessionKind` → `kimi`                        |
| `src/components/workspace/WorkspaceRestoreCoordinator.js`             | `onPanelLive` wiring                                    |
| `src/components/terminal/hooks/useTerminalInitialCommandLifecycle.js` | Resolver gate                                           |
| `src/components/terminal/hooks/useTerminalV2Session.js`               | Listen for reattach signal                              |
| `src/components/TerminalRestoreSettingsModal.jsx`                     | Copy + Terminal tab without restore dup                 |
| `src/components/settings/TerminalSettingsSection.jsx`                 | Prop `showRestorePolicies` default true; false in modal |
| `src/components/workspace/WorkspaceRestoreCoordinator.js`             | `seedSuspended*` generalized                            |
| `tests/e2e/terminal-session-restore-post-reboot.spec.ts`              | Single-inject assertions                                |

## Interfaces

```ts
// startupInjectOrchestrator.js (conceptual)
type InjectIntent =
  | { action: 'inject'; command: string; reason: string }
  | { action: 'skip'; reason: 'already-dispatched' | 'runtime-live' | 'policy-off' | 'policy-manual' };

function resolvePanelStartupInjectIntent({
  panelId,
  panel,
  agentRun,
  runtimeTerminal,
  lifecycleRecord,
  restorePolicy,
  proposedCommand,
  phase: 'hydrate' | 'startup-relaunch',
}): InjectIntent;
```

Startup relaunch MUST pass `phase: 'startup-relaunch'`; TTY MUST pass `phase: 'hydrate'`.

## Testing Strategy

| Layer     | Focus                                                                                                   |
| --------- | ------------------------------------------------------------------------------------------------------- |
| Unit      | `startupInjectOrchestrator` matrix: alive runtime, duplicate command, manual policy, opencode vs grok   |
| Unit      | `startupRestoreRunner` skips relaunch when intent skip                                                  |
| Component | `TerminalWorkspacesManager.startupRestore` — no second `devhub:relaunch-panel` when lifecycle satisfied |
| Component | `TerminalRestoreSettingsModal` — no duplicate testids on Terminal tab                                   |
| E2E       | Cold reload: one ws input or one relaunch for OpenCode fixture                                          |

Strict TDD: orchestrator RED → runner → TTY hook → gear → e2e.

## Migration / Rollout

No persisted schema migration. Behavior change only on cold start path. Rollback: remove orchestrator calls; restore unconditional `buildOpenCodeResumeCommand` relaunch (reverts to prior race risk).

## Open Questions

- [ ] Grok/Kimi CLI list+resume commands (Phase B) — document in provider tickets when discovered.
- [ ] Whether `sessionStorage` cold-load token should reset lifecycle map on `navigation type reload` only (align with existing `shouldRunStartupRestoreThisPageLoad`).
