# Tasks: CLI-7 Heartbeat & Status Commands

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 250–350 |
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
| 1 | DB migration + heartbeat command + tests + update-status command + tests + registration | PR 1 | Single PR — well under 400-line budget |

## Phase 1: Foundation — DB Migration

- [x] 1.1 Add `ensureWriteSchema()` to `devhub-cli/lib/db.js` — check `table_info(agent_registry)` for `task_description`, run `ALTER TABLE` if missing
- [x] 1.2 Call `ensureWriteSchema()` early in CLI startup path (before commands execute)

## Phase 2: Heartbeat Command (TDD)

- [x] 2.1 **RED** — Write `devhub-cli/commands/heartbeat.test.js`: test exit 2 on missing agent-id, exit 0 on success, exit 1 on unknown agent, DB write verified, idempotency
- [x] 2.2 **GREEN** — Create `devhub-cli/commands/heartbeat.js`: validate agent-id arg, call `getDb()`, run `UPDATE agent_registry SET last_heartbeat = datetime('now') WHERE agent_id = ?`, check `changes()`, print confirmation or warning, `process.exit(code)`
- [x] 2.3 **GREEN** — Handle unknown agent case: `changes() === 0` → stderr warning, exit 1
- [x] 2.4 Verify tests pass: `npm test -- heartbeat`

## Phase 3: Update-Status Command (TDD)

- [x] 3.1 **RED** — Write `devhub-cli/commands/updateStatus.test.js`: test exit 2 on missing args (no args, missing status), exit 1 on invalid status, exit 0 on valid status, exit 1 on unknown agent, DB write verified, optional task_description
- [x] 3.2 **GREEN** — Create `devhub-cli/commands/updateStatus.js`: validate args, hardcode `VALID_STATUSES` Set, validate status enum, call `getDb()`, run `UPDATE agent_registry SET status = ?, task_description = COALESCE(?, task_description) WHERE agent_id = ?`, check `changes()`, print confirmation or warning, `process.exit(code)`
- [x] 3.3 **GREEN** — Handle invalid status: stderr lists valid values, exit 1
- [x] 3.4 **GREEN** — Handle unknown agent: `changes() === 0` → stderr warning, exit 1
- [x] 3.5 Verify tests pass: `npm test -- updateStatus`

## Phase 4: Registration — Wire into cli.js

- [x] 4.1 Import `heartbeat` command in `devhub-cli/cli.js`, register as `program.command('heartbeat').argument('[agent-id]')`
- [x] 4.2 Import `updateStatus` command in `devhub-cli/cli.js`, register as `program.command('update-status').argument('[agent-id]').argument('[status]').argument('[task-description]')`
- [x] 4.3 Verify both appear in `devhub --help` output

## Phase 5: Verify — Full Suite + Lint

- [x] 5.1 Run full test suite: `npm test` — all new and existing tests pass
- [x] 5.2 Run linter: `eslint devhub-cli/commands/heartbeat.js devhub-cli/commands/updateStatus.js devhub-cli/lib/db.js devhub-cli/cli.js`
- [x] 5.3 Manual smoke test: `node devhub-cli/cli.js heartbeat test-agent` and `node devhub-cli/cli.js update-status test-agent active`
