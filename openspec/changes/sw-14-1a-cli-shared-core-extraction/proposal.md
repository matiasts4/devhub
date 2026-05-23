# Proposal: SW-14.1A Shared core extraction for compact CLI durable reads

## Intent

Extract the first Fase 14 dependency slice: a shared read-side core for compact durable swarm state. This change does **not** implement the CLI; it prepares the readers that future `devhub status`, `queue`, `agents`, `swarm`, `task`, `ws`, and `run` commands will reuse without exposing agent-plumbing through the public MCP.

## Scope

### In Scope

- Extract shared readers/presenters for snapshot, queue/lease state, workspace/run/evidence lookups, and durable summaries now split across `devhub-mcp/server.js` and `src/app/api/agenthub/operations/health/route.js`.
- Define the split: public MCP keeps portable durable contracts (`projects`, `tasks`, `milestones`, `comments`, bounded queue/lease primitives, bounded evidence reads); runtime plumbing moves behind internal modules.
- Add compatibility adapters so current MCP and health-route consumers reuse the same core.

### Out of Scope

- Implementing CLI commands or final output UX for `status`, `queue`, `agents`, `swarm`, `task`, `ws`, or `run`.
- Pruning public MCP tools, rewriting runtime/session orchestration, or removing `agent_registry`.
- New durable schema, launch-flow redesign, or broader Fase 14 work.

## Capabilities

### New Capabilities

- `cli-shared-core`: compact durable readers/presenters plus explicit public-MCP vs internal-runtime boundaries.

### Modified Capabilities

- None.

## Approach

Move reusable read composition into shared modules near `src/lib/db/*` and `src/lib/operations/*`, then make `devhub-mcp/server.js` and `health/route.js` act as adapters. Public MCP stays the portable bounded contract; runtime plumbing (`agent_registry` mirrors, high-frequency heartbeats, OpenCode session reconciliation, low-level bindings) is isolated behind internal modules.

## Affected Areas

| Area                                                                                                  | Impact   | Description                     |
| ----------------------------------------------------------------------------------------------------- | -------- | ------------------------------- |
| `devhub-mcp/server.js`                                                                                | Modified | Consume shared read core.       |
| `src/app/api/agenthub/operations/health/route.js`                                                     | Modified | Reuse shared durable readers.   |
| `src/lib/db/workspaces.js`, `src/lib/db/agentRuns.js`, `src/lib/db/swarmMissions.js`                  | Modified | Export compact durable readers. |
| `src/lib/operations/health.js`, `src/lib/operations/contracts.js`, `src/lib/operations/presenters.js` | Modified | Centralize read contracts.      |
| `src/lib/runtime/`                                                                                    | New      | Hold internal runtime adapters. |

## Risks

| Risk                                            | Likelihood | Mitigation                     |
| ----------------------------------------------- | ---------- | ------------------------------ |
| ESM/CJS reuse gets awkward across app and MCP   | Med        | Keep shared core pure.         |
| Runtime plumbing leaks back into public helpers | High       | Enforce explicit boundary.     |
| Slice grows into full CLI build                 | High       | Reject command implementation. |

## Rollback Plan

Revert extracted shared modules and compatibility adapters together, restoring direct read composition in `devhub-mcp/server.js` and `health/route.js`. Public MCP stays unchanged.

## Dependencies

- `docs/swarm-control/SW-8.1E-fase14-cli-mcp-runtime-boundary.md`
- `docs/04_Protocolo_MCP_y_Agentes.md`
- `docs/23_Swarm_Workspace_Intencion_y_Roadmap.md`
- SW-2.1, SW-3.1, and SW-4.1 durable contracts

## Success Criteria

- [ ] One shared compact read core exists for future `status`, `queue`, `agents`, `swarm`, `task`, `ws`, and `run` commands.
- [ ] Public MCP still exposes portable durable contracts while internal runtime plumbing is separated.
- [ ] Existing MCP and health-route read paths reuse the extracted core without schema or behavior drift.
