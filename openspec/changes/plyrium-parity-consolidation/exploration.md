## Exploration: plyrium-parity-consolidation

### Current State

DevHub is already much closer to Plyrium than the old plans suggest. The core swarm/runtime surface exists: worktrees, presence, supervisor, mission messaging, approvals, and team_tell are real. The main mismatch is now boundary clarity, not base runtime parity.

Telegram MCP tools are conditional, integration-specific, and not part of the real Plyrium parity target. Current evidence says they should be removed from the MCP contract rather than treated as parity surface. The docs also overstate several remaining gaps, while underplaying how much CLI/runtime parity already exists.

### Affected Areas

- `devhub-mcp/server.js` — tool registration boundary; Telegram load path must be removed or isolated out of MCP parity.
- `devhub-mcp/tools/telegram.js` — unused MCP integration surface targeted for removal from parity scope.
- `devhub-mcp/tests/integration/tools-list.test.js` — official tool catalog must reflect the final MCP contract.
- `devhub-mcp/tests/integration/telegram-external-adapter.test.js` — likely becomes obsolete or must move out of MCP contract tests.
- `docs/Plyrium/documentos.md` — parity inventory needs reality-first consolidation.
- `docs/Plyrium/comparacion_devhub.md` — current matrix should stop counting Telegram as parity and highlight remaining real gaps.
- `docs/31_MCP_Decomposition_Plan.md`, `docs/33_CLI_Enhancement_Plan.md`, `docs/34_Execution_Roadmap.md` — planning docs still encode old scope assumptions.

### Approaches

1. **Telegram MCP removal + doc/contract reconciliation only** — remove Telegram from the MCP parity contract, update tool catalog/tests/docs, and leave runtime Telegram integration intact.
   - Pros: smallest safe slice; directly resolves the user’s explicit request; removes dead/unused surface.
   - Cons: does not add any new Plyrium-like capability.
   - Effort: Low

2. **Boundary cleanup + operator parity backlog framing** — remove Telegram MCP surface, then rewrite the parity docs so the remaining high-value work is explicitly framed as operator/team/worktree introspection, with retrieval/DB split deferred.
   - Pros: one coherent SDD; keeps the remaining parity work logical and end-to-end; prevents scope drift into low-value areas.
   - Cons: still mostly consolidation, not feature delivery.
   - Effort: Medium

### Recommendation

Use **Approach 2**. Make the single SDD a parity-boundary consolidation: remove Telegram from MCP parity entirely, keep Telegram runtime/data model out of scope, and rewrite the docs to say the remaining real gap is operator/team/worktree introspection rather than base swarm/runtime parity. Internal order should be:

1. Telegram removal first.
2. MCP tool catalog + tests + docs sync.
3. Reconcile Plyrium comparison docs and roadmap docs to current reality.
4. Defer new feature work to a separate backlog.

### Risks

- Hidden consumers may still reference Telegram MCP tools.
- Tool-catalog tests and docs can drift if Telegram is removed without a final contract pass.
- Scope can easily explode into retrieval/indexing CLI, physical DB split, or worktree manifest work; keep those explicitly deferred.

### Ready for Proposal

Yes — but only if the proposal stays narrow: Telegram MCP removal, contract/test/doc reconciliation, and a clear backlog for the remaining operator-parity gaps. No retrieval/DB redesign in this change.
