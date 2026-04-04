# Spec: Continuidad de Ejecución

## Requirements

### REQ-1: Multi-Turn Execution Loop

The system SHALL support sending multiple sequential messages to the same OpenCode session within a single user task. Each message SHALL reuse the same `opencode_session_id` to maintain conversation context. The executor service (`telegram-bot/services/executor.js`) SHALL orchestrate the loop: receive an initial prompt, send the first message via `opencode.sendMessage()`, detect when OpenCode returns to `idle` (via `session.status` SSE event with `status.type === 'idle'`), evaluate whether the task is complete or needs continuation, and if continuation is needed, send the next message reusing the same session.

The loop SHALL continue until one of the following conditions is met: (a) the agent indicates task completion naturally (idle with no pending actions), (b) the user interrupts with `/pausar` or sends a new message, or (c) a system error occurs that cannot be recovered from.

The system SHALL maintain an in-memory task registry keyed by `chatId` tracking: SSE abort function, progress interval ID, turn counter, session info, and current status.

### REQ-2: Permission Auto-Approval with Deny-List

The system SHALL pass an `onApproval` callback to every `opencode.sendMessage()` call for multi-turn execution. The callback SHALL analyze the permission request's `action` and `tool` properties (from `permission.asked` or `require.approval` SSE events) and auto-approve or auto-reject based on a deny-list policy.

The system SHALL auto-approve by default when the permission request does NOT match any entry in the deny-list. The deny-list SHALL include at minimum: `sudo` commands, `rm -rf /` or equivalent recursive system deletions, access to `/etc` system configuration, access to `/root` home directory, and any operation targeting paths outside the project working directory (`cwd`).

The system SHALL log every permission decision (approve or reject) to the `agent_logs` table via `logAgentEvent()` with `event_type='permission_decision'`, including the action, tool, decision result (approved/rejected), reason, and timestamp.

### REQ-3: Telegram Notifications (Start/End/Progress)

The system SHALL send a Telegram notification when a multi-turn task begins. The notification SHALL include: task indicator emoji, agent name, initial prompt (truncated to 200 characters), and session ID.

The system SHALL send a Telegram notification when the task completes (either naturally or by user cancellation). The notification SHALL include: final status (completed/cancelled/error), total duration, turn count, and summary of tools executed.

The system SHALL send a progress summary every 10 minutes during active execution. Progress notifications SHALL contain: elapsed time, number of turns completed, tools executed since last update, and current session status. Progress notifications SHALL NOT interrupt or block the SSE execution loop — they SHALL be sent as independent Telegram messages via `bot.sendMessage()`.

### REQ-4: No Time or Iteration Limits

The system SHALL NOT impose any timeout, max execution duration, or max iteration limit on multi-turn tasks. Tasks SHALL run until they complete naturally or the user manually intervenes. The system SHALL NOT abort a session based on elapsed time alone. The agent SHALL work until the task is naturally complete, regardless of duration (5 minutes or 50).

The system SHALL allow the user to manually cancel execution at any time using `/pausar` or by sending a new message.

### REQ-5: Session Control (Pause/Resume/Interrupt)

The `/pausar` command SHALL cancel the active SSE reader loop for the current chat's session via `reader.cancel()`, update the session status to `paused` in `agent_hub_sessions` (SQLite), clear the progress notification interval, and send a confirmation to Telegram. If no active multi-turn session exists for the chat, `/pausar` SHALL fall back to the existing DB-only behavior (pausing agents by `db.pauseAgent()`).

The `/reanudar` command SHALL resume execution by sending a "continue" message to the same OpenCode session, updating the session status to `busy` in `agent_hub_sessions`, restarting the multi-turn loop, and sending a confirmation to Telegram. If no paused session exists for the chat, `/reanudar` SHALL fall back to the existing DB-only behavior (resuming agents by `db.resumeAgent()`).

The system SHALL persist task state (turn count, last activity timestamp, session status, `opencode_session_id`) to SQLite. The `agent_hub_sessions` table SHALL support status values: `active`, `busy`, `paused`, `completed`, `error`.

If the SSE reader is corrupted, cancelled, or stale on resume, the system SHALL create a new reader via `fetch(.../event).body.getReader()` instead of reusing the cancelled one. The new reader SHALL reconnect to the OpenCode event stream and continue processing events for the same `opencode_session_id`.

The system SHALL allow the user to interrupt an active multi-turn task by sending a new text message (not a command), which SHALL cancel the current loop, update the session status, and begin processing the new message as a fresh task.

### REQ-6: Permission Deadlock Fix (Prerequisite Bugfix)

The `runOpenCodeHeadless()` function in `telegram-bot/commands/chat.js` SHALL pass an `onApproval` callback to `opencode.sendMessage()`. Currently, this callback is NOT passed (line ~256-262), which causes the SSE stream to hang indefinitely when OpenCode requests permission, because the `permission.asked` event is emitted but no handler responds.

The system SHALL auto-approve permissions by default when no explicit deny-list match is found. This prevents the SSE stream from blocking on unhandled permission requests.

All permission decisions SHALL be recorded in the `agent_logs` table via `logAgentEvent()` with `event_type='permission_decision'` for auditability.

### REQ-7: Executor Service Architecture

A new service file `telegram-bot/services/executor.js` SHALL be created as the multi-turn execution orchestrator. The executor SHALL expose the following interface:

- `startMultiTurn(chatId, agent, prompt, options)`: Starts the multi-turn loop. Returns a task handle.
- `pauseTask(chatId)`: Cancels the active SSE loop for the chat's session.
- `resumeTask(chatId)`: Resumes the multi-turn loop for the chat's session.
- `getTaskState(chatId)`: Returns the current task state (turn count, status, last activity).

The executor SHALL integrate with `session-bridge.js` to resolve sessions and with `opencode.js` to send messages. The executor SHALL use the existing `logAgentEvent()` from `activityLogger.js` for all logging.

### REQ-8: Feature Flag for Rollback

The system SHALL use a feature flag `TELEGRAM_MULTI_TURN` (default: `true`) to enable or disable the multi-turn execution loop. When set to `false`, the system SHALL fall back to single-turn behavior via the existing `runOpenCodeHeadless()` path. The executor service SHALL be bypassed entirely when the flag is `false`.

## Scenarios

### SC-1: User sends a long task (SDD full cycle)

**Given** the user sends a complex multi-step task: "Implement the user authentication feature following SDD workflow"
**When** the executor detects this as a multi-turn task (heuristic: length > 100 chars or SDD keywords like "implement", "create", "following")
**Then** a start notification is sent to Telegram with task details
**And** the first message is sent to OpenCode with the full prompt and a new `opencode_session_id`
**And** the agent begins executing (creating proposal, design, specs, tasks)
**And** each time the agent returns to `idle` (via `session.status` SSE event), the executor evaluates if the SDD cycle is complete
**And** if not complete, the executor sends the next instruction reusing the same `opencode_session_id`
**And** this cycle repeats for 3+ turns until natural completion
**And** progress notifications are sent every 10 minutes
**And** when the full cycle completes, an end notification is sent with summary
**And** no timeout is triggered regardless of total duration

### SC-2: Agent requests permission to write a file

**Given** the agent is executing and needs to write `openspec/changes/new-feature/proposal.md`
**When** OpenCode emits a `permission.asked` event with action `write_file`
**Then** the `onApproval` callback evaluates the action against the deny-list
**And** since `write_file` within the project directory is NOT in the deny-list
**Then** the permission is auto-approved via the OpenCode permissions API endpoint
**And** the decision is logged to `agent_logs` with `event_type='permission_decision'`, `status='ok'`, and metadata `{ action: 'write_file', decision: 'approved', reason: 'not in deny-list' }`
**And** the agent continues execution without user intervention

### SC-3: Agent requests sudo permission

**Given** the agent attempts to execute `sudo apt-get update` during a task
**When** OpenCode emits a `permission.asked` event with action containing `sudo`
**Then** the `onApproval` callback detects the `sudo` prefix matches the deny-list
**And** the permission is auto-rejected via the OpenCode permissions API
**And** the decision is logged to `agent_logs` with `event_type='permission_decision'`, `status='error'`, and metadata `{ action: 'sudo apt-get update', decision: 'rejected', reason: 'deny-list: sudo command' }`
**And** a Telegram notification is sent to the user: "⚠️ Permiso rechazado: sudo apt-get update (comando no permitido)"
**And** the agent receives the rejection and continues (or handles the error)

### SC-4: Task runs for 15+ minutes without timeout

**Given** a multi-turn task has been running for 15 minutes
**When** the 10-minute progress interval fires at T=10min
**Then** a progress notification is sent: "📊 Progreso: 10 min transcurridos, 3 turnos, herramientas: read_file (x5), write_file (x3), bash (x2)"
**And** the SSE loop continues uninterrupted
**When** the 10-minute progress interval fires again at T=20min
**Then** another progress notification is sent with updated stats
**And** no timeout occurs at any point
**And** the task continues until natural completion

### SC-5: User pauses execution mid-task

**Given** a multi-turn task is actively executing for chat ID `12345` with an active SSE reader
**When** the user sends the `/pausar` command
**Then** the executor looks up the active task for `chatId=12345`
**And** calls the SSE abort function to cancel the reader via `reader.cancel()`
**And** clears the progress notification interval
**And** updates `agent_hub_sessions` status to `paused` with current `turn_count` and `last_activity`
**And** sends "⏸️ Ejecución pausada después de X turnos (Y minutos)" to Telegram
**And** the OpenCode session remains alive (not destroyed)

### SC-6: User resumes after pause

**Given** a session is in `paused` status for chat ID `12345` with `turn_count=5`
**When** the user sends the `/reanudar` command
**Then** the executor looks up the paused session
**And** updates `agent_hub_sessions` status to `busy`
**And** creates a new SSE reader via `fetch(.../event).body.getReader()` (not reusing the old one)
**And** sends a "continue" message to the same `opencode_session_id` with context about where it left off
**And** restarts the multi-turn loop from turn 6
**And** restarts the progress notification interval
**And** sends "▶️ Ejecución reanudada (turno 6)" to Telegram

### SC-7: User interrupts with a new message

**Given** a multi-turn task is actively executing for chat ID `12345`
**When** the user sends a new text message (not a command)
**Then** the executor detects the active task for this chat
**And** cancels the current SSE loop
**And** clears the progress notification interval
**And** removes the task from the in-memory registry
**And** processes the new message as a fresh single-turn or multi-turn request
**And** optionally notifies the user: "⚠️ Tarea anterior cancelada. Procesando nuevo mensaje..."

### SC-8: Permission deadlock fix prevents hang

**Given** the current codebase where `runOpenCodeHeadless()` does NOT pass `onApproval` to `sendMessage()` (lines ~256-262)
**When** an agent requests permission during execution
**Then** the SSE stream hangs indefinitely (current bug — DEADLOCK)
**After the fix is applied:**
**And** `runOpenCodeHeadless()` passes `onApproval` to `sendMessage()`
**And** the agent requests permission during execution
**Then** the `onApproval` callback auto-approves the request
**And** the SSE stream continues without hanging
**And** the task completes successfully

### SC-9: SSE reader corruption handled on resume

**Given** a session was paused and its SSE reader was cancelled
**When** the user sends `/reanudar`
**Then** a brand new SSE reader is created via `fetch(.../event).body.getReader()`
**And** the old cancelled reader is NOT reused
**And** the new reader processes events for the same `opencode_session_id`
**And** execution continues without data loss or duplicate processing

### SC-10: Feature flag disables multi-turn

**Given** the environment variable `TELEGRAM_MULTI_TURN` is set to `false`
**When** a user sends a message that would trigger multi-turn execution
**Then** the executor is bypassed entirely
**And** the message is processed as a single-turn request via the existing `runOpenCodeHeadless()` path
**And** the behavior is identical to the pre-multi-turn implementation
**And** no multi-turn loop is started

### SC-11: Concurrent chats maintain independent sessions

**Given** two different Telegram chats (`chatId=12345` and `chatId=67890`) each start a multi-turn task
**When** both tasks are running simultaneously
**Then** each chat has its own entry in the executor's in-memory task registry
**And** each chat has its own SSE reader and progress interval
**And** pausing one chat's task does NOT affect the other
**And** progress notifications are sent independently to each chat

### SC-12: /pausar falls back when no active session

**Given** no multi-turn session is active for the chat
**When** the user sends `/pausar`
**Then** the existing DB-only behavior executes (pausing agents by `db.pauseAgent()`)
**And** the user receives the existing confirmation message

### SC-13: /reanudar falls back when no paused session

**Given** no session is in `paused` status for the chat
**When** the user sends `/reanudar`
**Then** the existing DB-only behavior executes (resuming agents by `db.resumeAgent()`)
**And** the user receives the existing confirmation message

### SC-14: Git operations are auto-approved

**Given** the agent requests permission to run `git add`, `git commit`, or `git diff`
**When** the `onApproval` callback evaluates the request
**Then** the permission is auto-approved (git operations are NOT in the deny-list)
**And** the decision is logged to `agent_logs`

### SC-15: npm install is auto-approved

**Given** the agent requests permission to run `npm install` or equivalent package installation
**When** the `onApproval` callback evaluates the request
**Then** the permission is auto-approved
**And** the decision is logged to `agent_logs`

### SC-16: System file deletion is auto-rejected

**Given** the agent requests permission to execute `rm -rf /` or delete files in `/etc` or `/root`
**When** the `onApproval` callback evaluates the request
**Then** the action matches the deny-list (system path or destructive pattern detected)
**And** the permission is auto-rejected
**And** the decision is logged to `agent_logs` with `status='error'`
**And** a notification is sent to the user via Telegram
