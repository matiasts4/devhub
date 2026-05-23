# Spec: terminal-workspace-componentize

**Change**: `terminal-workspace-componentize`
**Type**: Structural extraction — no logic changes
**Strict TDD**: active

---

## Purpose

Split `src/components/TerminalWorkspacesManager.jsx` (3,373 lines, ~75 functions, 24 useState hooks, 21 useEffect, 37 useCallback) into focused hooks, sub-components, and utilities. Orchestrator file MUST remain ≤ 300 lines. All existing behavior, props API, and tests MUST pass unchanged.

---

## Out of Scope

- Logic changes, bug fixes, or behavior modifications during extraction
- New features or props
- CSS/style refactors
- Backend or Tauri-layer changes
- Renaming the orchestrator file or its default export

---

## Requirements

### Requirement: UTIL-1 — Utility Extraction

Pure helper functions with no React dependencies MUST be extracted to `src/components/terminal/utils/`. Each utility module MUST be individually importable. Orchestrator imports them from the new paths.

#### Scenario: Utilities are tree-shakeable

- GIVEN pure helper functions identified in `TerminalWorkspacesManager.jsx`
- WHEN moved to `src/components/terminal/utils/`
- THEN each module exports only named functions with no side-effects at import time
- AND the orchestrator imports them and behavior is identical to pre-extraction

#### Scenario: Existing tests pass after utility extraction

- GIVEN tests covering utility logic (direct or indirect)
- WHEN `npm test` is run post-extraction
- THEN all tests pass with zero failures

---

### Requirement: HOOK-1 — useRightDockController Extraction

`useRightDockController` MUST be extracted to `src/components/terminal/hooks/useRightDockController.js`. The hook MUST accept the same arguments and return the same shape as before extraction.

#### Scenario: Hook contract preserved

- GIVEN the hook is consumed by the orchestrator
- WHEN extracted to its own module and re-imported
- THEN the orchestrator passes the same arguments and receives the same return shape
- AND UI behavior is render-equivalent

---

### Requirement: COMP-1 — WorkspaceWindowTabBar Extraction

`WorkspaceWindowTabBar` MUST be extracted to `src/components/terminal/components/WorkspaceWindowTabBar.jsx`. Props API MUST be identical to the inline version.

#### Scenario: Tab bar renders identically

- GIVEN the orchestrator renders `WorkspaceWindowTabBar`
- WHEN the component is imported from its new path
- THEN rendered output is identical to pre-extraction

#### Scenario: All props forwarded correctly

- GIVEN any prop passed by the orchestrator to `WorkspaceWindowTabBar`
- WHEN the component is rendered
- THEN each prop is consumed identically to the pre-extraction behavior

---

### Requirement: COMP-2 — WorkspaceTerminalSurface Extraction

`WorkspaceTerminalSurface` MUST be extracted to `src/components/terminal/components/WorkspaceTerminalSurface.jsx` with identical props API.

#### Scenario: Terminal surface renders identically

- GIVEN the orchestrator renders `WorkspaceTerminalSurface`
- WHEN imported from new path
- THEN rendered output and xterm.js lifecycle behavior is identical

---

### Requirement: HOOK-2 — useWorkspaceWindowsController Extraction

`useWorkspaceWindowsController` MUST be extracted to `src/components/terminal/hooks/useWorkspaceWindowsController.js` with identical arguments and return shape.

#### Scenario: Windows controller contract preserved

- GIVEN the orchestrator invokes `useWorkspaceWindowsController`
- WHEN extracted and re-imported
- THEN all window management operations behave identically

---

### Requirement: SMOKE-1 — Smoke Test Gate Before Swarm Extraction

Before extracting `useSwarmLaunchController` + `SwarmLaunchEntryPoint` (step 6), a smoke test MUST be executed and MUST pass. The swarm launch mechanism uses `fetch('/api/agenthub/operations/health')` with `action: 'launch_swarm_local'` followed by `window.dispatchEvent(new CustomEvent('devhub:run-agent'))` — NOT Tauri IPC. The smoke test MUST cover swarm launch initiation end-to-end in the running app.

#### Scenario: Smoke test required before step 6

- GIVEN steps 1–5 are complete and passing
- WHEN the implementer is about to begin step 6
- THEN a smoke test for swarm launch MUST be run first
- AND if the smoke test fails, step 6 MUST NOT proceed until the failure is resolved

#### Scenario: Smoke test passes, step 6 proceeds

- GIVEN the smoke test covers swarm launch initiation
- WHEN the smoke test passes
- THEN the implementer MAY proceed with swarm extraction

---

### Requirement: HOOK-3 — useSwarmLaunchController + SwarmLaunchEntryPoint Extraction (High Risk)

`useSwarmLaunchController` MUST be extracted to `src/components/terminal/hooks/useSwarmLaunchController.js`. `SwarmLaunchEntryPoint` MUST be extracted to `src/components/terminal/components/SwarmLaunchEntryPoint.jsx`. Side-effect behavior (IPC calls, Tauri commands, WebSocket events) MUST be functionally equivalent.

#### Scenario: Swarm launch side-effects preserved

- GIVEN swarm launch is triggered from the UI
- WHEN `SwarmLaunchEntryPoint` and `useSwarmLaunchController` are extracted
- THEN all Tauri IPC calls, WebSocket events, and state transitions occur in the same order as before extraction

#### Scenario: Tests pass after swarm extraction

- GIVEN the smoke test passed pre-extraction
- WHEN step 6 extraction is complete and `npm test` runs
- THEN all tests pass with zero failures

---

### Requirement: ORCH-1 — Orchestrator Size Constraint

`TerminalWorkspacesManager.jsx` (the orchestrator file) MUST be ≤ 300 lines after all extractions are complete.

#### Scenario: Orchestrator line count enforced

- GIVEN all 6 extraction steps are done
- WHEN `wc -l src/components/TerminalWorkspacesManager.jsx` is run
- THEN line count is ≤ 300

---

### Requirement: API-1 — External Props API Unchanged

The props accepted by the default export of `TerminalWorkspacesManager.jsx` MUST NOT change during or after extraction.

#### Scenario: No prop renames or additions

- GIVEN any consumer of `TerminalWorkspacesManager`
- WHEN the refactor is complete
- THEN the same props with the same names and types continue to work

---

### Requirement: TEST-1 — Zero Test Regressions

All existing tests MUST pass after each extraction step. No test SHOULD be deleted or disabled to make the build green.

#### Scenario: Per-step test gate

- GIVEN any single extraction step is completed
- WHEN `npm test` runs
- THEN zero pre-existing test failures are introduced by that step

---

## Risks and Mitigations

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Swarm launch side-effects broken by extraction | High | SMOKE-1 gate must pass before step 6. Swarm uses fetch() + CustomEvent, not Tauri IPC |
| Implicit closure dependencies missed | Medium | Read each extracted unit's full closure before moving |
| Dead imports cleanup breaks something | Low | NotificationCenter, FileExplorerEditorPane, unused lucide icons — verify none are referenced dynamically |
| Already-extracted modules conflict | Low | workspaceShortcuts.js, rightDockState.js, browserWindowState.js, terminalRendererPreferences.js already exist — do NOT re-extract |
| Import cycles introduced | Medium | Enforce `utils → hooks → components` import direction; no reverse imports |
| Orchestrator exceeds 300 lines after extraction | Low | Measure after each step; adjust scope before proceeding |
