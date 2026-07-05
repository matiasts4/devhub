# Tasks: terminal-window-mount-parity

## Phase 1 — Render
- [x] Mount all windows in `WorkspaceTerminalSurface.jsx`
- [x] Split handles only on active window
- [x] Update `TerminalWorkspacesManager.workspaceWindows.test.js` parked contract

## Phase 2 — Lifecycle
- [x] Window-switch effect parity in `useWorkspacePanelLifecycle.js`
- [x] Remove `dispatchTerminalWindowVisible` + `syncPanelLifecycleLayout` on window switch

## Phase 3 — State
- [ ] Optional: reduce `ws.columns` swap in `switchWindowInWorkspace` (deferred; render uses `window.columns`)

## Phase 4 — Pizarra
- [x] Remove layout-settled burst in `PizarraPane` `finishViewSwitch`

## Phase 5 — Verify
- [ ] `npm test -- workspaceWindows.test.js workspaceAnimProps.test.js`
- [ ] Manual Tauri: V1↔V2 + pizarra view switch