# Apply Progress: SW-6.1 Telegram External Adapter Plan

## Current Slice Focus

- Scope kept inside Telegram adapter boundary.
- Avoided Control Room / MCP shared-surface churn except durable snapshot consumption already used by Telegram status.
- No final verify/checkpoint/commit performed.

## Completed This Apply Batch

- Added durable Telegram adapter persistence in `src/lib/db/localDb.js` for:
  - actor allowlist mappings,
  - idempotent intent envelopes,
  - delivery receipts,
  - subscription records,
  - shared channel snapshot assembly from supervisor/workspace/run/artifact truth.
- Reworked `src/app/api/telegram/status/route.js` to read shared durable snapshot instead of Telegram-local busy/tool heuristics.
- Added degraded-unavailable fallback for Telegram status reads when durable access fails.
- Added Telegram adapter service layer in `telegram-bot/services/external-adapter.js` for:
  - inbound intent normalization,
  - forbidden-verb denial,
  - idempotent accepted intents,
  - pending-approval creation,
  - stale approval denial.
- Extended auth in `telegram-bot/services/auth.js` with durable allowlisted actor resolution.
- Updated realtime helper coverage for degraded snapshot rendering.
- Added bounded MCP helpers in `devhub-mcp/server.js` for:
  - adapter-safe intent recording,
  - approval responses,
  - delivery receipt bookkeeping,
  - subscription writes,
  - shared Telegram channel snapshot reads,
  - explicit forbidden verb rejection for git/worktree/merge/filesystem-adjacent verbs.
- Reworked `src/app/api/telegram/activity/route.js` to serve durable intent + delivery + subscription history instead of `telegram_activity` as source of truth.
- Expanded Telegram snapshot/UI test coverage in:
  - `devhub-mcp/tests/integration/telegram-external-adapter.test.js`,
  - `devhub-mcp/tests/integration/tools-list.test.js`,
  - `tests/unit/telegram-activity-api.test.js`,
  - `tests/unit/telegram-status-api.test.js`,
  - `tests/unit/telegram-monitor-realtime.test.js`.
- Wired adapter-context lookup into `telegram-bot/services/session-bridge.js` so bot-side flows can resolve allowlisted Telegram actors through the durable adapter envelope/outcome path before replying.
- Wired `telegram-bot/services/telegram-persister.js` to stamp persisted bot messages with durable adapter audit/idempotency metadata when an adapter outcome is available.
- Quarantined legacy Telegram orchestration commands (`/spawn`, `/continuar`, `/pausar`, `/reanudar`, `/reset`) behind durable out-of-scope/degraded replies with audit refs instead of local mutations.
- Extended quarantine to `/agente <nombre>` so Telegram no longer mutates local provider/agent selection state and instead emits adapter-bounded denial + audit refs.
- Updated Telegram help/formatter output to describe channel-only behavior and include durable audit/outcome refs in quarantine messaging.
- Tightened help/output copy so `/agente` remains read-only in Telegram help while quarantined mutation paths are no longer advertised.
- Deepened `telegram-persister` durable-first behavior by merging adapter audit/idempotency metadata with existing message metadata instead of overwriting prior channel context.
- Finished adapter-boundary flow coverage in `tests/agenthub/flows/telegram-flow.test.js` so forbidden orchestration commands are denied without creating orchestration-side session state.
- Started `src/views/TelegramMonitor.jsx` migration to shared snapshot/activity fields only.

## TDD Cycle Evidence

| Task slice | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| Durable Telegram adapter records + snapshot assembly | `tests/unit/local-db-telegram-adapter.test.js` | Unit | ✅ `tests/unit/local-db-agent-runs.test.js` passing baseline | ✅ wrote failing tests for actor mapping, idempotency, snapshot assembly | ✅ `npm test -- --runTestsByPath "tests/unit/local-db-telegram-adapter.test.js"` | ✅ happy path + replay/snapshot path | ➖ none needed |
| Shared Telegram status snapshot + degraded fallback | `tests/unit/telegram-status-api.test.js` | Unit | ✅ `tests/unit/telegram-status-api.test.js` passing baseline | ✅ rewrote expectations first for snapshot/degraded behavior | ✅ `npm test -- --runTestsByPath "tests/unit/telegram-status-api.test.js" "tests/unit/telegram-monitor-realtime.test.js"` | ✅ snapshot path + empty path + degraded path | ✅ extracted `buildDegradedStatus()` |
| Adapter intent normalization + approval-safe writes | `telegram-bot/__tests__/external-adapter.test.js` | Unit | ✅ focused root baseline bundle passing | ✅ added failing tests before service existed | ✅ `npm test -- --runTestsByPath "telegram-bot/__tests__/external-adapter.test.js" "telegram-bot/__tests__/auth.test.js"` | ✅ allowed intent + forbidden verb + pending approval + stale approval | ➖ none needed |
| Durable allowlisted actor resolution | `telegram-bot/__tests__/auth.test.js` | Unit | ✅ focused root baseline bundle passing | ✅ wrote allowlist/mismatch tests first | ✅ same command as above | ✅ allowlisted + denied/mismatch cases | ➖ none needed |
| MCP Telegram adapter helpers + tool catalog | `devhub-mcp/tests/integration/telegram-external-adapter.test.js`, `devhub-mcp/tests/integration/tools-list.test.js` | Integration | ✅ `npm test -- --runTestsByPath "tests/integration/tasks.test.js"` in `devhub-mcp/` | ✅ wrote failing MCP coverage first for intent replay, forbidden verbs, snapshot reads, delivery/subscription/approval helpers | ✅ `npm test -- --runTestsByPath "tests/integration/telegram-external-adapter.test.js" "tests/integration/tools-list.test.js"` in `devhub-mcp/` | ✅ replay + forbidden verbs + snapshot + helper write cases | ✅ extracted adapter boundary guard + snapshot helper |
| Durable Telegram activity API | `tests/unit/telegram-activity-api.test.js` | Unit | ✅ `npm test -- --runTestsByPath "tests/unit/telegram-status-api.test.js" "tests/unit/telegram-monitor-realtime.test.js"` | ✅ wrote failing tests first for delivery/subscription history + degraded fallback | ✅ `npm test -- --runTestsByPath "tests/unit/telegram-status-api.test.js" "tests/unit/telegram-monitor-realtime.test.js" "tests/unit/telegram-activity-api.test.js"` | ✅ intent rows + subscription rows + degraded path | ✅ extracted union query helpers |
| Telegram snapshot UI serializers | `tests/unit/telegram-monitor-realtime.test.js` | Unit | ✅ same root telegram safety bundle | ✅ added failing tests first for activity normalization + snapshot badges | ✅ same command as above | ✅ intent normalization + approval/delivery badge cases | ✅ moved serializer logic into shared realtime helper module |
| Session bridge adapter context seam | `tests/unit/telegram-session-adapter.test.js` | Unit | ✅ `npm test -- --runTestsByPath "tests/unit/session-bridge.test.js"` | ✅ wrote failing tests first for allowlisted context resolution + allowlist denial | ✅ `npm test -- --runTestsByPath "tests/unit/telegram-session-adapter.test.js"` | ✅ allowlisted path + denied path | ✅ kept helper isolated from legacy session reuse logic |
| Telegram persister audit metadata | `tests/unit/telegram-persister.test.js` | Unit | ✅ `npm test -- --runTestsByPath "tests/unit/telegram-persister.test.js"` baseline on touched file path | ✅ wrote failing metadata expectations before persister changes | ✅ same command after implementation | ✅ adapter refs + denial metadata | ➖ none needed |
| Legacy command quarantine + adapter-safe help output | `tests/unit/telegram-formatter.test.js`, `tests/agenthub/flows/telegram-flow.test.js`, `tests/agenthub/telegram/basic-commands.test.js` | Unit + Flow | ✅ `npm test -- --runTestsByPath "tests/agenthub/flows/telegram-flow.test.js" "tests/agenthub/telegram/basic-commands.test.js"` | ✅ wrote failing assertions first for out-of-scope replies, help quarantine copy, and no session creation | ✅ `npm test -- --runTestsByPath "tests/unit/telegram-session-adapter.test.js" "tests/unit/telegram-persister.test.js" "tests/unit/telegram-formatter.test.js" "tests/agenthub/flows/telegram-flow.test.js" "tests/agenthub/telegram/basic-commands.test.js"` | ✅ forbidden spawn + quarantined reset + escaped audit refs | ✅ extracted shared quarantine responder |
| Agent mutation quarantine + durable meta merge | `telegram-bot/__tests__/external-adapter.test.js`, `tests/unit/telegram-persister.test.js`, `tests/unit/telegram-formatter.test.js`, `tests/agenthub/telegram/session-commands.test.js` | Unit + Command | ✅ `npm test -- --runTestsByPath "tests/unit/telegram-session-adapter.test.js" "tests/unit/telegram-persister.test.js" "tests/unit/telegram-formatter.test.js" "telegram-bot/__tests__/external-adapter.test.js" "tests/agenthub/telegram/basic-commands.test.js" "tests/agenthub/telegram/session-commands.test.js"` | ✅ wrote failing assertions first for `/agente` mutation denial, merged metadata, and help copy | ✅ `npm test -- --runTestsByPath "telegram-bot/__tests__/external-adapter.test.js" "tests/unit/telegram-persister.test.js" "tests/unit/telegram-formatter.test.js" "tests/agenthub/telegram/session-commands.test.js"` | ✅ `/agente` forbidden path + metadata merge path + read-only help path | ✅ reused quarantine seam instead of adding new bot-local branching |

## Tests Run

- Safety net:
  - `npm test -- --runTestsByPath "tests/unit/local-db-agent-runs.test.js" "tests/unit/telegram-status-api.test.js" "devhub-mcp/tests/integration/tools-list.test.js" "devhub-mcp/tests/integration/supervisor-loop.test.js" "tests/agenthub/flows/telegram-flow.test.js"`
  - Result: root suites passed; `devhub-mcp/tests/integration/*` were not executed by root Jest because root config ignores `devhub-mcp/`.
- RED:
  - `npm test -- --runTestsByPath "tests/unit/telegram-status-api.test.js"`
  - `npm test -- --runTestsByPath "tests/unit/local-db-telegram-adapter.test.js"`
  - `npm test -- --runTestsByPath "telegram-bot/__tests__/external-adapter.test.js"`
- GREEN:
  - `npm test -- --runTestsByPath "tests/unit/local-db-telegram-adapter.test.js"`
  - `npm test -- --runTestsByPath "tests/unit/telegram-status-api.test.js" "tests/unit/telegram-monitor-realtime.test.js"`
  - `npm test -- --runTestsByPath "telegram-bot/__tests__/external-adapter.test.js" "telegram-bot/__tests__/auth.test.js"`
- Focused bundle:
  - `npm test -- --runTestsByPath "tests/unit/local-db-agent-runs.test.js" "tests/unit/local-db-telegram-adapter.test.js" "tests/unit/telegram-status-api.test.js" "tests/unit/telegram-monitor-realtime.test.js" "telegram-bot/__tests__/external-adapter.test.js" "telegram-bot/__tests__/auth.test.js" "tests/agenthub/flows/telegram-flow.test.js"`
- Additional safety net for MCP batch:
  - `npm test -- --runTestsByPath "tests/integration/tasks.test.js"` (workdir `devhub-mcp/`)
- Additional RED/GREEN cycle this batch:
  - `npm test -- --runTestsByPath "tests/unit/telegram-status-api.test.js" "tests/unit/telegram-monitor-realtime.test.js" "tests/unit/telegram-activity-api.test.js"`
  - `npm test -- --runTestsByPath "tests/integration/telegram-external-adapter.test.js" "tests/integration/tools-list.test.js"` (workdir `devhub-mcp/`)
- Safety net for current batch:
  - `npm test -- --runTestsByPath "tests/unit/session-bridge.test.js" "tests/unit/telegram-chat-formatting.test.js" "tests/unit/telegram-chat-progress.test.js" "telegram-bot/__tests__/external-adapter.test.js" "tests/agenthub/flows/telegram-flow.test.js" "tests/agenthub/telegram/basic-commands.test.js"`
- RED/GREEN current batch:
  - `npm test -- --runTestsByPath "tests/unit/telegram-session-adapter.test.js" "tests/unit/telegram-persister.test.js" "tests/unit/telegram-formatter.test.js" "tests/agenthub/flows/telegram-flow.test.js" "tests/agenthub/telegram/basic-commands.test.js"`
  - `npm test -- --runTestsByPath "tests/unit/session-bridge.test.js" "telegram-bot/__tests__/external-adapter.test.js" "tests/unit/telegram-session-adapter.test.js" "tests/unit/telegram-persister.test.js" "tests/unit/telegram-formatter.test.js" "tests/agenthub/flows/telegram-flow.test.js" "tests/agenthub/telegram/basic-commands.test.js" "tests/agenthub/telegram/session-commands.test.js"`
- Additional RED/GREEN cycle this batch:
  - `npm test -- --runTestsByPath "telegram-bot/__tests__/external-adapter.test.js" "tests/unit/telegram-persister.test.js" "tests/unit/telegram-formatter.test.js" "tests/agenthub/telegram/session-commands.test.js"`
  - `npm test -- --runTestsByPath "tests/unit/telegram-session-adapter.test.js" "tests/unit/telegram-persister.test.js" "tests/unit/telegram-formatter.test.js" "telegram-bot/__tests__/external-adapter.test.js" "tests/agenthub/telegram/basic-commands.test.js" "tests/agenthub/telegram/session-commands.test.js"`

## Files Touched

- `src/lib/db/localDb.js`
- `src/app/api/telegram/status/route.js`
- `src/app/api/telegram/activity/route.js`
- `src/views/TelegramMonitor.jsx`
- `src/views/telegramMonitorRealtime.js`
- `tests/unit/local-db-telegram-adapter.test.js`
- `tests/unit/telegram-activity-api.test.js`
- `tests/unit/telegram-status-api.test.js`
- `tests/unit/telegram-monitor-realtime.test.js`
- `devhub-mcp/server.js`
- `devhub-mcp/tests/integration/telegram-external-adapter.test.js`
- `devhub-mcp/tests/integration/tools-list.test.js`
- `telegram-bot/services/external-adapter.js`
- `telegram-bot/services/auth.js`
- `telegram-bot/services/session-bridge.js`
- `telegram-bot/services/telegram-persister.js`
- `telegram-bot/services/command-quarantine.js`
- `telegram-bot/services/formatter.js`
- `telegram-bot/commands/agente.js`
- `telegram-bot/commands/spawn.js`
- `telegram-bot/commands/continuar.js`
- `telegram-bot/commands/pausar.js`
- `telegram-bot/commands/reanudar.js`
- `telegram-bot/commands/reset.js`
- `telegram-bot/__tests__/external-adapter.test.js`
- `telegram-bot/__tests__/auth.test.js`
- `tests/unit/telegram-session-adapter.test.js`
- `tests/unit/telegram-persister.test.js`
- `tests/unit/telegram-formatter.test.js`
- `tests/agenthub/telegram/basic-commands.test.js`
- `tests/agenthub/telegram/session-commands.test.js`

## Remaining Work

- Task 2.2 still incomplete: `session-bridge.js` and `telegram-persister.js` now expose reusable adapter seams and audit metadata, but the broader chat/auth execution path is not fully migrated to adapter envelopes end-to-end.
- Task 2.3 partial only: legacy command quarantine now covers `/spawn`, `/continuar`, `/pausar`, `/reanudar`, `/reset`, and `/agente <nombre>`, but provider modules remain untouched to avoid broader shared-surface churn.
- Task 3.3 partial only: serializer helpers are migrated, but `TelegramMonitor.jsx` still needs a cleanup pass and targeted UI test before marking done.
- Task 3.4 partial only: formatter/help quarantine messaging now emits durable audit/outcome refs and merged message metadata, but `telegram-bot/bot.js` and non-quarantined outbound flows still need a durable-first pass.
- Docs intentionally deferred to reduce parallel-session conflict risk.

## Risks / Notes

- Root `npm test` does NOT execute `devhub-mcp/` integration suites because root Jest ignores that folder. Real MCP adapter coverage must run from `devhub-mcp/` package test command later.
- `src/app/api/telegram/status/route.js` now intentionally logs durable-read failures and returns degraded data with HTTP 200; verify phase should treat the console error in the degraded-path unit test as expected behavior.
- `src/app/api/telegram/activity/route.js` now intentionally logs durable-read failures and returns degraded data with HTTP 200; same verify note applies.
- `src/views/TelegramMonitor.jsx` was started but NOT fully stabilized in this batch; because SW-7.1A/SW-5.1A touch nearby surfaces, safest move was to stop before broader UI churn and leave task 3.3 partial.
- Quarantine coverage intentionally avoids `telegram-bot/services/providers/*.js` in this batch because that surface still overlaps legacy fallback/chat behavior and risks conflict with adjacent slices; leave explicit follow-up for 2.3/3.4.
- `/agente` is now split: read path preserved, mutation path quarantined. Any future provider-level cleanup must keep that read-only contract unless the spec changes.
