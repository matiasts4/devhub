# Proposal: SW-9.7B Director Report Delivery Contract

## Intent

Make agent reports land as durable, Director-visible delivery events tied to a verified session/terminal. The Director should see receipt/status truth from the same read-model family, not a new transport.

## Scope

### In Scope
- Reuse mission messages + delivery receipts as the report contract.
- Project delivery status into the Director read-model and MissionKernel panel.
- Add contract tests for delivery receipts, ordering, and visible Director state.

### Out of Scope
- New report tables, new transport routes, or runtime-only storage.
- Non-verified consumers or ad hoc delivery channels.
- The integrated observability+delivery QA flow, until SW-9.7A lands.

## Capabilities

### New Capabilities
- `director-report-delivery`: durable report emission, verified Director session delivery, and receipt/status semantics.

### Modified Capabilities
- `swarm-observability`: show report delivery status in the control-room read-model.

## Approach

Treat reports as mission messages with durable receipts. Keep the Director terminal/session as the verified consumer and expose a narrow delivery-status projection from the existing snapshot helpers and health route.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/lib/swarm/teamTell.js` | Modified | Emit report messages and durable delivery receipts. |
| `src/lib/db/swarmMissions.js` | Modified | Extend message/delivery helpers and Director snapshot projection. |
| `src/app/api/agenthub/operations/health/route.js` | Modified | Surface report delivery state in the read-model. |
| `src/components/control-room/MissionKernelPanel.jsx` | Modified | Show the Director inbox/report feed. |
| `src/views/SwarmControl.jsx` | Modified | Wire report-delivery status copy into the page. |
| `src/lib/operations/__tests__/swarmControl.test.js`, `src/lib/db/swarmMissions.test.js`, `src/views/__tests__/SwarmControl.test.jsx` | Modified | Cover delivery receipts, ordering, and visible Director state. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Report meaning stays implicit | Medium | Define explicit message-kind/status semantics. |
| Delivery projection drifts from durable truth | Medium | Keep receipts sourced from mission snapshot helpers. |
| A second transport sneaks in | Low | Ban runtime-only report stores in scope and review. |

## Rollback Plan

Remove the report-projection wiring and revert to the prior mission message display. No schema rollback is needed if we stay on existing receipts.

## Dependencies

- Verified Director session/terminal identity.
- SW-9.7A for the integrated observability + delivery QA pass.

## Success Criteria

- [ ] Agent reports appear as durable Director-visible delivery events.
- [ ] Delivery receipts are visible in the read-model and MissionKernel panel.
- [ ] No new transport or storage source of truth is introduced.
