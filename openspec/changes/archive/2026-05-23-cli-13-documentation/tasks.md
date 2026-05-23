# Tasks: CLI Documentation

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~250 (single file create) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | N/A — single file, single PR |
| Delivery strategy | auto-chain |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Create `devhub-cli/README.md` with all sections | PR 1 | Documentation only, no code changes |

## Phase 1: Source Material Review

- [x] 1.1 Read `cli.js` — extract all 11 command signatures, arguments, options
- [x] 1.2 Read `lib/format.js` — confirm TTY vs piped output behavior and `FORCE_TTY` env var
- [x] 1.3 Read `tests/fixtures/seed-factory.js` — note deterministic fixture types and `DEVHUB_DB_PATH` isolation
- [x] 1.4 Review archived specs — capture behavioral details for agent lifecycle and exit codes

## Phase 2: Write README.md

- [x] 2.1 Create `devhub-cli/README.md` with Overview + Quick Start section (~15 lines)
- [x] 2.2 Write Installation section: `npm link`, global install, direct `node bin/devhub` invocation (~15 lines)
- [x] 2.3 Write Command Reference Table summarizing all 11 commands (~15 lines)
- [x] 2.4 Write per-command detail for `status` — usage, options, example
- [x] 2.5 Write per-command detail for `queue` — usage, `--limit`, `--project`, `--blocked` options, example
- [x] 2.6 Write per-command detail for `agents` — usage, `--status`, `--active` options, example
- [x] 2.7 Write per-command detail for `swarm` — usage, `--compact` option, example
- [x] 2.8 Write per-command detail for `task` — usage, `--verbose` option, example
- [x] 2.9 Write per-command detail for `ws` — usage, example
- [x] 2.10 Write per-command detail for `heartbeat` — usage, `[agent-id]` argument, example
- [x] 2.11 Write per-command detail for `update-status` — usage, 3 positional args, example
- [x] 2.12 Write per-command detail for `claim` — usage, `[agent-id]` argument, example
- [x] 2.13 Write per-command detail for `release` — usage, 2 positional args, `--outcome` option, example
- [x] 2.14 Write per-command detail for `tell` — usage, 2 positional args, `--kind`, `--mission`, `--sender` options, example
- [x] 2.15 Write Exit Codes section: table with 0 (success), 1 (runtime error), 2 (invalid args/unknown command)
- [x] 2.16 Write Output Modes section: TTY color via `isTTY`/`FORCE_TTY`, piped plain text
- [x] 2.17 Write Integration Test Guide: `npm run test:integration`, seed factory, temp DB isolation
- [x] 2.18 Write Agent Workflow Patterns: register → heartbeat loop → claim → work → release → heartbeat

## Phase 3: Verify

- [x] 3.1 Diff README against `cli.js` — confirm all 11 commands present, no hallucinated commands
- [x] 3.2 Run `wc -l devhub-cli/README.md` — verify under 300 lines (298)
- [x] 3.3 Spot-check 2-3 CLI examples against test DB for syntax validity
- [x] 3.4 Verify exit code table matches `cli.js` error handlers (exit 2 for unknown, exit 1 for runtime)
- [x] 3.5 Verify output mode docs match `lib/format.js` `isTTY` logic
