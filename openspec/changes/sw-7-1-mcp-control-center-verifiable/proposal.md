# Proposal: SW-7.1 MCP Control Center Verifiable

## Intent

SW-7.1 starts now because SW-6.1 already bounded external channels, so the next gap is MCP observability inside DevHub itself. The change must verify MCP reality from frozen SW-3.1 evidence and SW-4.1 supervisor states without creating a second control plane.

## Scope

### In Scope

- Define a verifiable MCP Control Center contract for `doctor`, `list-tools`, and `smoke`.
- Define visibility checks for environment/path, Node/runtime, permissions, DB/connectivity, and degraded inventory states.
- Define safe UI/API read models that consume durable DevHub truth plus bounded live probes.

### Out of Scope

- No Git/worktree/branch/merge/filesystem verbs as general MCP control-plane actions.
- No new durable truth outside DevHub task/workspace/run/artifact contracts; `devhub_agent_runs` stays runtime-local.

## Capabilities

### New Capabilities

- `mcp-control-center`: verified MCP doctor/list-tools/smoke contract for UI and operators.

### Modified Capabilities

- `swarm-observability`: add diagnostic read model tied to durable supervisor/evidence state and explicit degraded statuses.

## Approach

Treat MCP Control Center as a diagnostic overlay. `doctor` reports probe classes and why a check is healthy/degraded/unavailable; `list-tools` reports discovered tools with source authority (`live`, `durable`, `configured`); `smoke` verifies only safe read/visibility paths. If live MCP inventory is absent, the contract MUST surface degraded evidence instead of inferred health. GTK/VTE remains optional attach surface only.

## Affected Areas

| Area                                              | Impact   | Description                              |
| ------------------------------------------------- | -------- | ---------------------------------------- |
| `openspec/specs/mcp-control-center/spec.md`       | New      | New control-center capability            |
| `openspec/specs/swarm-observability/spec.md`      | Modified | Shared durable/degraded snapshot rules   |
| `src/app/api/agenthub/mcp/status/route.js`        | Modified | Future doctor/list-tools source contract |
| `src/components/chat/MCPStatusPanel.jsx`          | Modified | Future UI rendering for verified results |
| `src/app/api/agenthub/operations/health/route.js` | Modified | Future health-source consumption         |

## Risks

| Risk                                  | Likelihood | Mitigation                                               |
| ------------------------------------- | ---------- | -------------------------------------------------------- |
| UI treats inferred inventory as truth | High       | Require authority/degraded fields in contract            |
| Diagnostics leak unsafe control verbs | Med        | Freeze non-goals and allow only read/smoke checks        |
| Live inventory missing in OpenCode    | High       | Design durable fallback with explicit unavailable states |

## Rollback Plan

Keep existing MCP panel as informational-only status view and reject the new contract if specs cannot preserve DevHub as sole durable authority.

## Dependencies

- Frozen checkpoints: SW-2.1, SW-2.2, SW-3.1, SW-4.1, SW-6.1, safe baseline `f814998dd05cb491caf8637bf570dbd74b539090`
- Exploration artifact: `sdd/sw-7-1-mcp-control-center-verifiable/explore`

## Success Criteria

- [ ] Proposal defines doctor/list-tools/smoke with authority, degraded, and non-goal boundaries.
- [ ] Proposal explains dependency on SW-3.1 evidence and SW-4.1 supervisor states.
- [ ] Proposal keeps DevHub as durable control plane and limits smoke checks to safe observability paths.
