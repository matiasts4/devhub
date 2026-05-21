# Design: Workspace Editor Dock Stability

## Technical Approach

Take the smallest safe path: keep one editor dock instance mounted at manager level, while right-dock persistence stays workspace-scoped through `rightDockState`. Do not add server search. Reuse the already-loaded tree in `FileExplorerEditorPane` for memoized client-side filtering, and improve navigation cues inside the existing read-only explorer.

## Architecture Decisions

| Decision | Options | Choice | Rationale |
|---|---|---|---|
| Editor lifecycle | Keep dock per workspace shell; hoist one persistent editor shell | One persistent dock/editor shell | Current per-workspace render path swaps dock instances when `activeWsId` changes. One shared shell preserves file tree, selected file, preview mode, and Monaco/preview mount state. |
| Workspace dock state | Global dock state only; workspace-scoped storage + shared mounted shell | Keep workspace-scoped storage | Existing `readRightDockState/writeRightDockState` already isolate browser/history/size per workspace. We only stop using that state as a mount boundary. |
| File search | New `/api/fs/search`; client-side filter on loaded tree | Client-side filter | Proposal asks smallest safe path. Tree is already fetched eagerly; filtering it avoids API scope, refetch churn, and backend risk. |
| Folder/context affordance | Full tree redesign; targeted visual cues | Targeted cues only | Faster, lower-risk UX win: explicit chevron hit target, match highlighting, folder result visibility, and a stronger selected-path header/breadcrumb. |

## Data Flow

```text
workspace tab click
  -> setActiveWsId(next)
  -> effect loads workspace-scoped dock state
  -> single WorkspaceRightDock stays mounted
  -> browser props update for active workspace only
  -> FileExplorerEditorPane keeps existing local state

tree fetched once
  -> local tree state
  -> searchQuery memo filter
  -> filteredTree + forced ancestor expansion
  -> click file -> /api/fs/read -> content/preview
```

## File Changes

| File | Action | Description |
|---|---|---|
| `src/components/TerminalWorkspacesManager.jsx` | Modify | Render a single right-dock layer outside the workspace loop, feed it active-workspace browser/window props, and keep size/visibility driven by current `rightDockState`. |
| `src/components/workspace/WorkspaceRightDock.jsx` | Modify | Always keep `FileExplorerEditorPane` mounted; switch browser/editor visibility with CSS instead of conditional editor mount. |
| `src/components/workspace/FileExplorerEditorPane.jsx` | Modify | Add `searchQuery`, derived filtered tree, ancestor auto-expand during filtering, clearer folder toggles, empty-search state, and stronger current-path/header styling. |
| `src/components/__tests__/TerminalWorkspacesManager.right-dock.test.jsx` | Modify | Assert editor DOM node survives workspace switches and dock prop swaps; keep existing browser persistence assertions green. |
| `src/components/__tests__/FileExplorerEditorPane.test.jsx` | Modify | Cover client-side search, folder visibility during filtering, and stronger selected-path context rendering. |

## Interfaces / Contracts

```js
// FileExplorerEditorPane local additions
const [searchQuery, setSearchQuery] = useState('');
const filteredTree = useMemo(() => filterTree(tree, searchQuery), [tree, searchQuery]);

// filterTree contract
// - returns matching files plus ancestor folders
// - folder match keeps descendants visible
// - does not mutate original tree
```

Behavior contract:
- Workspace switch MUST NOT replace the mounted editor subtree.
- Search MUST filter in memory only and MUST NOT call `/api/fs/tree` again.
- Clearing search MUST restore normal expanded-path behavior from stored prefs.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | `filterTree` behavior | Extract helper in same module or tiny utility; test file match, folder match, ancestor retention, and empty query passthrough. |
| Integration | Dock stability across workspace switches | Extend right-dock Jest test: open editor, select/capture node identity, add workspace, switch away/back, assert same editor element persists. |
| Integration | Explorer UX | Extend pane tests for search input, filtered results, no-refetch on query change, and selected path/breadcrumb visibility. |
| E2E | None for MVP | Local deterministic UI behavior already covered in component tests. |

Strict TDD RED first:
1. Editor stays mounted across workspace switch.
2. Search filters existing tree without extra `/api/fs/tree` fetches.
3. Matching nested file keeps parent folder visible/expandable.
4. Selected path context remains visible after search and selection.

## Migration / Rollout

No migration required. Storage keys stay unchanged. Rollout is direct because only render boundaries and local explorer UX change.

## Open Questions

- [ ] None blocking MVP.

## Rollback Considerations

Rollback is straightforward: move dock rendering back into the workspace shell, restore conditional editor mount, and remove search/context UI additions. Stored dock/UI prefs remain valid.
