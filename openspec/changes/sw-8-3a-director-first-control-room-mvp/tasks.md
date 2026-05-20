# Tasks: SW-8.3A Director-first Control Room MVP

## Phase 1: Foundation selector (smallest safe first batch)

- [x] 1.1 RED — `src/lib/operations/__tests__/swarmControl.test.js`: add failing tests for `selectDirectorMissionSummary()` covering mission counts, latest-message fallback, and empty `mission_control` output.
- [x] 1.2 GREEN — `src/lib/operations/swarmControl.js`: implement/export pure `selectDirectorMissionSummary(snapshot)` from existing `mission_control` fields only; no route, POST, or contract edits.
- [x] 1.3 REFACTOR — `src/lib/operations/swarmControl.js`, `src/lib/operations/__tests__/swarmControl.test.js`: normalize default summary shape and dedupe tiny summary helpers without changing snapshot truth.

## Phase 2: Header mission strip

- [x] 2.1 RED — `src/views/__tests__/SwarmControl.test.jsx`: add failing assertions that Director mission context appears before filter/layout controls and that no new operational verbs/buttons are introduced.
- [x] 2.2 GREEN — `src/views/SwarmControl.jsx`, `src/components/control-room/ControlRoomHeader.jsx`: derive/pass `missionSummary` and render a compact read-only mission strip while preserving current supervisor metrics.
- [x] 2.3 REFACTOR — same files: keep prop shape optional, presentation-only, and compatible with existing header usage.

## Phase 3: Mission-first panel emphasis

- [x] 3.1 RED — `src/views/__tests__/SwarmControl.test.jsx`: add failing coverage for mission panel DOM priority, grid/stack invariance, and safe empty-state rendering with secondary panels still visible.
- [x] 3.2 GREEN — `src/views/SwarmControl.jsx`, `src/components/control-room/MissionKernelPanel.jsx`: move mission content ahead of local controls/secondary panels and reorder first screenful to overview → inbox preview → pending deliveries → presence.
- [x] 3.3 REFACTOR — same files: trim duplicated display formatting only; do not alter composer submit behavior, filters, or secondary-panel data sources.

## Phase 4: Focused verification and scope locks

- [x] 4.1 VERIFY — `src/lib/operations/__tests__/swarmControl.test.js`, `src/views/__tests__/SwarmControl.test.jsx`: run targeted Jest coverage for selector derivation, DOM order, legacy fallback, empty mission state, and no-new-controls assertions.
- [x] 4.2 VERIFY — touched files only: code-audit guardrails against edits to `persistMissionControlComposerMessage`, `/api/agenthub/operations/health`, `composeControlRoomSnapshot()`, lifecycle/dispatch paths, and any BROWSER/GTK/VTE/backend truth source.

## Guardrails

- Allowed implementation surface: `src/views/SwarmControl.jsx`, `src/components/control-room/ControlRoomHeader.jsx`, `src/components/control-room/MissionKernelPanel.jsx`, `src/lib/operations/swarmControl.js`, and the two targeted test files.
- UI-only, read-only over existing `mission_control`: derive presentation from `mission`, `participants`, `recent_messages`, `latest_message`, `pending_deliveries`, `presence`, `snapshot_at`, `watermark`.
- Do NOT add routes, grids, lifecycle controls, dispatch actions, browser/GTK/VTE controls, backend fields, alternate truth, or composer/API behavior.
