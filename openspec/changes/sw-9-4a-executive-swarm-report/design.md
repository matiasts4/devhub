# Design: SW-9.4A Executive Swarm Report

## Technical Approach

Add one derived read model on top of `composeControlRoomSnapshot()` in `src/lib/operations/swarmControl.js`. The new selector layer will summarize existing header, queue, runs, approvals, diagnostics, mission, errors, and evidence slices into a serializable executive report object, then `src/views/SwarmControl.jsx` will render it through a read-only panel. Export uses the same selector output so UI and downstream consumers share one formula and one source of truth.

## Architecture Decisions

### Decision: Selector-first report model

| Option                            | Tradeoff                                      | Decision |
| --------------------------------- | --------------------------------------------- | -------- |
| Build report inside JSX           | Fast, but duplicates formulas and hurts tests | No       |
| Add selector in `swarmControl.js` | Keeps report pure, testable, serializable     | Yes      |

**Rationale**: Existing Control Room already centralizes normalization/selectors in `swarmControl.js`; follow that pattern.

### Decision: Reuse snapshot slices, never raw input

| Option                                   | Tradeoff                                               | Decision |
| ---------------------------------------- | ------------------------------------------------------ | -------- |
| Compute from raw `input`                 | Risks drift from normalized truth                      | No       |
| Compute from `selectControlRoom*` slices | Stable semantics, respects durable authority/freshness | Yes      |

**Rationale**: Proposal requires authoritative read-only derivation over current snapshot truth.

### Decision: Export seam is data-only

| Option                                              | Tradeoff                                       | Decision |
| --------------------------------------------------- | ---------------------------------------------- | -------- |
| Add endpoint/persistence                            | Violates scope, adds second truth              | No       |
| Expose `selectExecutiveSwarmReportExport(snapshot)` | Zero mutation, reusable by UI/report consumers | Yes      |

**Rationale**: Scope is selectors/panel/export seams only.

## Data Flow

```text
health payload / injected snapshotInput
        │
        ▼
composeControlRoomSnapshot()
        │
        ├─► selectControlRoomHeader()
        ├─► selectDirectorQueue()
        ├─► selectControlRoomRuns()
        ├─► selectControlRoomApprovals()
        ├─► selectControlRoomDiagnostics()
        ├─► selectControlRoomEvidenceTimeline()
        └─► selectControlRoomErrors()
                     │
                     ▼
        selectExecutiveSwarmReport(snapshot)
                     ├─► ExecutiveSwarmReportPanel
                     └─► selectExecutiveSwarmReportExport(snapshot)
```

Report formulas stay deterministic:

- **Progress**: counts from queue/runs/approvals; never inferred from UI state.
- **Blockers**: blocked queue items + pending approvals + explicit errors.
- **Evidence coverage**: percentage/count buckets from rows already exposing `evidence_ref(s)` / `missing_source`.
- **Risk summary**: derived from degraded/stale/unavailable freshness, blocked approvals, and missing evidence.
- **Next action**: deterministic priority order: pending approval → blocked queue item → degraded diagnostics/evidence gap → next queue item → “monitor only”.

## File Changes

| File                                                        | Action | Description                                                                          |
| ----------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------ |
| `src/lib/operations/swarmControl.js`                        | Modify | Add executive report selectors, aggregation helpers, export-shaping helper           |
| `src/components/control-room/ExecutiveSwarmReportPanel.jsx` | Create | Read-only presentation for summary, risks, blockers, evidence, next action           |
| `src/views/SwarmControl.jsx`                                | Modify | Consume selector output and render panel without new mutation handlers               |
| `src/lib/operations/__tests__/swarmControl.test.js`         | Modify | Lock formulas, severity ordering, export contract                                    |
| `src/views/__tests__/SwarmControl.test.jsx`                 | Modify | Verify executive panel renders derived content and no action controls are introduced |

## Interfaces / Contracts

```js
{
  summary: { progress_ratio, active_runs, blocked_items, pending_approvals },
  evidence: { covered_count, missing_count, coverage_ratio, missing_sources },
  risks: [{ code, severity, label, source_ids }],
  blockers: [{ kind, id, label, reason }],
  next_action: { kind, label, reason, target_id },
  export: { generated_at, authority, freshness, report }
}
```

`export.generated_at` MUST come from snapshot timestamps already present (`mission_control.snapshot_at` first, then latest evidence occurrence, else `null`). No `Date.now()`.

## Testing Strategy

| Layer       | What to Test                        | Approach                                                                                          |
| ----------- | ----------------------------------- | ------------------------------------------------------------------------------------------------- |
| Unit        | Report aggregation formulas         | Extend `swarmControl.test.js` with representative healthy/degraded/blocked fixtures               |
| Integration | Export payload stability            | Assert exact shape and that export equals selector-derived data, not ad hoc UI data               |
| UI          | Read-only executive panel rendering | Extend `SwarmControl.test.jsx` for summary/risk/blocker text and absence of new mutation controls |

## Migration / Rollout

No migration required. Read-only selector/panel addition over existing snapshot contract.

## Open Questions

- [ ] Should the first implementation expose export as selector-only contract, or also add a local “copy JSON” affordance in the panel? Design assumes selector-only seam unless spec requires UI affordance.
