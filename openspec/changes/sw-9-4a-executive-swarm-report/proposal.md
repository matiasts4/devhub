# Proposal: SW-9.4A Executive Swarm Report

## Intent

Expose one executive report derived from the current Control Room snapshot so operators can assess progress, blockers, approvals, evidence, risks, and next action without reading every panel. Keep the feature read-only and authoritative to existing snapshot data.

## Scope

### In Scope

- Add a pure derived reporting selector over `composeControlRoomSnapshot()` output.
- Synthesize progress, blockers, pending approvals, evidence coverage, risk summary, and next-action recommendation from existing slices only.
- Expose an exportable report payload that serializes current durable snapshot truth for UI/report consumers.

### Out of Scope

- New orchestration, dispatch, approval mutation, or queue mutation behavior.
- New backend endpoint or secondary persistence model.

## Capabilities

### New Capabilities

- None

### Modified Capabilities

- `swarm-observability`: extend Control Room observability with an executive read-model summary and export payload derived from existing snapshot slices.

## Approach

Implement the report as a selector-level read model in `src/lib/operations/swarmControl.js`, sourced from existing header, queue, runs, approvals, diagnostics, mission, errors, and evidence selectors. Render it through a lightweight Control Room consumer and keep export as a serialized view of the same derived object. No new source of truth.

## Affected Areas

| Area                                                | Impact   | Description                                                |
| --------------------------------------------------- | -------- | ---------------------------------------------------------- |
| `src/lib/operations/swarmControl.js`                | Modified | Add executive report derivation and export payload shaping |
| `src/views/SwarmControl.jsx`                        | Modified | Consume and display derived executive summary              |
| `src/components/control-room/*`                     | Modified | Reuse/add read-only presentation for report sections       |
| `src/lib/operations/__tests__/swarmControl.test.js` | Modified | Lock selector formulas and export payload contract         |
| `src/views/__tests__/SwarmControl.test.jsx`         | Modified | Verify read-only rendering of executive report             |

## Risks

| Risk                                     | Likelihood | Mitigation                                                     |
| ---------------------------------------- | ---------- | -------------------------------------------------------------- |
| Derived fields drift from snapshot truth | Med        | Compute only from existing selectors/snapshot                  |
| Progress/risk formulas mislead operators | Med        | Define deterministic formulas and test them                    |
| Commit coverage is incomplete today      | High       | Report evidence/commit availability explicitly, not implicitly |

## Rollback Plan

Remove the executive selector/panel and revert consumers to existing Control Room slices. No data migration or state rollback required because the change is read-only.

## Dependencies

- Existing `control_room_snapshot_input` contract from `src/app/api/agenthub/operations/health/route.js`
- Current SwarmControl snapshot selectors and tests

## Success Criteria

- [ ] Operators can read one executive summary covering progress, blockers, approvals, evidence, risks, and next action.
- [ ] Export payload is fully derived from the current Control Room snapshot with no mutation path or new persistence.
- [ ] Tests prove deterministic selector output and read-only UI rendering for representative states.
