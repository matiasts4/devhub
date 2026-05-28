## Exploration: swarm-director-durable-feed MCP boundary

### Current State

`devhub-mcp/server.js` is already decomposed at registration level: it only composes tool modules and injects shared deps. The real surface is split across `tools/projects.js`, `tools/tasks.js`, `tools/workspaces.js`, `tools/agents.js`, and `tools/inbox.js`.

But boundary-wise it is not fully decomposed. Public MCP still exposes swarm/runtime ownership through workspace, run, lease, approval, artifact, and messaging tools. `team_tell` is thin MCP glue over `src/lib/swarm/teamTell.js`, which is mission-scoped and transport-aware.

### Affected Areas

- `devhub-mcp/server.js` — composition only; still injects swarm/runtime deps.
- `devhub-mcp/tools/workspaces.js` — workspace/run/artifact lifecycle tools live here now.
- `devhub-mcp/tools/tasks.js` — claim/release/renew/approval runtime ownership lives here.
- `devhub-mcp/tools/agents.js` — public `team_tell` wrapper lives here.
- `src/lib/swarm/teamTell.js` — real durable messaging logic and transport binding.
- `devhub-mcp/tests/integration/tools-list.test.js` — still snapshots the old 36-tool public contract.
- `openspec/changes/swarm-director-durable-feed/specs/mcp-public-contract/spec.md` — current change boundary already calls for removing lifecycle mutations.

### Approaches

1. **Keep current MCP surface, only document decomposition** — treat module split as sufficient.
   - Pros: smallest immediate change.
   - Cons: boundary still leaks runtime ownership; docs/tests remain misleading.
   - Effort: Low

2. **Trim public MCP to project/control-plane only** — remove swarm/runtime mutations from public contract and keep runtime logic in CLI/libs.
   - Pros: matches current change intent; aligns code, tests, and contract.
   - Cons: breaks consumers relying on MCP lifecycle tools.
   - Effort: Medium

### Recommendation

Use approach 2. The code already has module decomposition; the remaining problem is contract ownership. For this change, `team_tell` should move out with the other swarm/runtime concerns, and the public MCP catalog should stop advertising lifecycle/runtime mutations.

### Risks

- Hidden clients may still call removed MCP tools.
- README/test catalog will drift if not updated in the same slice.
- `team_tell` is the borderline case; if kept public, the boundary remains blurry.

### Ready for Proposal

Yes — narrow enough to finalize proposal/tasks around public MCP contract pruning and catalog/test alignment.
