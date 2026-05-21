# Exploration: SW-9.4A executive swarm report

### Current State

- The Control Room already has a durable read-model seam in `src/lib/operations/swarmControl.js` and a composed snapshot consumed by `src/views/SwarmControl.jsx`.
- Existing selectors already expose the main ingredients: `selectControlRoomHeader`, `selectControlRoomAgents`, `selectControlRoomWorkspaces`, `selectControlRoomRuns`, `selectControlRoomApprovals`, `selectDirectorQueue`, `selectDirectorMissionSummary`, `selectDirectorBriefingPreview`, `selectControlRoomDiagnostics`, `selectControlRoomEvidenceTimeline`, and `selectControlRoomErrors`.
- The snapshot already includes the durable ingredients for an executive report: progress-like counts (`active/max`, `queue_depth`), agent/workspace/run rows, approval gates, evidence timeline, mission summary, and diagnostics freshness/authority.
- UI already renders these slices in read-only panels: header, director queue, agents, workspaces, runs, approvals/errors, evidence timeline, mission kernel, and diagnostics overlay.
- What is missing is a synthesized executive layer that rolls these slices into one report with progress, risks, blockers, pending approvals, evidence/commits, next action recommendation, and an exportable snapshot.

### Affected Areas

- `src/lib/operations/swarmControl.js` — canonical place for selector/read-model composition.
- `src/lib/operations/health.js` — current health snapshot input already feeds the Control Room projection.
- `src/views/SwarmControl.jsx` — current orchestration surface that wires selectors into UI.
- `src/components/control-room/*` — existing read-only panels that could feed a report summary or export view.
- `src/views/__tests__/SwarmControl.test.jsx` and `src/lib/operations/__tests__/swarmControl.test.js` — existing contract tests for snapshot normalization and UI rendering.
- `src/app/api/agenthub/operations/health/route.js` — authoritative API path already returning `control_room_snapshot_input`.

### Approaches

1. **Derived executive selector only** — add a pure selector that composes a report from the existing snapshot slices.
   - Pros: no new orchestration, easiest to test, stays read-model only.
   - Cons: exportable snapshot/UI still needs a consumer.
   - Effort: Low/Medium.

2. **Selector + lightweight report panel** — add a derived report selector and a single UI panel that shows progress, risks, blockers, next action, and export payload.
   - Pros: user-visible value, still read-only, reuses current snapshot.
   - Cons: needs careful wording to avoid becoming a second truth surface.
   - Effort: Medium.

3. **New executive reporting API** — create a separate endpoint that formats the report from the snapshot.
   - Pros: clean consumer contract.
   - Cons: duplicates the read-model, risks drift from the canonical Control Room projection.
   - Effort: Medium/High.

### Recommendation

Use **Approach 2** but keep the report strictly derived from `composeControlRoomSnapshot()` output. Add one executive report selector plus a small read-only surface, and make export a serialized view of existing durable truth — not a new orchestration path.

### Risks

- Copying computed report fields into a new source of truth would fork authority away from the snapshot.
- "Progress" and "risk" need explicit formulas; if they are ad hoc, the report will be misleading.
- Evidence/commit coverage is partial today: runs, artifacts, approvals, and evidence timeline exist, but there is no explicit commit model in the current Control Room snapshot.
- Overlap with SW-9.1A/SW-9.2A if this feature starts mutating queue/approval behavior instead of only summarizing durable state.
- SW-9.3A/SW-9.5A likely own notification/orchestration/report distribution boundaries, so this change should not send messages or dispatch tasks.

### Ready for Proposal

Yes — if scoped as a pure read-model/reporting feature: derived executive summary, risk/blocker synthesis, next-action recommendation, and exportable snapshot built from existing Control Room truth.
