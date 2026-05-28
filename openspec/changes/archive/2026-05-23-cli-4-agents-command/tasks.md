# Tasks: CLI agents command

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~350 (40 query + 90 command + 220 tests + 10 cli.js) |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | feature-branch-chain |

Decision needed before apply: Yes
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Full agents command with tests | Single PR | All phases; tests first (TDD); under 400-line budget |

## Phase 1: Foundation — DB Query Function

- [x] 1.1 Add `readAgentRegistrySummary(db, opts)` to `src/lib/db/compactReads.js` — SQL with LEFT JOIN subquery on `agent_workspaces` (latest by `updated_at`), optional `statusFilter` and `activeOnly` WHERE clauses, ORDER BY `agent_id`
- [x] 1.2 Add `heartbeatLabel(lastHeartbeat)` helper in `compactReads.js` — returns `"Nm ago"`, `"Nh ago"`, `"stale"` (>=5min), or `"unknown"` (null/NaN)
- [x] 1.3 Verify re-export: `devhub-cli/lib/db.js` barrel already spreads `compactReads` — confirm `readAgentRegistrySummary` is accessible via `require('../lib/db')`

## Phase 2: TDD RED — Write Failing Tests

- [x] 2.1 Create `devhub-cli/commands/agents.test.js` with `seedAgentData()` helper — drops/recreates `agent_registry` and `agent_workspaces` tables, seeds test rows
- [x] 2.2 Add test: empty registry → stdout matches "No agents registered", exit code 0
- [x] 2.3 Add test: two agents with different statuses appear in TTY table output with correct columns (AGENT, STATUS, TASK, BRANCH, MODEL, HEARTBEAT)
- [x] 2.4 Add test: agent with no workspace → BRANCH column shows "—"
- [x] 2.5 Add test: agent with multiple workspaces → only latest `branch_name` shown
- [x] 2.6 Add test: `--status idle` filters to exact match only
- [x] 2.7 Add test: `--active` filters to statuses `active, working, running, thinking`
- [x] 2.8 Add test: `--active --status idle` → exit code 2 with error message
- [x] 2.9 Add test: non-TTY (piped) output contains no ANSI escapes, uses pipe-delimited format
- [x] 2.10 Add test: heartbeat "2m ago" for recent, "stale" for >5min, "unknown" for null
- [x] 2.11 Run `cd devhub-cli && npm test -- --testPathPattern=agents` — verify ALL tests FAIL (command not yet implemented)

## Phase 3: TDD GREEN — Implement Command

- [x] 3.1 Create `devhub-cli/commands/agents.js` — parse `--status` and `--active` flags, validate mutual exclusion (exit 2), call `readAgentRegistrySummary(db, opts)`
- [x] 3.2 Implement TTY output path — use `table(headers, rows)` from `lib/format.js` with columns AGENT, STATUS, TASK, BRANCH, MODEL, HEARTBEAT
- [x] 3.3 Implement non-TTY output path — pipe-delimited `agent_id|status|task|branch|model|heartbeat`, no header row, no ANSI
- [x] 3.4 Handle empty state — write "No agents registered\n", exit 0
- [x] 3.5 Register command in `devhub-cli/cli.js` — require `agents.js`, add `.command('agents')` with `--status` and `--active` options, remove `'agents'` from `STUB_COMMANDS`
- [x] 3.6 Run `cd devhub-cli && npm test -- --testPathPattern=agents` — verify ALL tests PASS

## Phase 4: TDD REFACTOR — Verify & Clean

- [x] 4.1 Run full test suite `cd devhub-cli && npm test` — verify no regressions in queue/status tests
- [x] 4.2 Review `agents.js` against `queue.js` patterns — consistent error handling, exit codes, JSDoc comments
- [x] 4.3 Verify `devhub agents --help` prints usage with flag descriptions
