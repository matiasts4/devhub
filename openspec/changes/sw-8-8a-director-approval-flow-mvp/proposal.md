# Proposal: SW-8.8A Director approval flow MVP

## Intent

Enable Director approve/reject actions from Control Room without breaking durable-state authority. Reads stay snapshot-first through the health projection; writes use one bounded approval seam only.

## Scope

### In Scope

- Add Director approve/reject action from the existing approvals panel flow.
- Add one dedicated server write route that validates pending checkpoint freshness before mutating durable supervisor tables.
- Return/trigger refreshed snapshot input so UI re-renders from authoritative snapshot data, not local mutation.

### Out of Scope

- Reviving AgentHub as a parallel control plane.
- Adding client caches, optimistic approval stores, or secondary approval projections.
- Expanding QA approval semantics beyond Director approval MVP.

## Capabilities

### New Capabilities

- `director-approval-flow`: Director can approve or reject a pending supervisor checkpoint from Control Room through a bounded durable write seam.

### Modified Capabilities

- None.

## Approach

- Keep `/api/agenthub/operations/health` as snapshot-first GET authority.
- Add a dedicated Director approval POST route separate from QA semantics and separate from the health GET route.
- Reuse existing durable DB helpers (`getSupervisorSnapshot`, `getSupervisorApprovalCheckpoint`, `upsertSupervisorApprovalCheckpoint`, `upsertSupervisorSnapshot`) with Director-specific validation and outcomes.
- Extend `ApprovalsErrorsPanel.jsx` and `SwarmControl.jsx` to submit approve/reject, handle pending/error UI, then reload authoritative snapshot data.

## Affected Areas

| Area                                                   | Impact   | Description                                                    |
| ------------------------------------------------------ | -------- | -------------------------------------------------------------- |
| `src/app/api/agenthub/operations/health/route.js`      | Modified | Preserve GET projection contract used after approval writes    |
| `src/app/api/agenthub/director-approval/route.js`      | New      | Minimal approve/reject write seam                              |
| `src/lib/db/localDb.js`                                | Reused   | Durable approval/supervisor authority remains source of truth  |
| `src/lib/operations/swarmControl.js`                   | Modified | Keep approval normalization compatible with refreshed snapshot |
| `src/components/control-room/ApprovalsErrorsPanel.jsx` | Modified | Add Director action controls and mutation states               |
| `src/views/SwarmControl.jsx`                           | Modified | Wire action callbacks and snapshot refresh                     |

## Risks

| Risk                        | Likelihood | Mitigation                                                                |
| --------------------------- | ---------- | ------------------------------------------------------------------------- |
| Stale approval accepted     | Med        | Reject unless checkpoint still pending and snapshot linkage still matches |
| UI forks from durable truth | Med        | No optimistic cache; always refresh from health snapshot after POST       |
| QA/Director semantic drift  | Low        | Keep new route separate from `/api/agent/qa-result`                       |

## Rollback Plan

Remove Director action wiring and new POST route; keep approvals panel read-only. Durable tables remain compatible because change only adds bounded writes using existing schema.

## Dependencies

- Existing supervisor checkpoint/snapshot tables and DB helpers.

## Success Criteria

- [ ] Director can approve or reject a pending checkpoint from Control Room.
- [ ] Rejected or closed checkpoints disappear/update only after authoritative snapshot refresh.
- [ ] No new approval cache, AgentHub authority, or alternate read model is introduced.
