# Delta Spec: Terminal Workspace Window Switching Stability

## ADDED Requirements

### Requirement: TWS-1 — Focus-State Reconciliation on Window Switch

`switchWindowInWorkspace` MUST reconcile `focusedPanelByWorkspace[wsId]` before committing the new `activeWindowIds` and `activePanelIds`. If the currently focused panel is not present in the destination window's panel set, the focus entry for that workspace MUST be cleared. If the focused panel is present in the destination window, the focus entry MAY be retained.

#### Scenario: TWS-S1 — Focused panel absent from destination window clears focus mode

- GIVEN workspace `W` has focused panel `P1` and destination window `V2` contains panels `P2` and `P3`
- WHEN the user switches to window `V2` in workspace `W`
- THEN `focusedPanelByWorkspace[W]` is cleared before the layout renders
- AND `resolvePanelVisibleInLayout` makes `P2` and `P3` visible

#### Scenario: TWS-S2 — Focused panel present in destination window retains focus mode

- GIVEN workspace `W` has focused panel `P1` and destination window `V2` contains `P1` and `P2`
- WHEN the user switches to window `V2` in workspace `W`
- THEN `focusedPanelByWorkspace[W]` remains `P1`
- AND `resolvePanelVisibleInLayout` keeps only `P1` visible

### Requirement: TWS-2 — Layout-Settled Lifecycle Dispatch on Window Switch

The `activeWindowIds` post-commit effect in `TerminalWorkspacesManager.jsx` MUST dispatch `devhub:terminal-layout-settled` for every panel id in the destination window after a workspace window switch, in addition to the existing `devhub:native-vte-workspace-sync` event.

#### Scenario: TWS-S3 — Window switch emits layout-settled for destination panels

- GIVEN workspace `W` switches from window `V1` to window `V2`
- AND `V2` contains panels `P2` and `P3`
- WHEN the switch commits and the post-commit effect runs
- THEN a `devhub:terminal-layout-settled` event is dispatched
- AND the event payload includes panel ids `[P2, P3]`
- AND the event reason is `workspace-window-switch`

#### Scenario: TWS-S4 — Native VTE sync continues to fire

- GIVEN a workspace window switch occurs
- WHEN the post-commit effect runs
- THEN `devhub:native-vte-workspace-sync` is still dispatched unchanged
- AND the browser-side layout-settled event is also dispatched

### Requirement: TWS-3 — Workspace Window Switch Lifecycle Reason

`terminalLifecycleSync.js` MUST add `WORKSPACE_WINDOW_SWITCH` to `PANEL_LIFECYCLE_REASONS`. The window-switch dispatch SHOULD route through `scheduleTerminalLifecycleSync` so deduplication and burst-guard logic is reused.

#### Scenario: TWS-S5 — New lifecycle reason is defined

- GIVEN `terminalLifecycleSync.js` defines `PANEL_LIFECYCLE_REASONS`
- WHEN the spec is implemented
- THEN `WORKSPACE_WINDOW_SWITCH` is a valid reason
- AND its string representation is `workspace-window-switch`

#### Scenario: TWS-S6 — Burst deduplication guards are reused

- GIVEN a window switch dispatches `devhub:terminal-layout-settled`
- WHEN the destination panel dimensions have not changed
- THEN `shouldSkipRedundantLayoutSettleViewportSync` prevents redundant fit/resize work

### Requirement: TWS-4 — TerminalTTY Recovery Path Activation

`TerminalTTY.jsx` existing `workspace-window` branches in `handleLayoutSettled`, `shouldClearGpuAtlasOnWorkspaceShow`, and freeze helpers MUST fire for the new `workspace-window-switch` reason without requiring component changes.

#### Scenario: TWS-S7 — GPU atlas clear fires on window switch

- GIVEN a `TerminalTTY` panel is in the destination window
- WHEN `devhub:terminal-layout-settled` with reason `workspace-window-switch` is handled
- THEN the `workspace-window` recovery branch clears the GPU atlas and reattaches the renderer

### Requirement: TWS-5 — Focus-State Consistency for Panel Activation

`activateWorkspacePanel` and `navigateToPanel` MUST ensure `focusedPanelByWorkspace[wsId]` points at a panel that is visible in the current window. If the activated/navigated panel is not in the current window, the system MUST clear the stale focus entry rather than hiding the destination panels.

#### Scenario: TWS-S8 — Navigation to panel in another window clears stale focus

- GIVEN `focusedPanelByWorkspace[W]` is `P1` and the user navigates to panel `P4` in window `V3`
- WHEN the navigation completes
- THEN the focus entry is cleared if `P1` is not in `V3`
- AND panels in `V3` are visible

## Test Scenarios

### Unit Test: `resolvePanelVisibleInLayout` Missing Focus Panel

- GIVEN `focusedPanelId` is set to a panel not present in the current window's columns
- WHEN `resolvePanelVisibleInLayout` evaluates visibility
- THEN it returns `true` for every panel in the destination window
- AND it does not hide all panels

### Integration Test: Window Switch Layout-Settled Event

- GIVEN `TerminalWorkspacesManager` renders workspace `W` with windows `V1` and `V2`
- WHEN `switchWindowInWorkspace(W, V2)` is called
- THEN `devhub:terminal-layout-settled` is dispatched once for `V2`'s panel ids
- AND the event reason is `workspace-window-switch`
- AND `focusedPanelByWorkspace[W]` is cleared when the focused panel is not in `V2`

### Regression Test: Workspace and Page Switches Unchanged

- GIVEN a workspace or page switch that does not change the active workspace window
- WHEN the switch completes
- THEN no `workspace-window-switch` layout-settled event is dispatched
- AND existing layout-show `useLayoutEffect` behavior remains unchanged

## Acceptance Criteria

- Window/panel switches no longer leave destination panels invisible.
- `TerminalTTY` GPU recovery burst fires on every workspace window switch.
- Existing workspace/page switch behavior is unchanged.
- New unit and integration tests pass.
- Changed-line budget stays within ~200–300 lines.
