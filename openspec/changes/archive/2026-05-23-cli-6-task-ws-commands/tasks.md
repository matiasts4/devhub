# Tasks: CLI-6 Task and Workspace Detail Commands

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 250–350 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Full implementation: readTaskById, task.js, ws.js, tests, cli.js wiring | PR 1 | All files; well under 400 lines |

## Phase 1: Foundation — Add `readTaskById` to compactReads.js

- [x] 1.1 Add `readTaskById(dbOrNull, taskId)` to `src/lib/db/compactReads.js` using `resolveDb` pattern; SELECT * FROM tasks WHERE id = ? LIMIT 1
- [x] 1.2 Export `readTaskById` in `src/lib/db/compactReads.js` module.exports
- [x] 1.3 Re-export `readTaskById` from `devhub-cli/lib/db.js` (if re-export layer exists)

## Phase 2: Task Command — `commands/task.js` + TDD tests

- [x] 2.1 RED: Write `commands/task.test.js` — missing ID exits 2 with "ID required" stderr
- [x] 2.2 GREEN: Create `commands/task.js` — validate `process.argv` for ID arg, exit 2 if missing
- [x] 2.3 RED: Write test — task found, TTY output (`FORCE_TTY=1`) shows title/status/priority/project/assigned_to/due_date/description sections, exit 0
- [x] 2.4 GREEN: Implement TTY branch in `task.js` — call `readTaskById`, format with `lib/format.js` helpers (section, row)
- [x] 2.5 RED: Write test — task found, non-TTY output shows `key=value` pairs, no ANSI escapes, exit 0
- [x] 2.6 GREEN: Implement non-TTY branch in `task.js` — pipe-delimited key=value lines
- [x] 2.7 RED: Write test — task not found exits 1 with "Task not found" stderr
- [x] 2.8 GREEN: Add not-found branch in `task.js` — stderr write + process.exit(1)
- [x] 2.9 RED: Write test — long description (>120 chars) truncated with `...` in TTY mode
- [x] 2.10 GREEN: Add truncation logic in `task.js` TTY branch (slice at 120 + "...")
- [x] 2.11 RED: Write test — `--verbose` flag shows full description without truncation
- [x] 2.12 GREEN: Add `--verbose` flag handling in `task.js` to skip truncation

## Phase 3: Workspace Command — `commands/ws.js` + TDD tests

- [x] 3.1 RED: Write `commands/ws.test.js` — missing ID exits 2 with "ID required" stderr
- [x] 3.2 GREEN: Create `commands/ws.js` — validate ID arg, exit 2 if missing
- [x] 3.3 RED: Write test — workspace found, TTY output (`FORCE_TTY=1`) shows workspace_id/agent_id/status/branch/current_task/latest_run/latest_artifact, exit 0
- [x] 3.4 GREEN: Implement TTY branch in `ws.js` — call `readWorkspaceEvidenceSummary`, format with `lib/format.js` helpers
- [x] 3.5 RED: Write test — workspace found, non-TTY output shows `key=value` pairs, no ANSI, exit 0
- [x] 3.6 GREEN: Implement non-TTY branch in `ws.js`
- [x] 3.7 RED: Write test — workspace not found exits 1 with "Workspace not found" stderr
- [x] 3.8 GREEN: Add not-found branch in `ws.js`
- [x] 3.9 RED: Write test — workspace with no runs shows `latest_run=none` and `latest_artifact=none`
- [x] 3.10 GREEN: Handle null run/artifact in `ws.js` formatting (display "none")
- [x] 3.11 RED: Write test — workspace with runs/artifacts shows latest run status and artifact kind
- [x] 3.12 GREEN: Format latest_run.status and latest_artifact.kind in `ws.js`

## Phase 4: Registration — Wire into `cli.js`

- [x] 4.1 Import `taskCommand` from `./commands/task.js` in `cli.js`, register `.command('task')` with `.option('--verbose')`
- [x] 4.2 Import `wsCommand` from `./commands/ws.js` in `cli.js`, register `.command('ws')`
- [x] 4.3 Remove `'task'` and `'ws'` from `STUB_COMMANDS` array in `cli.js` (leave `'run'`)

## Phase 5: Verify — Full suite + lint

- [x] 5.1 Run `npm test` — all new + existing tests pass
- [x] 5.2 Run linter (`npm run lint` or equivalent) — zero errors
- [x] 5.3 Manual smoke test: `node devhub-cli/bin/devhub task --help` and `node devhub-cli/bin/devhub ws --help` show correct descriptions
