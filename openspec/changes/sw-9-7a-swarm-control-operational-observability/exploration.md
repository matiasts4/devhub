# Exploration: SW-9.7A swarm-control operational observability

### Current State

- `src/lib/operations/swarmControl.js` already composes the Control Room snapshot, mission inbox, evidence timeline, launchpad catalog, and active swarm hero.
- `src/components/control-room/AgentTopologyGraph.jsx` renders a read-only Director↔worker graph, but edges are only unlabeled strings and nodes only show coarse status/workspace/run IDs.
- `src/components/control-room/AgentsClaimsPanel.jsx`, `WorkspacesPanel.jsx`, `RunsArtifactsPanel.jsx`, `EvidenceTimelinePanel.jsx`, `MissionKernelPanel.jsx`, and `DiagnosticOverlay.jsx` already expose the durable ingredients for a richer per-agent operational view, but they do not tie them into one canonical agent narrative.
- There is no explicit runtime-vs-durable mismatch indicator; live hints exist, but ghost-swarm detection is only implicit.
- Existing timeline/report patterns in SW-8.7A and SW-9.4A already prove the repo prefers selector-first, read-only derivations.

### Affected Areas

- `src/lib/operations/swarmControl.js` — canonical selectors for agent states, mismatch summaries, topology metadata, and per-agent operational view models.
- `src/components/control-room/AgentTopologyGraph.jsx` — actionable topology rendering, connection types, and last-signal display.
- `src/components/control-room/AgentsClaimsPanel.jsx` — agent row affordances and terminal/task/evidence linkage.
- `src/components/control-room/EvidenceTimelinePanel.jsx` — narrative timeline copy and next-step framing.
- `src/components/control-room/DiagnosticOverlay.jsx` — runtime/durable mismatch indicator and recovery hints.
- `src/components/control-room/ControlRoomHeader.jsx` — top-level canonical state badge / summary.
- `src/views/SwarmControl.jsx` — wiring for selected-agent detail state and the new read-only observability surfaces.
- `src/lib/operations/__tests__/swarmControl.test.js`, `src/views/__tests__/SwarmControl.test.jsx` — contract coverage for labels, mismatch, topology, and narrative ordering.

### Approaches

1. **Selector-first observability view model** — add pure selectors for canonical human-readable agent states, per-agent operational cards, mismatch summaries, and topology edges with connection type/last signal; then wire small read-only panels.
   - Pros: stays snapshot-first, easy to test, minimizes risk.
   - Cons: needs a few new selectors and panel props.
   - Effort: Medium.

2. **New agent-insights panel and drawer** — build a dedicated detail surface plus graph/tooltips in one pass.
   - Pros: strong UX.
   - Cons: bigger diff, higher review cost, more state plumbing.
   - Effort: High.

### Recommendation

Use the selector-first path. Keep topology and agent detail read-only, derive last-signal/mismatch from existing snapshot/live-hint data, and avoid reusing launchpad topology strings as the observability contract.

### Risks

- If topology metadata is stored only in UI, it will drift from the snapshot and reintroduce ghost-swarm ambiguity.
- If mismatch detection only looks at live hints, it will become noisy and hard to trust.
- Reusing launchpad topology strings directly would couple observability to launchpad presets and make future changes brittle.

### Ready for Proposal

Yes — if scoped to read-only observability. Defer report-delivery transport and any terminal/session write semantics to a separate change; the manual QA checklist should be finalized after that second slice lands.
