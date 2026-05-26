# Proposal: Swarm Director Durable Feed

## Intent

Remove director friction when workers finish by making completion and handoff readiness durable, director-visible facts. Director progress must come from canonical persisted state, not from whether a worker chat/session transport happened to deliver. In the same change, tighten the MCP boundary so human-operated swarm/agent/workspace lifecycle actions stop living in the public DevHub MCP surface and move to the CLI/runtime side where they belong.

## Scope

### In Scope

- Add a durable director feed/projection for `task_completed` and `handoff_ready`.
- Define canonical persisted event/state inputs the feed consumes.
- Expose one reusable backend contract for IDE/CLI adapters.
- Reduce the public MCP surface so project-management tools remain, while agent/workspace/run/swarm-control actions are removed from the supported MCP contract and treated as CLI/runtime responsibilities.

### Out of Scope

- Chat redesign, CLI rewrite, or transport-specific hacks.
- Broad orchestration redesign, DB physical split, or worktree automation.
- Requiring verified worker delivery before the director sees completion.
- Rebuilding every existing operator command; only the MCP/CLI ownership boundary is corrected.

## Capabilities

### New Capabilities

- `director-durable-feed`: director-facing durable feed for worker completion, handoff readiness, and next-action state derived from persisted mission/runtime truth.

### Modified Capabilities

- `agent-events`: canonical worker events MUST carry projection-ready completion/handoff semantics.
- `swarm-observability`: director snapshots/read models MUST expose feed items and watermarks from durable truth.
- `mcp-public-contract`: supported DevHub MCP tools MUST exclude swarm agent/workspace/run lifecycle actions and keep MCP focused on project/application management.

## Approach

Keep durable event/state as source of truth: normalize worker lifecycle events in persistence, derive a director feed in shared DB read helpers, and publish that projection through runtime-consumable APIs. Frontends/CLIs become thin adapters over the same contract. `teamTell` remains optional transport only; `binding_missing` cannot block feed visibility. In parallel, trim the MCP contract so it no longer owns swarm agent/workspace/run creation or manipulation; that ownership moves to CLI/runtime adapters over the same durable backend truth.

## Affected Areas

| Area                                                 | Impact   | Description                                                                                                       |
| ---------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------- |
| `src/app/api/agenthub/events/route.js`               | Modified | Normalize completion/handoff events into canonical persisted inputs.                                              |
| `src/lib/db/swarmMissions.js`                        | Modified | Build director feed projection, ordering, and watermark from durable mission state.                               |
| `src/lib/db/compactReads.js`                         | Modified | Expose reusable director-feed contract for adapters.                                                              |
| `src/app/api/agenthub/sessions/stream/route.js`      | Modified | Surface feed updates without inventing a second truth source.                                                     |
| `devhub-mcp/server.js` + MCP tool modules/tests/docs | Modified | Remove swarm agent/workspace/run lifecycle tools from public MCP contract and keep project-management scope only. |
| `devhub-cli/*`                                       | Modified | Keep/expand CLI ownership for swarm/agent/workspace orchestration where needed.                                   |

## Risks

| Risk                                                     | Likelihood | Mitigation                                                                |
| -------------------------------------------------------- | ---------- | ------------------------------------------------------------------------- |
| Event semantics split across tables                      | Med        | Define precedence and canonical mapping once in shared helpers.           |
| Feed drifts from persisted truth                         | Med        | Derive projection only from durable rows; add watermark/order tests.      |
| Adapter-specific logic leaks into backend                | Low        | Keep adapter contract read-only and backend-owned.                        |
| Hidden consumers still depend on current MCP swarm tools | Med        | Lock exact removal list in spec and update tests/docs/contracts together. |

## Rollback Plan

Remove the director-feed projection/API surface and fall back to current raw event/trace visibility. Keep canonical event persistence intact so no destructive data rollback is needed.

## Dependencies

- Existing durable stores: `agent_events`, `mission_messages`, `message_deliveries`, `agent_traces`, `agent_hub_sessions`.
- Clear canonical mapping for `task_completed` and `handoff_ready`.
- Current MCP tool catalog must be reviewed to identify the exact swarm/agent/workspace/run lifecycle tools to remove from the supported surface.

## Success Criteria

- [ ] Director sees durable completion/handoff feed items even when worker delivery binding is missing.
- [ ] OpenCode, Codex, CloudCode, and Gemini CLI can consume the same backend contract.
- [ ] Feed ordering/freshness comes from persisted state and is test-covered.
- [ ] Supported MCP surface no longer exposes swarm agent/workspace/run lifecycle tools; those flows are CLI/runtime-owned.
