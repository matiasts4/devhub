# Design: Terminal Workspace Shortcuts

## Technical Approach

Keep the change local to terminal UX. Add workspace-scoped split controls to the panel sub-tabs toolbar, not the already crowded top tab bar. Centralize keyboard parsing and workspace-order resolution in a small pure helper so `TerminalWorkspacesManager.jsx` stays orchestration-only: it wires one global listener, gates it by terminal visibility/focus, and applies actions using the latest workspace snapshot.

## Architecture Decisions

| Decision | Options | Choice | Rationale |
|---|---|---|---|
| Split control placement | Global top bar; panel sub-tabs bar; dropdown-only | Panel sub-tabs bar | Split acts on the active panel in the active workspace. Local placement improves discoverability without adding noise beside Agents/Grid/Reopen controls. |
| Shortcut centralization | Inline `keydown` branches in component; custom hook; pure helper module | Pure helper module + single listener in manager | Keeps event policy, order math, and gating testable without introducing another stateful abstraction into an already large component. |
| Workspace navigation source | Stored IDs; DOM order; `workspaces` state order | `workspaces` state order | Drag/drop already mutates `workspaces`, so state order is the visible order and remains deterministic after reorder. |
| Target panel resolution | Switch workspace only; always pick first panel; preserve per-workspace active panel with fallback | Preserve saved active panel, fallback to first live panel | Matches current UX, avoids dead panel IDs after close/split, and keeps focus predictable. |

## Data Flow

```text
Keydown / split click
  -> TerminalWorkspacesManager listener
  -> workspaceShortcuts.shouldHandle(event, { isVisible, root, activeElement })
  -> workspaceShortcuts.resolveAction(event)
  -> workspaceShortcuts.getAdjacentWorkspaceId(workspaces, activeWsId, direction)
  -> manager resolves target workspace + target panel
  -> setActivePanelIds(...) if fallback needed
  -> setActiveWsId(...) / handleSplit(...)
  -> TerminalTTY receives autoFocus for resolved active panel
```

Rules:
- Ignore all shortcuts when terminal route is hidden.
- Ignore when focus is outside the manager root or inside editable inputs (for example Grid command input).
- `Ctrl+Alt+←/→` wraps across current visible workspace order.
- `Ctrl+Shift+D/R/W` stays mapped to split down/right/close.

## File Changes

| File | Action | Description |
|---|---|---|
| `src/components/TerminalWorkspacesManager.jsx` | Modify | Add compact split controls in the panel toolbar; replace ad-hoc keydown branches with centralized shortcut wiring; resolve workspace/panel switching from latest state. |
| `src/components/terminal/workspaceShortcuts.js` | Create | Pure helpers for shortcut matching, scope gating, ordered workspace IDs, and adjacent workspace resolution. |
| `src/components/__tests__/TerminalWorkspacesManager.panel-subtabs.test.jsx` | Modify | RED-first coverage for visible split controls, accessible names, and click behavior for split right/down. |
| `src/components/__tests__/TerminalWorkspacesManager.shortcuts.test.jsx` | Create | RED-first keyboard tests for workspace cycling, wraparound, visibility/focus gating, and preserved legacy split shortcuts. |

## Interfaces / Contracts

```js
export const TERMINAL_WORKSPACE_SHORTCUTS = {
  splitDown: 'Ctrl+Shift+D',
  splitRight: 'Ctrl+Shift+R',
  closePanel: 'Ctrl+Shift+W',
  previousWorkspace: 'Ctrl+Alt+ArrowLeft',
  nextWorkspace: 'Ctrl+Alt+ArrowRight',
};

getAdjacentWorkspaceId(workspaces, activeWsId, direction) => workspaceId | null
shouldHandleTerminalShortcut(event, { isVisible, rootElement, activeElement }) => boolean
```

Toolbar contract:
- Two visible split actions in one compact group: Split Right, Split Down.
- Each button MUST expose `title` and `aria-label` with shortcut hints.
- Buttons always target the current active panel in the current active workspace.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | Shortcut matcher, scope guard, adjacent workspace resolution | Jest tests for helper module, including reordered workspaces and wraparound. |
| Integration | Split buttons and keyboard behavior in manager | DOM/component tests with persisted workspace state and dispatched keyboard events. |
| E2E | None for MVP | Existing component coverage is enough because behavior is local and deterministic. |

Strict TDD RED first:
1. Split controls render in the panel toolbar with accessible labels and shortcut hints.
2. Clicking Split Right creates a new column and makes the new panel active.
3. Clicking Split Down stacks a panel in the same column and makes it active.
4. `Ctrl+Alt+→/←` follows reordered workspace state and wraps safely.
5. Navigation shortcuts do nothing when terminal is hidden or an editable field is focused.
6. `Ctrl+Shift+D/R/W` still trigger the existing split/close behavior.

## Migration / Rollout

No migration required. No storage schema changes. Rollout is direct because the change only affects in-memory UI behavior on the terminal route.

## Open Questions

- [ ] None blocking MVP.

## Rollback Considerations

Rollback is low risk: remove the split-control group, delete `workspaceShortcuts.js`, and drop the shortcut-focused tests. Because workspace persistence shape is unchanged, rollback does not require data cleanup or state migration.
