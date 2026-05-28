# Proposal: CLI-7 Heartbeat & Status Commands

## Intent

CLI-1 through CLI-6 deliver read-only commands (status, queue, agents, swarm, task, ws). CLI-7 adds two **mutation** commands so agents can self-report liveness and status directly to SQLite without bouncing through the MCP server. This closes the loop: agents can now both read and write their own operational state from the CLI.

## Scope

### In Scope
- `devhub heartbeat <agent-id>` — updates `last_heartbeat` timestamp in `agent_registry`. Idempotent.
- `devhub update-status <agent-id> <status>` — updates `status` (and optional `task_description`) in `agent_registry`.
- Register both commands in `cli.js`.
- Unit tests for both commands (exit codes, valid/invalid args, DB write verification).
- Write helpers in `lib/db.js` if not already present.

### Out of Scope
- Heartbeat daemon or cron scheduling (operational concern, not CLI).
- Status validation beyond enum check (MCP layer handles business rules).
- WebSocket push of status changes (future enhancement).

## Capabilities

### New Capabilities
- `cli-heartbeat-command`: Heartbeat mutation command — writes `last_heartbeat` to SQLite, idempotent, exits 0 on success.
- `cli-update-status-command`: Status mutation command — writes `status` + optional `task_description` to SQLite, validates status enum, exits 0 on success.

### Modified Capabilities
- `cli-entrypoint`: Register two new commands in `cli.js`, remove from stub list, update help output.

## Approach

Both commands write directly to SQLite via `getDb()` from `lib/db.js` — same pattern as existing read commands. No MCP bounce.

- **heartbeat**: `UPDATE agent_registry SET last_heartbeat = datetime('now') WHERE agent_id = ?`. Always succeeds (idempotent), warns if agent_id not found.
- **update-status**: `UPDATE agent_registry SET status = ?, task_description = ? WHERE agent_id = ?`. Validates status against known enum values. Errors on unknown status (exit 1).

`lib/db.js` may need a small write helper wrapper; existing `getDb` is sufficient for raw SQL.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `devhub-cli/cli.js` | Modified | Register `heartbeat` and `update-status` commands |
| `devhub-cli/commands/heartbeat.js` | New | Heartbeat command handler |
| `devhub-cli/commands/heartbeat.test.js` | New | Unit tests for heartbeat |
| `devhub-cli/commands/updateStatus.js` | New | Update-status command handler |
| `devhub-cli/commands/updateStatus.test.js` | New | Unit tests for update-status |
| `devhub-cli/lib/db.js` | Modified | Add write helpers if needed |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| DB write race with MCP heartbeat job | Low | Both write same column; SQLite serializes. Idempotent by design. |
| Invalid status value accepted | Low | Validate against enum before write. |
| Agent ID not found silently ignored | Medium | Warn to stderr, still exit 0 (idempotent contract). |

## Rollback Plan

1. Unregister commands from `cli.js` (remove 2 lines).
2. Delete 4 new files (`heartbeat.js`, `heartbeat.test.js`, `updateStatus.js`, `updateStatus.test.js`).
3. Revert any `lib/db.js` changes.
4. No data migration needed — existing rows remain valid.

## Dependencies

- CLI-1 through CLI-6 must be merged (scaffold, db barrel, format helpers exist).
- `agent_registry` table must exist in SQLite schema.

## Success Criteria

- [ ] `devhub heartbeat test-agent-1` updates `last_heartbeat` and exits 0.
- [ ] `devhub update-status test-agent-1 active` updates status and exits 0.
- [ ] `devhub update-status test-agent-1 invalid-status` exits 1 with error message.
- [ ] All unit tests pass via `cd devhub-cli && npm test`.
- [ ] Both commands appear in `devhub --help`.
