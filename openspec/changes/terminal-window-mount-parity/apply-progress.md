# Apply progress: terminal-window-mount-parity

**Branch:** feature/terminal-decompose

## Done

- WorkspaceTerminalSurface: all windows mount TTY slots; parked uses opacity + `isVisibleInLayout=false`
- useWorkspacePanelLifecycle: window-switch effect mirrors workspace-switch
- PizarraPane: removed layout-settled on view finish
- SDD scaffold under `openspec/changes/terminal-window-mount-parity/`
- `TerminalWorkspacesManager.workspaceWindows.test.js` updated for mount parity

## Follow-up fix (normal mode black / staggered mount)

- `renderWorkspacePanel.jsx`: v2 stays mounted when `isWorkspaceShellVisible` (parked windows)
- `resolveWorkspaceAllWindowsTerminalPanelCount` + cold mount ordinals across all V1/V2/V3
- Restored `dispatchTerminalWindowVisible` for destination `panelIds` on window switch (soft reveal)

## Pending

- Manual Tauri smoke (V1/V2/V3, pizarra)