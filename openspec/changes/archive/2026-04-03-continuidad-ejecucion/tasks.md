# Tasks: Continuidad de Ejecución

> **Spec refs**: REQ-1 through REQ-8, SC-1 through SC-16
> **Design refs**: AD-1 through AD-8, Section 2 (Component Design), Section 4 (Data Model)

## Phase 1: Permission Deadlock Fix (Critical Bug — Prerequisite)

> Addresses: REQ-6, REQ-2 (partial), SC-8, SC-2, SC-3, SC-14, SC-15, SC-16
> ⚠️ **DEPLOY FIRST** — fixes the SSE hang that blocks all multi-turn work

- [x] 1.1 Add `signal` (AbortSignal) option to `sendMessage()` in `opencode.js` — pass `options.signal` to the SSE `fetch()` call (~line 533) — [Design AD-7]
- [x] 1.2 Handle `AbortError` in `sendMessage()` catch block (~line 700) — log as debug, reject cleanly — [Design §2.5 Phase 2.5]
- [x] 1.3 Create `createSimpleApprovalHandler(sessionId, agentName, chatId)` in `executor.js` — deny-list auto-approve/reject with `logAgentEvent()` logging — [REQ-6, Design §7.1]
- [x] 1.4 Wire `onApproval: createSimpleApprovalHandler(...)` into `runOpenCodeHeadless()` in `chat.js` (~lines 252-262) — [REQ-6, SC-8]
- [ ] 1.5 Test: send message triggering file write permission — verify auto-approve, no hang — [SC-2, SC-8]
- [ ] 1.6 Test: verify `permission_decision` events appear in `agent_logs` — [REQ-2]

## Phase 2: Executor Service Foundation

> Addresses: REQ-1, REQ-7, REQ-8, SC-10, SC-11

- [x] 2.1 Create `telegram-bot/services/executor.js` with `MultiTurnExecutor` class — constructor with `bot`, `tasks` Map, options (denyList, completionKeywords, progressIntervalMs=600000) — [Design §2.1]
- [x] 2.2 Implement `TaskState` shape and in-memory `Map<chatId, TaskState>` registry — [Design §2.1 TaskState]
- [x] 2.3 Implement `hasActiveTask(chatId)` — checks Map for status `running` — [Design §5.5]
- [x] 2.4 Implement `hasPausedTask(chatId)` — queries DB for session status `paused` — [REQ-5]
- [x] 2.5 Implement `getTaskState(chatId)` — returns current task state — [REQ-7]
- [x] 2.6 Add `TELEGRAM_MULTI_TURN` feature flag in `chat.js` (default `true`, bypass executor when `false`) — [REQ-8, SC-10]
- [x] 2.7 Add `isMultiTurnTask(text)` heuristic in `chat.js` — length >100 chars OR SDD keywords (implement, create, following, build, fix, refactor, sdd) — [REQ-1, SC-1]
- [ ] 2.8 Test: `TELEGRAM_MULTI_TURN=false` bypasses executor, uses single-turn path — [SC-10]

## Phase 3: Approval Handler & Deny-List (Executor)

> Addresses: REQ-2, SC-2, SC-3, SC-14, SC-15, SC-16

- [x] 3.1 Implement `_createApprovalHandler(taskState)` — returns `onApproval` callback with deny-list check — [Design §2.2]
- [x] 3.2 Implement `_checkDenyList(action, denyList)` — case-insensitive substring matching — [Design §2.2]
- [x] 3.3 Configure deny-list: `sudo`, `rm -rf /`, `/etc/`, `/root/`, `chmod 777 /` — [REQ-2]
- [x] 3.4 Send Telegram notification on auto-reject: `⚠️ Permiso rechazado: {action} (comando no permitido)` — [SC-3, SC-16]
- [x] 3.5 Log all permission decisions via `logAgentEvent()` with `event_type='permission_decision'` — [REQ-2]
- [ ] 3.6 Test: `write_file` within project dir → auto-approved — [SC-2]
- [ ] 3.7 Test: `sudo apt-get update` → auto-rejected with Telegram notification — [SC-3]
- [ ] 3.8 Test: `git add/commit` and `npm install` → auto-approved — [SC-14, SC-15]

## Phase 4: Multi-Turn Execution Loop

> Addresses: REQ-1, REQ-4, SC-1, SC-4

- [x] 4.1 Implement `startMultiTurn(chatId, agent, prompt, options)` — resolve session via session-bridge, create TaskState, send start notification, enter loop — [REQ-1, SC-1]
- [x] 4.2 Implement `_runTurn(taskState, prompt)` — call `opencode.sendMessage()` with `onApproval`, `signal` (AbortController), `onEvent`, `cwd` — [Design §2.1]
- [x] 4.3 Implement main loop: after each turn reaches `idle`, call `_evaluateCompletion()` → if not complete, send continuation message — [REQ-1, SC-1]
- [x] 4.4 Implement `_evaluateCompletion(taskState, output, events)` — keyword match + no-tools-called + minimal output heuristic — [Design §2.4]
- [x] 4.5 Wire executor in `runOpenCodeHeadless()`: if `USE_MULTI_TURN && isMultiTurnTask(text)` → `executor.startMultiTurn()` — [REQ-1, REQ-8]
- [x] 4.6 Log lifecycle events: `multiturn_start`, `multiturn_turn_complete`, `multiturn_complete`, `multiturn_error` — [Design §4.3]
- [ ] 4.7 Test: long SDD task executes 3+ turns in same OpenCode session — [SC-1]
- [ ] 4.8 Test: no timeout triggers regardless of duration — [REQ-4]

## Phase 5: Progress Notifications

> Addresses: REQ-3, SC-4

- [x] 5.1 Implement `_startProgressInterval(taskState)` — `setInterval` every 10 min, checks status before sending — [REQ-3]
- [x] 5.2 Implement `_stopProgressInterval(taskState)` — `clearInterval` and cleanup — [REQ-5]
- [x] 5.3 Implement `_sendProgressSummary(taskState)` — elapsed time, turn count, tools executed since last summary — [REQ-3, SC-4]
- [x] 5.4 Track `toolsExecuted` Map in TaskState — increment on `tool.start`/`tool.execute` events — [REQ-3, Design TaskState]
- [ ] 5.5 Test: 15+ minute task → progress notifications at T=10min and T=20min — [SC-4]
- [ ] 5.6 Test: progress notifications don't block or interrupt SSE loop — [REQ-3]

## Phase 6: Start/End Notifications

> Addresses: REQ-3, SC-1

- [x] 6.1 Implement `_sendStartNotification(taskState, prompt)` — emoji, agent name, prompt (truncated 200 chars), session ID — [REQ-3]
- [x] 6.2 Implement `_sendEndNotification(taskState)` — final status, duration, turn count, tools summary — [REQ-3]
- [x] 6.3 Wire start notification at beginning of `startMultiTurn()` — [SC-1]
- [x] 6.4 Wire end notification on loop completion, cancellation, and error paths — [SC-1]
- [ ] 6.5 Test: verify start notification format — [SC-1]
- [ ] 6.6 Test: verify end notification includes correct turn count and duration — [SC-1]

## Phase 7: Session Control (Pause/Resume/Interrupt)

> Addresses: REQ-5, SC-5, SC-6, SC-7, SC-9

- [x] 7.1 Implement `pauseTask(chatId)` — status `cancelling`, `abortController.abort()`, clear interval, DB status `paused`, Telegram confirmation — [REQ-5, SC-5]
- [x] 7.2 Implement `resumeTask(chatId)` — DB status `busy`, new AbortController, new SSE reader (not reused), "continue" message, restart loop — [REQ-5, SC-6, SC-9]
- [x] 7.3 Implement `cancelTask(chatId, reason)` — abort SSE, clear interval, remove from Map, update DB, log `multiturn_cancelled` — [Design §5.5, SC-7]
- [x] 7.4 Modify `/pausar` (`pausar.js`) — check `executor.hasActiveTask(chatId)` → `pauseTask()`, else fallback `db.pauseAgent()` — [REQ-5, SC-5, SC-12]
- [x] 7.5 Modify `/reanudar` (`reanudar.js`) — check paused session → `resumeTask()`, else fallback `db.resumeAgent()` — [REQ-5, SC-6, SC-13]
- [x] 7.6 Handle user interruption in `bot.js` message handler — check `hasActiveTask()`, cancel, notify, process new message — [REQ-5, SC-7]
- [x] 7.7 Update session status via `db-bridge.updateSessionStatus()` for all transitions (busy, paused, completed, error) — [REQ-5, Design §4.2]
- [ ] 7.8 Test: pause mid-execution → SSE cancelled, interval cleared, DB=`paused`, "⏸️ Ejecución pausada después de X turnos (Y minutos)" — [SC-5]
- [ ] 7.9 Test: resume after pause → new SSE reader, "continue" message, "▶️ Ejecución reanudada (turno N)" — [SC-6, SC-9]
- [x] 7.10 Test: new text message during active task → old task cancelled, new message processed — [SC-7]
- [x] 7.11 Test: `/pausar` with no active session → DB-only fallback — [SC-12]
- [x] 7.12 Test: `/reanudar` with no paused session → DB-only fallback — [SC-13]

## Phase 8: Database & State Persistence

> Addresses: REQ-5, SC-5, SC-6

- [x] 8.1 Verify `agent_hub_sessions.status` column supports: `active`, `busy`, `paused`, `completed`, `error` — ensured via `ensureMultiTurnColumns()` in db-bridge.js — [REQ-5, Design §4.2]
- [x] 8.2 Add `updateSessionTaskState(sessionId, turnCount, lastActivity)` to `db-bridge.js` — [REQ-5]
- [x] 8.3 Wire DB status updates in executor: `busy` on start, `paused` on pause, `completed` on finish, `error` on failure — [Design §4.2]
- [x] 8.4 Wire `updateSessionTaskState` after each turn in `_runLoop()` — [REQ-5]
- [x] 8.5 Fix `cancelTask()` to use `'paused'` for user cancellation, `'error'` only for bot shutdown — [REQ-5]
- [ ] 8.4 Test: session transitions `active → busy → completed` — [SC-5]
- [ ] 8.5 Test: all multi-turn event types appear in `agent_logs` — [Design §4.3]

## Phase 9: Executor Singleton & Bot Integration

> Addresses: REQ-7, AD-4

- [x] 9.1 Instantiate `MultiTurnExecutor` singleton in `bot.js` — `const executor = new MultiTurnExecutor(bot, { ... })` — [Design AD-4]
- [x] 9.2 Export executor via getter pattern (`getExecutor()`) to avoid circular dependencies — [Design AD-4]
- [x] 9.3 Wire executor cleanup on SIGINT/SIGTERM — cancel all active tasks, clear intervals — [Design §1 Key Decisions]
- [ ] 9.4 Test: executor singleton shared between `chat.js`, `pausar.js`, `reanudar.js` — [AD-4]
- [ ] 9.5 Test: bot shutdown gracefully cancels all active tasks — [Design §1]

## Phase 10: End-to-End Verification

> Addresses: All success criteria from proposal

- [ ] 10.1 Full SDD cycle: "Implement user authentication following SDD workflow" → proposal → design → spec → tasks → implement across 3+ turns — [SC-1]
- [ ] 10.2 Single-turn backward compat: short message with `TELEGRAM_MULTI_TURN=true` → single-turn path — [REQ-8]
- [ ] 10.3 Feature flag rollback: `TELEGRAM_MULTI_TURN=false` → single-turn, no executor — [SC-10]
- [ ] 10.4 Concurrent chats: two chat IDs start multi-turn simultaneously → independent sessions, independent progress — [SC-11]
- [ ] 10.5 SSE disconnect recovery: simulate network drop → evaluate completion, retry if needed — [Design §5.1]
- [ ] 10.6 OpenCode server crash → task status `error`, end notification sent — [Design §5.3]
- [ ] 10.7 No regressions: `/estado`, `/tareas`, `/agentes`, `/help` work unchanged — [Success Criteria]
- [ ] 10.8 No permission deadlocks: task with multiple permission requests → all handled, no SSE hangs — [Success Criteria]
