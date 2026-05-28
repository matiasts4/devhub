# Proposal: CLI Tell Command

## Intent

Add `devhub tell` — the CLI equivalent of the `team_tell` MCP tool. Enables agents and operators to send inter-agent directives, status updates, handoffs, decisions, risks, and approval requests directly via CLI, persisting to SQLite for durable delivery.

## Scope

### In Scope
- `devhub tell <recipient> <message>` command with positional args
- `--kind directive|status|handoff|decision|risk|approval_request|approval_result` (default: directive)
- `--mission <mission-id>` required mission context
- `--sender <agent-id>` sender identification (required)
- Direct SQLite write to `mission_messages` + `message_deliveries` tables
- TTY-aware output (human-readable) and JSON output (piped)
- Exit codes: 0 = sent, 1 = runtime error (missing mission/agent), 2 = invalid args
- Registration in `cli.js`, removal from stub list
- Unit tests for arg parsing, validation, and DB write

### Out of Scope
- Transport dispatch (resolve bindings, send to sessions) — CLI is persist-only; delivery happens when recipient polls
- Multi-recipient fanout from single CLI call (single recipient per invocation)
- Telegram or external adapter integration

## Capabilities

### New Capabilities
- `cli-tell-command`: CLI tell command with arg parsing, validation, SQLite persist, and TTY-aware output

### Modified Capabilities
- `cli-entrypoint`: Register `tell` command in `cli.js`, add to help, remove from stubs

## Approach

Follow CLI-7/CLI-8 pattern:
1. `commands/tell.js` — synchronous function: validate args → `ensureWriteSchema()` → `getDb()` → `createMissionMessage()` → `upsertMessageDelivery()` per recipient → output result
2. Reuse `createMissionMessage` and `upsertMessageDelivery` from `src/lib/db/swarmMissions.js` (already exported via `lib/db.js` barrel)
3. Persist-only: CLI writes message + delivery record with status `pending`; no transport dispatch
4. TTY detection via `process.stdout.isTTY` for human vs JSON output

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `devhub-cli/cli.js` | Modified | Register `tell` command |
| `devhub-cli/commands/tell.js` | New | Tell command implementation |
| `devhub-cli/commands/tell.test.js` | New | Unit tests |
| `devhub-cli/lib/db.js` | Modified | Re-export `createMissionMessage` + `upsertMessageDelivery` if not already |
| `openspec/specs/cli-entrypoint/spec.md` | Modified | Add tell command registration requirement |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `mission_messages` schema mismatch | Low | Reuse existing `createMissionMessage` from swarmMissions.js |
| Missing `mission_id` causes orphan messages | Medium | Require `--mission` flag; exit 2 if absent |
| `sender_agent_id` not in registry | Low | Validate sender exists; exit 1 if not found |

## Rollback Plan

Remove `tell` from `cli.js` registration, delete `commands/tell.js` and tests. No data migration needed — existing `mission_messages` rows remain valid.

## Dependencies

- CLI entry point scaffold (CLI-1) — already exists
- `mission_messages` and `message_deliveries` tables — already exist
- `createMissionMessage` / `upsertMessageDelivery` in db barrel — verify export

## Success Criteria

- [ ] `devhub tell worker-1 "Start processing" --mission m-1 --sender worker-2` writes to SQLite and exits 0
- [ ] `devhub tell` without args exits 2
- [ ] `devhub tell x "msg" --mission m-1` without `--sender` exits 2
- [ ] Piped output is valid JSON
- [ ] All unit tests pass via `cd devhub-cli && npm test`
