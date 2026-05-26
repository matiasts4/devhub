# Design: Plyrium Parity Consolidation

## Technical Approach

Deliver one contract-reset change. Remove Telegram helpers from MCP registration and MCP-facing tests/docs, while keeping Telegram runtime/storage code untouched. Then align README, OpenSpec specs, and Plyrium parity docs to one authoritative baseline: the supported MCP contract is the 36 tools registered unconditionally by `devhub-mcp/server.js`; larger Plyrium-inspired gaps stay explicitly deferred.

## Architecture Decisions

| Decision                     | Options                                                                   | Tradeoff                                                                   | Choice / Rationale                                                                                                                                                                                        |
| ---------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Telegram MCP boundary        | Keep conditional MCP tools; remove them from MCP entirely                 | Keeping them preserves an unused surface and keeps docs/tests ambiguous    | Remove MCP registration and delete `devhub-mcp/tools/telegram.js`. Exploration and current tests already show the real supported baseline is the 36 non-Telegram tools.                                   |
| Telegram runtime scope       | Remove DB/runtime Telegram code too; keep runtime/data model intact       | Full removal is broader and risks unrelated integrations/data              | Keep `src/lib/db/telegram.js`, schema, and mappings untouched. This change is contract cleanup, not Telegram integration redesign.                                                                        |
| Documentation reconciliation | Rewrite broad Plyrium architecture docs; update only contract/parity docs | Full rewrite expands scope and mixes roadmap redesign into a narrow change | Update only files that define the current contract/baseline: MCP README, tool-catalog tests, Plyrium parity docs, roadmap docs `31/33/34`, and OpenSpec specs. Treat deeper/runtime redesign as deferred. |

## Data Flow

```text
MCP client ── tools/list ──> devhub-mcp/server.js
                               │
                               ├─ registerProjectTools
                               ├─ registerTaskTools
                               ├─ registerWorkspaceTools
                               ├─ registerAgentTools
                               └─ registerInboxTools

README + tools-list.test.js + OpenSpec specs + docs/Plyrium
            └────────────── assert same 36-tool baseline ──────────────┘

Telegram DB/runtime modules remain available internally, but no longer sit on the MCP public path.
```

## File Changes

| File                                                             | Action | Description                                                                                                                         |
| ---------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `devhub-mcp/server.js`                                           | Modify | Remove Telegram import/registration so `tools/list` never exposes Telegram helpers.                                                 |
| `devhub-mcp/tools/telegram.js`                                   | Delete | Remove unused MCP-only Telegram contract surface.                                                                                   |
| `devhub-mcp/tests/integration/tools-list.test.js`                | Modify | Lock the official catalog to 36 supported tools, including when `TELEGRAM_BOT_TOKEN` is set.                                        |
| `devhub-mcp/tests/integration/telegram-external-adapter.test.js` | Delete | Drop MCP contract coverage for Telegram helpers that are no longer public tools.                                                    |
| `devhub-mcp/README.md`                                           | Modify | Replace stale 45-tool/deprecated/Telegram matrix with the actual supported baseline and deferral notes.                             |
| `docs/Plyrium/documentos.md`                                     | Modify | Mark the 36-tool MCP surface as authoritative and move Telegram/retrieval/DB-split/worktree-manifest items into explicit deferrals. |
| `docs/Plyrium/comparacion_devhub.md`                             | Modify | Reframe parity around the supported baseline and list deferred gaps without implying they are current contract defects.             |
| `docs/31_MCP_Decomposition_Plan.md`                              | Modify | Convert stale “current state” claims into historical context and note Telegram MCP removal is complete, not pending.                |
| `docs/33_CLI_Enhancement_Plan.md`                                | Modify | Reconcile CLI parity narrative with the already-implemented command surface; leave remaining Plyrium-style gaps deferred.           |
| `docs/34_Execution_Roadmap.md`                                   | Modify | Remove completed/stale Telegram and CLI backlog claims; keep only deferred follow-up work.                                          |
| `openspec/specs/mcp-public-contract/spec.md`                     | Modify | Redefine the MCP public contract around the actual 36-tool supported surface.                                                       |
| `openspec/specs/cli-documentation/spec.md`                       | Modify | Require parity docs to reference the real implemented CLI baseline and mark non-implemented Plyrium commands as deferred.           |

## Interfaces / Contracts

- **Supported MCP contract**: exact `tools/list` result from `devhub-mcp/server.js`; expected count is 36 with no Telegram tools, regardless of Telegram env vars.
- **Internal Telegram capability**: Telegram persistence/snapshot helpers remain in `src/lib/db/telegram.js` and schema, but they are not part of the MCP contract.
- **Parity documentation rule**: docs MUST separate “supported baseline now” from “deferred parity work later.”

## Testing Strategy

| Layer       | What to Test                                                                                                                                | Approach                                                                                                                      |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Unit        | No new abstraction unless implementation extracts a shared tool-name helper                                                                 | Prefer no new unit layer; stay narrow.                                                                                        |
| Integration | MCP catalog stays at 36 tools with and without `TELEGRAM_BOT_TOKEN`; Telegram MCP test removed; README/spec updates match the same baseline | Strict TDD: make `tools-list.test.js` fail first, then remove registration/module, then rerun focused Jest integration tests. |
| E2E         | MCP server still boots and advertises the same contract via stdio                                                                           | Run `cd devhub-mcp && npm run mcp:smoke` plus focused `npm test -- --runInBand`.                                              |

## Migration / Rollout

No data migration required. Roll out as one code+docs cleanup. Existing Telegram tables and records remain untouched. Rollback is a simple revert restoring MCP registration, module, and tests.

## Open Questions

- None blocking. Future Telegram support, if needed, should return as a separate integration surface rather than re-entering the MCP public contract.
