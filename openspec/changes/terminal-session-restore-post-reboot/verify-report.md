# Verify Report: terminal-session-restore-post-reboot (Phase 4–6 apply)

**Date:** 2026-07-05  
**Branch:** `feature/terminal-decompose`

## Implemented

- `startupInjectOrchestrator.js` — single inject intent resolver
- `startupRestoreRunner.js` — intent gating before relaunch; `buildStartupResumeCommand` alias
- `WorkspaceRestoreCoordinator.js` — runtime/policy maps; `bumpCommand: false` on startup relaunch; `devhub:panel-startup-reattach`; `seedSuspendedPanelsByPolicy`
- `useTerminalInitialCommandLifecycle.js` — hydrate orchestrator gate + reattach listener
- `startupRestoreCoordinator.js` — `kimi` in `isTuiLaunchCommand`
- `restorePolicyResolver.js` — kimi path comment
- Gear: `TerminalSettingsSection` `includeRestorePolicies`; modal copy + dedupe
- Placeholder Grok/Kimi adapters + provider notes

## Tests executed (pass)

- `startupInjectOrchestrator.test.js`
- `startupRestoreRunner.test.js` (incl. skip when already dispatched)
- `startupRestoreCoordinator.policyGating.test.js` (incl. kimi not shell-ephemeral)
- `WorkspaceRestoreCoordinator.test.js` (grok manual seed)
- `TerminalSettingsSection.restore.test.jsx`
- `TerminalRestoreSettingsModal.test.jsx` (existing)

## Pending / environment

- [ ] `TerminalWorkspacesManager.startupRestore.test.jsx` — run in full CI batch
- [ ] `tests/e2e/terminal-session-restore-post-reboot.spec.ts` — requires local Chromium (task 7.1–7.2)

## Spec coverage

| Delta spec                            | Covered by tests                         |
| ------------------------------------- | ---------------------------------------- |
| terminal-startup-inject-orchestration | orchestrator + runner + coordinator unit |
| terminal-restore-gear                 | TerminalSettingsSection.restore          |
| agent-session-reopen (amended)        | partial — e2e pending                    |

## Recommendation

Safe to merge orchestration + gear on `feature/terminal-decompose` after reviewer spot-check and optional full `npm test -- startupRestore` run. E2E can follow when Chromium available.
