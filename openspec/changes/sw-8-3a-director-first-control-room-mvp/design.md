# Design: SW-8.3A Director-first Control Room MVP

## Technical Approach

Implement SW-8.3A as a presentation-only refinement of the existing `SwarmControl` screen. Keep `composeControlRoomSnapshot()` and current panel contracts as the source of truth, add at most one thin mission-summary selector, and re-order the existing shell so Director mission context is visually primary while secondary panels continue to run inside the current grid/stack container.

## Architecture Decisions

| Decision              | Choice                                                                          | Alternatives considered                                                     | Rationale                                                                                                              |
| --------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Mission-first summary | Add a small derived mission summary from existing `mission_control` fields only | Inline ad-hoc derivation in multiple components; backend contract expansion | Keeps logic consistent with current selector pattern in `src/lib/operations/swarmControl.js` and avoids truth drift.   |
| Layout strategy       | Reuse current `SwarmControl` shell and current grid/stack toggle                | New route, new page, new grid system                                        | Spec explicitly bans replacement architecture; current shell already owns filters, layout state, and secondary panels. |
| Scope boundary        | Read-path emphasis only; no lifecycle/dispatch/runtime additions                | Adding controls, action menus, or new mission writes                        | Matches proposal/spec boundary and keeps MVP reversible. Existing composer receives NO new behavior in this slice.     |

## Data Flow

```text
health route / snapshotInput
        ↓
composeControlRoomSnapshot(input)
        ↓
selectControlRoomHeader / Mission / Agents / Workspaces / Runs / Approvals / Diagnostics
        ↓
selectDirectorMissionSummary(snapshot)   (new thin selector)
        ↓
SwarmControl
  ├─ ControlRoomHeader(header, missionSummary)
  ├─ MissionKernelPanel(missionControl, missionSummary)
  ├─ local filter/layout controls
  ├─ existing secondary panel grid/stack
  └─ DiagnosticOverlay
```

## Component / File Plan

| File                                                 | Action | Description                                                                                                                                                                                                                                  |
| ---------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/views/SwarmControl.jsx`                         | Modify | Reorder render tree so mission-first content sits ahead of local controls and secondary panels; pass `missionSummary`; keep existing state (`layout`, `filterText`, `selectedRunId`, overlay) intact.                                        |
| `src/lib/operations/swarmControl.js`                 | Modify | Add `selectDirectorMissionSummary(snapshot)` derived only from normalized mission fields (`mission`, `participants`, `recent_messages`/`latest_message`, `pending_deliveries`, `presence`, `snapshot_at`, `watermark`). No contract changes. |
| `src/components/control-room/ControlRoomHeader.jsx`  | Modify | Accept optional `missionSummary` prop and surface a compact mission strip/chips without replacing existing supervisor metrics.                                                                                                               |
| `src/components/control-room/MissionKernelPanel.jsx` | Modify | Keep existing panel contract, but make first screenful explicitly Director-first: mission overview, inbox preview, pending deliveries, presence summary before any legacy sub-sections. No new controls.                                     |
| `src/views/__tests__/SwarmControl.test.jsx`          | Modify | Lock hierarchy, compatibility, and no-scope-creep behavior.                                                                                                                                                                                  |
| `src/lib/operations/__tests__/swarmControl.test.js`  | Modify | Add selector coverage for mission summary derivation and `latest_message` fallback compatibility.                                                                                                                                            |

## Rendering Hierarchy Changes

1. `ControlRoomHeader` remains top shell, but now includes compact mission context.
2. `MissionKernelPanel` becomes the explicit primary section immediately after the header.
3. Filter + grid/stack controls move below mission content as local presentation controls.
4. Existing secondary panels remain in the current container and current order: agents, workspaces, runs, approvals/errors.
5. `DiagnosticOverlay` stays last and independent of layout mode.

## Compatibility Strategy

- Keep the current `layout === 'grid' ? grid : stack` container unchanged; only mission-first sections live outside it.
- Keep panel props stable; only `ControlRoomHeader` gets a new optional prop.
- Keep filter semantics unchanged: filters apply to secondary panels only, not mission truth.
- Preserve legacy `latest_message` behavior by deriving summary text from `recent_messages[0]` fallback exactly like current normalization.
- Do not touch health-route payloads, `composeControlRoomSnapshot()`, or durable storage semantics.

## Interfaces / Contracts

```js
// additive presentation selector only
export function selectDirectorMissionSummary(snapshot = {}) {
  return {
    title: string | null,
    status: string,
    participantCount: number,
    pendingDeliveryCount: number,
    latestMessageSummary: string | null,
    activePresenceCount: number,
    stalePresenceCount: number,
    offlinePresenceCount: number,
    snapshotAt: string | null,
    watermark: string | null,
  };
}
```

## Testing Strategy

| Layer       | What to Test                                                                                                  | Approach                                                                                                           |
| ----------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Unit        | Mission summary derivation and `latest_message` fallback                                                      | Extend `src/lib/operations/__tests__/swarmControl.test.js`.                                                        |
| Integration | DOM order, header mission strip, grid/stack invariance, empty mission state, no new operational verbs/buttons | Extend `src/views/__tests__/SwarmControl.test.jsx` with the existing DOM harness.                                  |
| E2E         | None required for MVP                                                                                         | Skip unless route-level regression appears; this is a presentation-only change already covered by component tests. |

## Migration / Rollout

No migration required.

## Guardrails Against Scope Creep

- MUST NOT add a new route, page shell, or grid system.
- MUST NOT add lifecycle/runtime/dispatch/browser/GTK/VTE controls.
- MUST NOT add backend fields or alternate mission truth.
- MUST NOT expand or redesign the existing composer/API path in this change.
- SHOULD prefer modifying existing files over introducing new component layers.

## Open Questions

- [ ] None.
