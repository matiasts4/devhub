# Tasks: SW-5.1 Control Room UI redesign

## Phase 1: Shared snapshot anchors

- [x] 1.1 RED — Add Jest coverage for `composeControlRoomSnapshot` authority precedence and panel selectors in `src/lib/operations/__tests__/swarmControl.test.js`.
- [x] 1.2 GREEN — Extend `src/lib/operations/contracts.js` with Control Room authority/freshness/evidence helpers shared by UI, Telegram, and MCP presenters.
- [x] 1.3 GREEN — Build `composeControlRoomSnapshot` plus read-model selectors in `src/lib/operations/swarmControl.js` from frozen SW-2.1/SW-2.2/SW-3.1/SW-4.1/SW-6.1/SW-7.1 snapshots.
- [x] 1.4 REFACTOR — Add reusable snapshot fixtures/builders for unit and integration coverage under `src/lib/operations/__tests__/fixtures/`.

## Phase 2: UI composition panels

- [x] 2.1 RED — Add React tests for `src/views/__tests__/SwarmControl.test.jsx` proving header, agents, workspaces, runs, approvals, and diagnostics render from snapshot slices only.
- [x] 2.2 GREEN — Create `src/components/control-room/ControlRoomHeader.jsx`, `AgentsClaimsPanel.jsx`, `WorkspacesPanel.jsx`, `RunsArtifactsPanel.jsx`, `ApprovalsErrorsPanel.jsx`, and `DiagnosticOverlay.jsx`.
- [x] 2.3 GREEN — Refactor `src/views/SwarmControl.jsx` into read-only Control Room composition; keep local state limited to filters, selection, expansion, and layout.
- [ ] 2.4 REFACTOR — Update `src/components/SwarmQueuePanel.jsx` and `src/components/chat/MCPStatusPanel.jsx` to consume composed snapshot props on the Control Room path, not standalone authority logic.

## Phase 3: Freshness, degraded, and approval evidence

- [x] 3.1 RED — Add spec-scenario tests for stale, degraded, unavailable, and approval-pending states in `swarmControl` unit tests and `SwarmControl` integration tests.
- [x] 3.2 GREEN — Render authority, freshness, evidence refs, and missing-source messaging across header, runs, approvals, and diagnostics panels.
- [x] 3.3 GREEN — Show concurrency `active/max` and queue depth from supervisor snapshot only, and keep risky outcomes visibly unapplied until approval evidence exists.
- [x] 3.4 REFACTOR — Isolate any “live activity” labels as secondary hints so canonical status remains snapshot-owned.

## Phase 4: Legacy cleanup and parity

- [ ] 4.1 RED — Add regressions proving SSE caches, `agent_registry`, `devhub_agent_runs`, and browser storage cannot override durable snapshot truth.
- [ ] 4.2 GREEN — Remove authoritative leaks from `src/views/SwarmControl.jsx`: session-stream status synthesis, runtime-local counts, and mutating Git/worktree/filesystem control affordances.
- [ ] 4.3 GREEN — Demote `src/lib/agentRegistryLive.js` and related runtime mirror consumers to optional hint/open-terminal mapping only.
- [ ] 4.4 REFACTOR — Align observability presenters so Control Room, Telegram, and MCP diagnostics resolve the same snapshot semantics with presentation-only differences.

## Phase 5: Docs and verification

- [ ] 5.1 RED/GREEN — Add parity checks in Playwright/Jest for Control Room vs Telegram/MCP status, freshness, and evidence consistency.
- [ ] 5.2 Update `openspec/changes/sw-5-1-control-room-ui-redesign/design.md` with final live-hint placement decision and cleanup notes after implementation lands.
- [ ] 5.3 Verify forbidden control verbs stay out of scope, capture evidence for each spec scenario, and prepare `openspec/changes/sw-5-1-control-room-ui-redesign/verify-report.md` inputs.
