# Tasks: CLI `devhub queue` command — execution queue display

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 250–380 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | `table()` helper + queue command + registration + tests | PR 1 | Single PR; all files self-contained |

## Phase 1: Foundation — `table()` helper in `lib/format.js`

- [x] 1.1 Add `table(headers, rows)` function to `devhub-cli/lib/format.js`: compute max column widths, render aligned columns with header separator in TTY mode, pipe-separated rows in non-TTY mode.
- [x] 1.2 Export `table` in `module.exports` of `lib/format.js`.

## Phase 2: Core Implementation — `commands/queue.js`

- [x] 2.1 Create `devhub-cli/commands/queue.js` with `queueCommand(opts)` signature accepting `{ limit, project, blocked }`.
- [x] 2.2 Implement flag parsing: default `limit=20`, optional `project` (UUID string), optional `blocked` (boolean).
- [x] 2.3 Implement single-project query path: when `--project` given, call `readExecutionQueueSummary(db, { projectId, limit, includeBlocked: blocked })` from `lib/db.js`.
- [x] 2.4 Implement cross-project merge path: when no `--project`, `SELECT id, name FROM projects WHERE status='active' ORDER BY updated_at DESC LIMIT 10`, call `readExecutionQueueSummary` per project, deduplicate by `task.id`, sort by `priority_score DESC`, `slice(0, limit)`.
- [x] 2.5 Implement TTY-aware output: if `isTTY`, use `table()` with headers `['Score', 'Status', 'Title', 'Project', 'Blocked', 'Lease']`; else output pipe-separated rows without header.
- [x] 2.6 Handle empty result: output `"No tasks in queue\n"` and `process.exit(0)`.
- [x] 2.7 Handle `--limit 0`: output `"No tasks in queue\n"` and `process.exit(0)`.
- [x] 2.8 Truncate titles >40 chars with `"..."` in table cells; show full title on detail line below row.
- [x] 2.9 Format `lease_expires_at` as ISO 8601 with relative time indicator (e.g., `"in 2h"`) when present.

## Phase 3: Registration — wire into `cli.js`

- [x] 3.1 Remove `'queue'` from `STUB_COMMANDS` array in `devhub-cli/cli.js`.
- [x] 3.2 Add `const queueCommand = require('./commands/queue.js');` and register `program.command('queue').description('Show prioritized execution queue').option('--limit <n>', ...).option('--project <id>', ...).option('--blocked', ...).action(queueCommand);`.

## Phase 4: Testing — strict TDD RED→GREEN

- [x] 4.1 Create `devhub-cli/commands/queue.test.js` with Jest test suite.
- [x] 4.2 RED: Write failing test — `devhub queue` exits 0 and outputs `"No tasks in queue"` on empty DB.
- [x] 4.3 GREEN: Implement empty-queue handler in `queue.js` to pass test.
- [x] 4.4 RED: Write failing test — `--limit 5` shows exactly 5 rows when DB has 10+ tasks.
- [x] 4.5 GREEN: Implement limit slicing to pass test.
- [x] 4.6 RED: Write failing test — `--project <id>` filters to single project only.
- [x] 4.7 GREEN: Implement single-project query path to pass test.
- [x] 4.8 RED: Write failing test — `--blocked` shows only blocked tasks with reason.
- [x] 4.9 GREEN: Implement blocked filter to pass test.
- [x] 4.10 RED: Write failing test — non-TTY output contains no ANSI escape sequences.
- [x] 4.11 GREEN: Ensure `table()` non-TTY branch outputs plain pipe-separated rows.
- [x] 4.12 RED: Write failing test — cross-project merge deduplicates and sorts by priority score DESC.
- [x] 4.13 GREEN: Implement cross-project merge logic to pass test.
- [x] 4.14 Run full suite: `(cd devhub-cli && npm test)` — all tests pass.
