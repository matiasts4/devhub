# Proposal: CLI `status` command — compact swarm dashboard

## Intent

Implement the first real CLI command (`devhub status`) so the CLI moves from scaffold to functional tool. Provides a compact TTY dashboard showing projects, tasks, milestones, and swarm state — all via direct SQLite reads (no MCP bounce).

## Scope

### In Scope
- `commands/status.js` — command handler: reads SQLite, formats output
- `cli.js` — replace `status` stub with real command registration
- `lib/db.js` — extend barrel to also re-export `getDb` from `core.js`
- `lib/format.js` — extend with `section()`, `row()`, `divider()` helpers
- `commands/status.test.js` — exit 0, output sections, non-TTY mode
- Output under 40 lines in TTY mode

### Out of Scope
- Other commands (`queue`, `agents`, `swarm`, `task`, `ws`, `run`)
- MCP server or route changes
- Interactive/paginated output
- Real-time refresh or watch mode

## Capabilities

### New Capabilities
- `cli-status-command`: Compact dashboard command reading SQLite directly, with TTY-aware formatting and unit tests.

### Modified Capabilities
- `cli-entrypoint`: Extend `lib/db.js` barrel to also re-export `getDb` from `core.js` (needed by status command for direct queries).

## Approach

- `commands/status.js` imports `getDb` via `lib/db.js` and runs four compact queries:
  1. `projects` — `COUNT(*)` + top 5 by `progress DESC`
  2. `tasks` — `COUNT(*) GROUP BY status`
  3. `milestones` — upcoming (not completed), ordered by `due_date ASC`, limit 5
  4. `agent_workspaces` — active count (`status IN ('active','running')`) + claimed tasks (`current_task_id IS NOT NULL`)
- Output uses `lib/format.js` helpers: `section()`, `row()`, `divider()`, `colorize()`
- TTY mode: colored headers, compact layout. Non-TTY: plain text, pipe-safe
- No MCP bounce — direct SQLite via `better-sqlite3` singleton

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `devhub-cli/commands/status.js` | New | Status command handler |
| `devhub-cli/cli.js` | Modified | Replace status stub with real registration |
| `devhub-cli/lib/db.js` | Modified | Add `getDb` re-export from `core.js` |
| `devhub-cli/lib/format.js` | Modified | Add section/row/divider helpers |
| `devhub-cli/commands/status.test.js` | New | Unit tests for status command |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `getDb` singleton path resolution breaks in worktrees | Low | Already solved in CLI-1 via `path.resolve(__dirname)` |
| Output exceeds 40 lines with large datasets | Med | Hard LIMIT 5 on projects/milestones; aggregate counts for tasks |
| better-sqlite3 not available in CLI scope | Low | Already a root dependency; CLI inherits via node_modules resolution |
| Scope creep into other commands | Med | Strict single-command scope; other stubs remain |

## Rollback Plan

Revert `cli.js` to stub-only status command, delete `commands/status.js` and its test. No database schema changes, so rollback is purely code-level.

## Dependencies

- `cli-1-scaffold-entrypoint` (archived) — CLI scaffold must exist
- `better-sqlite3` — already in root project dependencies
- `src/lib/db/core.js` — `getDb()` singleton

## Success Criteria

- [ ] `devhub status` exits 0 with four sections: Projects, Tasks, Milestones, Swarm
- [ ] Output is under 40 lines in TTY mode
- [ ] Piped output (`devhub status | cat`) is plain text, no ANSI codes
- [ ] `devhub status` works with empty database (zero projects/tasks)
- [ ] All unit tests pass (`cd devhub-cli && npm test`)
