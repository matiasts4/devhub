# Apply Progress: terminal-decompose

**Change**: `terminal-decompose`  
**Branch**: `feature/terminal-decompose`  
**Last updated**: 2026-07-05

## Summary

Apply phase completed on the feature branch via a chained commit series from `4cc657f` (wire orphaned TWM modules) through `1e0f402` (useWorkspaceRenderAssembly). Post-decomposition test regressions were remediated (bootstrap/restore, right dock, swarm binding, split layout, panel labels). Final gate: **326 passed**, 4 skipped, 0 failed — `npm test -- --runInBand --testPathPattern="TerminalTTY|TerminalWorkspacesManager"`.

## Work units delivered

| Unit  | Slice                                                            | Status | Notes                             |
| ----- | ---------------------------------------------------------------- | ------ | --------------------------------- |
| TWM-1 | Wire orphaned componentize modules                               | Done   | `b8da6f6`, `4cc657f`              |
| TTY-1 | Delete native VTE stubs                                          | Done   | `969d373`, `fd19917`              |
| TTY-2 | Move pure helper exports                                         | Done   | `19d7099`                         |
| TTY-3 | useTerminalOutputQueue                                           | Done   | `730da3a`                         |
| TTY-4 | useTerminalClipboard                                             | Done   | (in hook tree)                    |
| TTY-5 | useTerminalWheelRouter                                           | Done   | guard tests in `hooks/__tests__`  |
| TWM-2 | WorkspaceRestoreCoordinator                                      | Done   | `44d12bd`                         |
| TWM-3 | useSwarmLaunchController                                         | Done   | `bb3a284`                         |
| TWM-4 | useZedWorkspaceEvents                                            | Done   | `b7bec62`                         |
| TWM-5 | useTerminalWorkspaceShortcuts                                    | Done   | `148bff6`                         |
| TWM-6 | useWorkspaceLayoutState                                          | Done   | `21e5a25` + follow-on extractions |
| TTY-6 | useTerminalV2Session                                             | Done   | `dd3c3c7`                         |
| TTY-7 | useTerminalRendererController                                    | Done   | `3a6e314`                         |
| TTY-8 | useTerminalViewportSync                                          | Done   | `acdd4ed`                         |
| TTY-9 | useTerminalEngine                                                | Done   | `2e9fad2` / `ae41001`             |
| TWM+  | Bootstrap/lifecycle/event bridge/panel lifecycle/render assembly | Done   | `93ca377`–`1e0f402`               |

## Remediation (handoff session)

- **TIC-2 gate**: `legacyCounterRandomizeEligibleRef` set only on storage hydration; `useWorkspaceLifecycle` gates `maybeRandomizeCountersForFreshWorkspace` so fresh default mounts do not randomize workspace IDs during right-dock tests.
- **Restore**: skip startup restore actions when `bootPanelIdsRef` empty; no mount-time counter randomize in bootstrap.
- **Swarm reopen**: binding POST ordering in `useWorkspaceEventBridge`.
- **Right dock**: layer bounds sync and test flush timing.

## Host file metrics (post-apply)

| File                            | Lines (approx.)                                                               |
| ------------------------------- | ----------------------------------------------------------------------------- |
| `TerminalTTY.jsx`               | ~1872 (intermediate thin-host; further slicing deferred per TTY-9 acceptance) |
| `TerminalWorkspacesManager.jsx` | ~1629 (down from ~7500 pre-change)                                            |

## Tasks artifact

All 60 acceptance checkboxes in `tasks.md` marked complete after reconciliation with commits and green terminal suites.
