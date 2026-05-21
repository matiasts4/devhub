# Tasks: SW-8.8A Director approval flow MVP

## Phase 1: Route contract and durable revalidation

- [x] 1.1 RED — Create `src/app/api/agenthub/director-approval/route.test.js` for approve, reject, invalid decision, stale checkpoint, and stale linkage payloads.
- [x] 1.2 GREEN — Create `src/app/api/agenthub/director-approval/route.js` with bounded POST validation for `task_id`, `checkpoint_key`, `decision`, `workspace_id`, `run_id`, and `evidence_ref`.
- [x] 1.3 GREEN — In `src/app/api/agenthub/director-approval/route.js`, re-read durable supervisor snapshot + checkpoint, fail `409` on stale/mismatched linkage, then persist decision via existing DB helpers.
- [x] 1.4 REFACTOR — Extract small route helpers in `src/app/api/agenthub/director-approval/route.js` for payload validation and conflict responses without changing behavior.

## Phase 2: Canonical projection refresh

- [x] 2.1 RED — Update `src/lib/operations/__tests__/swarmControl.test.js` to require normalized approval fields: `checkpoint_key`, linkage ids, `decision_note`, `decided_at`, `freshness`, and `authority`.
- [x] 2.2 GREEN — Update `src/lib/operations/swarmControl.js` to normalize enriched approval rows and action-gating fields from authoritative snapshot input.
- [x] 2.3 RED — Extend `tests/agenthub/api/operations-health.test.js` to prove pending approvals project only while checkpoint status is `pending` and disappear after closed state.
- [x] 2.4 GREEN — Update `src/app/api/agenthub/operations/health/route.js` to project pending approvals plus linked supervisor state and expose refreshed `control_room_snapshot_input` for POST responses.

## Phase 3: Control Room mutation flow

- [x] 3.1 RED — Update `src/views/__tests__/SwarmControl.test.jsx` for approve/reject submit, button pending/disabled state, conflict error rendering, and mandatory GET reload after POST.
- [x] 3.2 GREEN — Update `src/views/SwarmControl.jsx` to submit Director decisions, clear transient state on success, hydrate returned snapshot if present, and always trigger `loadSnapshot()` fallback revalidation.
- [x] 3.3 GREEN — Update `src/components/control-room/ApprovalsErrorsPanel.jsx` to render approve/reject controls, pending guards, and inline mutation errors using existing panel data.
- [x] 3.4 REFACTOR — Keep QA-only routes untouched and remove any duplicated local approval mutation logic in `src/views/SwarmControl.jsx` / `src/components/control-room/ApprovalsErrorsPanel.jsx`.

## Phase 4: Verification and checkpoints

- [x] 4.1 Verify RED→GREEN order was preserved: route tests first, projection tests second, UI tests third; record task checklist updates in this file as slices land.
- [x] 4.2 Run targeted verification for touched layers (`src/app/api/agenthub/director-approval/route.test.js`, `tests/agenthub/api/operations-health.test.js`, `src/lib/operations/__tests__/swarmControl.test.js`, `src/views/__tests__/SwarmControl.test.jsx`).
- [ ] 4.3 Check manual behavior in Control Room: pending approval renders, approve/reject revalidates from GET snapshot, stale tab returns conflict, QA flow remains on its existing route.
- [ ] 4.4 Create local checkpoint before marking complete: confirm `git status --short`, keep working tree intentional, and note verification outcome for handoff.
