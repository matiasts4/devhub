# Tasks: Terminal Workspace Shortcuts

## Phase 1: Shortcut Foundation

- [x] 1.1 RED: Create `src/components/__tests__/TerminalWorkspacesManager.shortcuts.test.jsx` for `Ctrl+Alt+ArrowLeft/Right` wraparound from reordered `workspaces` state, hidden-terminal no-op, editable-focus no-op, and legacy `Ctrl+Shift+D/R/W` safety-net coverage.
- [x] 1.2 GREEN: Create `src/components/terminal/workspaceShortcuts.js` with exported shortcut constants, combo parsing, terminal visibility/focus guards, and adjacent-workspace resolution from visible `workspaces` order.
- [x] 1.3 GREEN: Update `src/components/TerminalWorkspacesManager.jsx` to replace ad-hoc keydown branching with one listener that uses `workspaceShortcuts.js`, preserves active-panel fallback, and only prevents default for supported terminal-scoped combos.

## Phase 2: Visible Split Controls

- [x] 2.1 RED: Expand `src/components/__tests__/TerminalWorkspacesManager.panel-subtabs.test.jsx` for visible Split Right / Split Down buttons, accessible names, shortcut hints, and disabled or non-operative guardrails when another panel is not allowed.
- [x] 2.2 GREEN: Update `src/components/TerminalWorkspacesManager.jsx` panel sub-tabs toolbar to render compact split controls that call the existing split-right / split-down behavior for the active panel without changing geometry semantics.
- [x] 2.3 GREEN: Add terminal-visible hint wiring in `src/components/TerminalWorkspacesManager.jsx` so split controls expose `aria-label`, `title`, and discoverable shortcut text or tooltip for the mapped action and limit reason.

## Phase 3: Workspace Navigation Behavior

- [x] 3.1 RED: Extend `src/components/__tests__/TerminalWorkspacesManager.shortcuts.test.jsx` for previous/next workspace activation, wraparound, and preserving the saved active panel with first-live-panel fallback after workspace change.
- [x] 3.2 GREEN: Update `src/components/TerminalWorkspacesManager.jsx` to activate previous/next workspaces on `Ctrl+Alt+ArrowLeft/Right` using visible tab order plus terminal visibility and focus guardrails.
- [x] 3.3 GREEN: Surface discoverable previous/next workspace shortcut hints beside terminal split hints in `src/components/TerminalWorkspacesManager.jsx` without adding unrelated settings, remaps, or non-terminal UI changes.

## Phase 4: Safety Net and Verification

- [x] 4.1 REFACTOR: Tighten `src/components/__tests__/TerminalWorkspacesManager.shortcuts.test.jsx` assertions so `Ctrl+Shift+D`, `Ctrl+Shift+R`, and `Ctrl+Shift+W` prove split ordering and close-panel semantics remain unchanged.
- [x] 4.2 Verify targeted coverage with `npm test -- TerminalWorkspacesManager.panel-subtabs.test.jsx` and `npm test -- TerminalWorkspacesManager.shortcuts.test.jsx`, then check every scenario in `sdd/terminal-workspace-shortcuts/spec.md`.
- [x] 4.3 Verify no scope bleed by exercising terminal tab reorder/persistence and non-terminal workspace flows in existing tests or a manual checklist, confirming only visible split controls and workspace shortcuts changed.
