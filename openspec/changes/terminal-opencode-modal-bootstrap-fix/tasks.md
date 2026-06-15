# Tasks: Terminal OpenCode Modal Bootstrap Fix

## Review Workload Forecast

| Field                     | Value                       |
| ------------------------- | --------------------------- |
| Estimated changed lines   | ~305 (code ~45, tests ~260) |
| 400-line budget risk      | Low                         |
| 800-line preflight budget | Fits                        |
| Chained PRs recommended   | No                          |
| Suggested split           | Single PR                   |
| Delivery strategy         | single-pr-default           |
| Chain strategy            | pending                     |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

## Phase 1: RED — Write failing tests

- [ ] 1.1 Add test in `src/lib/terminal/__tests__/terminalLifecycleSync.test.js` asserting `PANEL_LIFECYCLE_REASONS.WORKSPACE_CREATED` exists and `LIFECYCLE_BURST_PHASES['workspace-created']` has `immediate`, `raf`, `delayMs: [120, 340]`. (~25 lines)
- [ ] 1.2 Add test in `src/components/__tests__/TerminalWorkspacesManager.test.js` that opens `WorkspaceTerminalSetupModal`, submits terminals + `opencode`, and verifies `devhub:terminal-layout-settled` events fire with the new workspace panel IDs. (~100 lines)
- [ ] 1.3 Add test in `src/components/__tests__/TerminalTTY.test.js` simulating a fresh panel with WS open and viewport fit confirmed: confirm command is NOT sent before `shared-surface-projection-ready`, and IS sent after. (~90 lines)
- [ ] 1.4 Add smoke test scanning `TerminalTTY.jsx` source for `127.0.0.1:7419` and asserting zero matches. (~15 lines)

Verify: `pnpm exec jest src/lib/terminal/__tests__/terminalLifecycleSync.test.js` (expect failures for 1.1, 1.2, 1.3; 1.4 passes).

## Phase 2: GREEN — Implement behavior

- [ ] 2.1 Add `WORKSPACE_CREATED: 'workspace-created'` to `PANEL_LIFECYCLE_REASONS` and matching `LIFECYCLE_BURST_PHASES` entry with `{ immediate: true, raf: true, delayMs: [120, 340] }` in `src/lib/terminal/terminalLifecycleSync.js`. (~5 lines)
- [ ] 2.2 In `src/components/TerminalWorkspacesManager.jsx`, collect `newPanelIds` inside `createWorkspaceWithTerminalCount` and call `syncPanelLifecycleLayout(PANEL_LIFECYCLE_REASONS.WORKSPACE_CREATED, newWsId, newPanelIds)` after state updates. (~10 lines)
- [ ] 2.3 In `src/components/TerminalTTY.jsx`, add `projectionReadyRef` and `panelCreatedAtRef`; gate `sendInitialCommandIfReady` so fresh panels wait for `projectionReadyRef.current` or a 500 ms timeout. (~15 lines)
- [ ] 2.4 Set `projectionReadyRef.current = true` in `handleLayoutSettled` when the reason includes `shared-surface-projection-ready` or `workspace-created` and the event targets this panel. (~10 lines)
- [ ] 2.5 Remove all eight `127.0.0.1:7419` debug `fetch` calls from `TerminalTTY.jsx`, keeping G-04 swarm bootstrap freeze/discard logic intact. (~8 lines removed)

Verify: `pnpm exec jest src/lib/terminal/__tests__/terminalLifecycleSync.test.js src/components/__tests__/TerminalWorkspacesManager.test.js src/components/__tests__/TerminalTTY.test.js`

## Phase 3: REFACTOR — Harden edge cases

- [ ] 3.1 Reset `panelCreatedAtRef.current` when the panel `id` prop changes so relaunched panels do not incorrectly reuse the fresh-panel gate timeout. (~5 lines)
- [ ] 3.2 Verify existing split/grid paths: add regression assertion that `handleApplyGrid` and `handleSplit` still call `syncPanelLifecycleLayout` with `PANEL_SPLIT` reason. (~20 lines)

Verify: `pnpm exec jest src/components/__tests__/TerminalWorkspacesManager.split-layout.test.jsx`

## Phase 4: VERIFY — Integration and manual QA

- [ ] 4.1 Run focused component test suites for TerminalTTY and TerminalWorkspacesManager. (~0 lines)
- [ ] 4.2 Run ESLint on modified files: `src/lib/terminal/terminalLifecycleSync.js`, `src/components/TerminalWorkspacesManager.jsx`, `src/components/TerminalTTY.jsx`. (~0 lines)
- [ ] 4.3 Manual QA: create a new workspace from `WorkspaceTerminalSetupModal` with terminals > 0 and initial command `opencode`; confirm panel renders the TUI (not blank) and prompt path is not duplicated. (~0 lines)

Verify: all tests pass and manual QA succeeds.
