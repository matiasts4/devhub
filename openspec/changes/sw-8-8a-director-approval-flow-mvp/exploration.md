## Exploration: SW-8.8A Director approval flow MVP

### Current State

- Durable approval truth already exists in `supervisor_approval_checkpoints` and `supervisor_snapshots` in `src/lib/db/localDb.js`.
- `/api/agenthub/operations/health` projects those rows into `control_room_snapshot_input.mission_control.approval_checkpoints` and `supervisor_snapshots`, and `composeControlRoomSnapshot()` normalizes them into `snapshot.approvals`.
- The Control Room UI renders approvals in `ApprovalsErrorsPanel.jsx`, but it is read-only. `DirectorQueuePanel.jsx` only handles queue claim state, not approval decisions.
- `src/app/api/agent/qa-result/route.js` already writes approval decisions to durable supervisor tables, but it is QA-specific and not a general Director panel action.

### Affected Areas

- `src/lib/db/localDb.js` — source of truth for approval checkpoints and supervisor snapshots.
- `src/app/api/agenthub/operations/health/route.js` — read projection seam for durable supervisor/approval state.
- `src/lib/operations/swarmControl.js` — snapshot normalization/selectors for approvals and director surfaces.
- `src/components/control-room/ApprovalsErrorsPanel.jsx` — best existing UI seam for approval review/actions.
- `src/views/SwarmControl.jsx` — composes the Control Room panels and would wire any new action callbacks.
- `src/app/api/agent/qa-result/route.js` — reusable durable write pattern, but semantics are narrower than Director approvals.

### Approaches

1. **Extend the existing Approvals panel with a dedicated approval action route** — keep read model in health/snapshot projection, add approve/reject controls beside each pending checkpoint, and POST to a bounded server action that updates `supervisor_approval_checkpoints` + `supervisor_snapshots`.
   - Pros: keeps durable-first authority; smallest UI seam; clear separation from queue claim logic.
   - Cons: needs a new write route and careful permission/freshness checks.
   - Effort: Medium.

2. **Reuse the QA approval route for Director actions** — map Director decisions onto `src/app/api/agent/qa-result/route.js`.
   - Pros: fewer new backend files; uses already-verified durable write path.
   - Cons: wrong domain semantics; risks conflating QA decisions with Director approvals; harder to reason about authority/freshness.
   - Effort: Low.

3. **Create a new Director approval facade inside the health route** — add POST actions to `/api/agenthub/operations/health` for approve/reject.
   - Pros: one endpoint for read + bounded write; easy to keep snapshot fresh after mutation.
   - Cons: mixes read and write concerns; can bloat the already-central health route; easier to drift into a second control plane.
   - Effort: Medium.

### Recommendation

Use **Approach 1**: keep the GET snapshot as the only read authority, add a dedicated bounded approval write route, and surface approve/reject controls in `ApprovalsErrorsPanel` (or a sibling panel if the UX needs more room). The route should validate against the durable supervisor checkpoint state, write the checkpoint decision, update the matching supervisor snapshot, and then return refreshed snapshot input so the UI stays snapshot-first.

### Risks

- Write-path drift: if the UI mutates local state, it will fork from durable truth.
- Authority/freshness bugs: approvals must be rejected when the checkpoint is no longer pending or the supervisor snapshot changed.
- Domain confusion: reusing QA routes can blur QA vs Director approval semantics.
- Duplicate sources: do not introduce a client-side approval cache or separate approval store.

### Ready for Proposal

Yes — the next step is a proposal/design that defines the bounded approval action route and the exact panel/UI seam.
