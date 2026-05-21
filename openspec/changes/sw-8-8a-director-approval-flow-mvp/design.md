# Design: SW-8.8A Director approval flow MVP

## Technical Approach

Keep Control Room snapshot-first. `GET /api/agenthub/operations/health` remains read authority and MUST expose the approval slice needed by the UI. Director decisions travel through one new bounded write route, then the client re-fetches the health snapshot instead of mutating local approvals.

## Architecture Decisions

| Decision         | Choice                                                                                                             | Alternatives considered                                             | Rationale                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Read authority   | Keep approvals sourced from health snapshot GET                                                                    | Client cache; POST response as long-lived state                     | Prevents UI drift and preserves one read model.                              |
| Write seam       | Add `src/app/api/agenthub/director-approval/route.js`                                                              | Reuse `/api/agent/qa-result`; add more POST actions to health route | QA semantics are different, and health route is already overloaded.          |
| Freshness guard  | Revalidate checkpoint + linked supervisor snapshot on every POST                                                   | Blind update by `task_id`; trust client freshness                   | Durable checkpoint is source of truth; stale approvals must fail closed.     |
| Refresh behavior | POST returns minimal status plus refreshed `control_room_snapshot_input`; client also performs GET reload fallback | Optimistic local patch                                              | Close/reject changes affect multiple slices; GET keeps projection canonical. |

## Read Path vs Write Path

**Read path**

- `src/app/api/agenthub/operations/health/route.js`
- Read `getSupervisorSnapshot`, `listSupervisorApprovalCheckpoints`, `getSwarmMissionDirectorSnapshot`
- Build `control_room_snapshot_input.supervisor.approvals` from durable rows, plus mission/evidence/director queue.
- `src/lib/operations/swarmControl.js` normalizes approvals, including `checkpoint_key`, `decision_note`, `decided_at`, and snapshot linkage fields needed for action gating.

**Write path**

- `src/app/api/agenthub/director-approval/route.js`
- Accept `{ checkpoint_key, decision: 'approved'|'rejected', task_id, workspace_id?, run_id?, evidence_ref? }`.
- Validate: task exists, supervisor snapshot exists, `supervisor_state === 'awaiting_approval'`, checkpoint exists, checkpoint `status === 'pending'`, snapshot `approval_checkpoint_key === checkpoint_key`, and route target still matches task/workspace/run linkage.
- Persist with `upsertSupervisorApprovalCheckpoint` then `upsertSupervisorSnapshot`.
- No direct client state mutation beyond transient submit/error state.

## Revalidation Strategy

Before applying decision:

1. Load current supervisor snapshot by `task_id`.
2. Load checkpoint by `checkpoint_key`.
3. Reject with `409` if checkpoint missing, non-pending, or not linked to the current snapshot.
4. Reject with `409` if `workspace_id`/`run_id` from request conflicts with durable linkage.
5. Apply decision and stamp `decided_at` + `decision_note`.

This keeps stale browser tabs from approving an outdated checkpoint after supervisor state advanced.

## Snapshot Refresh Behavior

After approve/reject:

- Route returns `{ success, supervisor, control_room_snapshot_input }` where snapshot input is rebuilt from the same durable store.
- `src/views/SwarmControl.jsx` clears panel-local submit state, hydrates returned snapshot if present, then triggers `loadSnapshot()` GET revalidation.
- If POST returns without snapshot payload, GET reload is mandatory fallback.

## Sequence Diagrams

### Approve

`ApprovalsErrorsPanel -> SwarmControl -> POST /api/agenthub/director-approval -> localDb(checkpoint+snapshot revalidate) -> upsert checkpoint approved -> upsert snapshot closed -> build refreshed health snapshot -> UI reloads from snapshot`

### Reject

`ApprovalsErrorsPanel -> SwarmControl -> POST /api/agenthub/director-approval -> localDb(checkpoint+snapshot revalidate) -> upsert checkpoint rejected -> upsert snapshot blocked(approval_rejected) -> build refreshed health snapshot -> UI reloads from snapshot`

## File Changes

| File                                                   | Action | Description                                                                 |
| ------------------------------------------------------ | ------ | --------------------------------------------------------------------------- |
| `src/app/api/agenthub/director-approval/route.js`      | Create | Dedicated Director approve/reject write seam.                               |
| `src/app/api/agenthub/operations/health/route.js`      | Modify | Expose authoritative approval slice in GET; share snapshot refresh builder. |
| `src/lib/operations/swarmControl.js`                   | Modify | Normalize richer approval records and action eligibility fields.            |
| `src/components/control-room/ApprovalsErrorsPanel.jsx` | Modify | Add approve/reject controls, disabled/pending/error UI.                     |
| `src/views/SwarmControl.jsx`                           | Modify | Wire mutation handler and post-decision revalidation.                       |
| `tests/agenthub/api/operations-health.test.js`         | Modify | Cover refreshed approval projection after decision.                         |
| `src/app/api/agenthub/director-approval/route.test.js` | Create | Route TDD for approve/reject, stale checkpoint, and linkage mismatch.       |
| `src/views/__tests__/SwarmControl.test.jsx`            | Modify | UI submit/pending/error/reload coverage.                                    |
| `src/lib/operations/__tests__/swarmControl.test.js`    | Modify | Approval normalization regressions.                                         |

## Interfaces / Contracts

```js
{
  checkpoint_key: string,
  task_id: string,
  decision: 'approved' | 'rejected',
  workspace_id?: string,
  run_id?: string,
  evidence_ref?: string,
  decision_note?: string,
}
```

Approval snapshot rows MUST expose `checkpoint_key`, `task_id`, `workspace_id`, `run_id`, `status`, `reason_class`, `decision_note`, `decided_at`, `evidence_ref`, `freshness`, `authority`.

## Testing Strategy

Strict TDD order:

1. **Route RED**: new route tests for approve, reject, stale checkpoint, stale linkage, invalid payload.
2. **Projection RED**: health route + swarmControl tests proving refreshed canonical approvals.
3. **UI RED**: SwarmControl/Approvals panel tests for pending buttons, error rendering, and GET revalidation after POST.
4. **GREEN/REFACTOR**: minimal implementation only after failures exist.

## Migration / Rollout

No migration required. Reuses existing durable tables and keys.

## Open Questions

- [ ] None blocking; MVP uses Control Room bounded route without expanding QA semantics.
