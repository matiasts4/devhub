# Proposal: CLI Swarm Command

## Intent

Operators need a single composite view of the entire swarm — projects, queue, agents, and milestones — without running `devhub status`, `devhub queue`, and `devhub agents` separately. Consolidates three commands into one overview surface.

## Scope

### In Scope
- New `devhub swarm` command handler in `commands/swarm.js`
- Composite output: Projects summary, Queue summary, Agent summary, Upcoming milestones
- `--compact` flag for shortened version (under 30 lines)
- Registration in `cli.js` command router
- Unit tests in `commands/swarm.test.js`

### Out of Scope
- New database queries — reuses existing `readExecutionQueueSummary`, `readAgentRegistrySummary`, project/milestone queries from `lib/db.js`
- Changes to existing `status`, `queue`, or `agents` commands
- Web UI or Telegram integration
- Real-time streaming or WebSocket updates

## Capabilities

### New Capabilities
- `cli-swarm-command`: Composite swarm overview command with `--compact` flag, direct SQLite reads, TTY-aware output via `lib/format.js`

### Modified Capabilities
- `cli-entrypoint`: Add `swarm` to registered commands in `cli.js`, remove from stub list

## Approach

Compose existing durable read functions into a single handler:
1. `readProjectSummary()` — project count + top projects
2. `readExecutionQueueSummary()` — queue counts by status
3. `readAgentRegistrySummary()` — agent list with heartbeat
4. Milestone query — upcoming 5 milestones

Each section rendered via `lib/format.js` helpers (`section()`, `row()`, `divider()`, `table()`). `--compact` mode collapses sections to single-line summaries.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `devhub-cli/commands/swarm.js` | New | Composite swarm handler |
| `devhub-cli/commands/swarm.test.js` | New | Unit tests |
| `devhub-cli/cli.js` | Modified | Register `swarm` command |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Output exceeds terminal height with large datasets | Medium | `--compact` flag + section limits (5 items each) |
| SQLite read contention with concurrent commands | Low | Read-only queries, no locks |
| Code duplication from status command | Low | Extract shared section renderers if overlap grows |

## Rollback Plan

Remove `swarm` from `cli.js` command map, delete `commands/swarm.js` and `commands/swarm.test.js`. No database schema changes — zero migration risk.

## Dependencies

- CLI-1 through CLI-4 complete (scaffold, status, queue, agents commands)
- `lib/db.js` barrel exports all required read functions
- `lib/format.js` TTY helpers available

## Success Criteria

- [ ] `devhub swarm` exits 0 with all four sections visible
- [ ] `devhub swarm --compact` outputs under 30 lines
- [ ] Non-TTY mode produces plain text with no ANSI codes
- [ ] Empty database shows appropriate empty-state messages per section
- [ ] All unit tests pass via Jest
