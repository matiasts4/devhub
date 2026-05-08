# Proposal: Workspace Editor Dock Stability

## Intent

Stop editor-side remount churn when users switch workspaces. Today the right dock reloads the editor subtree, which reloads the file tree, current file, and document preview. This change keeps editor state stable and improves file-tree usability without expanding scope into terminal restore or browser-dock behavior.

## Scope

### In Scope
- Preserve editor-pane mount/state across active workspace switches when the editor dock is in use.
- Keep file tree selection, expanded folders, loaded file content, and preview surface stable during workspace switching.
- Add fast file/folder search, clearer folder expand/collapse affordances, and stronger current path/file context cues in the editor pane.

### Out of Scope
- Terminal session restore, reboot recovery, or workspace creation semantics.
- New file operations, editing/write flows, or browser preview capability changes.

## Capabilities

### New Capabilities
- `workspace-editor-dock`: Stable right-dock editor lifecycle plus improved file-tree navigation/context UX.

### Modified Capabilities
- None.

## Approach

Decouple right-dock editor rendering from active workspace swaps so the editor pane stays mounted while dock state remains workspace-scoped. Replace conditional editor mount/unmount in the dock path with a persistent shell strategy, then add lightweight client-side tree filtering and stronger visual hierarchy inside `FileExplorerEditorPane`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/components/TerminalWorkspacesManager.jsx` | Modified | Stop active-workspace dock state swaps from forcing editor remount churn. |
| `src/components/workspace/WorkspaceRightDock.jsx` | Modified | Keep editor pane mounted while switching visible dock content. |
| `src/components/workspace/FileExplorerEditorPane.jsx` | Modified | Add search, clearer folder toggles, and stronger current context signaling. |
| `src/components/__tests__/TerminalWorkspacesManager.right-dock.test.jsx` | Modified | Cover stable editor mount across workspace switches. |
| `src/components/__tests__/FileExplorerEditorPane.test.jsx` | Modified | Cover search and improved tree/context UX. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Persistent mount leaks stale project data | Med | Scope retained editor state to project path and reset only on project change. |
| Search/filter weakens tree performance on large trees | Low | Use memoized in-memory filtering; avoid refetch on query changes. |

## Rollback Plan

Revert dock rendering to current conditional mount behavior and remove new tree-search/context UI. Workspace-scoped right-dock persistence remains intact.

## Dependencies

- None.

## Success Criteria

- [ ] Switching between workspaces no longer reloads the mounted editor subtree, selected file, or document preview.
- [ ] File-tree search filters files/folders quickly without triggering tree refetches.
- [ ] Folder expand/collapse and current directory/file context are visually clearer in the embedded editor pane.
