# Design: terminal-workspace-componentize

## Technical Approach

Pure structural extraction in 6 ordered steps. No logic changes. Each step is a standalone commit with passing tests. Import direction enforced by convention + ESLint rule. Orchestrator shrinks to composition-only shell ≤300 lines.

## Architecture Decisions

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Context API for shared state | Clean but requires wrapping consumers; risky scope change | ❌ Rejected — props drilling preserved; no logic change allowed |
| Custom hooks only (no component split) | Simpler but doesn't reduce orchestrator line count enough | ❌ Partial — hooks AND component extraction both needed |
| Extract in dependency order (utils first) | Prevents broken imports mid-extraction | ✅ Chosen — UTIL → HOOK → COMP order |
| Barrel index as public API gate | Enables import path stability for external consumers | ✅ Chosen |
| ESLint `import/no-restricted-paths` for direction | Automated enforcement, fails CI | ✅ Chosen alongside manual review |

## Module Boundary Map

### Already extracted (do NOT re-extract)
| File | Owns | Notes |
|------|------|-------|
| `terminal/workspaceStateHelpers.js` | `closeTerminalSessions`, `syncWorkspaceCountersMonotonic` | Already exists |
| `terminal/workspaceShortcuts.js` | `shouldHandleTerminalShortcut`, `resolveTerminalShortcutAction`, `getAdjacentWorkspaceId`, `TERMINAL_WORKSPACE_SHORTCUTS` | Already exists |
| `terminal/terminalRendererPreferences.js` | Full renderer prefs module | Already exists |
| `workspace/rightDockState.js` | Right dock persistence | Already exists |
| `workspace/browserWindowState.js` | Browser window persistence | Already exists |

### `src/components/terminal/utils/`

| File | Owns | Args → Returns |
|------|------|----------------|
| `swarmRoleMeta.js` | `SWARM_ROLE_ORDER`, `SWARM_ROLE_META`, `inferSwarmRoleKey`, `buildSwarmRoleMetadata`, `getSwarmRoleOrder`, `getSwarmSnapshotStorageKey` | pure functions, no React |
| `panelHelpers.js` | `createPanel`, `createColumn`, `createWindow`, `createDefaultWorkspaceState`, `normalizeWorkspaceState`, `normalizeWorkspaceWindows`, `resolveWorkspacePanelId`, `getWorkspaceTabStyle` | pure functions, no React |
| `semanticMetadata.js` | `derivePanelCommandMetadata`, `derivePanelSemanticMetadata`, `getSessionRenderKey`, `getAgentFromCommand`, `normalizeAgentLabel`, `readAgentRunsByPanel`, `shortPath`, `shortenCommandSummary`, `shortenSemanticLabel`, `buildUniqueRenderKey`, `normalizeRoleKey` | pure functions, no React |

### `src/components/terminal/components/`

| File | Owns | Props → Renders |
|------|------|-----------------|
| `renderWorkspacePanel.jsx` | `renderWorkspacePanel` (lines 494–702, ~208 lines) | `(panel, ...) → JSX` — standalone JSX function, not a React component |

### `src/components/terminal/hooks/`

| File | Owns | Args → Returns |
|------|------|----------------|
| `useRightDockController.js` | All `rightDock*` state (5 hooks: `rightDockState`, `rightDockMeasuredBounds`, `hasMountedRightDock`, `isDraggingDock`, `dockWorkspaceId`) + all rightDock callbacks + `readRightDockState`/`writeRightDockState` effects | `({ projectId, isVisible }) → { rightDockState, setRightDockState, ...handlers, rightDockMeasuredBounds, ... }` |
| `useWorkspaceWindowsController.js` | `workspaceWindows`, `activeWindowIds` state + all window management callbacks (open/close/focus/maximize per-workspace) + Tauri WebviewWindow IPC | `({ projectId, workspaces, activeWsId }) → { workspaceWindows, activeWindowIds, ...handlers }` |
| `useSwarmLaunchController.js` | `swarmLaunchWizardOpen`, `swarmLaunchWizardStep`, `swarmLaunchDraft`, `swarmLaunchSubmitState` state + `enqueueSwarmLaunchRequest` + all swarm wizard handlers | `({ projectId, workspaces, activePanelIds, activeWsId }) → { swarmLaunchWizardOpen, swarmLaunchDraft, handlers... }` |

### `src/components/terminal/components/`

| File | Owns | Props → Renders |
|------|------|-----------------|
| `WorkspaceWindowTabBar.jsx` | Tab strip UI per workspace: drag handles, tab labels, add/close buttons, swarm role badges | `{ workspaces, activeWsId, draggedWsId, dragOverWsId, onTabClick, onAddWorkspace, onCloseWorkspace, onDragStart, onDragOver, onDrop, ... } → JSX` |
| `WorkspaceTerminalSurface.jsx` | Per-workspace panel grid: columns, `Panel`/`PanelGroup`/`PanelResizeHandle`, `TerminalTTY` instances, split/add/close panel controls | `{ workspace, activePanelId, focusedPanel, terminalRendererPreferences, showPathChip, ...panelHandlers } → JSX` |
| `SwarmLaunchEntryPoint.jsx` | `SwarmLaunchWizardModal` trigger + wiring; renders the modal when `swarmLaunchWizardOpen` is true | `{ open, step, draft, submitState, onClose, onStepChange, onSubmit, ... } → JSX` |

### Orchestrator (`TerminalWorkspacesManager.jsx` — stays)

Owns post-extraction:
- Props: `{ cwd, isVisible, projectId }` — **unchanged**
- Core workspace state: `workspaces`, `activeWsId`, `activePanelIds` (these 3 are the root; all other state moves out)
- `isClientLoaded`, `isMaximized`, `isAgentSidebarVisible`, `isDraggingInternalSplit`, `gridCommand`, `isGridLauncherOpen`, `browserWindowStates`, `terminalRendererPreferences`, `showWorkspacePathChip`, `focusedPanelByWorkspace`, `reopenActionError` — stays
- Calls all extracted hooks; assembles sub-components
- Session persistence effects (localStorage read/write for workspaces)
- Keyboard shortcut global handler

## Shared State Design (24 useState → post-split homes)

| State | Post-split home |
|-------|----------------|
| `workspaces`, `activeWsId`, `activePanelIds` | Orchestrator (root state — others depend on it) |
| `rightDockState`, `rightDockMeasuredBounds`, `hasMountedRightDock`, `isDraggingDock`, `dockWorkspaceId` | `useRightDockController` |
| `workspaceWindows`, `activeWindowIds` | `useWorkspaceWindowsController` |
| `swarmLaunchWizardOpen`, `swarmLaunchWizardStep`, `swarmLaunchDraft`, `swarmLaunchSubmitState` | `useSwarmLaunchController` |
| `draggedWsId`, `dragOverWsId` | Orchestrator (tab drag — trivial, local to orchestrator) |
| `gridCommand`, `isGridLauncherOpen` | Orchestrator |
| `browserWindowStates` | Orchestrator (used by `useWorkspaceWindowsController` but owned in orchestrator, passed as arg) |
| `terminalRendererPreferences` | Orchestrator |
| `showWorkspacePathChip`, `focusedPanelByWorkspace` | Orchestrator |
| `reopenActionError`, `isClientLoaded`, `isMaximized`, `isAgentSidebarVisible`, `isDraggingInternalSplit` | Orchestrator |
| `isWinMaximized` (line 2804 — inside sub-component) | `WorkspaceWindowTabBar` or inline (already scoped) |

## Index Barrel

`src/components/terminal/index.js` — public API for external consumers:

```js
// Hooks
export { default as useRightDockController } from './hooks/useRightDockController';
export { default as useWorkspaceWindowsController } from './hooks/useWorkspaceWindowsController';
export { default as useSwarmLaunchController } from './hooks/useSwarmLaunchController';

// Components
export { default as WorkspaceWindowTabBar } from './components/WorkspaceWindowTabBar';
export { default as WorkspaceTerminalSurface } from './components/WorkspaceTerminalSurface';
export { default as SwarmLaunchEntryPoint } from './components/SwarmLaunchEntryPoint';

// Utils (selected — only what external callers may need)
export * from './utils/swarmRoleMeta';
export * from './utils/panelHelpers';
```

Internal utils (`semanticMetadata.js`, `renderWorkspacePanel.js`) are NOT barrel-exported — they are private to the package.

## Data Flow

```
TerminalWorkspacesManager (orchestrator)
  ├── workspaces / activeWsId / activePanelIds  ──→  passed down as props
  │
  ├── useRightDockController({ projectId, isVisible })
  │     └── returns rightDockState, handlers ──→ props to WorkspaceRightDock
  │
  ├── useWorkspaceWindowsController({ projectId, workspaces, activeWsId })
  │     └── returns workspaceWindows, activeWindowIds, handlers
  │
  ├── useSwarmLaunchController({ projectId, workspaces, activePanelIds, activeWsId })
  │     └── returns wizard state + handlers ──→ props to SwarmLaunchEntryPoint
  │
  ├── <WorkspaceWindowTabBar workspaces activePanelIds ... />
  ├── <WorkspaceTerminalSurface workspace activePanelId ... />  (mapped over workspaces)
  └── <SwarmLaunchEntryPoint open draft submitState ... />
```

## SMOKE-1 Gate Design

Before step 6 (swarm extraction), verify these manually in the running app:

| Check | What to verify |
|-------|---------------|
| SMOKE-1a | Click "Launch Swarm" → wizard modal opens at step `team` |
| SMOKE-1b | Select a team template + fill slots → `swarmLaunchDraft` populated (visible via React DevTools) |
| SMOKE-1c | Submit → `enqueueSwarmLaunchRequest` fires → workspaces + panels are created |
| SMOKE-1d | `SwarmLaunchWizardModal` closes after submit |
| SMOKE-1e | All launched terminals connect (TerminalTTY renders without error boundary fallback) |

Document SMOKE-1 result (pass/fail + date) in a `smoke-test-log.md` in the change directory before starting step 6.

## Import Direction Enforcement

Direction: `utils → hooks → components → orchestrator` (no reverse allowed).

**ESLint rule** — add to `.eslintrc` (or `eslint.config.js`):

```json
"import/no-restricted-paths": ["error", {
  "zones": [
    {
      "target": "./src/components/terminal/utils",
      "from": "./src/components/terminal/hooks"
    },
    {
      "target": "./src/components/terminal/utils",
      "from": "./src/components/terminal/components"
    },
    {
      "target": "./src/components/terminal/hooks",
      "from": "./src/components/terminal/components"
    }
  ]
}]
```

This makes CI fail if a util imports a hook, a hook imports a component, etc.

## Orchestrator Size — What Remains ≤300 Lines

After all extractions the orchestrator contains ONLY:
1. Imports (hooks + components + utils)
2. Props destructure
3. Root workspace state (3 useState)
4. ~10 remaining useState hooks (grid, browser, renderer, sidebar, etc.)
5. Session persistence effects (localStorage read/write, ~50 lines)
6. Keyboard shortcut effect
7. Hook calls (3 hooks, 3 lines each)
8. `return (...)` — JSX assembly using the 3 sub-components

Estimate: ~220–270 lines. Margin to spare.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/components/terminal/utils/swarmRoleMeta.js` | Create | SWARM_ROLE constants + inferSwarmRoleKey, buildSwarmRoleMetadata |
| `src/components/terminal/utils/panelHelpers.js` | Create | createPanel, createColumn, createWindow, createDefaultWorkspaceState, normalizeWorkspaceState, normalizeWorkspaceWindows |
| `src/components/terminal/utils/semanticMetadata.js` | Create | derivePanelCommandMetadata, derivePanelSemanticMetadata, readAgentRunsByPanel, related helpers |
| `src/components/terminal/utils/renderWorkspacePanel.js` | Create | renderWorkspacePanel function (has React dep) |
| `src/components/terminal/hooks/useRightDockController.js` | Create | Right dock state + callbacks + persistence effects |
| `src/components/terminal/hooks/useWorkspaceWindowsController.js` | Create | Workspace window management + Tauri WebviewWindow IPC |
| `src/components/terminal/hooks/useSwarmLaunchController.js` | Create | Swarm wizard state + enqueueSwarmLaunchRequest |
| `src/components/terminal/components/WorkspaceWindowTabBar.jsx` | Create | Tab strip UI |
| `src/components/terminal/components/WorkspaceTerminalSurface.jsx` | Create | Panel grid + TerminalTTY rendering |
| `src/components/terminal/components/SwarmLaunchEntryPoint.jsx` | Create | Swarm wizard modal wiring |
| `src/components/terminal/index.js` | Create | Public barrel export |
| `src/components/TerminalWorkspacesManager.jsx` | Modify | Remove extracted code, add imports, reduce to ≤300 lines |
| `.eslintrc` (or `eslint.config.js`) | Modify | Add import/no-restricted-paths zones |
| `openspec/changes/terminal-workspace-componentize/smoke-test-log.md` | Create (at SMOKE-1 gate) | Manual smoke test result before step 6 |

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | Each util function | Existing tests + new ones per utils file |
| Unit | useRightDockController, useWorkspaceWindowsController | `renderHook` from `@testing-library/react` |
| Unit | WorkspaceWindowTabBar, WorkspaceTerminalSurface | Snapshot + prop forwarding tests |
| Integration | Orchestrator renders without error after each step | `npm test` gate per step |
| Manual smoke | Swarm launch end-to-end | SMOKE-1 checklist before step 6 |

## Migration / Rollout

No migration required. Pure refactor — no API, database, or Tauri contract changes.

## Open Questions

- [ ] `renderWorkspacePanel` (line 494) has React JSX — should it live in `utils/` or `components/`? (Recommendation: `components/renderWorkspacePanel.js` since it produces JSX, but it's not a React component — keep as named function export.)
- [ ] Does `useWorkspaceWindowsController` own `browserWindowStates` or receive it from orchestrator? Needs line-count audit of that hook to decide.
