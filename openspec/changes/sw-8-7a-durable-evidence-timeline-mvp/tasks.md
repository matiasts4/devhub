# Tasks: SW-8.7A Durable Evidence Timeline MVP

## Phase 1: Batch 1 — Selector contract (smallest safe slice)

- [x] 1.1 RED — Extend `src/lib/operations/__tests__/fixtures/controlRoomSnapshot.js` and `src/lib/operations/__tests__/swarmControl.test.js` with failing coverage for deterministic `evidence_timeline` order, empty state, missing metadata, and secondary-session labeling.
- [x] 1.2 GREEN — Update `src/lib/operations/swarmControl.js` to normalize/sort mission-linked durable timeline rows and expose `selectControlRoomEvidenceTimeline()` with no write/action surface.
- [x] 1.3 REFACTOR — Keep comparator/helpers local to `src/lib/operations/swarmControl.js`; dedupe fixture/setup noise in `src/lib/operations/__tests__/swarmControl.test.js`.
- [ ] 1.4 VERIFY/CHECKPOINT — Run targeted selector tests for `src/lib/operations/__tests__/swarmControl.test.js`; review `git diff -- src/lib/operations/swarmControl.js src/lib/operations/__tests__/fixtures/controlRoomSnapshot.js src/lib/operations/__tests__/swarmControl.test.js` and leave batch checkpoint-ready.

## Phase 2: Batch 2 — GET projection only

- [x] 2.1 RED — Add failing API assertions in `tests/agenthub/api/operations-health.test.js` for GET `control_room_snapshot_input.evidence_timeline` shape, bounded mission-linked rows, and zero POST/claim/approval side effects.
- [x] 2.2 GREEN — Modify `src/app/api/agenthub/operations/health/route.js` to project durable `evidence_timeline` into GET snapshot input using existing mission-linked reads only; do not add writes, schema work, MCP calls, or new actions.
- [x] 2.3 REFACTOR — Align route projection fields with selector contract from Batch 1 and remove duplication without touching existing POST paths.
- [ ] 2.4 VERIFY/CHECKPOINT — Run targeted API tests for `tests/agenthub/api/operations-health.test.js`; review `git diff -- src/app/api/agenthub/operations/health/route.js tests/agenthub/api/operations-health.test.js` and leave batch checkpoint-ready.

## Phase 3: Batch 3 — Read-only panel wiring

- [x] 3.1 RED — Add failing view assertions in `src/views/__tests__/SwarmControl.test.jsx` for timeline panel placement, ordered rows, empty copy, secondary badge, and absence of new buttons/forms/actions.
- [x] 3.2 GREEN — Create `src/components/control-room/EvidenceTimelinePanel.jsx` as minimal read-only renderer for primary durable rows plus labeled secondary hints.
- [x] 3.3 GREEN — Update `src/views/SwarmControl.jsx` to select/render `evidence_timeline` from snapshot state only; no local truth, no mutation handlers.
- [x] 3.4 REFACTOR — Tighten props/copy between `src/components/control-room/EvidenceTimelinePanel.jsx`, `src/views/SwarmControl.jsx`, and `src/views/__tests__/SwarmControl.test.jsx` while preserving existing Control Room layout.
- [ ] 3.5 VERIFY/CHECKPOINT — Run targeted view tests for `src/views/__tests__/SwarmControl.test.jsx`, then run the three touched suites together; review `git diff -- src/components/control-room/EvidenceTimelinePanel.jsx src/views/SwarmControl.jsx src/views/__tests__/SwarmControl.test.jsx` and leave final checkpoint-ready.
