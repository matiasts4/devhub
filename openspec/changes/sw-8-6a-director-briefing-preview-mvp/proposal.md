# Proposal: SW-8.6A Director Briefing Preview MVP

## Intent

Repo truth already has the local composer seam: `MissionKernelPanel.jsx` renders it, `SwarmControl.jsx` submits through `persistMissionControlComposerMessage()`, `operations-health/route.js` persists local mission messages, and `swarmControl.js` normalizes `mission_control`. This slice adds a deterministic Director briefing/prompt preview over that existing seam so Director can inspect the derived prompt before sending, without creating a second composer or new backend truth.

## Scope

### In Scope

- Derive a deterministic briefing/prompt preview from durable `mission_control` plus selected participant(s).
- Render that preview inside the existing `MissionKernelPanel` composer flow.
- Keep the current submit path and persistence semantics unchanged.
- Add focused selector/UI tests for deterministic preview behavior.

### Out of Scope

- New composer system, schema, queue truth, approvals, live evidence, Browser/GTK work.
- SW-8.7A / SW-8.8A behavior or any dispatch/runtime-control expansion.
- Changes to `persistMissionControlComposerMessage()`, POST payload shape, or local mission message persistence.

## Capabilities

### New Capabilities

- `director-briefing-preview`: deterministically derives and previews the Director briefing text from existing `mission_control` context before submit.

### Modified Capabilities

- None.

## Approach

Add a pure derivation helper in `src/lib/operations/swarmControl.js` that accepts normalized `mission_control` plus selected recipient ids and returns stable preview text/sections. `SwarmControl.jsx` passes the normalized slice into `MissionKernelPanel.jsx`; the panel keeps local selection/input state, renders a bounded preview, and still submits only `{ recipient_agent_ids, body_summary }` through the current handler.

## Affected Areas

| Area                                                                 | Impact   | Description                                         |
| -------------------------------------------------------------------- | -------- | --------------------------------------------------- |
| `openspec/changes/sw-8-6a-director-briefing-preview-mvp/proposal.md` | New      | Proposal artifact                                   |
| `src/lib/operations/swarmControl.js`                                 | Modified | Pure briefing/prompt derivation selector/helper     |
| `src/components/control-room/MissionKernelPanel.jsx`                 | Modified | Existing composer gains bounded preview UI          |
| `src/views/SwarmControl.jsx`                                         | Modified | Thread preview inputs through current composer seam |
| `src/lib/operations/__tests__/swarmControl.test.js`                  | Modified | Deterministic selector coverage                     |
| `src/views/__tests__/SwarmControl.test.jsx`                          | Modified | Preview rendering/submission boundary coverage      |

## Risks

| Risk                                    | Likelihood | Mitigation                                     |
| --------------------------------------- | ---------- | ---------------------------------------------- |
| Preview drifts from durable truth       | Med        | Derive only from normalized `mission_control`  |
| Scope creeps into new composer behavior | High       | Reuse current submit contract unchanged        |
| Flaky UI tests                          | Med        | Keep preview deterministic and selector-driven |

## Rollback Plan

Revert preview selector/UI changes. Existing composer submission and persistence path remain intact.

## Dependencies

- Existing `mission_control` normalization and local composer persistence seam.

## Success Criteria

- [ ] Director sees deterministic preview derived only from existing `mission_control` and selected participants.
- [ ] Existing submit request/route contract stays unchanged.
- [ ] No new schema, queue authority, approvals, live evidence, or alternate composer is introduced.
