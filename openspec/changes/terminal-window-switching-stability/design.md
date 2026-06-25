# Design: Terminal Workspace Window Switching Stability

## Technical Approach

DevHub keeps every terminal panel mounted and toggles visibility through `resolvePanelVisibleInLayout`. Switching workspace windows (V1/V2/V3) currently leaves panels blank because a stale `focusedPanelByWorkspace[wsId]` can hide all destination panels, and no browser-side `devhub:terminal-layout-settled` event reaches `TerminalTTY` to clear the GPU atlas and reattach the renderer.

The fix is localized:

1. Reconcile `focusedPanelByWorkspace` before committing a window switch or panel activation/navigation.
2. Dispatch `devhub:terminal-layout-settled` from the `activeWindowIds` post-commit effect using a new `WORKSPACE_WINDOW_SWITCH` lifecycle reason.
3. Rely on existing `TerminalTTY` `workspace-window` recovery branches for GPU/resize recovery.

## Architecture Decisions

| Decision                        | Chosen                                                                      | Rationale                                                                               |
| ------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Focus reconciliation            | Clear focus only when focused panel is absent from destination window       | Minimizes user surprise; preserves focus mode when it still applies                     |
| Browser-side lifecycle dispatch | Reuse `scheduleTerminalLifecycleSync` with `notifyNative` omitted           | Avoids double native sync; `notifyNativeWorkspaceSurfaceSync` already covers native VTE |
| Native VTE sync                 | Keep existing `notifyNativeWorkspaceSurfaceSync('workspace-window-switch')` | Spec requires `devhub:native-vte-workspace-sync` unchanged                              |
| TerminalTTY changes             | None — verify existing branches                                             | `workspace-window` substring already matches `workspace-window-switch`                  |

## Sequence Diagram

```
User clicks V2 tab
  |
  v
switchWindowInWorkspace(wsId, V2)
  |-- markWindowSwitchPanelLayoutSuppress()
  |-- snapshot current window columns into workspaceWindows
  |-- reconcile focusedPanelByWorkspace[wsId]
  |     |-- focusedPanelId in V2.panels ? keep : delete
  |-- setActiveWindowIds[wsId] = V2
  |-- setActivePanelIds[wsId] = V2.activePanelId
  |-- setWorkspaces[wsId].columns = V2.columns
  v
React commit -> activeWindowIds useEffect
  |-- notifyNativeWorkspaceSurfaceSync('workspace-window-switch')
  |     --> dispatch devhub:native-vte-workspace-sync
  |-- scheduleTerminalLifecycleSync({
  |       reason: 'workspace-window-switch',
  |       workspaceId: activeWsId,
  |       panelIds: [V2 panel ids]
  |     })
        --> dispatch devhub:terminal-layout-settled
  v
TerminalTTY.handleLayoutSettled
  |-- panelIds includes self
  |-- isWorkspaceOrWindowSwitch = true
  |-- scheduleTerminalViewportSyncBurst(delays [80, 180, 340])
        --> syncTerminalViewportOnWorkspaceShow with clearAtlas
```

## State Flow Changes

- `focusedPanelByWorkspace[wsId]` is reconciled before the window switch commit.
- `activeWindowIds[wsId]`, `activePanelIds[wsId]`, and `workspaces[wsId].columns` are updated to the destination window state.
- `resolvePanelVisibleInLayout` recomputes `isVisibleInLayout`; with stale focus removed, all destination panels become visible.
- `TerminalTTY` instances in the destination window receive `devhub:terminal-layout-settled` and run the existing workspace/window GPU recovery burst.

## File Changes

| File                                                                          | Action           | Description                                                                                                   |
| ----------------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------- |
| `src/lib/terminal/terminalLifecycleSync.js`                                   | Modify           | Add `WORKSPACE_WINDOW_SWITCH` to `PANEL_LIFECYCLE_REASONS` and `LIFECYCLE_BURST_PHASES`                       |
| `src/components/TerminalWorkspacesManager.jsx`                                | Modify           | `switchWindowInWorkspace`: clear or retain `focusedPanelByWorkspace[wsId]` based on destination panels        |
| `src/components/TerminalWorkspacesManager.jsx`                                | Modify           | `activateWorkspacePanel` / `navigateToPanel`: clear stale focus when target panel is not in the active window |
| `src/components/TerminalWorkspacesManager.jsx`                                | Modify           | `activeWindowIds` post-commit effect: dispatch `devhub:terminal-layout-settled` for destination panels        |
| `src/components/TerminalTTY.jsx`                                              | Verify           | Existing `workspace-window` branches fire for the new reason                                                  |
| `src/lib/terminal/workspaceWindowRender.js`                                   | Verify           | `resolvePanelVisibleInLayout` handles missing focus panel                                                     |
| `src/components/__tests__/TerminalWorkspacesManager.workspaceWindows.test.js` | Create           | Integration tests for window switch lifecycle and focus reconciliation                                        |
| `src/lib/terminal/__tests__/workspaceWindowRender.test.js`                    | Create or modify | Unit test for missing focus panel visibility                                                                  |

## Event Contract

| Event                              | Dispatched by                                                                                 | Payload                                                                                                                  |
| ---------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `devhub:native-vte-workspace-sync` | `notifyNativeWorkspaceSurfaceSync('workspace-window-switch')`                                 | `{ reason: 'workspace-window-switch', activeWorkspaceId, activePanelIds, hiddenPanelIds, avoidRects, at }`               |
| `devhub:terminal-layout-settled`   | `scheduleTerminalLifecycleSync({ reason: 'workspace-window-switch', workspaceId, panelIds })` | `{ reason: 'workspace-window-switch', workspaceId, panelIds: string[], phase: 'immediate' \| 'raf' \| 'delay-...', at }` |

## Testing Strategy

| Layer       | What to test                                                                                                  | Approach                                                              |
| ----------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Unit        | `resolvePanelVisibleInLayout` with stale/missing focus panel                                                  | Jest in `workspaceWindowRender.test.js`                               |
| Integration | Window switch dispatches `devhub:terminal-layout-settled` with correct reason/panelIds and clears stale focus | Render `TerminalWorkspacesManager` and call `switchWindowInWorkspace` |
| Regression  | Workspace/page switches do not emit `workspace-window-switch`                                                 | Assert no event when `activeWindowIds` JSON is unchanged              |
| E2E         | Switching V1/V2/V3 leaves no blank terminal panels                                                            | Playwright smoke in desktop runtime                                   |

## Migration / Rollout

No migration required. The change is behavioral only; no persisted schema changes.

## Open Questions

None.
