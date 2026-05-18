# Exploration: Telegram external adapter/channel for DevHub Swarm

### Current State

SW-2.1, SW-2.2, SW-3.1, and SW-4.1 already freeze the durable control plane: `agent_workspaces`, `agent_runs`, `agent_artifacts`, queue/lease handling, and executor-produced evidence. Telegram today still mixes adapter behavior with orchestration-adjacent concerns: it persists chat/session mappings, reads local runtime mirrors, derives busy/realtime status from `agent_logs`, and exposes a legacy LLM bridge with provider failover, tool calling, and SQLite conversation state.

The new boundary must make Telegram a consumer/adapter only. It can read DevHub durable state and emit user intents, but it must not own orchestration, git/worktree/filesystem verbs, or runtime truth.

### Affected Areas

- `docs/13_Telegram_LLM_Bridge.md` — explicitly documents the stale bridge/orchestration model and must be rewritten or superseded.
- `docs/review/MODULO-06-telegram-bot.md` — contains the audit findings that justify deprecating the fragile bridge pieces.
- `src/views/TelegramMonitor.jsx` / `src/views/telegramMonitorRealtime.js` — UI currently polls Telegram-local status and should shift to durable DevHub snapshots.
- `src/lib/agentRegistryLive.js` — still bridges runtime-local `devhub_agent_runs`; this is the wrong truth source for the new channel contract.
- `src/app/api/telegram/status/route.js` — status surface is still Telegram-local and only partially aligned with durable control-plane state.
- `telegram-bot/services/session-bridge.js` / `telegram-bot/services/telegram-persister.js` — reusable adapter pieces for chat/session persistence, but not orchestration ownership.

### Approaches

1. **Thin Telegram channel over durable DevHub snapshots** — Telegram becomes an adapter that reads `agent_workspaces`/`agent_runs`/`agent_artifacts`/queue state and posts intents into DevHub.
   - Pros: clean boundary, reusable for SW-5.1 and SW-7.1, easier auditability, keeps human approval gates central.
   - Cons: requires deprecating some legacy Telegram-local assumptions and reshaping status/UI payloads.
   - Effort: High

2. **Keep Telegram as a semi-orchestrator with stricter guardrails** — preserve bridge/tool-calling model but fence off destructive verbs.
   - Pros: lower migration cost, reuses most of the current bot code.
   - Cons: still blurs ownership, keeps `devhub_agent_runs`/local runtime drift, and risks reintroducing orchestration coupling.
   - Effort: Medium

3. **Split adapter and legacy bridge into separate surfaces** — preserve chat UX while introducing a new DevHub-backed adapter API and deprecating the old bridge gradually.
   - Pros: safer migration path, allows parallel validation, reduces blast radius.
   - Cons: temporary duplication, needs explicit contract seams and feature flags.
   - Effort: High

### Recommendation

Use **Approach 3**, but make the end-state explicit: Telegram is only an external adapter/channel over DevHub Swarm, not a planner or executor. Reuse the chat/session persistence pieces, but rewire all useful reads to durable DevHub state and route all writes through DevHub task/workspace/run/artifact/supervisor contracts. Keep legacy LLM-bridge code isolated behind deprecation boundaries, not as the new architecture.

### Required Responsibilities / Non-Responsibilities

**Telegram SHOULD own:** chat transport, chat-to-session mapping, message persistence, presentation/formatting, notification delivery, retry/delivery handling, and user-facing command parsing.

**Telegram MUST NOT own:** orchestration policy, queue selection, task claiming/releasing, git/worktree/filesystem verbs, merge/cleanup side effects, durable execution truth, or approval authority.

### Security and Operational Constraints

- Telegram access MUST be allowlisted and authenticated; token handling must stay secret and rotated.
- Human approval MUST remain mandatory for risky/destructive actions.
- Writes MUST be idempotent and replay-safe; delivery failures cannot duplicate task transitions.
- Chat IDs must map to durable DevHub sessions/runs/tasks, not to ephemeral runtime mirrors.
- Audit trails MUST include who requested what, which durable DevHub entity was touched, and which approval gate was crossed.
- Legacy bridge/provider code should be treated as audit/deprecation targets, especially where it implies function-calling or orchestration authority.

### Contract Seams for SW-5.1 / SW-7.1

- A normalized **Telegram channel snapshot** sourced from DevHub durable state.
- A **Telegram intent envelope** for user actions that only creates/updates DevHub-side records.
- A **delivery/audit interface** for chat notifications, retries, and idempotency keys.
- A **read-only supervisor summary** that UI/Telegram/MCP consumers can render without touching executor-local logs or `devhub_agent_runs`.

### Risks

- Reusing the legacy bridge too broadly will reintroduce orchestration-core behavior.
- Leaving Telegram status derived from local logs will keep drift and false busy/idle signals.
- If approval and replay semantics are not explicit, duplicate actions and unsafe side effects can leak back in.

### Ready for Proposal

Yes — the boundary is clear enough to draft a proposal and then a spec/design that formalizes Telegram as a channel adapter over DevHub Swarm.
