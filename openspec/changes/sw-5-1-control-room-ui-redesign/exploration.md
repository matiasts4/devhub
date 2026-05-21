# Exploration: SW-5.1 Control Room UI redesign

### Current State

`src/views/SwarmControl.jsx` is still a mixed surface: it renders live sessions, queue/history, launch controls, visibility toggles, and health badges from a blend of SSE, polling, `agent_registry`, `tasks`, `agenthub/sessions`, `/api/agenthub/operations/health`, and `/api/agenthub/config`. It also uses local-only UI state (`localStorage` hidden tasks, panel expansion, filters), so the page is not a pure read-model consumer today.

The frozen contracts already define the right boundaries: SW-2.1 workspace reservation, SW-3.1 `agent_runs`/`agent_artifacts`, SW-4.1 supervisor outcomes and approval gates, SW-6.1 Telegram as adapter only, and SW-7.1 one diagnostic read model for UI/MCP/Telegram. SW-5.1 should therefore be a Workspace Control Room that _renders_ those durable snapshots, not another control-plane source.

### Affected Areas

- `src/views/SwarmControl.jsx` — current UI mix of durable reads and ephemeral view state.
- `src/lib/operations/swarmControl.js` — current header/health projection layer; likely the seam for a canonical read model.
- `src/lib/agentRegistryLive.js` — still bridges runtime-local `devhub_agent_runs`; high drift risk if treated as truth.
- `src/components/SwarmQueuePanel.jsx` — queue UX currently warns about in-memory state; should align with canonical queue/supervisor snapshot.
- `docs/23_Swarm_Workspace_Intencion_y_Roadmap.md` — already declares SW-5.1 as “Workspace Control Room” and lists the intended panels.
- `openspec/changes/sw-4-1-supervisor-loop-design/*` — supervisor contract that SW-5.1 must visualize.
- `openspec/changes/sw-6-1-telegram-external-adapter-plan/*` — Telegram must consume the same durable snapshot, so SW-5.1 cannot invent alternate truth.
- `openspec/changes/sw-7-1-mcp-control-center-verifiable/*` — MCP Control Center shares the same diagnostic read-model semantics.

### Approaches

1. **Snapshot-first Control Room** — UI becomes a thin renderer over one shared durable snapshot (supervisor + workspace/run/artifact + approval + delivery state), with local state limited to filters, expansion, and panel selection.
   - Pros: one truth shape across SW-5.1/SW-6.1/SW-7.1; less drift; easier auditing; safer degraded-state handling.
   - Cons: requires a stronger read-model contract and more projection work.
   - Effort: Medium

2. **Incremental retrofit of current SwarmControl** — keep existing SSE/polling and progressively replace panels with canonical snapshot consumers.
   - Pros: lower immediate risk; smaller UI churn.
   - Cons: prolongs split-brain truth; keeps runtime-local mirrors in the critical path; harder to reason about degraded states.
   - Effort: Low/Medium

3. **Parallel new page + gradual cutover** — build a new Control Room route and leave legacy SwarmControl as fallback.
   - Pros: isolates redesign work; avoids destabilizing current page.
   - Cons: duplicates surface area and truth mapping; risks two UIs diverging; more maintenance.
   - Effort: High

### Recommendation

Use **Approach 1**. SW-5.1 should standardize the Control Room around one durable read model and explicitly separate:

- **Durable consumers**: agents, claimed tasks, leases, workspaces, branches, artifacts, approvals, errors, queue state, supervisor outcomes.
- **Ephemeral UI state**: filters, search, expanded drawers, selected panels, view mode, hidden/visible toggles, scroll position.

### Risks

- Current UI still derives visible state from local/runtime mirrors (`agent_registry`, `devhub_agent_runs`, `localStorage`, SSE/polling), so it can disagree with supervisor truth.
- If SW-5.1 keeps inventing its own health/queue/status synthesis, SW-6.1 Telegram and SW-7.1 MCP will drift from the same control-room semantics.
- Approval gates and degraded states need explicit rendering; hiding them behind “healthy/active” badges would reintroduce unsafe implicit authority.

### Ready for Proposal

Yes — next phase should formalize the Control Room information model and panel contract against the shared durable snapshot, then turn that into proposal/spec artifacts.
