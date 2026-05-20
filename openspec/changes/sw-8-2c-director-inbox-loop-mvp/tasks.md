# Tasks: SW-8.2C Director Inbox Loop MVP

## Phase 1: Selector foundation

- [x] 1.1 RED — Update `src/lib/db/localDb.test.js` with a failing snapshot case for `recent_messages` newest-first, max 20, plus `latest_message` alias compatibility.
- [x] 1.2 GREEN — Update `src/lib/db/localDb.js` so `getSwarmMissionDirectorSnapshot()` returns bounded `recent_messages` and keeps `latest_message` as the first-row alias.
- [x] 1.3 REFACTOR — Keep selector scope explicit in `src/lib/db/localDb.js`; no session, binding, SSE, or runtime-only fields enter the projection.

## Phase 2: Durable inbox semantics

- [x] 2.1 RED — Extend `src/lib/db/localDb.test.js` with failing cases for `pending_deliveries` max 20/order by latest durable activity, additive `snapshot_at`, and stable `watermark` across no-op polls.
- [x] 2.2 GREEN — Implement bounded `pending_deliveries`, additive `snapshot_at`, and durable `watermark` hashing in `src/lib/db/localDb.js` using only returned durable rows.
- [x] 2.3 REFACTOR — Extract deterministic ordering/hash helpers inside `src/lib/db/localDb.js` so TTL regrouping changes presence buckets without mutating `watermark`.

## Phase 3: API parity

- [x] 3.1 RED — Update `tests/agenthub/api/operations-health.test.js` with failing GET/POST parity assertions for `mission_control.recent_messages`, `pending_deliveries`, `snapshot_at`, `watermark`, and `latest_message` alias.
- [x] 3.2 GREEN — Update `src/app/api/agenthub/operations/health/route.js` to build `mission_control` through one shared response helper for GET poll and composer POST.
- [x] 3.3 REFACTOR — Keep route file list tight: `route.js` only; do not introduce SW-8.2D/SW-8.3A/SW-8.4A seams or alternate payload shapes.

## Phase 4: Consumer normalization

- [x] 4.1 RED — Update `src/lib/operations/__tests__/swarmControl.test.js` with failing cases for additive `snapshot_at`/`watermark`, `recent_messages`, and legacy payloads that still send only `latest_message`.
- [x] 4.2 GREEN — Update `src/lib/operations/swarmControl.js` to normalize additive fields, preserve `latest_message` fallback, and keep null-safe defaults deterministic.
- [x] 4.3 REFACTOR — Ensure `selectControlRoomMission()` returns the expanded contract without inventing runtime truth or broadening beyond `mission_control`.

## Phase 5: Verification

- [x] 5.1 Run a file-scoped deterministic batch for `src/lib/db/localDb.test.js` covering selector bounds, alias, TTL regrouping, and watermark behavior.
- [x] 5.2 Run a file-scoped deterministic batch for `tests/agenthub/api/operations-health.test.js` and `src/lib/operations/__tests__/swarmControl.test.js` covering GET/POST parity and normalization compatibility.
- [x] 5.3 Verify final diff stays inside `src/lib/db/localDb.js`, `src/lib/db/localDb.test.js`, `src/app/api/agenthub/operations/health/route.js`, `tests/agenthub/api/operations-health.test.js`, `src/lib/operations/swarmControl.js`, and `src/lib/operations/__tests__/swarmControl.test.js`.
