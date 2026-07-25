# Verification Report: terminal-load-performance

## Overview

- **Change Name:** `terminal-load-performance`
- **Status:** Implementation complete and test-verified; **runtime SLO measurement pending** (requires manual cold starts + transition matrix with the app running)
- **Date:** 2026-07-22 (rework after review of a fabricated first pass)

## What was verified (automated, this machine)

| Suite                                                                              | Result       | Notes                                       |
| ---------------------------------------------------------------------------------- | ------------ | ------------------------------------------- |
| `src/lib/terminal/__tests__/startupPerfMarks.test.js`                              | 9/9 PASS     | transition marks + counter registry         |
| `src/lib/terminal/__tests__/terminalKeepalivePolicy.test.js`                       | 7/7 PASS     | kill-switch + WebKitGTK gate                |
| `src/lib/terminal/__tests__/terminalConnectedOnceRegistry.test.js`                 | 4/4 PASS     | overlay persistence registry                |
| `src/lib/terminal/ttyServer.restoreEphemeral.test.js`                              | 9/9 PASS     | restore + single disk write per restore run |
| `src/lib/terminal/startupRestoreCoordinator.test.js`                               | 5/5 PASS     | restore planning                            |
| `src/lib/terminal/__tests__/startupRestoreRunner.test.js`                          | 8/8 PASS     | active-workspace priority                   |
| `src/lib/devhub/__tests__/sidecarRuntime.test.js`                                  | 8/8 PASS     | parallel probes + short-circuit             |
| `src/components/terminal/hooks/__tests__/useActivatedWorkspaceIds.test.js`         | 6/6 PASS     | activate-then-keep-alive                    |
| `src/components/terminal/__tests__/terminalScrollIntegrity.test.js`                | 8/8 PASS     | resize guard telemetry + viewport restore   |
| `src/components/terminal/hooks/__tests__/useTerminalWorkspaceShowRecovery.test.js` | 1/1 PASS     | pre-existing mock failure fixed             |
| `src/components/terminal` (all)                                                    | 273/273 PASS |                                             |
| `TerminalWorkspacesManager.v2graveyard`                                            | 7/7 PASS     | keep-alive on/off                           |

## Known pre-existing failures (fail identically on HEAD — NOT caused by this change)

| Suite                                               | Failures | Cause                                                                        |
| --------------------------------------------------- | -------- | ---------------------------------------------------------------------------- |
| `src/components/__tests__/TerminalTTY.*` (4 suites) | 31 tests | harness issue on this machine ("WebSocket was never created"), fails on HEAD |
| `TerminalWorkspacesManager.right-dock`              | 2 tests  | pre-existing on HEAD                                                         |
| `TerminalWorkspacesManager.split-layout`            | 3 tests  | pre-existing on HEAD                                                         |
| `PizarraPane.cascade`                               | 2 tests  | pre-existing on HEAD                                                         |
| `ttyServer.test.js`                                 | 3 tests  | zsh args, Windows worktree path, history replay                              |
| `sessionStore.test.js`                              | 4 tests  | Windows path separators in assertions                                        |
| `agentTuiMetadata.test.js`                          | 1 test   | marker detection, untouched by this change                                   |

Verified via `git stash` comparisons: identical failures with and without this change's edits. One flaky extra suite was observed once in the TWM+pizarra run (did not reproduce).

## What is NOT verified (requires a human running the app)

- All SLO numbers in `proposal.md` (the first pass published fabricated values; they were removed). No baseline or post measurements exist yet — see "Pending measurements" in `tasks.md`.
- Packaged (Electron) smoke: window-before-sidecar, WebKitGTK behavior, RSS with keep-alive on.
- Visual TUI QA after Ctrl+L removal (OpenCode/Grok reattach rendering).
- `devhub_terminal_keepalive=off` rollback in real runtime.

## Summary of landed changes (verified in the working tree)

1. **PR1 Instrumentation:** transition marks, counter registry, backend spawn/restore durations.
2. **PR2 Dev cold start:** dev-server warm corrected (`/api/terminal/session` + `/`); cache persistence documented; 16 s import characterized as first-run compile.
3. **PR3 Backend cold start:** sidecar ∥ window, parallel probes with short-circuit, sync-default session store with opt-in debounce, single-write restore, memoized Windows shell, real active-workspace restore priority.
4. **PR4 Mount storm:** activate-then-keep-alive (`useActivatedWorkspaceIds`), immediate connect for visible panels.
5. **PR5 Total keep-alive:** v2 panels stay mounted on tab switch (flagged, WebKitGTK-gated); overlay only on true first boot; pizarra remount stays by design but is symptom-free.
6. **PR6 Scroll integrity:** resize telemetry wired into the two real senders, reconnect exception, viewport preservation on reveal, scroll-jump counter, dead code removed.
7. **PR7 Close-out:** honest docs; fabricated numbers and false checkboxes corrected.
