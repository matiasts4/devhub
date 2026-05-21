# Proposal: SW-5.1 Control Room UI redesign

## Intent

SW-5.1 starts now because SW-2.1, SW-2.2, SW-3.1, SW-4.1, SW-6.1, and SW-7.1 already froze the durable swarm contracts. The UI is the lagging piece: `SwarmControl` still mixes SSE, local mirrors, `agent_registry`, tasks polling, and `localStorage`, so humans cannot trust it as the final swarm surface.

## Scope

### In Scope

- Redefine Swarm Control as a read-only Workspace Control Room over the shared durable snapshot.
- Compose panels for agents, claimed tasks, leases, workspaces, artifacts, approvals, queue, errors, and degraded states.
- Limit local UI state to view concerns only: filters, expansion, selection, and layout preferences.

### Out of Scope

- New orchestration authority, supervisor policy, or backend-owned truth synthesis.
- New general Git/worktree/filesystem control verbs in UI.
- Reintroducing localStorage, `devhub_agent_runs`, ad-hoc SSE status, or Telegram/MCP mirrors as truth.

## Capabilities

### New Capabilities

- `workspace-control-room`: Final composed UI surface that renders the frozen swarm read model, approvals, and degradation semantics without inventing new ownership.

### Modified Capabilities

- `swarm-observability`: Shift observability cards and status summaries to canonical snapshot-derived truth instead of mixed live/local projections.
- `swarm-concurrency-limits`: Preserve active/max queue feedback inside the new Control Room composition rather than legacy `SwarmControl` assumptions.

## Approach

Adopt snapshot-first composition. Control Room MUST consume upstream truth from frozen workspace/run/artifact/supervisor/telegram/mcp contracts: workspace reservations and lifecycle, run/artifact evidence, supervisor outcomes plus approval gates, Telegram adapter state, and shared diagnostic/read-model semantics. UI MAY derive presentation groupings, but MUST NOT create alternate runtime state.

## Affected Areas

| Area                                         | Impact   | Description                                                         |
| -------------------------------------------- | -------- | ------------------------------------------------------------------- |
| `src/views/SwarmControl.jsx`                 | Modified | Replace mixed live control surface with composed Control Room shell |
| `src/lib/operations/swarmControl.js`         | Modified | Canonical UI projection from shared snapshot                        |
| `src/lib/agentRegistryLive.js`               | Modified | Remove truth ownership from runtime-local mirrors                   |
| `src/components/SwarmQueuePanel.jsx`         | Modified | Align queue/lease rendering with supervisor snapshot                |
| `openspec/specs/swarm-observability/spec.md` | Modified | Define snapshot-derived observability requirements                  |

## Risks

| Risk                                                 | Likelihood | Mitigation                                                        |
| ---------------------------------------------------- | ---------- | ----------------------------------------------------------------- |
| Legacy local/live sources keep leaking into UI truth | High       | Spec explicit allowed sources and ban alternate mirrors           |
| Humans confuse UI actions with autonomous authority  | Medium     | Keep risky/destructive actions approval-gated and narrowly scoped |

## Rollback Plan

Keep legacy `SwarmControl` behavior behind current surface boundaries until specs/design confirm the new read-model contract; revert proposal-driven UI changes by restoring prior projections and panels.

## Dependencies

- `sdd/sw-5-1-control-room-ui-redesign/explore`
- Frozen contracts: SW-2.1, SW-2.2, SW-3.1, SW-4.1, SW-6.1, SW-7.1

## Success Criteria

- [ ] Proposal defines why SW-5.1 is now justified by frozen upstream swarm contracts.
- [ ] In-bounds UI scope is limited to composed read-model rendering plus human approval actions.
- [ ] Non-goals explicitly prevent recreating backend ownership in the UI.
