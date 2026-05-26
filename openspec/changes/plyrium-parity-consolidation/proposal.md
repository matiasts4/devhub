# Proposal: Plyrium Parity Consolidation

## Intent

Remove unused Telegram MCP surface and stop stale docs from advertising parity gaps and contracts that no longer match DevHub. This change defines one authoritative parity baseline: current MCP/CLI contract is real, remaining larger Plyrium-inspired gaps are explicitly deferred.

## Scope

### In Scope

- Remove Telegram MCP tools from the public MCP contract, catalog tests, and contract-facing docs.
- Align MCP/CLI/Plyrium docs with the actual shipped surface.
- Publish one explicit parity baseline that marks deferred gaps instead of implying they are current missing work.

### Out of Scope

- Retrieval/indexing CLI parity.
- Physical DB split by concern.
- Explicit worktree manifest.
- Larger orchestration/runtime redesign.

## Capabilities

### New Capabilities

- `plyrium-parity-baseline`: Defines the authoritative parity matrix and deferred-gap policy for Plyrium comparison docs and roadmap docs.

### Modified Capabilities

- `mcp-public-contract`: Remove Telegram tools from the public MCP contract and update contract counts, docs, and tests.
- `cli-documentation`: Reconcile CLI documentation with the actual current command surface and parity narrative.

## Approach

Apply in strict order: (1) remove Telegram MCP contract surface and catalog references, (2) update MCP README/tests/specs to match the real contract, (3) rewrite Plyrium comparison and roadmap docs so deferred items stay deferred. Keep Telegram runtime and DB code untouched.

## Affected Areas

| Area                                                                                                                        | Impact            | Description                                                     |
| --------------------------------------------------------------------------------------------------------------------------- | ----------------- | --------------------------------------------------------------- |
| `devhub-mcp/server.js`                                                                                                      | Modified          | Remove Telegram MCP registration from the public parity surface |
| `devhub-mcp/tools/telegram.js`                                                                                              | Removed/Relocated | Drop unused MCP Telegram tool module                            |
| `devhub-mcp/README.md`                                                                                                      | Modified          | Publish real MCP contract and tool counts                       |
| `devhub-mcp/tests/integration/tools-list.test.js`                                                                           | Modified          | Lock official catalog to non-Telegram surface                   |
| `devhub-mcp/tests/integration/telegram-external-adapter.test.js`                                                            | Removed/Relocated | Stop treating Telegram adapter as MCP contract                  |
| `docs/Plyrium/*.md`, `docs/31_MCP_Decomposition_Plan.md`, `docs/33_CLI_Enhancement_Plan.md`, `docs/34_Execution_Roadmap.md` | Modified          | Consolidate parity baseline and deferrals                       |
| `openspec/specs/mcp-public-contract/spec.md`, `openspec/specs/cli-documentation/spec.md`                                    | Modified          | Reflect new contract and documentation expectations             |

## Risks

| Risk                                             | Likelihood | Mitigation                                                  |
| ------------------------------------------------ | ---------- | ----------------------------------------------------------- |
| Hidden consumer still expects Telegram MCP tools | Med        | Search callers/docs/tests first; keep rollback simple       |
| Docs drift again after tool removal              | Med        | Update catalog test, README, and parity docs in same change |
| Scope expands into backlog redesign              | High       | Keep explicit out-of-scope list in specs/tasks              |

## Rollback Plan

Revert the implementation commit(s) restoring Telegram MCP registration, docs, and tests. Do not touch Telegram runtime or DB code in this change, so rollback stays code-and-doc only.

## Dependencies

- Existing exploration artifact for `plyrium-parity-consolidation`
- Existing specs: `mcp-public-contract`, `cli-documentation`

## Success Criteria

- [ ] MCP public contract, README, and tool-catalog tests no longer include Telegram tools.
- [ ] Plyrium, MCP, and CLI docs describe the same current contract and the same deferred gaps.
- [ ] Retrieval/indexing CLI parity, physical DB split, worktree manifest, and orchestration redesign are explicitly deferred.
