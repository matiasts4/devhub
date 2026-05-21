# Design: Swarm Control launchpad-first redesign

## Technical Approach

Keep `composeControlRoomSnapshot()` as canonical snapshot seam. Add one new derived read-model layer in `src/lib/operations/swarmControl.js` that decides the top-of-page mode: **active tower** vs **launchpad empty**. `src/views/SwarmControl.jsx` becomes a composition shell: dominant primary surface first, existing operational panels demoted into secondary sections. Styling follows `.impeccable.md`: dense dark surfaces, warm amber emphasis, minimal chrome.

## Architecture Decisions

| Decision               | Options                                       | Choice                                                                     | Rationale                                                                                                             |
| ---------------------- | --------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Primary mode seam      | Branch in JSX only; derived selector          | Add `selectSwarmControlPrimarySurface(snapshot)`                           | Keeps hierarchy formula pure/testable and preserves read-model-first discipline.                                      |
| Template/preset source | New backend source; UI-local ad hoc constants | Selector-owned V1 catalog with explicit local metadata                     | V1 needs preparation/catalog only; no orchestration change. Centralizing in selector layer avoids scattered UI truth. |
| Existing panels        | Replace everything; keep all equal weight     | Reuse queue/mission/evidence/approvals panels under new hero               | Lowest-risk compatibility with current tests, mutations, and snapshot contracts.                                      |
| Active CTA             | New mutation verbs                            | Navigation/selection CTA only, reuse current claim/approval/composer seams | Scope stays UI IA redesign, not orchestration rewrite.                                                                |

## Data Flow

```text
operations/health snapshot
        -> composeControlRoomSnapshot()
        -> existing selectors (header/mission/queue/approvals/...)
        -> selectSwarmControlPrimarySurface()
             -> mode=active => tower hero model
             -> mode=idle => launchpad model + type catalog
        -> SwarmControl.jsx composition
             -> primary surface
             -> secondary panels
```

Sequence:

```text
GET snapshot -> compose snapshot -> derive primary surface -> render hero/launchpad
POST claim/approval/composer -> fetch refresh -> same selector path -> same page reorders nothing
```

## File Changes

| File                                                      | Action | Description                                                                                            |
| --------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------ |
| `src/lib/operations/swarmControl.js`                      | Modify | Add primary-surface/catalog selectors and mode derivation helpers without changing snapshot authority. |
| `src/views/SwarmControl.jsx`                              | Modify | Replace panel-first layout with primary-surface-first composition and state-aware section ordering.    |
| `src/components/control-room/SwarmPrimarySurface.jsx`     | Create | Thin presenter that switches between active tower and idle launchpad variants.                         |
| `src/components/control-room/ActiveSwarmTowerPanel.jsx`   | Create | Dominant active-swarm hero/tower summary with next-action anchors and compact operational stats.       |
| `src/components/control-room/LaunchpadTemplatesPanel.jsx` | Create | Template-first idle surface with recommended preset, catalog cards, and prep CTA copy.                 |
| `src/components/control-room/SwarmTypeCatalogPanel.jsx`   | Create | V1 read-only/prep catalog for swarm types/presets; no deep editor.                                     |
| `src/views/__tests__/SwarmControl.test.jsx`               | Modify | Lock ordering, empty-vs-active rendering, CTA hierarchy, and secondary-panel fallback.                 |
| `src/lib/operations/__tests__/swarmControl.test.js`       | Modify | Lock mode derivation, template recommendation, and catalog/read-model contracts.                       |

## Interfaces / Contracts

```js
selectSwarmControlPrimarySurface(snapshot) => {
  mode: 'active' | 'idle',
  hero: {
    title, status, authority, freshness,
    primaryCta: { kind: 'anchor'|'claim', target, label, disabled, reason },
    stats: { activeAgents, queueDepth, pendingApprovals, pendingDeliveries },
    highlights: []
  }
}

selectSwarmLaunchCatalog(snapshot) => {
  authority: 'local-catalog',
  recommended_template_id,
  templates: [{ id, label, summary, readiness, tags }],
  swarm_types: [{ id, label, summary, readiness, defaults_preview }]
}
```

Active mode formula: `mission_control.mission.status === 'active' || header.active > 0 || director_queue.handoff.status !== 'idle'`.

## Panel Composition

- **Active state**: `SwarmPrimarySurface(active tower)` -> `DirectorQueuePanel + ApprovalsErrorsPanel` -> `MissionKernelPanel + EvidenceTimelinePanel` -> `AgentsClaimsPanel / WorkspacesPanel / RunsArtifactsPanel` -> `DiagnosticOverlay`.
- **Idle state**: `SwarmPrimarySurface(launchpad)` -> `LaunchpadTemplatesPanel` -> `SwarmTypeCatalogPanel` -> `DirectorQueuePanel` (if backlog exists) -> `MissionKernelPanel`/diagnostics/evidence as compact secondary context.
- Filters/layout toggles move below the primary surface and apply only to secondary panels, not the hero/launchpad.

## Testing Strategy

| Layer          | What to Test                                                                       | Approach                                                                                              |
| -------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Unit           | Mode derivation, CTA disable reasons, template recommendation, catalog contract    | RED tests in `swarmControl.test.js` for active/idle/degraded snapshots.                               |
| Integration/UI | Primary ordering, empty vs active copy, preserved claim/approval/composer behavior | RED tests in `SwarmControl.test.jsx` using existing fixtures and DOM assertions.                      |
| E2E            | One smoke path idle->launchpad visible; one active snapshot path tower visible     | Extend existing Playwright swarm-control spec only if hierarchy is user-visible enough to justify it. |

## Migration / Rollout

No migration required. Rollout is file-local UI refactor over existing snapshot contracts.

## Open Questions

- [ ] Whether V1 launchpad primary CTA should trigger existing claim flow directly or remain anchor-only for stricter scope.
- [ ] Whether idle state should hide evidence/diagnostics by default or keep them visible in compact form for operator trust.
