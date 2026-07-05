# Design: terminal-decompose

## Technical Approach

Behavior-preserving refactor. Move code out of `TerminalTTY.jsx` (~9,200 lines) and `TerminalWorkspacesManager.jsx` (~7,500 lines) into single-responsibility modules (≤1,000 lines, cohesive modules up to ~1,200). The sequence is TWM componentize-first, then TTY low-risk slices, then deeper TWM state. No v1 retirement, no behavior change.

## Architecture Decisions

### Decision: Ref-Bag Contract for TTY

| Option                           | Tradeoff                                                              | Decision                            |
| -------------------------------- | --------------------------------------------------------------------- | ----------------------------------- |
| (a) Domain ref bags              | Stable across renders, explicit ownership, minimal stale-closure risk | **Chosen**                          |
| (b) Imperative controller object | Good for engine slice, but overkill for UI slices                     | Use only inside `useTerminalEngine` |
| (c) React Context                | Adds re-render surface and indirection; refs are not snapshot-safe    | Rejected                            |

**Contract**

- `viewportRefs`: `{ terminalRootRef, containerRef, viewportShellRef, resizeObserverRef, lastViewportYRef, lastPointerZoneRef, ... }`
- `rendererRefs`: `{ termRef, webglAddonRef, canvasAddonRef, fitRef, webglFallbackRef, handleWebglContextLossRef, ... }`
- `sessionRefs`: `{ wsRef, connectInFlightRef, connectEpochRef, connectAbortRef, sessionClosingRef, transportRef, ... }`
- `lifecycleRefs`: `{ isDisposingRef, hasConnectedOnceRef, isActivePanelRef, isVisibleInLayoutRef, layoutChurnedWhileHiddenRef, ... }`
- `outputRefs`: `{ outputPendingRef, hiddenOutputBufferRef, terminalOutputQueueRef, syncOutputActiveRef, syncOutputBufferRef, ... }`

Each extracted hook receives the bag(s) it needs via props. The bag object itself is created once with `useRef({ ... })` or `useMemo` and mutated in place; the hook reads `.current` fields inside callbacks, never destructures refs at render time. This avoids stale closures without relying on deps arrays.

### Decision: Hook-Before-Class

Build `useTerminalEngine()` first; convert to a headless `TerminalEngine` class only if the hook remains >1,200 lines after all other slices are extracted. The waveterm `termwrap.ts` pattern is the target, not the first step.

### Decision: Orphan Reconciliation

Import the already-extracted TWM componentize modules and delete inline duplicates. Reconcile by diffing behavior, not by line matching; when inline code has diverged, prefer the inline behavior and patch the orphan to match.

## Data Flow

```
TerminalTTY.jsx (thin view)
    │
    ├── domain ref bags ──→ useTerminalOutputQueue
    ├── domain ref bags ──→ useTerminalClipboard
    ├── domain ref bags ──→ useTerminalWheelRouter
    ├── domain ref bags ──→ useTerminalV2Session
    ├── domain ref bags ──→ useTerminalRendererController
    ├── domain ref bags ──→ useTerminalViewportSync
    │
    └── useTerminalEngine (optional final class)

TerminalWorkspacesManager.jsx (thin view)
    │
    ├── renderWorkspacePanel.jsx
    ├── WorkspaceWindowTabBar.jsx
    ├── WorkspaceTerminalSurface.jsx
    ├── useWorkspaceWindowsController
    ├── useRightDockController
    ├── useSwarmLaunchController
    ├── WorkspaceRestoreCoordinator
    ├── useZedWorkspaceEvents
    ├── useTerminalWorkspaceShortcuts
    └── WorkspaceLayoutState reducer
```

## File Changes

| File                                                              | Action         | Description                                               |
| ----------------------------------------------------------------- | -------------- | --------------------------------------------------------- |
| `src/components/TerminalTTY.jsx`                                  | Modify         | Thin view: JSX, effects that wire hooks, ref-bag creation |
| `src/components/TerminalWorkspacesManager.jsx`                    | Modify         | Thin view: JSX, wire orphaned modules, state reducer      |
| `src/components/terminal/hooks/useTerminalOutputQueue.js`         | Create         | Output backlog, flush RAF, sync output (DEC 2026)         |
| `src/components/terminal/hooks/useTerminalClipboard.js`           | Create         | Paste, copy, context menu UI state                        |
| `src/components/terminal/hooks/useTerminalWheelRouter.js`         | Create         | Shell vs TUI wheel decisions                              |
| `src/components/terminal/hooks/useTerminalV2Session.js`           | Create         | WS connect, subscribe, frame decode, rehydration          |
| `src/components/terminal/hooks/useTerminalRendererController.js`  | Create         | WebGL/Canvas attach, context-loss, fallback               |
| `src/components/terminal/hooks/useTerminalViewportSync.js`        | Create         | Fit, resize, workspace-show recovery                      |
| `src/components/terminal/hooks/useTerminalEngine.js`              | Create (later) | `{ boot, dispose, fit, resize, sendInput, ... }`          |
| `src/components/terminal/hooks/useTerminalFocusState.js`          | Create         | Focus/blur tracking, active-panel refs                    |
| `src/components/terminal/hooks/useTerminalTuiDetection.js`        | Create         | grok/kimi/opencode readiness detection                    |
| `src/components/terminal/hooks/useTerminalSettings.js`            | Create         | Font size, renderer prefs local state                     |
| `src/components/workspace/WorkspaceRestoreCoordinator.js`         | Create         | Startup restore async orchestration                       |
| `src/components/terminal/hooks/useZedWorkspaceEvents.js`          | Create         | Zed action event handlers                                 |
| `src/components/terminal/hooks/useTerminalWorkspaceShortcuts.js`  | Create         | Keyboard shortcut wiring                                  |
| `src/components/terminal/hooks/useWorkspaceLayoutState.js`        | Create         | Reducer consolidating 20+ `useState` calls                |
| `src/components/terminal/components/renderWorkspacePanel.jsx`     | Modify         | Reconcile with TWM inline, import into TWM                |
| `src/components/terminal/hooks/useWorkspaceWindowsController.js`  | Modify         | Reconcile drift, expand signature to match TWM            |
| `src/components/terminal/hooks/useRightDockController.js`         | Modify         | Keep; import into TWM                                     |
| `src/components/terminal/hooks/useSwarmLaunchController.js`       | Modify         | Reconcile counters/refs signature                         |
| `src/components/terminal/components/WorkspaceWindowTabBar.jsx`    | Modify         | Import into TWM                                           |
| `src/components/terminal/components/WorkspaceTerminalSurface.jsx` | Modify         | Import into TWM                                           |

## Interfaces / Contracts

### Ref-Bag Shape

```js
const viewportRefs = useRef({
  terminalRootRef,
  containerRef,
  viewportShellRef,
  resizeObserverRef,
  lastViewportYRef,
  lastPointerZoneRef,
  needsViewportSyncOnShowRef,
  layoutChurnedWhileHiddenRef,
  layoutHiddenGenerationRef,
  containerWasZeroSizedOnShowRef,
});
```

Hook signature:

```js
function useTerminalOutputQueue({ refs, isEngineV2, onSyncOutput }) {
  // reads refs.outputPendingRef.current, refs.terminalOutputQueueRef.current
  // returns { enqueueOutput, flushOutput, clearOutputQueue }
}
```

The `refs` object identity is stable; only `.current` fields mutate.

### `useTerminalEngine` Return

```js
const engine = useTerminalEngine({
  refs,
  isEngineV2,
  initialCommand,
  panelId,
  // ...read-only props
});

// engine exposes imperative surface only:
{
  boot,
  dispose,
  fit,
  resize,
  sendInput,
  paste,
  focus,
  blur,
  getConnectionState,
}
```

The thin view keeps React state and JSX; `useTerminalEngine` owns xterm lifecycle and imperative actions.

### `WorkspaceLayoutState` Reducer

```js
const [layoutState, dispatchLayout] = useWorkspaceLayoutState({
  initialWorkspaces,
  initialActiveWsId,
  initialActivePanelIds,
});

// Actions
{
  type: 'ADD_WORKSPACE';
}
{
  type: ('REMOVE_WORKSPACE', wsId);
}
{
  type: ('SELECT_WORKSPACE', wsId);
}
{
  type: ('ADD_WINDOW', wsId, window);
}
{
  type: ('SELECT_WINDOW', wsId, windowId);
}
{
  type: ('SPLIT_PANEL', panelId, direction);
}
{
  type: ('CLOSE_PANEL', panelId);
}
{
  type: ('RENAME_PANEL', panelId, name);
}
{
  type: ('SET_FOCUSED_PANEL', wsId, panelId);
}
```

## Testing Strategy

| Layer       | What to Test                                          | Approach                                                                                                                                           |
| ----------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit        | `useTerminalOutputQueue` backlog/flush/sync output    | Jest hook test with fake RAF + timers                                                                                                              |
| Unit        | `useTerminalClipboard` paste/copy/context menu        | React Testing Library, mocked clipboard                                                                                                            |
| Unit        | `useTerminalWheelRouter` routing decisions            | Jest, mocked wheel event + TUI state                                                                                                               |
| Unit        | `useTerminalV2Session` connect/subscribe/frame decode | Mock WebSocket, assert on message handling                                                                                                         |
| Unit        | `useTerminalRendererController` attach/reattach       | Mock xterm + addon refs                                                                                                                            |
| Unit        | `useTerminalViewportSync` fit/resize coalescing       | Mock ResizeObserver + timers                                                                                                                       |
| Integration | Orphan reconciliation                                 | Run `TerminalWorkspacesManager.test.js`, `.workspaceWindows.test.js`, `.right-dock.test.jsx`, `.split-layout.test.jsx` before deleting inline code |
| Integration | `WorkspaceRestoreCoordinator`                         | `startupRestoreCoordinator.test.js`, `startupRestoreRunner.test.js`                                                                                |
| E2E         | v2 terminal flows                                     | Playwright smoke: open panel, type, switch workspace, restore                                                                                      |

Slices without dedicated tests (output queue, sync output) get a guard test written **before** extraction.

## Migration / Rollout

No data migration. Feature flags, v1/v2 branches, and recovery paths are preserved exactly. Each extraction is one PR in a feature-branch chain; child PRs rebase/retarget to the parent branch before review so diffs stay clean.

## Open Questions

- [ ] Should `useTerminalEngine` be a hook or a headless class? Decision deferred until hook size is known.
- [ ] Which `WorkspaceLayoutState` reducer actions can be extracted in one PR without exceeding 400 changed lines?

## Extraction Order

### TerminalTTY.jsx

1. Delete native VTE stubs (~20 lines).
2. Move pure helper exports to `lib/terminal/` or `TerminalTTY.helpers.js`.
3. Extract `useTerminalOutputQueue` — clean boundary, add guard tests first.
4. Extract `useTerminalClipboard`.
5. Extract `useTerminalWheelRouter`.
6. Extract `useTerminalV2Session`.
7. Extract `useTerminalRendererController`.
8. Extract `useTerminalViewportSync`.
9. Build `useTerminalEngine` from remaining lifecycle; optional class conversion last.

### TerminalWorkspacesManager.jsx

1. Wire orphaned componentize modules and delete inline duplicates.
2. Extract startup restore into `WorkspaceRestoreCoordinator`.
3. Wire `useSwarmLaunchController` and delete inline swarm logic.
4. Extract Zed events into `useZedWorkspaceEvents`.
5. Extract shortcuts into `useTerminalWorkspaceShortcuts`.
6. Consolidate workspace state into `useWorkspaceLayoutState` reducer.
7. Final thin TWM.

## Tangled-Slice Handling

| Tangled Slice          | Finer Cut                                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------- |
| `TerminalEngine`       | Hook-first; class only if hook >1,200 lines. Build from grouped ref bags.                                     |
| `TerminalViewModel`    | Split into `useTerminalFocusState`, `useTerminalTuiDetection`, `useTerminalSettings`, `useTerminalClipboard`. |
| `TerminalResizeSync`   | Split fit/resize (`useTerminalViewportSync`) from renderer attach (`useTerminalRendererController`).          |
| `WorkspaceLayoutState` | Reducer with actions per mutation; keep selectors in module to avoid passing `workspacesRef` into closures.   |

## Orphan Reconciliation

For each orphaned module, compare against the inline TWM twin:

| Module                             | Reconcile Strategy                                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------------------ |
| `renderWorkspacePanel.jsx`         | Inline version at TWM L919–1309 is richer; patch orphan to match, then import.             |
| `useWorkspaceWindowsController.js` | Inline version has more feature-complete add/remove/switch; expand hook signature, import. |
| `useRightDockController.js`        | Already matches inline behavior; import directly.                                          |
| `useSwarmLaunchController.js`      | Inline counters/refs differ; align signatures before import.                               |
| `WorkspaceWindowTabBar.jsx`        | Import as JSX component.                                                                   |
| `WorkspaceTerminalSurface.jsx`     | Inline render at TWM L6428+ may differ; patch or choose the more complete one.             |

Reconcile rule: **preserve behavior**. If inline code handles an edge case the orphan does not, patch the orphan. Run TWM tests after each import switch.

## Test-Gating Strategy

- Every extraction branch must pass the full TTY/TWM suites before PR open.
- Slices without dedicated tests require a guard test added first.
- `useTerminalOutputQueue` guard test: assert backlog coalescing and DEC 2026 sync-output boundaries.
- `useTerminalWheelRouter` guard test: assert wheel events route to shell vs TUI based on `tuiSessionActiveRef`.
- `WorkspaceRestoreCoordinator` guard test: assert restore plan execution order and abort on unmount.

## Per-Extraction Commit Shape

Each PR is one commit with this structure:

1. Tests (new or updated) for the slice.
2. Extracted module(s).
3. TTY/TWM import switch and inline duplicate deletion.
4. No other changes.

Work-unit naming: `refactor(terminal-decompose): {slice-name}`.

## Risks & Mitigations

| Risk                               | Mitigation                                                                |
| ---------------------------------- | ------------------------------------------------------------------------- |
| Stale closures from ref extraction | Domain ref bags; hooks read `.current`, never destructure refs at render. |
| Orphan drift changes behavior      | Reconcile behavior-first; run TWM tests before deleting inline code.      |
| Premature `TerminalEngine` class   | Hook-first; class conversion is last, optional slice.                     |
| v1/v2 branch divergence            | Preserve `isEngineV2` branches exactly; run legacy suites.                |
| Chain merge conflicts              | One slice per PR; rebase/retarget child PRs to parent before review.      |
| Output-queue regressions           | Add guard tests before extraction.                                        |
| >1,000 line residual files         | Split further if needed; cohesive modules allowed up to ~1,200.           |
