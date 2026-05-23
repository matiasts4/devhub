# Proposal: CLI `queue` command — execution queue with priority ordering

## Intent

Add `devhub queue` command so operators can see the prioritized execution queue without opening the UI. Shows pending tasks ordered by priority score, blocked status with dependency reasons, and lease/claim info for claimed tasks.

## Scope

### In Scope
- `commands/queue.js` — command handler with `--limit`, `--project`, `--blocked` flags
- `commands/queue.test.js` — unit tests for flags, output format, empty data
- `cli.js` — replace `queue` stub with real command registration
- `lib/format.js` — add `table(headers, rows)` helper for tabular queue output

### Out of Scope
- Interactive/paginated output
- Real-time refresh or watch mode
- Write operations (claim, release, renew lease)
- MCP or HTTP calls — direct SQLite only

## Capabilities

### New Capabilities
- `cli-queue-command`: Execution queue command with priority ordering, blocked filtering, lease display, and TTY-aware tabular output.

### Modified Capabilities
- None

## Approach

- `commands/queue.js` imports `getDb` and `readExecutionQueueSummary` via `lib/db.js`
- When `--project <id>` is provided: call `readExecutionQueueSummary(db, { projectId, limit, includeBlocked })` directly
- When no `--project` flag: query all active projects, call `readExecutionQueueSummary` per project, merge and re-sort by priority score
- `--blocked` flag maps to `includeBlocked: true` in the shared core call
- `--limit N` (default 20) passed through to shared core; when merging across projects, apply limit after merge
- Output uses new `table()` helper in `lib/format.js` for aligned columns; falls back to compact rows in non-TTY
- Columns: priority score, status (pending/blocked), task title, project name, blocked reason (if blocked), lease expiry (if claimed)

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `devhub-cli/commands/queue.js` | New | Queue command handler |
| `devhub-cli/commands/queue.test.js` | New | Unit tests for queue command |
| `devhub-cli/cli.js` | Modified | Replace queue stub with real registration |
| `devhub-cli/lib/format.js` | Modified | Add `table()` helper for tabular output |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Cross-project merge produces duplicate task IDs | Low | Deduplicate by task ID after merge |
| `readExecutionQueueSummary` per-project N+1 with many projects | Med | Limit to active projects only; cap at 10 projects when no filter |
| Table output misaligned with long task titles | Med | Truncate title to 40 chars with ellipsis; full title on hover/detail line |
| Lease expiry display in wrong timezone | Low | Display as-is from DB (ISO 8601); add relative time (e.g., "in 2h") |

## Rollback Plan

Revert `cli.js` to stub-only queue command, delete `commands/queue.js` and its test, remove `table()` from `format.js`. No database or shared core changes — pure CLI addition.

## Dependencies

- `cli-1-scaffold-entrypoint` (archived) — CLI scaffold, `lib/db.js`, `lib/format.js`
- `cli-2-status-command` (archived) — pattern reference for command structure
- `src/lib/db/compactReads.js` — `readExecutionQueueSummary` function

## Success Criteria

- [ ] `devhub queue` exits 0 showing prioritized task list
- [ ] `devhub queue --project <id>` filters to single project
- [ ] `devhub queue --blocked` shows only blocked tasks with dependency reason
- [ ] `devhub queue --limit 5` respects limit
- [ ] Piped output is plain text, no ANSI codes
- [ ] All unit tests pass (`cd devhub-cli && npm test`)
