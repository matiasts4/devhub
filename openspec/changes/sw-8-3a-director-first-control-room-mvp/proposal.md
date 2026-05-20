# Proposal: SW-8.3A Director-first Control Room MVP

## Intent

`SwarmControl` already is a panelized Control Room and SW-8.2C already froze a usable `mission_control` snapshot. SW-8.3A should therefore be a Director-first refinement of the existing read-only room: make mission context primary for the operator without rebuilding layout, adding orchestration, or taking terminal/runtime control.

## Scope

### In Scope

- Prioritize Director mission context inside the existing Control Room shell using the current grid/stack view and existing panels.
- Derive any new emphasis, summaries, or ordering only from the existing `mission_control` snapshot already exposed to `SwarmControl`.
- Add focused UI coverage for Director-first rendering and preserved read-only boundaries.

### Out of Scope

- New grid implementation, route redesign, or a second Control Room architecture.
- Terminal/session lifecycle actions, runtime handle control, binding resolution UI, browser/GTK/VTE control, or `terminalLifecycleContract` integration.
- Dispatch/orchestration authority, new write APIs beyond the existing local composer, or backend schema/contract changes to `mission_control`.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `workspace-control-room`: refine the existing read-only Control Room so Director mission state becomes the primary operator context.
- `director-mission-inbox`: render the already-frozen inbox snapshot as first-class Control Room context without changing durable semantics.

## Approach

Treat SW-8.3A as presentation-only refinement. Reuse `src/views/SwarmControl.jsx`, the current control-room panels, and the stable `mission_control` normalization already present in `src/lib/operations/swarmControl.js`. Any new UI cue SHALL derive only from `mission`, `participants`, `recent_messages`, `latest_message`, `pending_deliveries`, `presence`, `snapshot_at`, and `watermark`.

## Affected Areas

| Area                                                                   | Impact         | Description                                                            |
| ---------------------------------------------------------------------- | -------------- | ---------------------------------------------------------------------- |
| `openspec/changes/sw-8-3a-director-first-control-room-mvp/proposal.md` | New            | Proposal for the conservative MVP slice                                |
| `src/views/SwarmControl.jsx`                                           | Modified       | Reorder/refine current Control Room composition for Director-first use |
| `src/components/control-room/MissionKernelPanel.jsx`                   | Modified       | Promote mission context inside existing panel contract                 |
| `src/components/control-room/ControlRoomHeader.jsx`                    | Modified       | Surface mission-aware summary if needed without new authority          |
| `src/views/__tests__/SwarmControl.test.jsx`                            | Modified       | Lock Director-first UI behavior and read-only boundaries               |
| `src/lib/operations/swarmControl.js`                                   | Maybe Modified | Only for thin presentation selectors; no contract expansion            |

## Acceptance Boundary

Accepted when Director can open the existing Control Room and immediately see mission state as the primary context, while all data still comes from the current snapshot contract and no lifecycle/orchestration/runtime-control surface is introduced.

## Risks

| Risk                             | Likelihood | Mitigation                                                                  |
| -------------------------------- | ---------- | --------------------------------------------------------------------------- |
| Scope drifts into layout rewrite | Med        | Reuse current grid/stack shell and panel contracts                          |
| UI leaks into lifecycle control  | High       | Ban `terminalLifecycleContract` and runtime-control actions from this slice |
| Contract creep into backend      | Med        | Consume existing `mission_control` fields only                              |

## Rollback Plan

Revert the UI composition changes and tests. No schema change, no new API contract, and no runtime cleanup required.

## Dependencies

- SW-5.1 already delivered the panelized, snapshot-first Control Room in `src/views/SwarmControl.jsx`; SW-8.3A is refinement, not replacement.
- SW-8.2C already delivered stable `mission_control` in `src/lib/operations/swarmControl.js` and `src/app/api/agenthub/operations/health/route.js`; this is the data prerequisite for Director-first UI.
- SW-8.2D and SW-8.4A are checkpointed, so binding/lifecycle seams exist and can stay explicitly out of scope; that makes a read-only UI refinement the next safe task.

## Success Criteria

- [ ] Proposal limits SW-8.3A to Director-first refinement of the existing Control Room.
- [ ] Scope explicitly excludes grid rebuild, lifecycle control, and orchestration/dispatch work.
- [ ] Likely implementation touches remain UI-first, with backend contracts unchanged.
