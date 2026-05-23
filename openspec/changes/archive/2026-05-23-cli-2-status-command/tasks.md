# Tasks: CLI `status` Command — Compact Swarm Dashboard

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 200–300 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | feature-branch-chain |

Decision needed before apply: No (resolved: single PR, under 400 lines)
Chained PRs recommended: No
Chain strategy: feature-branch-chain
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | DB barrel + format helpers + status command + tests | PR 1 | single PR; all files fit under 400 lines |

## Phase 1: Foundation — DB Barrel and Format Helpers

- [x] 1.1 Extend `devhub-cli/lib/db.js` to re-export `getDb` and `closeDb` from `../../src/lib/db/core.js` alongside existing compactReads barrel
- [x] 1.2 Add `section(title)` helper to `devhub-cli/lib/format.js` — returns colored header if TTY, plain `--- title ---` otherwise
- [x] 1.3 Add `row(label, value)` helper to `devhub-cli/lib/format.js` — returns indented `label: value` string
- [x] 1.4 Add `divider()` helper to `devhub-cli/lib/format.js` — returns 40-char colored line if TTY, plain dashes otherwise
- [x] 1.5 Export new helpers from `devhub-cli/lib/format.js` module.exports

## Phase 2: Command Handler — status.js

- [x] 2.1 Create `devhub-cli/commands/status.js` with shebang-less entry that requires `../lib/db` and `../lib/format`
- [x] 2.2 Implement Projects section: query `COUNT(*) FROM projects` and `SELECT name, progress FROM projects ORDER BY progress DESC LIMIT 5`, format with `section()` + `row()`
- [x] 2.3 Implement Tasks section: query `SELECT status, COUNT(*) FROM tasks GROUP BY status`, normalize to 4 buckets (pending/in_progress/completed/blocked), default missing to 0
- [x] 2.4 Implement Milestones section: query `SELECT title, due_date, status FROM milestones WHERE status != 'completed' ORDER BY due_date ASC LIMIT 5`
- [x] 2.5 Implement Swarm section: query active agents (`status IN ('active','running')`) and claimed tasks (`current_task_id IS NOT NULL`)
- [x] 2.6 Assemble all 4 sections with `divider()` separators, write via `process.stdout.write()`, exit 0

## Phase 3: Registration — Wire into cli.js

- [x] 3.1 Remove `'status'` from `STUB_COMMANDS` array in `devhub-cli/cli.js`
- [x] 3.2 Add `program.command('status')` registration that imports and calls `commands/status.js` handler
- [x] 3.3 Add `--help` support so `devhub status --help` prints brief usage and exits 0

## Phase 4: Tests — Strict TDD RED→GREEN

- [x] 4.1 RED: Create `devhub-cli/commands/status.test.js` — write failing test that `devhub status` exits with code 0
- [x] 4.2 GREEN: Make exit code test pass by implementing minimal status.js handler
- [x] 4.3 RED: Write failing test verifying all 4 sections (Projects, Tasks, Milestones, Swarm) appear in output
- [x] 4.4 GREEN: Ensure section queries produce expected headers
- [x] 4.5 RED: Write failing test mocking `process.stdout.isTTY = true` — verify ANSI codes (`\x1b[`) present in output
- [x] 4.6 GREEN: Confirm TTY colorization works via format.js helpers
- [x] 4.7 RED: Write failing test mocking `process.stdout.isTTY = false` — verify no ANSI codes in output
- [x] 4.8 GREEN: Confirm non-TTY mode strips all escape sequences
- [x] 4.9 RED: Write failing test with empty DB — verify "No projects" friendly message and exit 0
- [x] 4.10 GREEN: Handle empty DB gracefully in status.js
- [x] 4.11 RED: Write failing test verifying `require('./lib/db').getDb` is a function (barrel export)
- [x] 4.12 GREEN: Confirm db.js barrel re-exports getDb correctly
- [x] 4.13 RED: Write failing test verifying `require('./lib/format').section` is a function
- [x] 4.14 GREEN: Confirm format.js exports all new helpers
- [x] 4.15 Run full `npm test` from devhub-cli — all tests pass
