# Tasks: CLI Claim and Release Commands

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 280–380 |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | single PR (claim + release are coupled lifecycle) |
| Delivery strategy | ask-on-risk |
| Chain strategy | feature-branch-chain |

Decision needed before apply: Yes
Chained PRs recommended: No
Chain strategy: feature-branch-chain
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Claim command + tests | PR 1 | base=main; tests + impl together |
| 2 | Release command + tests | PR 2 | base=main; independent of claim after foundation |
| 3 | cli.js registration + smoke | PR 3 | base=main; wires both commands |

## Phase 1: Foundation (Claim Helper)

- [x] 1.1 Add `claimNextTask(db, agentId)` to `lib/db.js`: resolve `project_id` from `agent_registry`, call `readExecutionQueueSummary(db, { projectId, limit: 20, includeBlocked: true })`, return first non-blocked pending task or null
- [x] 1.2 Add `releaseTask(db, taskId, claimToken, outcome)` to `lib/db.js`: atomic UPDATE with `WHERE id = ? AND claim_token = ?`, return `{ changes, taskFound, wasClaimed }` for caller to distinguish errors
- [x] 1.3 Write RED test `lib/db-claim-release.test.js` — `claimNextTask` returns null when no pending tasks exist
- [x] 1.4 Write GREEN — implement `claimNextTask` to pass the null-case test
- [x] 1.5 Write RED test — `claimNextTask` returns first non-blocked pending task when available
- [x] 1.6 Write GREEN — seed a pending task + agent, verify `claimNextTask` returns it
- [x] 1.7 Write RED test — `claimNextTask` skips blocked tasks, returns next pending
- [x] 1.8 Write GREEN — seed blocked + pending tasks, verify correct task picked
- [x] 1.9 Write RED test — `releaseTask` returns `{ changes: 0, taskFound: false }` for non-existent task
- [x] 1.10 Write GREEN — implement `releaseTask` select-before-update path
- [x] 1.11 Write RED test — `releaseTask` returns `{ changes: 0, taskFound: true, wasClaimed: false }` when claim_token is NULL
- [x] 1.12 Write GREEN — seed unclaimed task, verify wasClaimed false path
- [x] 1.13 Write RED test — `releaseTask` returns `{ changes: 1 }` on valid token match
- [x] 1.14 Write GREEN — seed claimed task, verify atomic update clears lease fields

## Phase 2: Claim Command + TDD Tests

- [x] 2.1 Create `devhub-cli/commands/claim.test.js` with RED test: missing agent-id → exit 2
- [x] 2.2 Create `devhub-cli/commands/claim.js` with GREEN: validate `process.argv`, write stderr, `process.exit(2)`
- [x] 2.3 RED test: agent not in registry → exit 1
- [x] 2.4 GREEN: query `agent_registry`, exit 1 if no matching agent
- [x] 2.5 RED test: no pending tasks → exit 1, "No pending tasks available"
- [x] 2.6 GREEN: call `claimNextTask`, exit 1 if null
- [x] 2.7 RED test: successful claim → exit 0, DB updated with `claim_token` (32-char hex) and `lease_expires_at` (now + 300s)
- [x] 2.8 GREEN: generate token via `crypto.randomBytes(16).toString('hex')`, atomic UPDATE, TTY output
- [x] 2.9 RED test: piped output (FORCE_TTY unset) → valid JSON with id, title, project, claim_token, lease_expires_at
- [x] 2.10 GREEN: check `isTTY`, branch to JSON output when false
- [x] 2.11 RED test: double-claim prevention — claim same task twice, second exits 1
- [x] 2.12 GREEN: verify `WHERE status = 'pending'` guard in UPDATE prevents double-claim

## Phase 3: Release Command + TDD Tests

- [x] 3.1 Create `devhub-cli/commands/release.test.js` with RED test: missing task-id → exit 2
- [x] 3.2 Create `devhub-cli/commands/release.js` with GREEN: validate args, stderr "Missing required arguments: task-id, claim-token", exit 2
- [x] 3.3 RED test: missing claim-token → exit 2, "Missing required argument: claim-token"
- [x] 3.4 GREEN: parse `process.argv`, validate both positional args present
- [x] 3.5 RED test: `--outcome invalid` → exit 2, "Invalid outcome: invalid. Must be one of: completed, paused, failed, abandoned"
- [x] 3.6 GREEN: parse `--outcome` flag, validate against whitelist, default to `completed`
- [x] 3.7 RED test: task not found → exit 1, "Task not found: <id>"
- [x] 3.8 GREEN: call `releaseTask`, branch on `taskFound === false`
- [x] 3.9 RED test: task not claimed (NULL token) → exit 1, "Task <id> is not currently claimed"
- [x] 3.10 GREEN: branch on `wasClaimed === false`
- [x] 3.11 RED test: token mismatch → exit 1, "Invalid claim token"
- [x] 3.12 GREEN: branch on `changes === 0` after update
- [x] 3.13 RED test: release with default outcome → status=completed, lease cleared, exit 0
- [x] 3.14 GREEN: execute release, stdout "Task <id> released (completed)"
- [x] 3.15 RED test: release with `--outcome paused` → status=paused
- [x] 3.16 GREEN: map outcome to status (`abandoned` → `blocked`)
- [x] 3.17 RED test: release with `--outcome failed` → status=failed
- [x] 3.18 GREEN: verify all four outcome mappings
- [x] 3.19 RED test: expired lease → warning "Lease expired at <time>" + success
- [x] 3.20 GREEN: check `lease_expires_at < now` before update, write warning to stdout

## Phase 4: Registration in cli.js

- [x] 4.1 Register `claim` command in `cli.js`: `program.command('claim').argument('[agent-id]', 'Agent ID').action(require('./commands/claim'))`
- [x] 4.2 Register `release` command in `cli.js`: `program.command('release').argument('[task-id]').argument('[claim-token]').option('--outcome <value>').action(require('./commands/release'))`
- [x] 4.3 Verify `claim` and `release` not in `STUB_COMMANDS` (removed 'run' from stubs, STUB_COMMANDS = [])

## Phase 5: Verify + Lint + Smoke Test

- [x] 5.1 Run `npm test` in `devhub-cli/` — all new tests pass (33/33 in isolation; pre-existing failures in other test files are unrelated)
- [x] 5.2 Smoke: `node bin/devhub claim smoke-agent` with seeded data → TTY/JSON output, exit 0
- [x] 5.3 Smoke: `node bin/devhub release <task-id> <token> --outcome completed` → confirmation, exit 0
- [x] 5.4 Smoke: `node bin/devhub claim smoke-agent | jq .` → valid JSON piped output
- [x] 5.5 Lint: no ESLint configured in devhub-cli (package.json has no lint script)
