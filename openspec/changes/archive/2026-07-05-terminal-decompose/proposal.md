# Proposal: terminal-decompose

## Intent

Decompose `src/components/TerminalTTY.jsx` (~9,200 lines) and `src/components/TerminalWorkspacesManager.jsx` (~7,500 lines) into focused, single-responsibility modules (≤1,000 lines each, cohesive modules up to ~1,200). The refactor is strictly behavior-preserving: it moves code, deletes dead inline duplicates, and introduces controller hooks/classes, but keeps all existing tests green and does not change terminal behavior.

## Scope

### In Scope

- Wire the orphaned `terminal-workspace-componentize` modules into `TerminalWorkspacesManager.jsx` and remove duplicate inline code.
- Extract TTY hooks/controllers in risk order: output queue, clipboard/context menu, wheel router, v2 session, renderer controller, viewport sync.
- Extract TWM hooks/controllers: restore coordinator, swarm launch, Zed events, workspace shortcuts, layout-state reducer.
- Define ref-bag/imperative-controller contracts for TTY slices.
- Keep every extraction test-gated; each extraction = one chained PR.

### Out of Scope

- Behavior changes, new features, or UX changes.
- v1 panel retirement or survivor-recovery deletion (Phase 6).
- `terminal-engine-v2` Phase 6 cleanup.
- Performance optimizations except those that fall out of cleaner structure.

## Capabilities

No spec-level behavior changes. Internal modules are implementation refactor only.

### New Capabilities

None

### Modified Capabilities

None

## Approach

1. **TWM first — finish componentize**: import `renderWorkspacePanel.jsx`, `useWorkspaceWindowsController.js`, `useRightDockController.js`, `WorkspaceWindowTabBar.jsx`, `WorkspaceTerminalSurface.jsx`, `useSwarmLaunchController.js`; delete the matching inline code.
2. **TTY — low-risk slices first**: delete native VTE stubs, move pure helpers, then extract `useTerminalOutputQueue`, `useTerminalClipboard`, `useTerminalWheelRouter`, `useTerminalV2Session`, `useTerminalRendererController`, `useTerminalViewportSync`.
3. **Hook-before-class**: build `useTerminalEngine()` only after refs are grouped into domain bags; consider a headless `TerminalEngine` class as the final, optional extraction.
4. **TWM — deeper slices**: extract `WorkspaceRestoreCoordinator`, wire swarm launch, extract `useZedWorkspaceEvents`, `useTerminalWorkspaceShortcuts`, and consolidate workspace state into a `WorkspaceLayoutState` reducer.
5. **Test gate**: run the full TTY/TWM suites after every extraction; red tests block the chain.

## First Slice

**Wire orphaned TWM componentize modules and delete inline duplicates.** This reuses already-extracted code, has zero behavior change, and removes the duplicate-code safety hazard before deeper TTY extractions begin.

## Affected Areas

| Area                                           | Impact   | Description                                                   |
| ---------------------------------------------- | -------- | ------------------------------------------------------------- |
| `src/components/TerminalTTY.jsx`               | Modified | Shrunk by extracting controller hooks; thin view remains.     |
| `src/components/TerminalWorkspacesManager.jsx` | Modified | Shrunk by wiring orphaned modules and extracting state hooks. |
| `src/components/terminal/components/*.jsx`     | Modified | Orphaned components wired into TWM.                           |
| `src/components/terminal/hooks/*.js`           | Modified | Orphaned hooks wired into TWM; new TTY hooks added.           |
| `src/lib/terminal/*.js`                        | Modified | Pure helpers moved/kept; survivor recovery left untouched.    |

## Risks

| Risk                                               | Likelihood | Mitigation                                                                                         |
| -------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------- |
| Ref-bag extraction creates stale closures in TTY   | High       | Use domain ref bags or imperative controllers; never pass loose refs through callbacks.            |
| Orphaned TWM modules have drifted from inline code | Med        | Reconcile each module against its inline twin in design; run TWM tests before deleting duplicates. |
| Premature `TerminalEngine` class rewrite           | Med        | Extract as hook first; class conversion is the last, optional slice.                               |
| v1/v2 branch divergence                            | Med        | Preserve `isEngineV2` branches; run legacy TTY/TWM suites.                                         |
| Long feature-branch-chain merge conflicts          | High       | One extraction per commit/PR; rebase/retarget child PRs to keep diffs clean.                       |

## Rollback Plan

Each extraction lives in its own PR. If tests fail or regressions appear, revert the offending PR; no schema, state, or API changes are involved. Keep the previous branch green before opening the next PR in the chain.

## Dependencies

- `terminal-engine-v2` migration stable and v2 path functional.
- v1 panels still active, so legacy survivor-recovery code must remain reachable.

## Success Criteria

- [ ] All 118 v2 tests + existing TTY/TWM suites pass after every extraction.
- [ ] `TerminalTTY.jsx` and `TerminalWorkspacesManager.jsx` each target ≤1,000 lines (≤1,200 for cohesive modules).
- [ ] Orphaned componentize modules are imported by TWM and their inline duplicates removed.
- [ ] No behavior change: feature flags, v1/v2 branches, and recovery paths are unchanged.
