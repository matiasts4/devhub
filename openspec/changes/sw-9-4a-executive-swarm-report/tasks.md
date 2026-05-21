# Tasks: SW-9.4A Executive Swarm Report

## Phase 1: Selector formulas and export contract

- [ ] 1.1 RED — `src/lib/operations/__tests__/swarmControl.test.js`: add failing coverage for `selectExecutiveSwarmReport()` and `selectExecutiveSwarmReportExport()` across current, degraded, and quiet snapshots from existing Control Room slices only.
- [ ] 1.2 GREEN — `src/lib/operations/swarmControl.js`: implement/export pure report selectors and aggregation helpers for progress, blockers, evidence coverage, risks, and deterministic next-action priority without touching snapshot composition or mutation paths.
- [ ] 1.3 REFACTOR — same files: normalize default empty/unavailable shapes, severity ordering, and `generated_at` fallback (`mission_control.snapshot_at` → latest evidence occurrence → `null`) with no `Date.now()`.

## Phase 2: Read-only executive panel wiring

- [ ] 2.1 RED — `src/views/__tests__/SwarmControl.test.jsx`: add failing assertions that the executive report panel renders summary, blockers, evidence, risks, and next action from derived data, while introducing no claim/approval/export mutation controls.
- [ ] 2.2 GREEN — `src/components/control-room/ExecutiveSwarmReportPanel.jsx`, `src/views/SwarmControl.jsx`: create the read-only panel and wire selector output into the Control Room above detail-heavy panels, preserving existing layout/filter behavior.
- [ ] 2.3 REFACTOR — same files: keep props optional, presentation-only, and consistent with existing control-room panel styles and empty states.

## Phase 3: Export mirror and scenario hardening

- [ ] 3.1 RED — `src/lib/operations/__tests__/swarmControl.test.js`: add failing assertions that export payload mirrors the on-screen report object exactly, preserves degraded/unavailable authority and freshness, and reports partial/missing evidence explicitly.
- [ ] 3.2 GREEN — `src/lib/operations/swarmControl.js`: shape the export payload as data-only `{ generated_at, authority, freshness, report }` sourced from the same selector formulas used by the UI.
- [ ] 3.3 REFACTOR — same files plus `src/views/__tests__/SwarmControl.test.jsx`: dedupe fixture/setup noise needed for healthy, degraded, and quiet report scenarios without changing behavior.

## Phase 4: Verification and scope locks

- [ ] 4.1 VERIFY — `src/lib/operations/__tests__/swarmControl.test.js`, `src/views/__tests__/SwarmControl.test.jsx`: run targeted Jest coverage for spec scenarios covering summary completeness, incomplete evidence, quiet state, export parity, and read-only rendering.
- [ ] 4.2 VERIFY — touched files only: audit that no code changes add endpoints, persistence, approval/queue mutations, `performDirectorApprovalDecision()` changes, `persistMissionControlComposerMessage()` changes, or `composeControlRoomSnapshot()` contract drift.

## Guardrails

- Allowed implementation surface: `src/lib/operations/swarmControl.js`, `src/components/control-room/ExecutiveSwarmReportPanel.jsx`, `src/views/SwarmControl.jsx`, `src/lib/operations/__tests__/swarmControl.test.js`, `src/views/__tests__/SwarmControl.test.jsx`.
- Report MUST derive from `selectControlRoom*`/`selectDirectorQueue()` outputs only; never from raw health payloads.
- Export seam stays selector/data-only for this change; no local “copy JSON” affordance unless specs are updated.
