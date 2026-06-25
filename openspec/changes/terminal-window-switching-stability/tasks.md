# Tasks: Terminal Workspace Window Switching Stability

## Review Workload Forecast

| Field                   | Value                        |
| ----------------------- | ---------------------------- |
| Estimated changed lines | ~250 (impl ~100, tests ~150) |
| 400-line budget risk    | Low                          |
| Chained PRs recommended | No                           |
| Suggested split         | Single PR                    |
| Delivery strategy       | single-pr-default            |
| Chain strategy          | stacked-to-main              |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: stacked-to-main
400-line budget risk: Low

## Phase 1 — RED: Tests + Lifecycle Reason

| ID        | Description                                                                                                                                                                                                                                                                     | Est. Lines | Depends on | Verification                                                                             |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------- | ---------------------------------------------------------------------------------------- |
| [x] T-1.1 | Add `WORKSPACE_WINDOW_SWITCH` to `PANEL_LIFECYCLE_REASONS` (and burst phases if required) in `src/lib/terminal/terminalLifecycleSync.js`                                                                                                                                        | 10         | —          | `PANEL_LIFECYCLE_REASONS.WORKSPACE_WINDOW_SWITCH === 'workspace-window-switch'` (TWS-S5) |
| [x] T-1.2 | RED unit test: `resolvePanelVisibleInLayout` returns `true` for every destination panel when focused panel id is missing from current window in `src/lib/terminal/__tests__/workspaceWindowRender.test.js`                                                                      | 35         | —          | Test fails before fix; covers TWS-S1                                                     |
| [x] T-1.3 | RED integration test: render `TerminalWorkspacesManager`, call `switchWindowInWorkspace`, assert `devhub:terminal-layout-settled` dispatches once with reason/panelIds and stale focus cleared in `src/components/__tests__/TerminalWorkspacesManager.workspaceWindows.test.js` | 70         | —          | Test fails before fix; covers TWS-S3/S4                                                  |
| [x] T-1.4 | RED regression test: unchanged `activeWindowIds` JSON does not emit `workspace-window-switch` layout-settled event                                                                                                                                                              | 25         | T-1.3      | Test fails before guard; covers regression spec                                          |

## Phase 2 — GREEN: Core Implementation

| ID        | Description                                                                                                                                                                                                 | Est. Lines | Depends on   | Verification                      |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------ | --------------------------------- |
| [x] T-2.1 | In `switchWindowInWorkspace`, reconcile `focusedPanelByWorkspace[wsId]` before commit: keep focus if panel is in destination window, otherwise delete (`src/components/TerminalWorkspacesManager.jsx`)      | 25         | T-1.1, T-1.2 | TWS-S1/S2 unit + integration pass |
| [x] T-2.2 | In `activateWorkspacePanel` and `navigateToPanel`, clear `focusedPanelByWorkspace[wsId]` when target panel is not in the active window                                                                      | 20         | T-2.1        | TWS-S8 pass                       |
| [x] T-2.3 | In `activeWindowIds` post-commit effect, dispatch `devhub:terminal-layout-settled` via `scheduleTerminalLifecycleSync({ reason: 'workspace-window-switch', workspaceId, panelIds })` for destination panels | 30         | T-1.1, T-1.3 | TWS-S3/S4/S6 pass                 |

## Phase 3 — VERIFY

| ID        | Description                                                                                                            | Est. Lines | Depends on | Verification                               |
| --------- | ---------------------------------------------------------------------------------------------------------------------- | ---------- | ---------- | ------------------------------------------ |
| [x] T-3.1 | Run `npm test -- workspaceWindowRender.test.js TerminalWorkspacesManager.workspaceWindows.test.js` and fix regressions | 10         | T-2.3      | All tests green                            |
| [x] T-3.2 | Confirm `TerminalTTY.jsx` existing `workspace-window` branches fire for `workspace-window-switch` reason without edits | 0          | T-2.3      | Code review / manual trace confirms TWS-S7 |
| [ ] T-3.3 | Desktop smoke: switch V1→V2→V3 and confirm no blank terminal panels; GPU recovery burst fires                          | 0          | T-3.1      | Visual check / Playwright if available     |

## Phase 4 — COMMIT

| ID    | Description                                                                                                                                                                             | Est. Lines | Depends on | Verification                                                   |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------- | -------------------------------------------------------------- |
| T-4.1 | Commit Phase 1+2 as work units: `feat(terminal): add workspace-window-switch lifecycle reason and tests`; `fix(terminal): reconcile focus and dispatch layout-settled on window switch` | 0          | T-3.1      | `git log --oneline` shows clean story, `git diff --stat` ≤ 250 |
| T-4.2 | Open single PR with spec/design/tasks links and `size:small` label                                                                                                                      | 0          | T-4.1      | PR created, diff within budget                                 |
