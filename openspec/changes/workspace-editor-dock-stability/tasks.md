# Tasks: Workspace Editor Dock Stability

## Phase 1: RED — Regression Coverage

- [x] 1.1 RED: Extend `src/components/__tests__/TerminalWorkspacesManager.right-dock.test.jsx` for workspace switch coverage proving browser/editor panes do not remount or reload when moving `ws1 → ws2 → ws1`.
- [x] 1.2 RED: Expand `src/components/__tests__/FileExplorerEditorPane.test.jsx` for file-tree search filtering, ancestor reveal, explicit expand/collapse controls, and empty-result messaging.
- [x] 1.3 RED: Extend `src/views/__tests__/CodeEditor.shell.test.jsx` for standalone editor header context showing project path plus current file/breadcrumb metadata without breaking existing shell chrome.

## Phase 2: GREEN — Workspace-Scoped Stability

- [x] 2.1 GREEN: Create `src/components/workspace/editorPaneState.js` with pure helpers for workspace-scoped selected file, expanded paths, search query, and collapsed-state persistence.
- [x] 2.2 GREEN: Update `src/components/workspace/FileExplorerEditorPane.jsx` to hydrate from `editorPaneState.js`, preserve loaded file/context across workspace activation changes, and avoid resetting content on harmless dock rerenders.
- [x] 2.3 GREEN: Update `src/components/workspace/WorkspaceRightDock.jsx` and `src/components/TerminalWorkspacesManager.jsx` to pass stable workspace identity/props so dock editor and preview stay mounted through workspace switches.

## Phase 3: GREEN — Search And Context UX

- [x] 3.1 GREEN: Update `src/components/workspace/FileExplorerEditorPane.jsx` to add a tree-search input with recursive matching, preserved parent folders, and clear/reset behavior.
- [x] 3.2 GREEN: Update `src/components/workspace/FileExplorerEditorPane.jsx` tree rows and toolbar to improve expand/collapse affordance with visible chevrons, larger click targets, and accessible labels/test ids.
- [x] 3.3 GREEN: Update `src/components/workspace/FileExplorerEditorPane.jsx` and `src/views/CodeEditor.jsx` to surface current path/file context via breadcrumb or dual-line header with truncation-safe tooltip fallbacks.

## Phase 4: REFACTOR — Pure Logic Extraction

- [ ] 4.1 REFACTOR: Extract tree filtering and visible-node derivation into `src/components/workspace/fileTreeState.js` with focused coverage in `src/components/workspace/__tests__/fileTreeState.test.js` if component logic becomes branch-heavy.

## Phase 5: VERIFY — Targeted Proof

- [ ] 5.1 VERIFY: Run `npm test -- TerminalWorkspacesManager.right-dock.test.jsx FileExplorerEditorPane.test.jsx CodeEditor.shell.test.jsx fileTreeState.test.js` and fix any regressions before closing the change.
- [ ] 5.2 VERIFY: Manually confirm every scope item — workspace-switch stability, file-tree search, clearer expand/collapse affordance, and stronger current path/file context visibility — against the implemented UI states.
