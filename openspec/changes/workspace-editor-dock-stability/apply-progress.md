# Apply Progress: workspace-editor-dock-stability

## Status

- Completed tasks: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3
- Pending tasks: 4.1, 5.1, 5.2
- Mode: Strict TDD (`npm test`)

## Completed Work

- Added RED coverage for persistent right-dock editor mounting across workspace switches.
- Added RED coverage for in-memory file-tree search, ancestor visibility, explicit folder toggles, and empty-search messaging.
- Added RED coverage for standalone editor shell context showing project path, current file, and breadcrumb metadata.
- Introduced workspace-scoped editor pane persistence helpers in `editorPaneState.js`.
- Kept the editor pane mounted inside the shared right dock while swapping active workspace identity.
- Added stronger file/directory context headers plus search UX and explicit folder toggle controls.

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 1.1 | `src/components/__tests__/TerminalWorkspacesManager.right-dock.test.jsx` | Integration | ✅ `npm test -- src/components/__tests__/TerminalWorkspacesManager.right-dock.test.jsx src/components/__tests__/FileExplorerEditorPane.test.jsx src/views/__tests__/CodeEditor.shell.test.jsx` → 24/24 passing baseline | ✅ Added persistent mount assertion for `ws1 → ws2 → ws1` | ✅ Final targeted suite passed | ✅ Same node identity + workspace id swap + single mount count | ✅ Hoisted shared right-dock layer while keeping existing browser tests green |
| 1.2 | `src/components/__tests__/FileExplorerEditorPane.test.jsx` | Integration | ✅ same 24/24 baseline | ✅ Added search/filter, ancestor visibility, toggle affordance, empty-state tests | ✅ `npm test -- src/components/__tests__/FileExplorerEditorPane.test.jsx` → 4/4 passing | ✅ Non-empty nested match + empty-search branch | ✅ Extracted workspace-scoped pane state helper and recursive filter helpers in component |
| 1.3 | `src/views/__tests__/CodeEditor.shell.test.jsx` | Integration | ✅ same 24/24 baseline | ✅ Added standalone shell header context assertions | ✅ Final targeted suite passed | ✅ Project path + file path + breadcrumb assertions | ✅ Kept shell chrome intact while adding context callback |
| 2.1 | `src/components/__tests__/FileExplorerEditorPane.test.jsx` | Integration + pure helper support | ✅ RED suite in place first | ✅ Existing RED tests required workspace-scoped persistence | ✅ Final targeted suite passed | ✅ Search state + selected file persistence exercised through pane tests | ✅ Added `editorPaneState.js` as minimal pure helper module |
| 2.2 | `src/components/__tests__/FileExplorerEditorPane.test.jsx` | Integration | ✅ RED suite in place first | ✅ Tests failed before persistence/search changes existed | ✅ Final targeted suite passed | ✅ File load + search + context branches covered | ✅ Preserved legacy UI prefs while layering workspace snapshots |
| 2.3 | `src/components/__tests__/TerminalWorkspacesManager.right-dock.test.jsx` | Integration | ✅ RED suite in place first | ✅ Dock stability test failed before stable shared layer existed | ✅ Final targeted suite passed | ✅ Visibility-hidden workspace swap + return path covered | ✅ Smallest safe manager/right-dock changes only |
| 3.1 | `src/components/__tests__/FileExplorerEditorPane.test.jsx` | Integration | ✅ RED suite in place first | ✅ Search tests written before implementation | ✅ `npm test -- src/components/__tests__/FileExplorerEditorPane.test.jsx` → 4/4 passing | ✅ Matching nested file + empty-search state | ✅ Kept search in-memory only, no new API |
| 3.2 | `src/components/__tests__/FileExplorerEditorPane.test.jsx` | Integration | ✅ RED suite in place first | ✅ Toggle affordance assertions written first | ✅ Final targeted suite passed | ✅ Toggle label + search branch both pass | ✅ Explicit chevron control separated from file selection |
| 3.3 | `src/views/__tests__/CodeEditor.shell.test.jsx`, `src/components/__tests__/FileExplorerEditorPane.test.jsx` | Integration | ✅ RED suite in place first | ✅ Header context assertions written first | ✅ Final targeted suite passed | ✅ Embedded pane current path + standalone shell breadcrumb | ✅ Reused callback-driven context instead of duplicating state |

## Test Commands

1. Safety net baseline  
   `npm test -- src/components/__tests__/TerminalWorkspacesManager.right-dock.test.jsx src/components/__tests__/FileExplorerEditorPane.test.jsx src/views/__tests__/CodeEditor.shell.test.jsx`  
   Result: 24/24 passing before RED edits.

2. Focused GREEN proof for explorer pane  
   `npm test -- src/components/__tests__/FileExplorerEditorPane.test.jsx`  
   Result: 4/4 passing.

3. Focused GREEN proof for dock + shell  
   `npm test -- src/components/__tests__/TerminalWorkspacesManager.right-dock.test.jsx src/views/__tests__/CodeEditor.shell.test.jsx`  
   Result: 24/24 passing.

4. Final targeted scope proof  
   `npm test -- src/components/__tests__/TerminalWorkspacesManager.right-dock.test.jsx src/components/__tests__/FileExplorerEditorPane.test.jsx src/views/__tests__/CodeEditor.shell.test.jsx`  
   Result: 28/28 passing.

## Files Changed

- `src/components/TerminalWorkspacesManager.jsx` — shared right-dock layer now survives workspace switches.
- `src/components/workspace/WorkspaceRightDock.jsx` — editor pane stays mounted and swaps visibility with CSS.
- `src/components/workspace/FileExplorerEditorPane.jsx` — workspace-scoped persistence, search UX, affordance updates, stronger path context.
- `src/components/workspace/editorPaneState.js` — pure persistence helpers for workspace editor pane state.
- `src/views/CodeEditor.jsx` — standalone shell now shows project path, current file, breadcrumb context.
- `src/components/__tests__/TerminalWorkspacesManager.right-dock.test.jsx` — regression coverage for shared dock stability.
- `src/components/__tests__/FileExplorerEditorPane.test.jsx` — regression coverage for search/context UX.
- `src/views/__tests__/CodeEditor.shell.test.jsx` — regression coverage for standalone shell context.

## Deviations

- Did not create `fileTreeState.js`; component-level helpers stayed small enough, so task 4.1 remains intentionally open.

## Next Steps

- Run task 5.1 verify command once final verify scope is ready.
- Manually confirm task 5.2 UI states in-app.
- Only extract `fileTreeState.js` if future branch complexity grows.
