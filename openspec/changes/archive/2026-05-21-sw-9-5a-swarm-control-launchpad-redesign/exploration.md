# Exploration: Swarm Control launchpad-first redesign

### Current State

- `src/views/SwarmControl.jsx` is a read-model composition surface with some local write seams (composer submit, director queue claim, approval decision refresh).
- The current UX is panel-heavy: header, mission kernel, director queue, filter/layout controls, evidence, agents, workspaces, runs, approvals, and diagnostics.
- It already honors snapshot-first authority, but the main screen feels like an operational report, not a launch surface.
- There is no template-first entry, no active-swarm hero with strong CTA hierarchy, and no surface for swarm type selection/prep.
- `src/views/Scaffolding.jsx` already shows a strong template-first pattern we can borrow: presets, recommended choices, primary CTA, and selected-state feedback.

### Affected Areas

- `src/views/SwarmControl.jsx` — top-level composition and primary IA.
- `src/components/control-room/*` — likely split or replace panels with a hero/launchpad/catalog structure.
- `src/lib/operations/swarmControl.js` — derived read-model helpers for active swarm summary, launchpad presets, and swarm type metadata.
- `src/views/__tests__/SwarmControl.test.jsx` — must lock the new ordering, empty states, and CTA hierarchy.
- `src/lib/operations/__tests__/swarmControl.test.js` — must keep snapshot truth stable if new selectors are added.
- `src/views/Scaffolding.jsx` — pattern reference for template-first selection and launch CTA styling.

### Approaches

1. **Incremental panel reshuffle** — keep the current panel set, but move a strong active-swarm hero and template launch strip to the top.
   - Pros: lower risk, smaller diff, reuses current panels.
   - Cons: still feels like a dashboard with a launch band bolted on.
   - Effort: Medium.

2. **Launchpad-first redesign** — make the first screen either an active swarm hero or a template-first launchpad, then tuck the detailed panels below.
   - Pros: matches the product decision, fixes hierarchy, gives clear CTA flow.
   - Cons: touches more UI composition and test expectations.
   - Effort: Medium/High.

3. **New dedicated control surface route** — split launch and observability into separate views.
   - Pros: very clean mental model.
   - Cons: too much for a first pass; higher routing and state risk.
   - Effort: High.

### Recommendation

Use **Approach 2**. Keep the snapshot-first read model, but redesign the page around a top-level decision: if a swarm is active, show a hero/control surface first; if not, show a template-first launchpad with presets/templates and then a configurable swarm-type surface. Preserve the existing detail panels as secondary context, not the first thing users see.

### Scope Minimum for v1

- Active swarm hero/control surface with the key live facts and the strongest CTA.
- Launchpad with ready-to-launch templates/presets when no swarm is active.
- Swarm type catalog/configuration surface at the preparation level only (surface, not deep editor).
- Empty state that still gives the user a useful next action.
- Stronger visual hierarchy, spacing, and CTA emphasis.

### Risks

- If we keep every old panel at equal weight, the redesign will still read as a passive dashboard.
- If template/preset data is invented instead of derived from the existing model, we risk a second truth surface.
- Full swarm-type editing is a scope trap; it can easily turn into a builder, not a control surface.
- Existing read-only snapshot contracts must not be broken while reshaping the UI.

### Ready for Proposal

Yes — this is ready for a new proposal/spec as a separate change, not as an extension of SW-9.4A.

### Contract

- **status**: ready for proposal
- **executive_summary**: New change, not SW-9.4A. Redesign Swarm Control into a launchpad-first surface with active-swarm hero, template-first empty state, and swarm-type prep/config at the top.
- **suggested_change_name**: `sw-9-5a-swarm-control-launchpad-redesign`
- **suggested_change_scope**: UI/IA redesign of `SwarmControl` with derived launch/read surfaces only; no new orchestration model.
- **implementation_candidates**:
  - `src/views/SwarmControl.jsx`
  - `src/components/control-room/*`
  - `src/lib/operations/swarmControl.js`
  - `src/views/__tests__/SwarmControl.test.jsx`
  - `src/lib/operations/__tests__/swarmControl.test.js`
- **non_goals**:
  - No new swarm orchestration or mutation backend.
  - No full swarm-type editor or deep config builder.
  - No rewrite of the durable snapshot/read model.
  - No passive dashboard refresh disguised as redesign.
- **artifacts**: `openspec/changes/sw-9-5a-swarm-control-launchpad-redesign/exploration.md`
- **risks**: hierarchy drift, truth drift, scope creep into builder semantics.
- **skill_resolution**: `sdd-explore` + existing frontend/UX standards; no additional skill was required beyond exploration and UI architecture analysis.
