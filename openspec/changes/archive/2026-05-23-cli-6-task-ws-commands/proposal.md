# Proposal: CLI-6 Task and Workspace Detail Commands

## Intent

Replace stub implementations for `devhub task` and `devhub ws` with real commands that show detailed information for a specific task or workspace. Operators need quick terminal lookups without opening the web UI.

## Scope

### In Scope
- `devhub task <ID>` — display task details (title, status, priority, project, assigned agent, due date, description)
- `devhub ws <ID>` — display workspace details (workspace_id, agent_id, status, branch, current task, latest run, latest artifact)
- Register both commands in `cli.js`, remove from `STUB_COMMANDS`
- Unit tests for both commands

### Out of Scope
- `devhub run` command (remains stub)
- Write operations or state mutations
- Filtering, pagination, or list views (covered by existing `status`/`queue`/`agents`)

## Capabilities

### New Capabilities
- `cli-task-command`: single-task detail lookup by ID via direct SQLite.
- `cli-ws-command`: single-workspace detail lookup by ID, including latest run and artifact summary.

### Modified Capabilities
- `cli-entrypoint`: remove `task` and `ws` from stub commands list; register both as implemented commands.

## Approach

Both commands read from SQLite directly via the shared compact durable read core (`lib/db.js`). Each accepts a single positional `<ID>` argument, queries the database, and formats output using `lib/format.js` helpers. TTY mode uses formatted sections; non-TTY produces machine-readable key=value pairs.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `devhub-cli/commands/task.js` | New | Task detail handler |
| `devhub-cli/commands/task.test.js` | New | Task command tests |
| `devhub-cli/commands/ws.js` | New | Workspace detail handler |
| `devhub-cli/commands/ws.test.js` | New | Workspace command tests |
| `devhub-cli/cli.js` | Modified | Register both commands, remove from stubs |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| ID not found — unclear error message | Low | Explicit "not found" message with exit 0 |
| Shared core missing required reader function | Low | Verify `lib/db.js` exports before implementation |
| Output exceeds terminal width on long descriptions | Low | Truncate description with ellipsis, show full on `--verbose` |

## Rollback Plan

Revert the 4 new files and restore `cli.js` stub list. Commands fall back to existing stub behavior ("not yet implemented").

## Dependencies

- SW-14.1A shared compact read core (completed)
- CLI-1 through CLI-5 (completed: scaffold, status, queue, agents, swarm)

## Success Criteria

- [ ] `devhub task <id>` displays task details or "not found" message, exits 0
- [ ] `devhub ws <id>` displays workspace details or "not found" message, exits 0
- [ ] Both commands removed from `STUB_COMMANDS` in `cli.js`
- [ ] All tests pass via `cd devhub-cli && npm test`
- [ ] TTY and non-TTY output modes work correctly for both commands
