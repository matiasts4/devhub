# Apply Progress

**Change**: sw-8-7a-durable-evidence-timeline-mvp
**Mode**: Strict TDD
**Artifact Sync Scope**: on-disk OpenSpec artifacts only

## Reality Source

- Verified apply-progress artifact in Engram (`#4913`)
- Direct repository evidence for explicit missing-linked-evidence coverage in:
  - `src/lib/operations/__tests__/swarmControl.test.js`
  - `src/views/__tests__/SwarmControl.test.jsx`

## Completed Tasks

- [x] 1.1 RED — selector fixture/test coverage for deterministic ordering, empty state, missing metadata, and secondary-session labeling
- [x] 1.2 GREEN — selector normalization/sort implementation via `selectControlRoomEvidenceTimeline()`
- [x] 1.3 REFACTOR — local helper/comparator cleanup in selector path
- [x] 2.1 RED — GET API assertions for `control_room_snapshot_input.evidence_timeline` shape and non-mutation boundaries
- [x] 2.2 GREEN — GET route projection for durable `evidence_timeline`
- [x] 2.3 REFACTOR — route alignment with selector contract without POST-path changes
- [x] 3.1 RED — view assertions for timeline placement, ordering, empty copy, secondary badge, and no new actions
- [x] 3.2 GREEN — read-only `EvidenceTimelinePanel.jsx`
- [x] 3.3 GREEN — `SwarmControl.jsx` render wiring from snapshot state only
- [x] 3.4 REFACTOR — panel/view prop and copy tightening without layout mutation

## Open Tasks

- [ ] 1.4 VERIFY/CHECKPOINT — intentionally left open; no actual git checkpoint performed in this artifact-sync pass
- [ ] 2.4 VERIFY/CHECKPOINT — intentionally left open; no actual git checkpoint performed in this artifact-sync pass
- [ ] 3.5 VERIFY/CHECKPOINT — intentionally left open; no actual git checkpoint performed in this artifact-sync pass

## Files Changed In Verified Implementation

| File                                                           | Action           | What Was Done                                                                                                                            |
| -------------------------------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/operations/__tests__/fixtures/controlRoomSnapshot.js` | Modified         | Added deterministic timeline fixture data, including linked secondary evidence hints and filtering proof for unlinked runtime-only rows. |
| `src/lib/operations/__tests__/swarmControl.test.js`            | Modified         | Added selector coverage for deterministic ordering, empty state, secondary labeling, and explicit missing linked evidence handling.      |
| `src/lib/operations/swarmControl.js`                           | Modified         | Added timeline normalization helpers, deterministic comparator, and `selectControlRoomEvidenceTimeline()`.                               |
| `tests/agenthub/api/operations-health.test.js`                 | Modified         | Added GET-only route assertions for timeline projection and non-mutation boundaries.                                                     |
| `src/app/api/agenthub/operations/health/route.js`              | Modified         | Added GET-only mission timeline projection from durable snapshot truth with deterministic ordering.                                      |
| `src/components/control-room/EvidenceTimelinePanel.jsx`        | Created/Modified | Added minimal read-only timeline panel and local warning cleanup.                                                                        |
| `src/views/SwarmControl.jsx`                                   | Modified         | Wired timeline panel from composed snapshot state and cleaned local lint warnings.                                                       |
| `src/views/__tests__/SwarmControl.test.jsx`                    | Modified         | Added render coverage for timeline ordering, read-only panel behavior, and explicit missing linked evidence rendering.                   |

## TDD Cycle Evidence

| Batch | Test File                                           | Layer       | RED | GREEN | REFACTOR |
| ----- | --------------------------------------------------- | ----------- | --- | ----- | -------- |
| 1     | `src/lib/operations/__tests__/swarmControl.test.js` | Unit        | ✅  | ✅    | ✅       |
| 2     | `tests/agenthub/api/operations-health.test.js`      | Integration | ✅  | ✅    | ✅       |
| 3     | `src/views/__tests__/SwarmControl.test.jsx`         | Integration | ✅  | ✅    | ✅       |

## Warnings / Notes

- Checkpoint tasks remain open ON PURPOSE until a real git checkpoint exists.
- React/Jest still emits an outdated JSX transform environment warning during `SwarmControl` test execution.
- Earlier verification notes about missing linked evidence coverage are now stale relative to repository reality; direct coverage exists in the selector and view tests listed above.

## Status

10/13 tasks complete on disk.
Implementation batches are synced as complete.
Checkpoint items remain pending until an actual git checkpoint happens.
