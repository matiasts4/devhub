# Proposal: Terminal Workspace Window Switching Stability

## Intent

DevHub terminal V1/V2/V3 and panel-focus switches crash or leave panes blank because `focusedPanelByWorkspace` leaks across window changes and window switches skip the `devhub:terminal-layout-settled` lifecycle event that `TerminalTTY` uses for GPU reattach/atlas clear. This change makes window/panel switches as stable as workspace/page switches while preserving the keep-mounted/visibility-only architecture.

## Scope

### In Scope

- Reconcile `focusedPanelByWorkspace` in `switchWindowInWorkspace` (clear or retarget only when the focused panel is absent from the destination window).
- Add a `WORKSPACE_WINDOW_SWITCH` lifecycle reason and dispatch `devhub:terminal-layout-settled` from the `activeWindowIds` post-commit effect for destination panel ids.
- Unit tests for `resolvePanelVisibleInLayout` with a missing focus panel and an integration test that asserts the layout-settled event fires with correct panel ids on window switch.

### Out of Scope

- Replacing the renderer/engine or native embedding changes.
- Unmounting inactive windows instead of hiding them.
- Browser/right-dock UX changes.

## Capabilities

### New Capabilities

- `terminal-workspace-window-switch`: focus reconciliation and lifecycle dispatch for switching workspace terminal windows.

### Modified Capabilities

- None.

## Approach

Adopt **Approach 1** from exploration. Update `TerminalWorkspacesManager.jsx` to clear/retarget focus state on window switch and emit `devhub:terminal-layout-settled` with reason `workspace-window-switch`. Add the new reason to `terminalLifecycleSync.js` and route the dispatch through `scheduleTerminalLifecycleSync`. Verify `TerminalTTY.jsx` existing `workspace-window` handlers fire without changes. Keep the existing native VTE sync untouched.

## Affected Areas

| Area                                                                          | Impact   | Description                                                                 |
| ----------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------- |
| `src/components/TerminalWorkspacesManager.jsx`                                | Modified | Reconcile focus state and dispatch layout-settled on window switch.         |
| `src/lib/terminal/terminalLifecycleSync.js`                                   | Modified | Add `WORKSPACE_WINDOW_SWITCH` lifecycle reason.                             |
| `src/lib/terminal/workspaceWindowRender.js`                                   | Verify   | Ensure `resolvePanelVisibleInLayout` handles missing focus panel correctly. |
| `src/components/TerminalTTY.jsx`                                              | Verify   | Confirm existing `workspace-window` recovery branch fires.                  |
| `src/components/__tests__/TerminalWorkspacesManager.workspaceWindows.test.js` | New      | Add unit/integration tests.                                                 |

## Risks

| Risk                                                            | Likelihood | Mitigation                                                                                                      |
| --------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------- |
| Extra layout-settled bursts cause resize/fit churn              | Low        | Existing duplicate guards (`shouldSkipRedundantLayoutSettleViewportSync`, size unchanged checks) prevent churn. |
| Users surprised that focus mode does not persist across windows | Med        | Clear focus state only when the focused panel is not in the destination window.                                 |
| Regression in large `TerminalWorkspacesManager.jsx`             | Low        | Localize changes to `switchWindowInWorkspace` and the `activeWindowIds` effect; add tests.                      |

## Rollback Plan

Revert the source edits in `TerminalWorkspacesManager.jsx` and `terminalLifecycleSync.js`, and remove the new tests. The prior blank/crash behavior returns, but no PTY/session data is corrupted because the keep-mounted model is unchanged.

## Dependencies

- None.

## Success Criteria

- [ ] Window/panel switches no longer leave destination panels invisible.
- [ ] `TerminalTTY` GPU recovery burst fires on every workspace window switch.
- [ ] Existing workspace/page switch behavior is unchanged.
- [ ] New unit and integration tests pass.
- [ ] Changed-line budget stays within ~200–300 lines.
