# Tasks: terminal-decompose

## Review Workload Forecast

| Field                   | Value                                                 |
| ----------------------- | ----------------------------------------------------- |
| Estimated changed lines | 3,000–6,000 (refactor: moves + deletes + new modules) |
| 400-line budget risk    | High                                                  |
| Chained PRs recommended | Yes                                                   |
| Suggested split         | feature/terminal-decompose tracker; 15 extraction PRs |
| Delivery strategy       | force-chained                                         |
| Chain strategy          | feature-branch-chain                                  |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

> This is a behavior-preserving refactor. Review burden is volume, not behavioral risk. Each PR is one extraction with focused tests. `size_exception_pre_authorized: true` is in effect.

### Suggested Work Units

| Unit  | Slice                                      | PR    | Base branch                  | Notes                                  |
| ----- | ------------------------------------------ | ----- | ---------------------------- | -------------------------------------- |
| TWM-1 | Wire orphaned componentize modules         | PR 1  | `feature/terminal-decompose` | Lowest risk; validates chain pipeline. |
| TTY-1 | Delete native VTE stubs                    | PR 2  | TWM-1 branch                 | ~20 lines; no-op collapse.             |
| TTY-2 | Move pure helper exports                   | PR 3  | TTY-1 branch                 | No behavior change.                    |
| TTY-3 | Extract `useTerminalOutputQueue`           | PR 4  | TTY-2 branch                 | Add guard tests first.                 |
| TTY-4 | Extract `useTerminalClipboard`             | PR 5  | TTY-3 branch                 | React-only slice.                      |
| TTY-5 | Extract `useTerminalWheelRouter`           | PR 6  | TTY-4 branch                 | Add guard tests first.                 |
| TWM-2 | Extract `WorkspaceRestoreCoordinator`      | PR 7  | TTY-5 branch                 | Async orchestration.                   |
| TWM-3 | Wire `useSwarmLaunchController`            | PR 8  | TWM-2 branch                 | Delete inline swarm logic.             |
| TWM-4 | Extract `useZedWorkspaceEvents`            | PR 9  | TWM-3 branch                 | Event dispatch slice.                  |
| TWM-5 | Extract `useTerminalWorkspaceShortcuts`    | PR 10 | TWM-4 branch                 | Keyboard wiring.                       |
| TWM-6 | Consolidate `WorkspaceLayoutState` reducer | PR 11 | TWM-5 branch                 | Largest TWM slice.                     |
| TTY-6 | Extract `useTerminalV2Session`             | PR 12 | TWM-6 branch                 | WS + rehydration.                      |
| TTY-7 | Extract `useTerminalRendererController`    | PR 13 | TTY-6 branch                 | WebGL/Canvas attach.                   |
| TTY-8 | Extract `useTerminalViewportSync`          | PR 14 | TTY-7 branch                 | Fit/resize/show recovery.              |
| TTY-9 | Extract `useTerminalEngine`                | PR 15 | TTY-8 branch                 | Hook-first; optional class later.      |

Dependency rule: each PR depends on its immediate predecessor in the table. TTY chain (TTY-1..TTY-9) and TWM chain (TWM-1..TWM-6) are logically independent; because the table interleaves them, a task depends on the previous table row. Teams may choose to run two parallel feature-branch chains, but the canonical tracker chain is sequential as shown.

---

## Task TWM-1: Wire orphaned TWM componentize modules

- **Domain:** TWM
- **Slice:** Orphan reconciliation
- **Goal:** Import the already-extracted `terminal-workspace-componentize` modules into `TerminalWorkspacesManager.jsx`, reconcile drift against inline twins, and delete the inline duplicates.
- **Files to modify:**
  - `src/components/TerminalWorkspacesManager.jsx` — add imports; switch calls to orphaned modules; remove inline duplicate code.
  - `src/components/terminal/components/renderWorkspacePanel.jsx` — patch to match richer inline TWM behavior at L919–1309.
  - `src/components/terminal/hooks/useWorkspaceWindowsController.js` — expand signature to cover inline add/remove/switch behavior.
  - `src/components/terminal/hooks/useRightDockController.js` — import as-is; no behavioral change expected.
  - `src/components/terminal/hooks/useSwarmLaunchController.js` — align counters/refs signature with inline.
  - `src/components/terminal/components/WorkspaceWindowTabBar.jsx` — import as JSX component.
  - `src/components/terminal/components/WorkspaceTerminalSurface.jsx` — patch to match inline render at L6428+.
- **Files to delete:** none (only inline code removal inside `TerminalWorkspacesManager.jsx`).
- **Ref-bag/contract:** TWM props pass-through; no ref-bag contract. Preserve `workspacesRef`, `activeWsIdRef`, and panel/window helpers by passing stable refs/objects into the wired hooks.
- **Existing tests to keep green:**
  - `src/components/__tests__/TerminalWorkspacesManager.test.js`
  - `src/components/__tests__/TerminalWorkspacesManager.workspaceWindows.test.js`
  - `src/components/__tests__/TerminalWorkspacesManager.right-dock.test.jsx`
  - `src/components/__tests__/TerminalWorkspacesManager.split-layout.test.jsx`
- **New tests to write first:** none required; covered by existing suites after behavior-first reconciliation.
- **Dependencies:** none (first PR).
- **Acceptance criteria:**
  - [x] `TerminalWorkspacesManager.jsx` imports and calls all six orphaned modules.
  - [x] Inline duplicate blocks removed; `TerminalWorkspacesManager.jsx` line count drops.
  - [x] `npm test -- TerminalWorkspacesManager` green; zero new failures.
  - [x] No v1/v2 behavior change.
- **Estimated changed lines:** M (≈400–700; large deletion + import wiring + orphan patches).

---

## Task TTY-1: Delete native VTE stubs

- **Domain:** TTY
- **Slice:** Dead-stub removal
- **Goal:** Collapse the no-op native VTE placeholder code in `TerminalTTY.jsx` (~20 lines).
- **Files to modify:** `src/components/TerminalTTY.jsx` (delete stubs; replace with a single stub object if any export is still imported).
- **Files to create:** none.
- **Files to delete:** none.
- **Ref-bag/contract:** none.
- **Existing tests to keep green:** `src/components/__tests__/TerminalTTY.test.js`.
- **New tests:** none.
- **Dependencies:** TWM-1 (chain predecessor).
- **Acceptance criteria:**
  - [x] VTE stub code removed or collapsed.
  - [x] `TerminalTTY.jsx` ≤1000 lines target remains tracked.
  - [x] `npm test -- TerminalTTY` green.
- **Estimated changed lines:** S (≈20–40).

---

## Task TTY-2: Move pure helper exports

- **Domain:** TTY
- **Slice:** Helper relocation
- **Goal:** Move stateless helper functions from `TerminalTTY.jsx` (lines ~90–1860) to `src/lib/terminal/` or `src/components/terminal/TerminalTTY.helpers.js`.
- **Files to create:** `src/components/terminal/TerminalTTY.helpers.js` (or individual `src/lib/terminal/*.js` files as appropriate).
- **Files to modify:** `src/components/TerminalTTY.jsx` (replace inline helpers with imports).
- **Files to delete:** none.
- **Ref-bag/contract:** none; pure functions only.
- **Existing tests to keep green:** `src/components/__tests__/TerminalTTY.test.js` (helper tests).
- **New tests:** none; existing helper tests move with the code.
- **Dependencies:** TTY-1.
- **Acceptance criteria:**
  - [x] All relocated helpers re-exported from new module(s).
  - [x] `TerminalTTY.jsx` imports helpers; no inline duplicate logic.
  - [x] Helper tests pass unchanged.
  - [x] `npm test -- TerminalTTY` green.
- **Estimated changed lines:** M (≈300–600; many small moves).

---

## Task TTY-3: Extract `useTerminalOutputQueue`

- **Domain:** TTY
- **Slice:** Output queue / sync output
- **Goal:** Extract output backlog, RAF flush, per-frame cap, and DEC 2026 synchronized-output logic into a hook.
- **Files to create:** `src/components/terminal/hooks/useTerminalOutputQueue.js`.
- **Files to modify:** `src/components/TerminalTTY.jsx` (replace inline queue logic with hook call and returned callbacks).
- **Files to delete:** none.
- **Ref-bag/contract:** Receives `outputRefs` bag: `{ outputPendingRef, hiddenOutputBufferRef, terminalOutputQueueRef, syncOutputActiveRef, syncOutputBufferRef }`. Hook reads `.current` only; never destructures refs at render.
- **Existing tests to keep green:** `src/components/__tests__/TerminalTTY.v2.test.js`, `src/components/__tests__/TerminalTTY.rehydration.test.jsx`.
- **New tests to write first:** `src/components/terminal/hooks/__tests__/useTerminalOutputQueue.test.js` — assert backlog coalescing and DEC 2026 sync-output boundaries.
- **Dependencies:** TTY-2.
- **Acceptance criteria:**
  - [x] Hook ≤1000 lines.
  - [x] `TerminalTTY.jsx` shrinks and delegates to `enqueueOutput`/`flushOutput`/`clearOutputQueue`.
  - [x] New guard tests pass before inline code is deleted.
  - [x] `npm test -- TerminalTTY` green.
- **Estimated changed lines:** M (≈300–500).

---

## Task TTY-4: Extract `useTerminalClipboard`

- **Domain:** TTY
- **Slice:** Clipboard / context menu
- **Goal:** Extract native + xterm paste, copy, context-menu UI state, and handlers.
- **Files to create:** `src/components/terminal/hooks/useTerminalClipboard.js`.
- **Files to modify:** `src/components/TerminalTTY.jsx` (replace inline paste/copy/context-menu blocks with hook return values).
- **Files to delete:** none.
- **Ref-bag/contract:** Receives `rendererRefs` bag for `termRef`; returns handlers and context-menu state to the thin view.
- **Existing tests to keep green:** `src/components/__tests__/TerminalTTY.test.js`.
- **New tests:** none required; if no existing clipboard test, add `src/components/terminal/hooks/__tests__/useTerminalClipboard.test.js` with mocked clipboard.
- **Dependencies:** TTY-3.
- **Acceptance criteria:**
  - [x] Hook ≤1000 lines.
  - [x] Paste/copy/context-menu behavior identical for v1 and v2.
  - [x] `npm test -- TerminalTTY` green.
- **Estimated changed lines:** S–M (≈200–400).

---

## Task TTY-5: Extract `useTerminalWheelRouter`

- **Domain:** TTY
- **Slice:** Wheel event routing
- **Goal:** Extract shell-vs-TUI wheel routing decisions.
- **Files to create:** `src/components/terminal/hooks/useTerminalWheelRouter.js`.
- **Files to modify:** `src/components/TerminalTTY.jsx` (replace wheel handlers with hook-returned router).
- **Files to delete:** none.
- **Ref-bag/contract:** Receives `outputRefs`/`lifecycleRefs` for `tuiSessionActiveRef`; returns `onWheel` callback.
- **Existing tests to keep green:** `src/components/__tests__/TerminalTTY.test.js`, `src/components/__tests__/TerminalTTY.v2.test.js`.
- **New tests to write first:** `src/components/terminal/hooks/__tests__/useTerminalWheelRouter.test.js` — assert wheel routes to shell vs TUI based on `tuiSessionActiveRef.current`.
- **Dependencies:** TTY-4.
- **Acceptance criteria:**
  - [x] Hook ≤1000 lines.
  - [x] Wheel behavior preserved for both TUI-active and shell-only modes.
  - [x] New guard tests pass before inline deletion.
  - [x] `npm test -- TerminalTTY` green.
- **Estimated changed lines:** S (≈100–200).

---

## Task TWM-2: Extract `WorkspaceRestoreCoordinator`

- **Domain:** TWM
- **Slice:** Startup restore orchestration
- **Goal:** Move the async startup restore block (TWM L2095–2352) into a coordinator module.
- **Files to create:** `src/components/workspace/WorkspaceRestoreCoordinator.js`.
- **Files to modify:** `src/components/TerminalWorkspacesManager.jsx` (replace inline restore with coordinator call).
- **Files to delete:** none.
- **Ref-bag/contract:** Receives `{ workspacesRef, dispatchLayout, restoreManifestRef, ... }`; coordinator returns `{ runStartupRestore, abortStartupRestore }`. Uses refs, not closures over mutable state.
- **Existing tests to keep green:**
  - `src/components/__tests__/TerminalWorkspacesManager.startupRestore.test.jsx`
  - `src/lib/terminal/startupRestoreCoordinator.test.js`
  - `src/lib/terminal/__tests__/startupRestoreRunner.test.js`
- **New tests to write first:** `src/components/workspace/__tests__/WorkspaceRestoreCoordinator.test.js` — assert restore plan execution order and abort on unmount.
- **Dependencies:** TTY-5.
- **Acceptance criteria:**
  - [x] Coordinator ≤1000 lines (≤1200 justified for async orchestration).
  - [x] `TerminalWorkspacesManager.jsx` restore block removed.
  - [x] New guard tests pass; existing restore tests green.
  - [x] `npm test -- TerminalWorkspacesManager startupRestore` green.
- **Estimated changed lines:** M (≈300–500).

---

## Task TWM-3: Wire `useSwarmLaunchController`

- **Domain:** TWM
- **Slice:** Swarm launch
- **Goal:** Replace inline swarm launch counters/refs with the existing `useSwarmLaunchController.js` hook.
- **Files to modify:**
  - `src/components/TerminalWorkspacesManager.jsx` (remove inline swarm logic; import/use hook).
  - `src/components/terminal/hooks/useSwarmLaunchController.js` (reconcile signature if needed).
- **Files to create:** none.
- **Files to delete:** none.
- **Ref-bag/contract:** Hook receives workspace/panel refs and returns swarm launch handlers/state.
- **Existing tests to keep green:**
  - `src/components/__tests__/TerminalWorkspacesManager.split-layout.test.jsx`
  - Any existing `useSwarmLaunchController` tests.
- **New tests:** none required if existing coverage is direct.
- **Dependencies:** TWM-2.
- **Acceptance criteria:**
  - [x] Inline swarm launch code removed.
  - [x] `useSwarmLaunchController` integrated with matching signatures.
  - [x] `npm test -- TerminalWorkspacesManager.split-layout` and swarm tests green.
- **Estimated changed lines:** M (≈300–500).

---

## Task TWM-4: Extract `useZedWorkspaceEvents`

- **Domain:** TWM
- **Slice:** Zed action events
- **Goal:** Extract Zed event handlers (TWM L6123–6343) into a hook.
- **Files to create:** `src/components/terminal/hooks/useZedWorkspaceEvents.js`.
- **Files to modify:** `src/components/TerminalWorkspacesManager.jsx` (replace inline Zed handlers with hook).
- **Files to delete:** none.
- **Ref-bag/contract:** Receives `{ dispatchLayout, workspacesRef, activeWsIdRef, ... }`; returns event handler callbacks.
- **Existing tests to keep green:** `src/components/__tests__/TerminalWorkspacesManager.test.js` and any Zed-specific tests.
- **New tests:** add `src/components/terminal/hooks/__tests__/useZedWorkspaceEvents.test.js` if no direct coverage exists.
- **Dependencies:** TWM-3.
- **Acceptance criteria:**
  - [x] Hook ≤1000 lines.
  - [x] All Zed actions dispatch identical layout/workspace mutations.
  - [x] `npm test -- TerminalWorkspacesManager` green.
- **Estimated changed lines:** M (≈250–450).

---

## Task TWM-5: Extract `useTerminalWorkspaceShortcuts`

- **Domain:** TWM
- **Slice:** Keyboard shortcuts
- **Goal:** Extract keyboard shortcut wiring (TWM L5571–5655) into a hook.
- **Files to create:** `src/components/terminal/hooks/useTerminalWorkspaceShortcuts.js`.
- **Files to modify:** `src/components/TerminalWorkspacesManager.jsx` (replace shortcut setup with hook call).
- **Files to delete:** none.
- **Ref-bag/contract:** Receives `{ dispatchLayout, activeWsIdRef, focusedPanelIdRef, ... }`; returns keydown handlers or an effect registration.
- **Existing tests to keep green:** `src/components/__tests__/TerminalWorkspacesManager.shortcuts.test.jsx`, `src/lib/terminal/__tests__/workspaceShortcuts.test.js` (if exists).
- **New tests:** add `src/components/terminal/hooks/__tests__/useTerminalWorkspaceShortcuts.test.js` if no direct coverage.
- **Dependencies:** TWM-4.
- **Acceptance criteria:**
  - [x] Hook ≤1000 lines.
  - [x] Shortcuts behave identically.
  - [x] `npm test -- TerminalWorkspacesManager.shortcuts` green.
- **Estimated changed lines:** S–M (≈150–300).

---

## Task TWM-6: Consolidate `WorkspaceLayoutState` reducer

- **Domain:** TWM
- **Slice:** Workspace state reducer
- **Goal:** Replace 20+ scattered `useState` calls with `useWorkspaceLayoutState` reducer.
- **Files to create:** `src/components/terminal/hooks/useWorkspaceLayoutState.js`.
- **Files to modify:** `src/components/TerminalWorkspacesManager.jsx` (replace state calls with `layoutState`/`dispatchLayout`).
- **Files to delete:** none.
- **Ref-bag/contract:** Hook accepts `{ initialWorkspaces, initialActiveWsId, initialActivePanelIds }`; returns `[layoutState, dispatchLayout]`. Actions: `ADD_WORKSPACE`, `REMOVE_WORKSPACE`, `SELECT_WORKSPACE`, `ADD_WINDOW`, `SELECT_WINDOW`, `SPLIT_PANEL`, `CLOSE_PANEL`, `RENAME_PANEL`, `SET_FOCUSED_PANEL`.
- **Existing tests to keep green:**
  - `src/components/__tests__/TerminalWorkspacesManager.test.js`
  - `src/components/__tests__/TerminalWorkspacesManager.workspaceWindows.test.js`
  - `src/components/__tests__/TerminalWorkspacesManager.split-layout.test.jsx`
  - `src/components/__tests__/TerminalWorkspacesManager.counterRandomization.test.jsx`
- **New tests:** add `src/components/terminal/hooks/__tests__/useWorkspaceLayoutState.test.js` covering each action.
- **Dependencies:** TWM-5.
- **Acceptance criteria:**
  - [x] Reducer ≤1000 lines (≤1200 justified).
  - [x] All previously-scattered workspace/window/panel state managed through reducer.
  - [x] `TerminalWorkspacesManager.jsx` shrinks significantly.
  - [x] `npm test -- TerminalWorkspacesManager` green.
- **Estimated changed lines:** L (≈600–1000).

---

## Task TTY-6: Extract `useTerminalV2Session`

- **Domain:** TTY
- **Slice:** v2 connection / rehydration
- **Goal:** Extract WebSocket connect, subscribe, frame decode, and rehydration controller integration.
- **Files to create:** `src/components/terminal/hooks/useTerminalV2Session.js`.
- **Files to modify:** `src/components/TerminalTTY.jsx` (replace inline v2 session logic with hook).
- **Files to delete:** none.
- **Ref-bag/contract:** Receives `sessionRefs` bag (`wsRef`, `connectInFlightRef`, `connectEpochRef`, `connectAbortRef`, `sessionClosingRef`, `transportRef`) plus `rendererRefs` for addon access. Returns `{ startV2Session, stopV2Session }`.
- **Existing tests to keep green:**
  - `src/components/__tests__/TerminalTTY.v2.test.js`
  - `src/components/__tests__/TerminalTTY.rehydration.test.jsx`
  - `src/lib/terminal/__tests__/v2Graveyard.test.js`
- **New tests:** add `src/components/terminal/hooks/__tests__/useTerminalV2Session.test.js` if no direct unit coverage.
- **Dependencies:** TWM-6.
- **Acceptance criteria:**
  - [x] Hook ≤1000 lines.
  - [x] v2 connect/subscribe/frame decode/rehydration behavior unchanged.
  - [x] `isEngineV2` branches preserved.
  - [x] `npm test -- TerminalTTY.v2 TerminalTTY.rehydration` green.
- **Estimated changed lines:** M–L (≈400–700).

---

## Task TTY-7: Extract `useTerminalRendererController`

- **Domain:** TTY
- **Slice:** Renderer attach / context-loss
- **Goal:** Extract WebGL/Canvas addon attach, reattach, context-loss, and fallback logic.
- **Files to create:** `src/components/terminal/hooks/useTerminalRendererController.js`.
- **Files to modify:** `src/components/TerminalTTY.jsx` (replace renderer lifecycle with hook).
- **Files to delete:** none.
- **Ref-bag/contract:** Receives `rendererRefs` bag (`termRef`, `webglAddonRef`, `canvasAddonRef`, `fitRef`, `webglFallbackRef`, `handleWebglContextLossRef`). Returns `{ attachRenderer, detachRenderer, handleContextLoss }`.
- **Existing tests to keep green:** `src/components/__tests__/TerminalTTY.xterm-webgl.test.jsx`.
- **New tests:** add `src/components/terminal/hooks/__tests__/useTerminalRendererController.test.js` with mocked xterm + addon refs.
- **Dependencies:** TTY-6.
- **Acceptance criteria:**
- [x] Hook ≤1000 lines.
- [x] WebGL/Canvas attach, fallback, and context-loss paths preserved.
- [x] `npm test -- TerminalTTY.xterm-webgl` green.
- **Estimated changed lines:** M (≈300–600).

---

## Task TTY-8: Extract `useTerminalViewportSync`

- **Domain:** TTY
- **Slice:** Fit / resize / workspace-show recovery
- **Goal:** Extract `fitAndResize`, `sendResize`, layout-show recovery, and ResizeObserver coalescing.
- **Files to create:** `src/components/terminal/hooks/useTerminalViewportSync.js`.
- **Files to modify:** `src/components/TerminalTTY.jsx` (replace viewport sync logic with hook).
- **Files to delete:** none.
- **Ref-bag/contract:** Receives `viewportRefs` bag (`terminalRootRef`, `containerRef`, `viewportShellRef`, `resizeObserverRef`, `lastViewportYRef`, `lastPointerZoneRef`, `needsViewportSyncOnShowRef`, `layoutChurnedWhileHiddenRef`, `layoutHiddenGenerationRef`, `containerWasZeroSizedOnShowRef`) and `sessionRefs` for `lastPtySizeRef`.
- **Existing tests to keep green:** `src/components/__tests__/TerminalTTY.test.js`, `src/components/__tests__/TerminalTTY.v2.test.js`.
- **New tests:** add `src/components/terminal/hooks/__tests__/useTerminalViewportSync.test.js` with fake ResizeObserver + timers.
- **Dependencies:** TTY-7.
- **Acceptance criteria:**
- [x] Hook ≤1000 lines.
- [x] Fit/resize/show-recovery behavior preserved.
- [x] `npm test -- TerminalTTY` green.
- **Estimated changed lines:** M (≈300–600).

---

## Task TTY-9: Extract `useTerminalEngine`

- **Domain:** TTY
- **Slice:** Engine lifecycle
- **Goal:** Build a `useTerminalEngine()` hook that owns xterm lifecycle and imperative actions (`boot`, `dispose`, `fit`, `resize`, `sendInput`, `paste`, `focus`, `blur`, `getConnectionState`). Class conversion is out of scope unless hook exceeds 1200 lines.
- **Files to create:** `src/components/terminal/hooks/useTerminalEngine.js`.
- **Files to modify:** `src/components/TerminalTTY.jsx` (replace remaining engine lifecycle with hook; keep thin view JSX/effects).
- **Files to delete:** none.
- **Ref-bag/contract:** Receives all grouped ref bags (`viewportRefs`, `rendererRefs`, `sessionRefs`, `lifecycleRefs`, `outputRefs`) plus read-only props (`isEngineV2`, `initialCommand`, `panelId`).
- **Existing tests to keep green:** all `TerminalTTY*` suites.
- **New tests:** add `src/components/terminal/hooks/__tests__/useTerminalEngine.test.js`.
- **Dependencies:** TTY-8.
- **Acceptance criteria:**
- [x] Hook ≤1000 lines (≤1200 justified for cohesive engine).
- [x] `TerminalTTY.jsx` is a thin view (~1500–2000 lines acceptable intermediate; further slicing deferred).
- [x] All v1/v2 paths preserved; survivor-recovery symbols remain reachable.
- [x] Full `npm test -- TerminalTTY` green.
- **Estimated changed lines:** L (≈600–1000).

---

## Shared Acceptance Criteria (all tasks)

- [x] Each extracted module ≤1000 lines (≤1200 with justification).
- [x] Host file (`TerminalTTY.jsx` or `TerminalWorkspacesManager.jsx`) shrinks after each extraction.
- [x] Targeted terminal test suites pass with zero new failures and no newly skipped previously-passing tests.
- [x] No runtime behavior change for v1 or v2 panels.
- [x] `legacyTerminalSurvivorRecovery.js`, `handleSurvivorRecover`, `scheduleSurvivorRecoverAfterClose`, `scheduleBoundedForceRepaint`, and `releaseWebglAddonForInactivePanel` remain reachable.
- [x] Commit message format: `refactor(terminal-decompose): {slice-name}`.
- [ ] Each PR contains exactly one extraction: tests first, then module, then import switch + inline deletion, then verification.
