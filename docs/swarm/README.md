# DevHub Swarm

> **Status:** 🟢 Active. Communication bus is the source of truth (post-`agent-comms-redesign`, 2026-06-01).

## Current architecture

- **Bus binary:** `devhub-cli/bin/devhub-bus.js` — subcommands: `chat-write`, `event-write`, `presence-upsert`, `presence-heartbeat`, `presence-list`, `event-list`, `inbox-check`, `snapshot`, `rotate`, `director-consume`
- **Storage:** `data/devhub.db` (SQLite + WAL, `team_chat` / `team_events` / `team_inbox` / `agent_presence` tables; migration 002)
- **Bash helpers (sourced into every agent):** `_devhub_chat`, `_devhub_event`, `_devhub_inbox_check`, `_devhub_presence_upsert`
- **Director consumer:** `devhub bus director-consume --mission <id>` with persistent dedupe file
- **TCT legacy compat shim:** `src/lib/bus/shim/tct.js` (one-release mirror to `pending_deliveries`, disable with `DEVHUB_INBOX_SHIM_DISABLED=1`)

For the full design rationale and scenarios, see `openspec/changes/agent-comms-redesign/`.

## Historical (pre-redesign) docs

The 2026-05 comms debugging handoff, diagnosis, solution design, and bug analysis are archived at `docs/archive/pre-agent-comms-redesign/`. They describe the deprecated HTTP+HMAC flow.
