# Proposal: Terminal Workspace Shortcuts

## Intent

Make terminal split actions visible and add explicit keyboard navigation between terminal workspaces, without changing existing split behavior.

## Scope

### In Scope
- Add explicit terminal toolbar controls for split down and split right on the active workspace.
- Add previous/next workspace shortcuts using `Ctrl+Alt+←` and `Ctrl+Alt+→`.
- Surface shortcut discoverability via visible labels, tooltip/title text, and accessible button names.
- Add automated coverage for keyboard interactions and visible affordances.

### Out of Scope
- Redesigning terminal layout, tab drag/drop, or workspace persistence format.
- User-configurable shortcut remapping.
- Changes outside targeted terminal UX modules.

## Capabilities

### New Capabilities
- `terminal-toolbar-split-controls`: Expose split actions in the terminal toolbar with discoverable shortcut hints.
- `terminal-workspace-shortcuts`: Support keyboard cycling across terminal workspaces while preserving existing split shortcuts.

### Modified Capabilities
- None.

## Approach

Extend `TerminalWorkspacesManager` toolbar with explicit split buttons wired to existing `handleSplit` behavior. Expand the global keydown handler to cycle workspaces by visible order, guard on terminal visibility, and keep `Ctrl+Shift+D/R/W` unchanged. Validate with focused UI tests for button rendering, accessible names, shortcut hints, and keyboard navigation.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/components/TerminalWorkspacesManager.jsx` | Modified | Add split controls, shortcut hints, and workspace navigation hotkeys |
| `src/components/__tests__/TerminalWorkspacesManager*.{js,jsx}` | Modified | Cover visible controls, preserved split shortcuts, and workspace cycling |
| `openspec/changes/terminal-workspace-shortcuts/proposal.md` | New | Proposal artifact |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Shortcut collision with browser/OS behavior | Med | Scope handler to visible terminal, prevent default only on supported combos, test both directions |
| UI clutter in toolbar | Low | Reuse existing compact button pattern and limit MVP to two split actions |
| Dirty worktree pulls unrelated files into scope | Med | Keep changes isolated to terminal UX component/tests only |

## Rollback Plan

Revert toolbar split controls and workspace hotkey handling in `TerminalWorkspacesManager.jsx`, then remove the related tests. Existing split behavior remains available through current shortcuts and generic add flows.

## Dependencies

- Existing split helpers and workspace tab ordering in `TerminalWorkspacesManager.jsx`
- Jest/DOM-based component tests already covering terminal workspace behavior

## Success Criteria

- [ ] Users can trigger split down/right from visible terminal toolbar controls.
- [ ] `Ctrl+Alt+←/→` switches to previous/next workspace in tab order.
- [ ] `Ctrl+Shift+D`, `Ctrl+Shift+R`, and `Ctrl+Shift+W` still behave as today.
- [ ] Tests verify visible affordances and keyboard interactions.
