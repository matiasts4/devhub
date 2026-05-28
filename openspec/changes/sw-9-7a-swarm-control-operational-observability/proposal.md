# Proposal: SW-9.7A Swarm Control Operational Observability

## Intent

Expose canonical agent state, topology semantics, and runtime-vs-durable mismatch signals in SwarmControl. Operators should read the swarm without logs, runtime guesses, or launchpad strings.

## Scope

### In Scope
- Add selector-first observability view models in `src/lib/operations/swarmControl.js`.
- Wire read-only topology, claims, evidence, diagnostics, and header summaries in SwarmControl UI.
- Add/update contract tests for canonical labels, mismatch state, topology detail, and narrative ordering.

### Out of Scope
- New write paths, storage tables, or transport layers.
- Director report delivery semantics.
- Deep builder or launch workflow changes.

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- `swarm-observability`: canonical agent narrative, topology detail, and mismatch detection.

## Approach

Use existing snapshot/live-hint data to derive a read-only observability model. Keep the topology graph, agent claims, evidence timeline, and diagnostics in sync through selectors, not client state.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/lib/operations/swarmControl.js` | Modified | Add canonical observability selectors and mismatch summaries. |
| `src/components/control-room/AgentTopologyGraph.jsx` | Modified | Render richer connection metadata and last-signal state. |
| `src/components/control-room/AgentsClaimsPanel.jsx` | Modified | Link selected agent to terminal/task/evidence narrative. |
| `src/components/control-room/EvidenceTimelinePanel.jsx` | Modified | Improve timeline copy and next-step framing. |
| `src/components/control-room/DiagnosticOverlay.jsx` | Modified | Show runtime-vs-durable mismatch and recovery hints. |
| `src/components/control-room/ControlRoomHeader.jsx` | Modified | Surface canonical swarm status badge/summary. |
| `src/views/SwarmControl.jsx` | Modified | Wire selected-agent observability state through the page. |
| `src/lib/operations/__tests__/swarmControl.test.js`, `src/views/__tests__/SwarmControl.test.jsx` | Modified | Cover labels, mismatch, topology, and narrative order. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Mismatch signal gets noisy | Medium | Derive it from durable + live hints only. |
| Topology semantics drift from snapshot truth | Medium | Keep all labels selector-derived. |
| Review scope grows too large | Medium | Keep the diff read-only and panel-local. |

## Rollback Plan

Revert the new selectors and UI wiring, then restore the previous coarse panels. No migration or data rollback is needed.

## Dependencies

- Existing snapshot/read-model seams in `swarmControl.js`, `health/route.js`, and mission snapshot helpers.

## Success Criteria

- [ ] SwarmControl shows canonical agent state and topology metadata.
- [ ] Runtime-vs-durable mismatch is visible and actionable.
- [ ] Tests cover the new read-only observability contract.
