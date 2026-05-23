# Proposal: Reduce MCP Server to CRUD + Portable Contracts

## Intent

CLI-2 through CLI-9 now cover the hot-path swarm operations (status, queue, agents, swarm, task, ws, heartbeat, update-status, claim, release, tell). The MCP server (`devhub-mcp/server.js`) has ~45 tools, many duplicating CLI functionality. This change clarifies the public contract: MCP focuses on CRUD (projects, tasks, milestones) and portable execution contracts (queue, claim/release, approvals, team_tell, Telegram, agent workspaces/runs/artifacts). CLI-duplicated read-only tools are marked deprecated — not removed — so existing MCP clients don't break.

## Scope

### In Scope
- Mark 6 MCP tools as `@deprecated` in descriptions: `get_dashboard`, `register_agent`, `heartbeat_agent`, `unregister_agent`, `update_agent_status`, `get_next_task`
- Update `devhub-mcp/README.md` with clear public contract: what MCP owns vs what CLI owns
- Add deprecation warnings to tool descriptions pointing to CLI equivalents
- Document the portable client contract (queue, claim/release, approvals)
- No tool removal — only documentation and deprecation markers

### Out of Scope
- Removing any tool from the server (deferred to future cleanup)
- Changing tool signatures or behavior
- CLI command changes (already done in CLI-2 through CLI-9)
- Database schema changes

## Capabilities

> This section is the CONTRACT between proposal and specs phases.

### New Capabilities
- `mcp-public-contract`: Documents the official MCP tool surface, deprecation policy, and CLI vs MCP ownership boundary

### Modified Capabilities
- None — existing CRUD capabilities remain unchanged; only descriptions are annotated

## Approach

1. Add `@deprecated` prefix to tool descriptions for CLI-duplicated tools
2. Update `devhub-mcp/README.md` with ownership matrix (MCP vs CLI)
3. Create `openspec/specs/mcp-public-contract/spec.md` documenting the contract
4. Keep all 45 tools functional — deprecation is advisory, not breaking

**Deprecation mapping:**

| MCP Tool | CLI Equivalent | Action |
|----------|---------------|--------|
| `get_dashboard` | `devhub status` | `@deprecated` |
| `register_agent` | `devhub agents register` (future) | `@deprecated` |
| `heartbeat_agent` | `devhub heartbeat` | `@deprecated` |
| `unregister_agent` | CLI (future) | `@deprecated` |
| `update_agent_status` | `devhub update-status` | `@deprecated` |
| `get_next_task` | `devhub claim` | `@deprecated` |

**MCP keeps (no changes):**
- Projects CRUD: `list_projects`, `get_project`, `create_project`, `update_project`, `delete_project`
- Tasks CRUD: `list_tasks`, `create_task`, `bulk_create_tasks`, `update_task`, `add_task_comment`
- Milestones CRUD: `list_milestones`, `create_milestone`, `bulk_create_milestones`, `update_milestone`
- Execution queue: `get_execution_queue` (portable clients)
- Claim/release: `claim_next_task`, `renew_task_lease`, `release_task` (portable clients)
- Approvals: `request_supervisor_approval`
- Team: `team_tell`
- Telegram: all 5 telegram tools (external integration)
- Agent workspaces: all 6 workspace tools (control plane)
- Agent runs: all 4 run tools (durable tracking)
- Agent artifacts: `append_agent_artifact`, `list_agent_artifacts`
- Evidence: `get_workspace_evidence`
- Planning: `get_project_context`

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `devhub-mcp/server.js` | Modified | Add `@deprecated` prefix to 6 tool descriptions |
| `devhub-mcp/README.md` | Modified | Add ownership matrix, deprecation policy, CLI vs MCP guide |
| `openspec/specs/mcp-public-contract/spec.md` | New | Document official MCP tool surface |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Existing MCP clients break | Low | No tools removed, only descriptions changed |
| Deprecation markers missed by clients | Medium | Clear README documentation, `@deprecated` prefix is standard |
| Scope creep into tool removal | Medium | Explicitly out of scope; enforce in review |

## Rollback Plan

Revert the 6 tool description changes and README update via `git revert`. No data migration or schema changes involved. All tools remain functional throughout.

## Dependencies

- CLI-2 through CLI-9 (completed — CLI commands exist)
- No database or infrastructure changes required

## Success Criteria

- [ ] 6 tools marked with `@deprecated` in descriptions
- [ ] README updated with MCP vs CLI ownership matrix
- [ ] `mcp-public-contract` spec created in openspec/specs/
- [ ] All 45 tools still functional (no behavioral changes)
- [ ] No breaking changes for existing MCP clients
