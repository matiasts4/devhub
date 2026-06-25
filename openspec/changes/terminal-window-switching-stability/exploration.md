## Exploration: Terminal window/panel switching stability

### Current State

- `TerminalWorkspacesManager.jsx` keeps every workspace shell and every workspace window mounted; visibility is toggled via CSS (`resolveWorkspaceShellVisibilityStyle`) rather than unmounting.
- `TerminalTTY.jsx` already supports a keep-mounted/visibility-only model: it releases WebGL/Canvas GPU addons when `isVisibleInLayout` becomes false and reattaches/clears atlases when it becomes true.
- Workspace and page switches only flip `activeWsId` / `isVisible`, so the same panels stay in the same window and the layout-show `useLayoutEffect` in `TerminalTTY` is enough.
- Window switches (V1/V2/V3) and panel focus toggles change the live layout inside the workspace shell, but the surrounding lifecycle events and visibility state are not reconciled the same way.

### Affected Areas

- `src/components/TerminalWorkspacesManager.jsx`
  - `switchWindowInWorkspace` updates `activeWindowIds`, `activePanelIds`, and `workspaces.columns` but never reconciles `focusedPanelByWorkspace`.
  - The `activeWindowIds` post-commit effect only emits `devhub:native-vte-workspace-sync`; it intentionally skips the browser-side `devhub:terminal-layout-settled` event that `TerminalTTY.handleLayoutSettled` already knows how to handle for `workspace-window`.
  - `activateWorkspacePanel` and `navigateToPanel` can also leave focus mode pointing at a panel that is no longer in the visible window.
- `src/lib/terminal/workspaceWindowRender.js`
  - `resolvePanelVisibleInLayout` hides every non-focused panel when `focusedPanelId` is set; this is correct for focus mode but becomes destructive when focus state leaks across a window switch.
- `src/lib/terminal/terminalLifecycleSync.js`
  - No `WORKSPACE_WINDOW_SWITCH` lifecycle reason exists; window switches therefore cannot reuse the centralized burst scheduler.
- `src/components/TerminalTTY.jsx`
  - Already has `workspace-window` branches in `handleLayoutSettled`, `shouldClearGpuAtlasOnWorkspaceShow`, and the freeze helpers, but they are not triggered because no layout-settled event is dispatched.
- `src/components/terminal/workspaceAnimProps.js`
  - `resolveWorkspaceShellVisibilityStyle` correctly keeps shells mounted with `visibility: hidden`; this part of the desired pattern already works.

### Approaches

1. **Reconcile focus state + emit layout-settled on window switch**
   - In `switchWindowInWorkspace`, clear `focusedPanelByWorkspace[wsId]` (or retarget it only if the focused panel exists in the destination window).
   - In the `activeWindowIds` effect, also dispatch `devhub:terminal-layout-settled` with reason `workspace-window-switch` and the destination window's panel ids, in addition to the existing native sync.
   - Optionally add a `WORKSPACE_WINDOW_SWITCH` entry to `PANEL_LIFECYCLE_REASONS` and route the dispatch through `scheduleTerminalLifecycleSync`.
   - Pros: Reuses existing TerminalTTY recovery paths (GPU reattach, atlas clear, extra burst delays), fixes the blank-window symptom, and keeps the keep-mounted/visibility-only contract.
   - Cons: Slightly more burst traffic; must ensure it does not duplicate the layout-show `useLayoutEffect` work. `shouldSkipRedundantLayoutSettleViewportSync` already dedupes unchanged dimensions.
   - Effort: Low

2. **Compute effective visibility without relying on focus state**
   - Change `resolvePanelVisibleInLayout` to ignore `focusedPanelId` when the focused panel is not present in the current window's columns.
   - Pros: Pure helper fix; no new events.
   - Cons: Hides the underlying lifecycle gap (no GPU burst for window switch) and does not standardize the behavior with workspace/page switches.
   - Effort: Very Low

3. **Unmount inactive windows instead of hiding them**
   - Stop rendering parked windows and let React unmount their panels.
   - Pros: Simpler visibility logic.
   - Cons: Violates the desired pattern (sessions/PTYs would need re-creation or complex preservation), and conflicts with the existing stabilization work for GPU renderers.
   - Effort: High

### Recommendation

Adopt **Approach 1**.

- It directly fixes the blank-terminal symptom by clearing focus state when the visible window changes.
- It standardizes window/panel switches on the same lifecycle path as other layout changes by emitting `devhub:terminal-layout-settled` for `workspace-window-switch`, which `TerminalTTY` already handles.
- It preserves the keep-mounted/visibility-only architecture and does not require changes to `xterm` or Tauri.

### Risks

- Adding a layout-settled burst for every window switch could produce extra fit/resize calls; existing guards (`shouldSkipRedundantLayoutSettleViewportSync`, `sizeUnchanged`) should prevent churn, but QA should verify on Tauri Linux WebKitGTK.
- Clearing focus mode on window switch changes UX: a user who expected focus mode to persist across windows may be surprised. The safer variant is to clear only when the focused panel is not in the destination window.
- `TerminalWorkspacesManager.jsx` is large; the change must be localized to `switchWindowInWorkspace` and the `activeWindowIds` effect to avoid regressions in pizarra/shared-surface paths.

### Ready for Proposal

Yes. The next step is an SDD proposal/spec that scopes the change to:

1. Focus-state reconciliation in `switchWindowInWorkspace` (and, for consistency, workspace switch).
2. A new `WORKSPACE_WINDOW_SWITCH` lifecycle reason and a single `terminal-layout-settled` dispatch from the `activeWindowIds` post-commit effect.
3. Unit tests for `resolvePanelVisibleInLayout` with a missing focus panel and an integration test that asserts the layout-settled event is fired with the correct panel ids on window switch.

---

## SDD Exploration Result

- **status**: ok
- **executive_summary**: DevHub already keeps terminal shells mounted and toggles visibility for workspace/page switches. Terminal window/panel switches fail because `focusedPanelByWorkspace` leaks across window changes, making every destination panel invisible, and because the `activeWindowIds` effect emits only a native VTE sync and skips the browser-side `devhub:terminal-layout-settled` event that TerminalTTY uses for GPU reattach/clear-atlas recovery. The smallest fix is to reconcile focus state on window switch and dispatch a `workspace-window-switch` layout-settled event for the destination panels.
- **root_cause**: Focus-mode state is global per workspace and is not cleared/retargeted when the active workspace window changes, so `resolvePanelVisibleInLayout` hides all panels in the new window. At the same time, window switches do not emit the `devhub:terminal-layout-settled` lifecycle event, so TerminalTTY's existing `workspace-window` GPU recovery burst is never triggered, leaving canvas/WebGL panels prone to blank or corrupted output.
- **proposed_fix**: In `switchWindowInWorkspace`, clear `focusedPanelByWorkspace[wsId]` when the focused panel is not in the destination window. In the `activeWindowIds` post-commit effect, dispatch `devhub:terminal-layout-settled` with reason `workspace-window-switch` and the destination window's panel ids (routed through `scheduleTerminalLifecycleSync` if a new lifecycle reason is added), while keeping the existing native sync.
- **files_involved**:
  - `src/components/TerminalWorkspacesManager.jsx`
  - `src/lib/terminal/workspaceWindowRender.js`
  - `src/lib/terminal/terminalLifecycleSync.js`
  - `src/components/TerminalTTY.jsx` (verify existing handlers, likely no changes)
  - `src/components/terminal/workspaceAnimProps.js`
  - `src/components/__tests__/TerminalWorkspacesManager.workspaceWindows.test.js`
- **risks**:
  - Extra layout-settled bursts must not duplicate layout-show effect work.
  - Clearing focus mode changes UX; prefer conditional clear.
  - Large TWM file requires careful regression testing for pizarra/shared surfaces.
- **skill_resolution**: paths-injected (`sdd-explore`, `devhub-desktop-engineering`, `senior-frontend`, `react-best-practices`)
- **next_recommended**: Create the SDD proposal and spec for this change, then implement the focus reconciliation + lifecycle dispatch and add tests.
