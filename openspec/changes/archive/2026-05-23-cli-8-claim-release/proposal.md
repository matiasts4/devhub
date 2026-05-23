# Proposal: CLI Claim and Release Commands

## Intent

Add lease management commands to the DevHub CLI so agents can take work from the execution queue and return it when done. CLI-1 through CLI-7 are read-only or simple writes; claim/release are the first commands that mutate task lifecycle state (lease_token, lease_expires_at, task status).

## Scope

### In Scope
- `devhub claim <agent-id>` — query execution queue, create claim_token, set lease, return task info
- `devhub release <task-id> <claim-token> [--outcome completed|paused|failed|abandoned]` — validate token, release lease, update task status
- Register both commands in `cli.js`, remove from stub list
- Unit tests for both commands (exit codes, arg validation, DB write, token validation)

### Out of Scope
- Lease renewal (separate change — CLI-9)
- Multi-task claim or batch operations
- Agent-side retry logic or exponential backoff

## Capabilities

### New Capabilities
- `cli-claim-command`: Claim next task from execution queue with lease management
- `cli-release-command`: Release task lease with outcome-based status update

### Modified Capabilities
- `cli-entrypoint`: Register `claim` and `release` commands, remove from stub list

## Approach

Both commands follow the CLI-7 (heartbeat/update-status) pattern:
1. Direct SQLite via `getDb()` from `lib/db.js` — no MCP or HTTP
2. Exit codes: 0 (success), 1 (runtime error: not found, invalid token), 2 (missing args)
3. TTY-aware output via `lib/format.js`
4. `claim` calls `readExecutionQueueSummary()` to find next available task, generates a random `claim_token` (crypto.randomBytes), sets `lease_expires_at` to now + 5 minutes, updates task status to `in_progress`
5. `release` validates `claim_token` matches the task's stored token, clears lease fields, updates task status based on `--outcome` flag (default: `completed`)

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `devhub-cli/commands/claim.js` | New | Claim handler with queue lookup + lease write |
| `devhub-cli/commands/claim.test.js` | New | Unit tests for claim command |
| `devhub-cli/commands/release.js` | New | Release handler with token validation + status update |
| `devhub-cli/commands/release.test.js` | New | Unit tests for release command |
| `devhub-cli/cli.js` | Modified | Register claim/release, remove from STUB_COMMANDS |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Token collision on claim | Low | Use `crypto.randomBytes(16).toString('hex')` — 256-bit entropy |
| Release with stale/expired token | Medium | Token must match stored value exactly; expired leases show warning but still release |
| Claim on already-claimed task | Medium | Queue query filters out `in_progress` tasks with valid lease |
| Race condition (two agents claim same task) | Low | SQLite write serialization; claim uses single UPDATE with WHERE status='pending' |

## Rollback Plan

1. Remove `claim.js`, `claim.test.js`, `release.js`, `release.test.js` from `devhub-cli/commands/`
2. Revert `cli.js` registration, add `claim` and `release` back to `STUB_COMMANDS`
3. No database migration needed — lease columns already exist from prior changes
4. Any tasks mid-lease will have stale tokens; they revert to `pending` on next queue cycle

## Dependencies

- CLI-1 through CLI-7 (complete and archived) — provides `lib/db.js`, `lib/format.js`, CLI scaffold
- `readExecutionQueueSummary` from `lib/db.js` — already available from CLI-6
- SQLite columns `claim_token`, `lease_expires_at` on tasks table — must exist before claim writes

## Success Criteria

- [ ] `devhub claim <agent-id>` returns next pending task and sets lease in DB
- [ ] `devhub release <task-id> <token>` clears lease and updates task status
- [ ] `devhub release` rejects mismatched tokens with exit code 1
- [ ] Both commands exit 2 on missing required arguments
- [ ] All unit tests pass via Jest
- [ ] TTY output shows task details; piped output is machine-readable
