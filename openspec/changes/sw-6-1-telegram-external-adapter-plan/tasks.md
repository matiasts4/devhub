# Tasks: SW-6.1 Telegram External Adapter Plan

## Phase 1: Contract & schema foundation

- [x] 1.1 RED — Add failing contract coverage in `devhub-mcp/tests/integration/telegram-external-adapter.test.js`, `tests/unit/telegram-status-api.test.js`, and `tests/agenthub/flows/telegram-flow.test.js` for allowlisted intents, forbidden verbs, degraded reads, and idempotent replays.
- [x] 1.2 GREEN — Extend `src/lib/db/localDb.js` with durable adapter records for actor mapping, intent envelopes, approval checkpoints, delivery receipts, subscriptions, and `ChannelSupervisorSnapshot` projections anchored to DevHub task/workspace/run/artifact truth.
- [x] 1.3 GREEN — Add bounded adapter helpers in `devhub-mcp/server.js` for status/detail reads, approval responses, retry receipts, and subscription writes; reject git/worktree/merge/filesystem verbs at the boundary.

## Phase 2: Inbound intents and approval gates

- [ ] 2.1 RED — Add failing adapter-service tests in `telegram-bot/__tests__/executor.test.js` and `telegram-bot/__tests__/external-adapter.test.js` for actor allowlist mapping, idempotency keys, pending approvals, stale approval rejection, and audit outcomes.
- [ ] 2.2 GREEN — Refactor `telegram-bot/services/session-bridge.js`, `telegram-bot/services/telegram-persister.js`, and `telegram-bot/services/auth.js` to normalize inbound envelopes, map Telegram actors to DevHub identities, persist audit/idempotency anchors, and create approval checkpoints instead of direct mutations.
- [ ] 2.3 GREEN — Quarantine Telegram-local orchestration in `telegram-bot/commands/{agente,spawn,reanudar,pausar,continuar,reset}.js` and `telegram-bot/services/providers/*.js`, leaving only adapter-safe reads, approval responses, retries, and subscription flows.

## Phase 3: Shared read models and outbound rendering

- [ ] 3.1 RED — Add parity tests in `tests/unit/telegram-monitor-realtime.test.js`, `tests/e2e/telegram-web-sync.test.js`, and `devhub-mcp/tests/integration/channel-supervisor-snapshot.test.js` proving Telegram, UI, and MCP render the same durable snapshot and degraded state.
- [x] 3.2 GREEN — Rework `src/app/api/telegram/status/route.js` and `src/app/api/telegram/activity/route.js` to serve shared `ChannelSupervisorSnapshot` and delivery history instead of `agent_logs`, `telegram_sessions`, or other Telegram-local truth.
- [ ] 3.3 GREEN — Update `src/views/TelegramMonitor.jsx`, `src/views/telegramMonitorRealtime.js`, and MCP-facing snapshot serializers in `devhub-mcp/server.js` to consume shared supervisor, approval, evidence, and delivery fields only.
- [ ] 3.4 GREEN — Wire outbound Telegram formatting in `telegram-bot/services/formatter.js` and `telegram-bot/bot.js` to render durable outcome/audit refs and degraded-state messaging without local busy heuristics.

## Phase 4: Boundary cleanup & docs

- [ ] 4.1 GREEN — Rewrite `docs/13_Telegram_LLM_Bridge.md`, `docs/review/MODULO-06-telegram-bot.md`, `docs/23_Swarm_Workspace_Intencion_y_Roadmap.md`, `docs/user/02_SwarmControl_Explained.md`, and `telegram-bot/README.md` to retire Telegram-local truth/orchestration claims and document external-adapter limits plus SW-5.1/SW-7.1 snapshot reuse.
- [ ] 4.2 GREEN — Remove or clearly deprecate stale Telegram surfaces in `src/app/api/telegram/status/route.js`, `src/views/TelegramMonitor.jsx`, and `telegram-bot/services/providers/*.js` so no doc or UI path advertises Telegram as control-plane authority.

## Phase 5: Verification & rollout anchors

- [ ] 5.1 REFACTOR — Add rollout coverage in `tests/integration/telegram-opencode.test.js` and `tests/agenthub/flows/telegram-no-hang.test.js` for read-only-first enablement, approval callback dedupe, retry bookkeeping, and forbidden-verb denials.
- [ ] 5.2 REFACTOR — Update `docs/23_Swarm_Workspace_Intencion_y_Roadmap.md`, `docs/user/02_SwarmControl_Explained.md`, and `telegram-bot/README.md` with secure rollout order, stale-surface retirement checklist, and verification evidence anchors.
