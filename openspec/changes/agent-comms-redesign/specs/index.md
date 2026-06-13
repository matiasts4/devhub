# Specs Index: agent-comms-redesign

> Manifest of every spec file this change touches. Read in order: bus → helpers → lock → agent-events delta → team-chat-targeting delta.

## New Specs (3)

| Capability                 | Path                                     | Requirements | Scenarios | Purpose                                                                                          |
| -------------------------- | ---------------------------------------- | ------------ | --------- | ------------------------------------------------------------------------------------------------ |
| `agent-comms-bus`          | `specs/agent-comms-bus/spec.md`          | 7            | 10        | Durable SQLite bus (team_chat, team_events, team_inbox, agent_presence) with JSONL projection    |
| `agent-bus-helpers`        | `specs/agent-bus-helpers/spec.md`        | 6            | 14        | Bash helper contract: `_devhub_chat`, `_devhub_event`, `_devhub_presence`, `_devhub_inbox_check` |
| `bootstrap-injection-lock` | `specs/bootstrap-injection-lock/spec.md` | 4            | 8         | State machine and rename for the launch-time prompt-injection lock                               |

## Delta Specs (2)

| Capability            | Path                                | Type  | Modifies                                     | Purpose                                                                                       |
| --------------------- | ----------------------------------- | ----- | -------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `agent-events`        | `specs/agent-events/spec.md`        | DELTA | `openspec/specs/agent-events/spec.md`        | Retires `POST /api/agenthub/events`; long-poll behavior removed; `agent_events` is audit-only |
| `team-chat-targeting` | `specs/team-chat-targeting/spec.md` | DELTA | `openspec/specs/team-chat-targeting/spec.md` | One-release shim: read from `team_inbox`, fall back to `pending_deliveries`                   |

## Required Scenario Coverage

The orchestrator required every scenario below to be covered. The table shows where each is implemented.

| Required scenario                                                                                             | Spec                                    | Scenario ID                              |
| ------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ---------------------------------------- |
| (a) `_devhub_chat <body> --to director` reaches director via tail -F within 2s                                | `agent-comms-bus` / `agent-bus-helpers` | BUS-S3, BUS-S8, HELPER-S1                |
| (b) `_devhub_event task_completed` projects to JSONL, dedupe on restart                                       | `agent-comms-bus` / `agent-bus-helpers` | BUS-S5, BUS-S8, HELPER-S5, HELPER-S6     |
| (c) Bootstrap lock state machine `pending→injecting→injected` and `injected→failed`                           | `bootstrap-injection-lock`              | LOCK-S3, LOCK-S4                         |
| (d) `pending_deliveries` → `team_inbox` shim, no behavior change for 1 release                                | `team-chat-targeting` (delta)           | TCT-DELTA-S1, TCT-DELTA-S2, TCT-DELTA-S8 |
| (e) Dedupe of director `tail -F` re-delivery on restart: same `(ts, from_role, body_hash)` does not re-render | `agent-comms-bus` / `agent-bus-helpers` | BUS-S4, BUS-S5, HELPER-S6                |
| (f) Director sees auditor report: end-to-end repro of `launch-e743667a`                                       | `agent-bus-helpers`                     | HELPER-S1                                |
| (g) `_devhub_presence busy <context>` updates state, does not block heartbeat                                 | `agent-bus-helpers`                     | HELPER-S8                                |
| (h) `_devhub_inbox_check` on bootstrap re-injects pending rows                                                | `agent-comms-bus` / `agent-bus-helpers` | BUS-S6, HELPER-S10, HELPER-S11           |
| (i) JSONL rotation when mission ends: move to archive path                                                    | `agent-comms-bus`                       | BUS-S9                                   |

## Total

- **5 spec files** written (3 new + 2 deltas)
- **26 requirements** total (17 new, 7 added/modified in deltas, 2 removed)
- **40+ scenarios** covering happy paths, error states, idempotency, backward compat, and recovery

## Out of Scope (per proposal)

- UI Control Room for the new bus (deferred to `control-room-bus-integration`)
- Adapters for Codex/Claude runtime, multi-tenant, multi-mission concurrent
- Fusion of `mission_messages`/`message_deliveries` with `team_chat`/`team_inbox`
- HMAC `DEVHUB_AGENT_TOKEN` removal in other endpoints (heartbeat, exit stay signed)
- Re-introduction of Plyrium or any external runtime

## Next Phase

`sdd-design` — write the technical design covering:

- Migration file structure (`data/migrations/002_agent_comms_bus.sql`)
- Trigger function bodies (compact JSON serialization)
- Wrapper integration: how the bash helpers reach `better-sqlite3` (PATH, shebang, or `node -e`)
- Director `tail -F` consumer implementation (dedupe buffer shape, `tail --retry` wrapper)
- `getMissionBusSnapshot(missionId)` snapshot helper for the CLI
- File-count and line-count budget reconciliation (D2 = ~800 lines)
