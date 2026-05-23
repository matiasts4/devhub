# Tasks: CLI Swarm Command

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~180-260 (swarm.js ~90, swarm.test.js ~120, cli.js ~10) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

## Phase 1: Tests — Strict TDD RED (Write failing tests first)

- [x] 1.1 Create `commands/swarm.test.js` with seed helper matching `status.test.js` pattern (projects, tasks, milestones, agent_workspaces)
- [x] 1.2 Add test: `devhub swarm` exits 0 and output contains all 4 section headers (Projects, Queue, Agents, Milestones)
- [x] 1.3 Add test: section ordering — Projects → Queue → Agents → Milestones with dividers between
- [x] 1.4 Add test: `--compact` flag produces under 30 lines with single-line summary
- [x] 1.5 Add test: `--compact` with empty DB shows empty-state messages, under 30 lines
- [x] 1.6 Add test: non-TTY output (spawnSync default) contains no ANSI escape codes (`\x1b[`)
- [x] 1.7 Add test: non-TTY output contains `key=value` pairs per section
- [x] 1.8 Add test: empty DB shows "No swarm data available" per section, exit 0
- [x] 1.9 Add test: partial data — seed only projects, assert Agents section shows empty message
- [x] 1.10 Add test: `devhub swarm` invokes handler (exit 0, not exit 1 stub error)
- [x] 1.11 Add test: `devhub --help` includes "swarm" in command list
- [x] 1.12 Verify all tests fail (RED) — run `cd devhub-cli && npm test -- --testPathPattern=swarm`

## Phase 2: Implementation — Command Handler (GREEN)

- [x] 2.1 Create `commands/swarm.js` with `swarmCommand(opts = {})` signature, export via `module.exports`
- [x] 2.2 Implement data fetch: direct SQLite queries for projects (COUNT + top 5 by progress DESC), task counts by status, milestones (non-completed, ordered by due_date), agent workspaces (reuse `readAgentRegistrySummary` pattern or direct query)
- [x] 2.3 Implement `--compact` flag: when `opts.compact` is true, render single-line summary with counts for all 4 sections
- [x] 2.4 Implement full TTY output: use `lib/format.js` helpers (`section()`, `row()`, `divider()`) for 4 sections in order
- [x] 2.5 Implement non-TTY output: `key=value` pairs per section, no ANSI codes (rely on `format.js` `isTTY` detection)
- [x] 2.6 Implement empty state: per-section "No swarm data available" when section data is empty, exit 0
- [x] 2.7 Verify all tests pass (GREEN) — run `cd devhub-cli && npm test -- --testPathPattern=swarm`

## Phase 3: Registration — Wire into cli.js

- [x] 3.1 In `cli.js`, add `const swarmCommand = require('./commands/swarm.js')` after existing command imports
- [x] 3.2 Register `swarm` command with `.option('--compact', 'Show collapsed one-line summaries')` and `.action(swarmCommand)`
- [x] 3.3 Remove `'swarm'` from `STUB_COMMANDS` array in `cli.js`
- [x] 3.4 Verify `devhub swarm` runs handler (exit 0) and `devhub --help` shows swarm

## Phase 4: Cleanup / Verification

- [x] 4.1 Run full test suite: `cd devhub-cli && npm test` — zero regressions
- [x] 4.2 Run `devhub swarm` manually — verify 4 sections render correctly
- [x] 4.3 Run `devhub swarm --compact` — verify single-line summary under 30 lines
- [x] 4.4 Run `devhub swarm | cat` — verify non-TTY `key=value` format, no ANSI
