# Exploration: MCP Control Center con doctor/list-tools/smoke

### Current State

The current MCP surface is split between three realities: the DevHub MCP server exposes operational control-plane tools in `devhub-mcp/server.js`; the AgentHub UI shows a cached/inferred MCP status panel; and the health route consumes that same inferred status. The MCP status route currently probes `http://127.0.0.1:${OPENCODE_PORT}/mcp`, but falls back to a hardcoded configured-server list when OpenCode does not expose live MCP metadata.

This means the existing UI is useful for visibility, but not yet a verifiable control center. It shows server names and tools, but not a real doctor/list-tools/smoke contract grounded in a durable source of truth.

### Affected Areas

- `src/app/api/agenthub/mcp/status/route.js` — current status source; needs the verifiable MCP control-center contract.
- `src/components/chat/MCPStatusPanel.jsx` — UI surface that will render doctor/list-tools/smoke results.
- `src/app/api/agenthub/operations/health/route.js` — consumes MCP status and will inherit any contract change.
- `devhub-mcp/server.js` — canonical control-plane tool catalog and runtime visibility boundary.
- `docs/04_Protocolo_MCP_y_Agentes.md` — authoritative boundary: DevHub MCP is control plane, not Git/filesystem/terminal.
- `docs/user/05_AgentHub.md` — user-facing MCP panel docs currently describe status and refresh only.
- `docs/23_Swarm_Workspace_Intencion_y_Roadmap.md` — frames SW-7 as the MCP control-center milestone.

### Approaches

1. **Status-only panel with richer metadata** — keep the current inferred status route and add doctor/list-tools/smoke as UI affordances over cached data.
   - Pros: smallest change, low risk.
   - Cons: still not verifiable; would keep UI and truth loosely coupled.
   - Effort: Medium

2. **Verifiable MCP control center over live probes** — add a dedicated diagnostic contract that separately reports environment/path visibility, Node/runtime visibility, permissions, DB/connectivity, discovered tools, and smoke-test outcomes.
   - Pros: matches SW-7.1 intent; makes the surface observable and auditable.
   - Cons: needs explicit probe boundaries and careful fallback/degraded states.
   - Effort: High

3. **Split canonical control plane from diagnostics UI** — keep DevHub MCP as the source of operational truth, and make MCP Control Center a diagnostic overlay that consumes frozen evidence plus live probes only for verification.
   - Pros: preserves the “no parallel truth” rule; best fit for frozen SW-3.1 evidence and safe verification.
   - Cons: requires clear contract seams and may need extra state normalization.
   - Effort: High

### Recommendation

Use **Approach 3**. MCP Control Center should be an observability/verification surface that consumes frozen DevHub evidence and live diagnostic probes, not a new source of truth. The contract should explicitly separate: discovered tools, environment visibility, permission state, DB/connectivity checks, and smoke results. Anything unavailable should be reported as degraded rather than inferred as healthy.

### Risks

- OpenCode may not expose a live MCP inventory API, so doctor/list-tools must tolerate inferred or degraded reads.
- If UI health continues to read placeholders as truth, the control center will drift from reality.
- Extending diagnostics into Git/filesystem control-plane verbs would violate the frozen boundary and reintroduce unsafe surface area.

### Ready for Proposal

Yes — the boundary is clear enough to draft a proposal/spec for a verifiable MCP Control Center with explicit degraded states and smoke semantics.
