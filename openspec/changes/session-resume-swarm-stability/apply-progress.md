# Implementation Progress

**Change**: session-resume-swarm-stability
**Batch**: Slice 1 (RESUME-SWARM-01 + RESUME-SWARM-02)
**Mode**: Strict TDD

## Completed

- Added canonical runtime status classifier and anomaly snapshot utility.
- Added unified read-only diagnostics endpoint: `/api/swarm/runtime-diagnostics`.
- Added shared OpenCode process scanner utility and reused it from `/api/swarm/processes`.
- Added focused tests:
  - `src/lib/swarm/runtimeStatus.test.js`
  - `src/app/api/swarm/runtime-diagnostics/route.test.js`

## Verification

Command run:
- `npx jest src/lib/swarm/runtimeStatus.test.js src/app/api/swarm/runtime-diagnostics/route.test.js --runInBand`

Result:
- 2 test suites passed
- 6 tests passed

## Remaining

- Wire canonical statuses into topology/control-room UI surfaces.
- Add broader integration coverage with realistic mixed runtime evidence.
- Begin Restore Manifest contract implementation (Milestone 2).

## Batch 2 — Runtime Diagnostics Wired Into Control Room Health

### Completed

- Added `buildRuntimeDiagnosticsHealthSource()` in `src/lib/operations/health.js`.
- Wired runtime diagnostics collection into `gatherOperationalHealth()` in `src/app/api/agenthub/operations/health/route.js`.
- Mapped `runtime-diagnostics` to control-room diagnostics contract in `src/lib/operations/swarmControl.js`.
- Extended diagnostics overlay to display Runtime card in `src/components/control-room/DiagnosticOverlay.jsx`.
- Added focused test coverage in `src/lib/operations/__tests__/health.test.js`.
- Updated control-room diagnostics default expectations in `src/lib/operations/__tests__/swarmControl.test.js`.

### Verification

Command run:
- `npx jest src/lib/operations/__tests__/health.test.js src/lib/operations/__tests__/swarmControl.test.js src/lib/swarm/runtimeStatus.test.js src/app/api/swarm/runtime-diagnostics/route.test.js --runInBand`

Result:
- 4 test suites passed
- 50 tests passed

### Updated Remaining

- Add resilient evidence links (logs/crash dumps) in diagnostics UI surface.
- Add integration test proving stale registry + orphan process + quota blocked scenarios across APIs.
- Begin Restore Manifest contract implementation (Milestone 2).

## Batch 3 — Runtime Evidence Links/Actions (Phase 2.2)

### Completed

- Extended health source contract to preserve `evidence_ref`/`evidence_refs`.
- Enriched runtime diagnostics endpoint output with evidence references for logs and crash dumps.
- Propagated runtime evidence refs through `buildRuntimeDiagnosticsHealthSource()`.
- Added runtime evidence action buttons in `DiagnosticOverlay` (copy-to-clipboard behavior with no hard dependency).
- Added a focused UI test suite for `DiagnosticOverlay` runtime evidence actions.
- Stabilized `SwarmControl` tests by mocking `ActiveProcessesPanel` side effects.

### Verification

Command run:
- `npx jest src/app/api/swarm/runtime-diagnostics/route.test.js src/lib/operations/__tests__/health.test.js src/components/__tests__/DiagnosticOverlay.test.jsx src/views/__tests__/SwarmControl.test.jsx --runInBand`

Result:
- 4 test suites passed
- 42 tests passed

### Updated Remaining

- Add integration test proving stale registry + orphan process + quota blocked scenarios across APIs.
- Begin Restore Manifest contract implementation (Milestone 2).

## Batch 4 — Cross-API Integration + Restore Manifest Contract Foundation

### Completed

- Added integration test for `gatherOperationalHealth()` proving runtime anomaly propagation (reattachable, orphaned process, stale registry, quota-blocked) into control-room diagnostics:
  - `src/app/api/agenthub/operations/health/route.integration.test.js`
- Added versioned restore manifest contract foundation with normalization + dedupe:
  - `src/lib/terminal/restoreManifest.js`
  - `src/lib/terminal/restoreManifest.test.js`

### Verification

Command run:
- `npx jest src/lib/terminal/restoreManifest.test.js src/app/api/agenthub/operations/health/route.integration.test.js src/app/api/swarm/runtime-diagnostics/route.test.js src/lib/operations/__tests__/health.test.js src/components/__tests__/DiagnosticOverlay.test.jsx --runInBand`

Result:
- 5 test suites passed
- 9 tests passed

### Updated Remaining

- Implement startup restore coordinator with idempotent reattach policy (3.2).
- Build E2E harness for reboot/reload swarm recovery matrix (3.3).

## Batch 5 — Startup Restore Coordinator (3.2)

### Completed

- Implemented idempotent startup restore planning module:
  - `src/lib/terminal/startupRestoreCoordinator.js`
- Added strict tests for core policies:
  - reattach live terminal (`alive + socketCount=0`)
  - resume OpenCode session when runtime terminal is missing
  - quota-blocked short-circuit classification
  - dedupe/idempotency for repeated manifest records
  - `src/lib/terminal/startupRestoreCoordinator.test.js`

### Verification

Command run:
- `npx jest src/lib/terminal/startupRestoreCoordinator.test.js src/lib/terminal/restoreManifest.test.js src/app/api/agenthub/operations/health/route.integration.test.js src/components/__tests__/DiagnosticOverlay.test.jsx --runInBand`

Result:
- 4 test suites passed
- 9 tests passed

### Updated Remaining

- Build E2E harness for reboot/reload swarm recovery matrix (3.3).

## Batch 6 — Restore/Reload E2E Matrix Harness (3.3)

### Completed

- Added Playwright matrix harness for runtime restore scenarios:
  - `tests/e2e/swarm-runtime-restore-matrix.spec.ts`
- Harness seeds durable control-room snapshot state via localStorage and validates Runtime diagnostics visibility plus evidence actions per scenario.
- Includes attach-based evidence pack per scenario (`matrix-*.json`) for QA artifact collection.

### Verification

- Harness file created and syntax reviewed.
- Browser execution was not re-run in this batch because the broader Playwright environment may still require local browser installation in this workspace.

### Updated Remaining

- Wire startup restore coordinator execution into app boot path (follow-up wiring task after policy foundation).

## Batch 7 — Milestone 4 Hardening: Prevent False Stale Downgrades

### Completed

- Hardened `useAgentRegistryPolling` stale cleanup policy to avoid demoting active agents to `idle` when there is live PTY/OpenCode evidence.
- Added `hasLiveEvidence()` guard using panel/session correlation (`panelId` + `opencodeSessionId`) before stale cleanup updates.
- Added regression coverage in `src/hooks/useAgentRegistryPolling.test.js`:
  - stale heartbeat + live session must remain active (no registry `update(...status: idle...)`).

### Verification

Command run:
- `npm test -- src/hooks/useAgentRegistryPolling.test.js --runInBand`

Result:
- 1 test suite passed
- 5 tests passed

### Updated Remaining

- Milestone 4.1 deeper reconciliation: ensure topology/control-room node states consume reconciled runtime categories (`orphaned-process`, `stale-registry`, `quota-blocked`) end-to-end, not only aggregate health.
- Milestone 4.2 durable launch identity (`launchId/missionId/runId/panelId/terminalId/pid`) consistency checks across UI + DB + runtime process evidence.

## Batch 8 — Milestone 4.1 + 4.2: Runtime-Reconciled Topology + Identity Health

### Completed

- Extended control-room diagnostics normalization to preserve runtime `metrics` and `status_reason` for downstream UI/roster logic.
- Updated active roster mapping to consume runtime-reconciled status signals:
  - `quota-blocked` (runtime anomaly)
  - `stale-registry` (runtime metric + idle-vs-live mismatch)
  - `orphaned-process` (runtime anomaly fallback)
- Added launch identity consistency checks in active hero payload to reconcile `agent -> workspace -> run` linkage plus runtime orphaned process signal.
- Added UI rendering support in active tower panel for launch identity health status (healthy/degraded + first mismatch detail).

### Verification

Command run:
- `npm test -- src/lib/operations/__tests__/swarmControl.test.js --runInBand`

Result:
- 1 test suite passed
- 44 tests passed

### Updated Remaining

- Milestone 5.1 dedicated restore/debug operation surface still needed for operator actions beyond evidence links.
- Milestone 5.2 expand/execute E2E harness scenarios to cover full recovery matrix and action validation.

## Batch 9 — Milestone 5.1: Runtime Restore/Debug Overlay Actions

### Completed

- Enhanced runtime diagnostics card in `DiagnosticOverlay` with runtime restore summary:
  - reattachable terminals count
  - orphaned processes count
  - stale registry count
  - quota blocked flag
- Added safe operator actions in overlay:
  - `Copy runtime summary`
  - `Export runtime JSON`
- Added UI tests validating summary rendering and clipboard copy behavior.

### Verification

Command run:
- `npm test -- src/components/__tests__/DiagnosticOverlay.test.jsx --runInBand`

Result:
- 1 test suite passed
- 2 tests passed

### Updated Remaining

- Milestone 5.2 expand E2E scenario execution coverage and evidence pack automation for full restore/recovery matrix.

## Batch 10 — Milestone 5.2: Expanded Restore Matrix Harness Coverage

### Completed

- Expanded `tests/e2e/swarm-runtime-restore-matrix.spec.ts` from 3 to 7 scenarios aligned with the roadmap matrix:
  - simple reopen
  - five-panel swarm reopen
  - reattach without sockets
  - quota-blocked runtime
  - stale registry with live process
  - VTE hidden/restore
  - worker kill reclassification
- Added runtime metrics per scenario and assertions over restore summary UI fields:
  - reattachable terminals
  - orphaned processes
  - stale registry agents
  - quota blocked flag
- Kept per-scenario evidence attachment payload for deterministic QA handoff.

### Verification

Command run:
- `npx playwright test tests/e2e/swarm-runtime-restore-matrix.spec.ts --list`

Result:
- 7 scenarios discovered in the matrix harness.

### Updated Remaining

- Execute full Playwright runtime matrix in environment with browser/runtime prerequisites and archive evidence output.

## Batch 11 — Durable Restore Identity Enrichment (Manifest Wiring)

### Completed

- Enriched startup restore manifest builder to include durable run identity fields sourced from panel-linked agent runs:
  - terminal session: `runId`, `launchId`, `missionId`
  - swarm runs collection with `runId`, `launchId`, `missionId`, `agentId`, `role`, `panelId`, `terminalId`, `pid`, `status`
- Wired `TerminalWorkspacesManager` startup planner call to pass `agentRunsByPanel` into restore manifest generation.
- Added best-effort live manifest persistence on state changes to `devhub_restore_manifest[:project]` for restart continuity snapshots.

### Verification

- Static error check completed on touched files (no editor/runtime diagnostics reported).

### Updated Remaining

- Execute and stabilize full Playwright runtime matrix (7 scenarios) against `/swarm` route and archive evidence outputs.
