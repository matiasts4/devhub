# Design: CLI Tell Command

## Technical Approach

Implement `devhub tell <recipient> <message>` as a synchronous CLI command in `devhub-cli/commands/tell.js`. The command validates arguments, ensures the write schema exists, opens the SQLite database, calls `createMissionMessage` to insert into `mission_messages`, then calls `upsertMessageDelivery` per recipient into `message_deliveries`. Reuses existing DB barrel functions — no direct SQL in the command.

## Architecture Decisions

| Decision | Option A | Option B | Decision |
|----------|----------|----------|----------|
| Write mechanism | Reuse `createMissionMessage` + `upsertMessageDelivery` | Direct SQL in command | **A** — reuse existing functions, same validation, same schema, zero duplication |
| `--mission` flag | Required | Optional | **Required** — `createMissionMessage` requires `mission_id`; spec mandates exit code 2 when missing |
| `--sender` flag | Required | Optional | **Required** — maps to `sender_agent_id`; spec mandates exit code 2 when missing |
| Output format | TTY human-readable, piped JSON | Always human-readable | **TTY-aware** — `process.stdout.isTTY` detection, matches existing CLI conventions |
| `--kind` validation | Pre-validate against `MISSION_MESSAGE_KINDS` array | Let `createMissionMessage` throw | **Pre-validate** — better error messages, exit code 2 (user error) vs code 1 (runtime error) |

## Data Flow

    CLI args ──→ parseArgs() ──→ validate(kind, mission, sender)
                                          │
                                          ▼
                              ensureWriteSchema() → getDb()
                                          │
                                          ▼
                              createMissionMessage(db, {
                                mission_id, sender_agent_id,
                                message_kind, body_summary
                              })
                                          │
                                          ▼
                              upsertMessageDelivery(db, {
                                message_id, recipient_agent_id,
                                channel: 'devhub-cli',
                                status: 'pending'
                              })
                                          │
                                          ▼
                              TTY output or JSON ──→ exit(0)

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `devhub-cli/commands/tell.js` | Create | Main command: arg parsing, validation, DB write, output |
| `devhub-cli/commands/tell.test.js` | Create | Unit tests: arg parsing, kind validation, missing args, DB write, TTY detection |
| `devhub-cli/lib/db.js` | Modify | Re-export `createMissionMessage`, `upsertMessageDelivery`, `isMissionMessageKind`, `MISSION_MESSAGE_KINDS` from swarmMissions |
| `devhub-cli/cli.js` | Modify | Register `tell` subcommand |

## Interfaces / Contracts

### Command Signature

```
devhub tell <recipient> <message> [--kind <kind>] --mission <id> --sender <id>
```

### Kind Values (from `MISSION_MESSAGE_KINDS`)

```javascript
['directive', 'status', 'handoff', 'decision', 'risk', 'approval_request', 'approval_result']
```

### DB Function Contracts

```javascript
// createMissionMessage requires: mission_id, message_kind, body_summary
// Optional: sender_agent_id, evidence_ref, related_* fields
createMissionMessage(db, {
  mission_id: string,
  sender_agent_id: string | null,
  message_kind: string,  // validated against MISSION_MESSAGE_KINDS
  body_summary: string,
})

// upsertMessageDelivery requires: message_id, recipient_agent_id, channel, status
upsertMessageDelivery(db, {
  message_id: string,        // from createMissionMessage result
  recipient_agent_id: string, // CLI positional arg <recipient>
  channel: 'devhub-cli',     // hardcoded — identifies CLI as delivery surface
  status: 'pending',         // initial state for delivery polling
})
```

### TTY Output

```
# TTY (isTTY === true):
Message sent: <message_id>
  Recipient: <recipient>
  Kind: <kind>
  Mission: <mission_id>

# Piped (isTTY === false):
{"message_id":"...","recipient":"...","kind":"...","mission":"...","sender":"..."}
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | Arg parsing (positional + flags) | Mock `process.argv`, verify parsed values |
| Unit | Kind validation (valid + invalid) | Call command with each kind, verify exit codes |
| Unit | Missing `--mission` / `--sender` | Omit flags, verify stderr + exit code 2 |
| Unit | DB write (createMissionMessage) | Mock DB, verify function called with correct args |
| Unit | DB write (upsertMessageDelivery) | Mock DB, verify delivery row with channel='devhub-cli' |
| Unit | TTY detection | Mock `process.stdout.isTTY`, verify output format |
| Unit | Unknown mission | Mock DB to return null, verify exit code 1 |

## Migration / Rollout

No migration required. Tables `mission_messages` and `message_deliveries` already exist. Functions `createMissionMessage` and `upsertMessageDelivery` already exported from db barrel — only need to add re-exports in `devhub-cli/lib/db.js`.

## Open Questions

- [ ] Should `tell` support multiple recipients (comma-separated or repeated `--recipient` flag)? Current spec uses single positional `<recipient>`.
- [ ] Should the `channel` field be configurable via `--channel` flag, or always `devhub-cli`? Using hardcoded for now — simplifies delivery polling logic.
