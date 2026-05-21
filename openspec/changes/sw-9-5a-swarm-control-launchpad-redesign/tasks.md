# Tasks: SW-9.5A Swarm Control Launchpad Redesign

## Phase 1: Selector foundation

- [x] 1.1 RED — Extend `src/lib/operations/__tests__/swarmControl.test.js` with failing cases for `selectSwarmControlPrimarySurface()` active/idle mode, CTA disable reasons, and `selectSwarmLaunchCatalog()` recommendation order.
- [x] 1.2 GREEN — Implement `selectSwarmControlPrimarySurface()` and `selectSwarmLaunchCatalog()` in `src/lib/operations/swarmControl.js`, deriving only from snapshot/read-model inputs plus local V1 catalog metadata.
- [x] 1.3 REFACTOR — Extract small mode/catalog helpers inside `src/lib/operations/swarmControl.js`; keep authority/freshness semantics and export contract stable for view consumers.

## Phase 2: Active tower surface

- [x] 2.1 RED — Add failing integration assertions in `src/views/__tests__/SwarmControl.test.jsx` proving active snapshots render the tower first, ahead of queue/mission/report panels, with status, agent summary, and primary CTA.
- [x] 2.2 GREEN — Create `src/components/control-room/SwarmPrimarySurface.jsx` and `src/components/control-room/ActiveSwarmTowerPanel.jsx` to render the active hero/tower from selector output without new mutations.
- [x] 2.3 REFACTOR — Tighten tower copy, stats grouping, and visual hierarchy in `SwarmPrimarySurface.jsx` + `ActiveSwarmTowerPanel.jsx` so V1 reads launchpad-first, not dashboard-first.

## Phase 3: Idle launchpad and type prep

- [x] 3.1 RED — Add failing view tests in `src/views/__tests__/SwarmControl.test.jsx` for idle snapshots: launchpad first, recommended template visible before swarm types, bounded prep copy, and no deep-builder affordances.
- [x] 3.2 GREEN — Create `src/components/control-room/LaunchpadTemplatesPanel.jsx` for template-first idle state using selector catalog metadata and anchor/reuse-only CTA semantics.
- [x] 3.3 GREEN — Create `src/components/control-room/SwarmTypeCatalogPanel.jsx` with prep-level swarm type cards and lightweight defaults preview only.
- [x] 3.4 REFACTOR — Normalize shared card primitives/props across `SwarmPrimarySurface.jsx`, `LaunchpadTemplatesPanel.jsx`, and `SwarmTypeCatalogPanel.jsx` without introducing a deep builder abstraction.

## Phase 4: SwarmControl recomposition

- [x] 4.1 RED — Add failing layout/order tests in `src/views/__tests__/SwarmControl.test.jsx` covering active vs idle section stacks, secondary-panel preservation, and filters/layout toggles staying below the primary surface.
- [x] 4.2 GREEN — Recompose `src/views/SwarmControl.jsx` around the new primary surface while preserving existing claim, approval, composer, filtering, selected-run, and diagnostics behavior.
- [x] 4.3 REFACTOR — Reorder secondary panels in `src/views/SwarmControl.jsx` per design (`DirectorQueuePanel`, `ApprovalsErrorsPanel`, `MissionKernelPanel`, `EvidenceTimelinePanel`, `AgentsClaimsPanel`, `WorkspacesPanel`, `RunsArtifactsPanel`, `DiagnosticOverlay`) without breaking current props/contracts.

## Phase 5: Verification

- [x] 5.1 Run targeted tests: `npm test -- src/lib/operations/__tests__/swarmControl.test.js src/views/__tests__/SwarmControl.test.jsx` and fix regressions until green.
- [x] 5.2 Verify existing user-visible hierarchy smoke in `tests/e2e/04_swarm_control.spec.ts`; add/update one bounded assertion only if current coverage misses active-tower or idle-launchpad visibility.
