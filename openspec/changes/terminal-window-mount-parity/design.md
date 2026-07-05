# Design: terminal-window-mount-parity

## Parity matrix

| Layer | Workspace tab switch | Window switch (target) | Pizarra view switch |
|-------|---------------------|------------------------|---------------------|
| React mount | Shell opacity; TTY mounted | All window shells mounted; TTY per window | Same panel ids; camera moves |
| Visibility | `isWorkspaceVisibleInLayout` | `isVisibleInLayout` + window shell style | `surfaceBelongsToView` / selection |
| Lifecycle effect | `notifyNative` + post-split if multi-panel | **Same** | `onWorkspaceWindowSelect` only |
| PTY | Unchanged | Unchanged | Unchanged |

## Key files

- `src/components/terminal/components/WorkspaceTerminalSurface.jsx` — remove empty parked shell.
- `src/components/terminal/hooks/useWorkspacePanelLifecycle.js` — window effect mirrors workspace effect.
- `src/components/pizarra/PizarraPane.jsx` — no `dispatchTerminalLayoutSettled` on view finish.

## Reuse

- `resolveWorkspaceWindowVisibilityStyle` — `workspaceAnimProps.js`
- `resolvePanelVisibleInLayout` — `workspaceWindowRender.js`
- `schedulePostSplitLayoutViewportSync` — `terminalLifecycleSync.js`