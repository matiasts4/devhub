# Proposal: CLI agents command

## Intent

Add `devhub agents` command to show live swarm agent state from SQLite. Operators need a quick terminal view of registered agents, their status, current task, workspace branch, and heartbeat freshness — without opening the web UI.

## Scope

### In Scope
- `commands/agents.js` — command handler with `--status` and `--active` flags
- `commands/agents.test.js` — unit tests for flags, TTY/non-TTY, empty data
- `cli.js` — register `agents` command, remove from stub list
- `lib/db.js` — add `readAgentRegistrySummary()` to compact reads
- Output: compact table via `lib/format.js` `table()` helper

### Out of Scope
- Agent lifecycle mutations (register, unregister, heartbeat)
- Real-time polling or watch mode
- Supabase sync verification
- Detailed agent run history

## Capabilities

### New Capabilities
- `cli-agents-command`: CLI command for listing swarm agents with status filter and active shorthand.

### Modified Capabilities
- `cli-entrypoint`: Remove `agents` from stub commands in `cli.js`.

## Approach

- Query `agent_registry` for agent state (agent_id, status, nombre, modelo_llm, current_task_id, last_heartbeat, error_message).
- LEFT JOIN `agent_workspaces` on agent_id to get branch_name and workspace status (latest active workspace per agent).
- Compute heartbeat age as relative time (e.g. "2m ago", "3h ago", "stale").
- `--status <filter>`: exact match on registry status (idle, working, running, thinking, error, etc.).
- `--active`: shorthand for `--status active,working,running,thinking`.
- TTY output uses `table()` with columns: AGENT, STATUS, TASK, BRANCH, MODEL, HEARTBEAT.
- Non-TTY: pipe-delimited, no headers.
- New `readAgentRegistrySummary(db, { statusFilter, activeOnly })` in `compactReads.js`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `devhub-cli/commands/agents.js` | New | Command handler |
| `devhub-cli/commands/agents.test.js` | New | Unit tests |
| `devhub-cli/cli.js` | Modified | Register agents, remove stub |
| `src/lib/db/compactReads.js` | Modified | Add `readAgentRegistrySummary()` |
| `devhub-cli/lib/db.js` | Modified | Re-export new function |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Multiple active workspaces per agent | Med | Pick most recent by `updated_at DESC LIMIT 1` |
| Heartbeat clock skew | Low | Use `Date.parse()` with fallback to "unknown" |
| Large registry (>100 agents) | Low | Add `--limit` flag, default 50 |

## Rollback Plan

Remove `commands/agents.js`, `commands/agents.test.js`. Revert `cli.js` to stub entry. Remove `readAgentRegistrySummary` from `compactReads.js` and `lib/db.js`. No schema changes to revert.

## Dependencies

- CLI-1 (scaffold), CLI-2 (status pattern), CLI-3 (queue pattern) — complete
- `agent_registry` and `agent_workspaces` tables — already exist

## Success Criteria

- [ ] `devhub agents` shows table of all registered agents
- [ ] `devhub agents --status idle` filters to idle agents only
- [ ] `devhub agents --active` shows agents with active statuses
- [ ] `devhub agents | cat` outputs pipe-delimited, no ANSI codes
- [ ] Empty registry shows "No agents registered"
- [ ] All unit tests pass (`cd devhub-cli && npm test`)
