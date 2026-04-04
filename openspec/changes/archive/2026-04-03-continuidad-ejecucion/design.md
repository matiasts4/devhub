# Design: Continuidad de Ejecución — Multi-Turn Autonomous Agent Execution

## 1. Architecture Overview

### Current State (Problem)

```
User Message → chat.js → runOpenCodeHeadless() → opencode.sendMessage()
                                                    ↓
                                              Single SSE loop
                                                    ↓
                                    [permission.asked] → NO onApproval → DEADLOCK
                                                    ↓
                                    session.status=idle → resolve → FIN
```

The current flow is single-turn: one message, one SSE loop, one response. The `onApproval` callback is never passed to `sendMessage()`, causing the SSE stream to hang indefinitely when OpenCode requests permission.

### Target State (Multi-Turn)

```
User Message → chat.js → isMultiTurnTask()?
                              │
                    ┌─────────┴─────────┐
                    YES                 NO
                    │                   │
              Executor.startMultiTurn()  runOpenCodeHeadless() (existing)
                    │
          ┌─────────┼──────────────┐
          │         │              │
    sendMessage()  Progress      Pause/Resume
    (turn N)      Notifier      Controls
          │         │              │
    onApproval → Auto-approve/reject
          │
    session.status=idle → Evaluate completion
          │
    ┌─────┴─────┐
    YES         NO (continue)
    │           │
  Complete   sendMessage() (turn N+1)
    │           │
  Notify     ...loop continues...
  User
```

### Component Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Telegram Bot (bot.js)                       │
│                                                                     │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌───────────────┐ │
│  │ chat.js  │    │ pausar.js│    │reanudar.js│   │ ...commands   │ │
│  └────┬─────┘    └────┬─────┘    └────┬─────┘    └───────────────┘ │
│       │               │               │                              │
│       │  isMultiTurn? │               │                              │
│       ├───────┬───────┤               │                              │
│       │ YES   │  NO   │               │                              │
│       ▼       ▼       ▼               ▼                              │
│  ┌────────────────┐  ┌───────────────────────────────────────────┐  │
│  │  executor.js   │  │         runOpenCodeHeadless()             │  │
│  │                │  │  (existing single-turn, adds onApproval)  │  │
│  │ MultiTurnExecutor     └────────────────┬──────────────────────┘  │
│  │  ├─ tasks: Map   │                     │                         │
│  │  ├─ start()      │                     │                         │
│  │  ├─ pause()      │                     │                         │
│  │  ├─ resume()     │                     │                         │
│  │  └─ getTaskState │                     │                         │
│  └──┬───┬───┬───────┘                     │                         │
│     │   │   │                              │                         │
└─────┼───┼───┼──────────────────────────────┼─────────────────────────┘
      │   │   │                              │
      ▼   ▼   ▼                              ▼
┌──────────────┐  ┌──────────────────┐  ┌──────────────────────┐
│ session-     │  │  opencode.js     │  │  activityLogger.js   │
│ bridge.js    │  │                  │  │                      │
│              │  │  ensureServer()  │  │  logAgentEvent()     │
│ resolveSession│  │  createSession() │  │  (agent_logs table)  │
│ createSession│  │  sendMessage()   │  └──────────────────────┘
│              │  │  getSessionInfo()│
└──────┬───────┘  └──────┬───────────┘
       │                  │
       ▼                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     SQLite (data/devhub.db)                         │
│                                                                     │
│  agent_hub_sessions  │  telegram_session_map  │  agent_logs         │
│  - status: TEXT      │  - chat_id → session   │  - permission_decision│
│  - opencode_sess_id  │                        │  - multturn_* events │
└─────────────────────────────────────────────────────────────────────┘
```

## 2. Component Design

### 2.1 Executor Service (`telegram-bot/services/executor.js`)

The executor is a **singleton** that manages all active multi-turn tasks across all Telegram chats. It is stateful, holding an in-memory `Map<chatId, TaskState>`.

```javascript
class MultiTurnExecutor {
  constructor(bot, options = {}) {
    this.bot = bot;
    this.tasks = new Map(); // chatId -> TaskState
    this.options = {
      progressIntervalMs: options.progressIntervalMs ?? 600_000, // 10 min
      autoApprove: options.autoApprove ?? true,
      denyList: options.denyList ?? [
        'sudo', 'rm -rf /', '/etc/', '/root/', 'chmod 777 /',
      ],
      completionKeywords: options.completionKeywords ?? [
        'completado', 'done', 'finished', 'task complete',
        'all tasks completed', 'implementación completada',
      ],
    };
  }

  // Public API
  async startMultiTurn(chatId, agent, prompt, options = {}) { ... }
  pauseTask(chatId) { ... }
  resumeTask(chatId) { ... }
  getTaskState(chatId) { ... }
  hasActiveTask(chatId) { ... }
  hasPausedTask(chatId) { ... }
  cancelTask(chatId, reason) { ... }

  // Internal
  async _runTurn(taskState, prompt) { ... }
  _startProgressInterval(taskState) { ... }
  _stopProgressInterval(taskState) { ... }
  _evaluateCompletion(taskState, output, events) { ... }
  _createApprovalHandler(taskState) { ... }
  _sendStartNotification(taskState, prompt) { ... }
  _sendEndNotification(taskState) { ... }
  _sendProgressSummary(taskState) { ... }
}
```

#### TaskState Shape

```javascript
{
  chatId: string,           // Telegram chat ID
  agent: string,            // Agent name (e.g. 'sdd-orchestrator')
  sessionId: string,        // AgentHub session ID (UUID)
  opencodeSessionId: string,// OpenCode session ID
  status: 'running' | 'paused' | 'completed' | 'error' | 'cancelling',
  turnCount: number,        // Number of completed turns
  lastActivity: Date,       // Timestamp of last SSE event
  startedAt: Date,          // When the task started
  sseAbort: () => void,     // Function to cancel current SSE reader
  progressInterval: NodeJS.Timer, // setInterval handle
  toolsExecuted: Map<string, number>, // toolName -> count
  lastProgressSummary: Date, // When last progress was sent
  cwd: string,              // Working directory
  onEvent: function,        // Optional event callback from chat.js
  resolve: function,        // Promise resolve for startMultiTurn
  reject: function,         // Promise reject for startMultiTurn
}
```

#### Key Design Decisions

**Singleton pattern**: The executor is instantiated once at bot startup and exported as a singleton. This ensures:

- Only one task per chatId (prevents overlapping executions)
- Centralized access for `/pausar` and `/reanudar` commands
- Clean shutdown on bot termination

**Promise-based API**: `startMultiTurn()` returns a Promise that resolves when the task completes naturally or is cancelled. This allows `chat.js` to `await` the result and then send the final response.

**SSE abort exposure**: Each turn's `sendMessage()` call creates a new SSE reader. The `sseAbort` function is stored in `TaskState` so that `/pausar` can cancel the _current_ turn's reader. On resume, a new reader is created for the next turn.

### 2.2 Approval Handler

The approval handler is created per-task and passed to every `sendMessage()` call. It implements a deny-list policy:

```javascript
_createApprovalHandler(taskState) {
  const self = this;
  return async function onApproval(request) {
    const { action, permissionID, approve, reject } = request;
    const isDestructive = self._checkDenyList(action, self.options.denyList);

    if (isDestructive) {
      try {
        await reject();
        logAgentEvent({
          sessionId: taskState.sessionId,
          agentName: taskState.agent,
          eventType: 'permission_decision',
          toolName: action,
          status: 'error',
          message: `Permiso rechazado: ${action}`,
          metadata: JSON.stringify({
            decision: 'rejected',
            reason: 'deny-list match',
            action,
          }),
        });
        self.bot.sendMessage(
          taskState.chatId,
          `⚠️ Permiso rechazado: ${action.substring(0, 100)} (comando no permitido)`
        ).catch(() => {});
      } catch (err) {
        logger.error(`Error rejecting permission: ${err.message}`);
      }
    } else {
      try {
        await approve();
        logAgentEvent({
          sessionId: taskState.sessionId,
          agentName: taskState.agent,
          eventType: 'permission_decision',
          toolName: action,
          status: 'ok',
          message: `Permiso aprobado: ${action}`,
          metadata: JSON.stringify({
            decision: 'approved',
            reason: 'not in deny-list',
            action,
          }),
        });
      } catch (err) {
        logger.error(`Error approving permission: ${err.message}`);
      }
    }
  };
}

_checkDenyList(action, denyList) {
  if (!action) return false;
  const combined = action.toLowerCase();
  return denyList.some(pattern => combined.includes(pattern.toLowerCase()));
}
```

**Why deny-list over allow-list**: The codebase operates in a development environment where agents need broad access to project files, git operations, npm commands, and build tools. An allow-list would be too restrictive and require constant maintenance. A deny-list for clearly destructive operations (sudo, system file deletion) is safer and more practical.

### 2.3 Progress Notifier

A simple `setInterval` that runs independently of the SSE loop:

```javascript
_startProgressInterval(taskState) {
  taskState.progressInterval = setInterval(() => {
    if (taskState.status !== 'running') {
      this._stopProgressInterval(taskState);
      return;
    }
    this._sendProgressSummary(taskState);
  }, this.options.progressIntervalMs);
}

_sendProgressSummary(taskState) {
  const elapsed = Math.round((Date.now() - taskState.startedAt) / 60000);
  const tools = Array.from(taskState.toolsExecuted.entries())
    .map(([name, count]) => `${name} (x${count})`)
    .join(', ');

  const msg = `📊 Progreso: ${elapsed} min transcurridos, ${taskState.turnCount} turnos\n` +
    `Herramientas: ${tools || 'ninguna aún'}`;

  this.bot.sendMessage(taskState.chatId, msg).catch((err) => {
    logger.warn(`Failed to send progress for chat ${taskState.chatId}: ${err.message}`);
  });
}
```

### 2.4 Completion Heuristic

The executor evaluates whether a task is complete after each turn reaches `idle` status:

```javascript
_evaluateCompletion(taskState, output, events) {
  // 1. Check for completion keywords in output
  const lowerOutput = (output || '').toLowerCase();
  const hasCompletionKeyword = this.options.completionKeywords.some(
    kw => lowerOutput.includes(kw)
  );

  // 2. Check if any tools were executed in the last turn
  const turnToolEvents = events.filter(
    e => e.type === 'tool.start' || e.type === 'tool.execute'
  );
  const noToolsCalled = turnToolEvents.length === 0;

  // 3. Check if output is minimal (agent just said "done" or similar)
  const isMinimalOutput = output && output.trim().length < 200;

  // Completion: (keyword found AND no tools called) OR (minimal output AND no tools called)
  if (noToolsCalled && (hasCompletionKeyword || isMinimalOutput)) {
    return true;
  }

  // Safety valve: if the agent has been idle with no tools for 2+ consecutive turns
  // with minimal output, consider it done
  if (taskState.turnCount >= 2 && noToolsCalled && isMinimalOutput) {
    return true;
  }

  return false;
}
```

**Rationale**: The heuristic is intentionally conservative. It only declares completion when the agent is idle AND shows signs of being done (keyword or minimal output). This prevents premature termination of long-running tasks that naturally go idle between tool batches.

## 3. Sequence Diagrams

### 3a. Multi-Turn Execution Flow

```
User            chat.js          Executor         opencode.js        OpenCode Server
 │                │                 │                  │                   │
 │ "Implement     │                 │                  │                   │
 │  auth feature" │                 │                  │                   │
 │───────────────>│                 │                  │                   │
 │                │ isMultiTurn?    │                  │                   │
 │                │ ───YES──────────│                  │                   │
 │                │                 │                  │                   │
 │                │ startMultiTurn()│                  │                   │
 │                │────────────────>│                  │                   │
 │                │                 │                  │                   │
 │                │                 │ resolveSession() │                   │
 │                │                 │─────────────────>│                   │
 │                │                 │<─────────────────│                   │
 │                │                 │  (session info)  │                   │
 │                │                 │                  │                   │
 │                │                 │ Send start notif │                   │
 │                │<────────────────│                  │                   │
 │   🚀 Starting  │                 │                  │                   │
 │<───────────────│                 │                  │                   │
 │                │                 │                  │                   │
 │                │                 │ ── TURN 1 ──     │                   │
 │                │                 │ sendMessage()    │                   │
 │                │                 │─────────────────>│                   │
 │                │                 │                  │ POST /session/ID  │
 │                │                 │                  │──────────────────>│
 │                │                 │                  │                   │
 │                │                 │                  │ SSE stream        │
 │                │                 │<─────────────────│◄──────────────────│
 │                │                 │  (events)        │    (events)       │
 │                │                 │                  │                   │
 │                │                 │ onApproval()     │                   │
 │                │                 │ → auto-approve   │                   │
 │                │                 │                  │                   │
 │                │                 │ session.status   │                   │
 │                │                 │ = idle           │                   │
 │                │                 │                  │                   │
 │                │                 │ evaluateComplete │                   │
 │                │                 │ → NOT complete   │                   │
 │                │                 │                  │                   │
 │                │                 │ ── TURN 2 ──     │                   │
 │                │                 │ sendMessage()    │                   │
 │                │                 │ (continuation)   │                   │
 │                │                 │─────────────────>│                   │
 │                │                 │                  │ POST /session/ID  │
 │                │                 │                  │──────────────────>│
 │                │                 │                  │ SSE stream        │
 │                │                 │<─────────────────│◄──────────────────│
 │                │                 │  (events)        │    (events)       │
 │                │                 │                  │                   │
 │                │                 │ session.status   │                   │
 │                │                 │ = idle           │                   │
 │                │                 │                  │                   │
 │                │                 │ evaluateComplete │                   │
 │                │                 │ → COMPLETE ✓     │                   │
 │                │                 │                  │                   │
 │                │                 │ Send end notif   │                   │
 │                │<────────────────│                  │                   │
 │                │                 │                  │                   │
 │                │ resolve(output) │                  │                   │
 │                │<────────────────│                  │                   │
 │                │                 │                  │                   │
 │   ✅ Done: 3   │                 │                  │                   │
 │   turns, 15min │                 │                  │                   │
 │<───────────────│                 │                  │                   │
```

### 3b. Pause/Resume Flow

```
User            chat.js          Executor         opencode.js        OpenCode Server
 │                │                 │                  │                   │
 │  (task running)│                 │                  │                   │
 │                │                 │ SSE reader active│                   │
 │                │                 │ ◄─────────────── │◄──────────────────│
 │                │                 │                  │                   │
 │ /pausar        │                 │                  │                   │
 │───────────────>│                 │                  │                   │
 │                │ pauseTask()     │                  │                   │
 │                │────────────────>│                  │                   │
 │                │                 │                  │                   │
 │                │                 │ task.sseAbort()  │                   │
 │                │                 │─────────────────>│                   │
 │                │                 │  reader.cancel() │                   │
 │                │                 │                  │  SSE stream ends  │
 │                │                 │                  │──────────────────>│
 │                │                 │                  │                   │
 │                │                 │ clearInterval()  │                   │
 │                │                 │                  │                   │
 │                │                 │ DB: status=paused│                   │
 │                │                 │                  │                   │
 │                │ resolve()       │                  │                   │
 │                │<────────────────│                  │                   │
 │                │                 │                  │                   │
 │   ⏸️ Paused    │                 │                  │                   │
 │   after 5 turns│                 │                  │                   │
 │<───────────────│                 │                  │                   │
 │                │                 │                  │                   │
 │                │  ... time passes ...               │                   │
 │                │                 │                  │                   │
 │ /reanudar      │                 │                  │                   │
 │───────────────>│                 │                  │                   │
 │                │ resumeTask()    │                  │                   │
 │                │────────────────>│                  │                   │
 │                │                 │                  │                   │
 │                │                 │ DB: status=busy  │                   │
 │                │                 │                  │                   │
 │                │                 │ NEW SSE reader   │                   │
 │                │                 │─────────────────>│                   │
 │                │                 │                  │ GET /event        │
 │                │                 │                  │──────────────────>│
 │                │                 │                  │ SSE stream        │
 │                │                 │<─────────────────│◄──────────────────│
 │                │                 │                  │                   │
 │                │                 │ send "continue"  │                   │
 │                │                 │─────────────────>│                   │
 │                │                 │                  │ POST /session/ID  │
 │                │                 │                  │──────────────────>│
 │                │                 │                  │                   │
 │                │                 │ restartProgress()│                   │
 │                │                 │ re-enter loop    │                   │
 │                │                 │                  │                   │
 │                │                 │ ── TURN 6 ──     │                   │
 │                │                 │ ...              │                   │
 │                │                 │                  │                   │
 │   ▶️ Resumed   │                 │                  │                   │
 │   (turn 6)     │                 │                  │                   │
 │<───────────────│                 │                  │                   │
```

### 3c. User Interruption (New Message During Active Task)

```
User            chat.js          Executor
 │                │                 │
 │  (task running)│                 │
 │                │                 │
 │ "Actually,     │                 │
 │  change X"     │                 │
 │───────────────>│                 │
 │                │ hasActiveTask() │
 │                │ ───YES──────────│
 │                │                 │
 │                │ cancelTask()    │
 │                │────────────────>│
 │                │                 │
 │                │ sseAbort()      │
 │                │ clearInterval() │
 │                │ tasks.delete()  │
 │                │                 │
 │                │ ⚠️ Previous task│
 │                │ cancelled       │
 │<───────────────│                 │
 │                │                 │
 │                │ process new msg │
 │                │ (fresh task)    │
 │                │ ...             │
```

## 4. Data Model

### 4.1 In-Memory TaskState

```typescript
interface TaskState {
  chatId: string;
  agent: string;
  sessionId: string; // AgentHub session UUID
  opencodeSessionId: string; // OpenCode session ID
  status: 'running' | 'paused' | 'completed' | 'error' | 'cancelling';
  turnCount: number;
  lastActivity: Date;
  startedAt: Date;
  sseAbort: () => void;
  progressInterval: ReturnType<typeof setInterval>;
  toolsExecuted: Map<string, number>;
  lastProgressSummary: Date;
  cwd: string;
  onEvent?: (info: string) => void;
  resolve: (value: string) => void;
  reject: (error: Error) => void;
}
```

### 4.2 Database Changes

**No new tables or columns required.** The `agent_hub_sessions` table already has a `status` column (added in the `agent-observability-v2` migration):

```sql
-- Already exists from previous migration:
ALTER TABLE agent_hub_sessions ADD COLUMN status TEXT DEFAULT 'active';
```

The existing status values are extended:

| Status      | Meaning                          | Set When                           |
| ----------- | -------------------------------- | ---------------------------------- |
| `active`    | Session exists, not executing    | Session creation                   |
| `busy`      | Multi-turn task actively running | `startMultiTurn()`, `resumeTask()` |
| `paused`    | User paused execution            | `pauseTask()`                      |
| `completed` | Task finished naturally          | Multi-turn loop completion         |
| `error`     | Task failed with error           | Error in SSE loop or sendMessage   |

**Status transitions**:

```
active ──startMultiTurn()──→ busy ──natural completion──→ completed
                                │
                           pauseTask()
                                │
                                ▼
                              busy ──resumeTask()──→ busy (loop continues)
                                │
                           cancelTask()
                                │
                                ▼
                              error
```

### 4.3 Agent Logs Extensions

New `event_type` values logged to `agent_logs`:

| Event Type                | When                    | Status       |
| ------------------------- | ----------------------- | ------------ |
| `multiturn_start`         | Task begins             | `ok`         |
| `multiturn_turn_complete` | Each turn finishes      | `ok`         |
| `multiturn_complete`      | Task finishes naturally | `ok`         |
| `multiturn_cancelled`     | User cancels/pauses     | `ok`         |
| `multiturn_error`         | Error in loop           | `error`      |
| `permission_decision`     | Auto-approve/reject     | `ok`/`error` |

## 5. Error Handling

### 5.1 SSE Disconnect

**Scenario**: The SSE stream drops mid-turn (network issue, OpenCode server restart).

**Handling**:

```javascript
// In _runTurn():
try {
  const result = await opencode.sendMessage(...);
  // Process result
} catch (err) {
  if (taskState.status === 'cancelling') {
    // User-initiated cancellation — don't treat as error
    return;
  }

  // SSE disconnect — the stream ended without sessionDone
  // opencode.sendMessage() already handles this by resolving with
  // whatever output was collected. We evaluate completion:
  const isComplete = this._evaluateCompletion(taskState, result.output, result.events);
  if (isComplete) {
    // Task naturally ended
    this._completeTask(taskState, result.output);
  } else {
    // Unexpected disconnect — try one more turn
    logger.warn(`SSE disconnect on turn ${taskState.turnCount}, retrying...`);
    await this._runTurn(taskState, 'Continue from where you left off.');
  }
}
```

### 5.2 Bot Crash / Process Restart

**Scenario**: The Node.js process crashes while a multi-turn task is running.

**Impact**:

- In-memory `TaskState` is lost
- OpenCode server continues running (separate process)
- OpenCode session remains alive

**Recovery**:

- On bot restart, the executor's `tasks` Map is empty
- Next user message for that chatId will create a new session (via `resolveSession`)
- The old OpenCode session will eventually go idle on its own
- **No automatic recovery** — the user must send a new message or `/reanudar`
- The `agent_hub_sessions.status` column may show `busy` for a dead task — this is a known limitation. A future cleanup job could reset stale `busy` sessions.

### 5.3 OpenCode Server Crash

**Scenario**: The OpenCode server process dies during execution.

**Handling**:

- `sendMessage()` throws — caught by the executor's error handler
- Task status set to `error`
- End notification sent to user
- On next message, `ensureServer()` in `opencode.js` will restart the server
- A new OpenCode session is created (old one is lost)

### 5.4 Telegram Rate Limits

**Scenario**: Too many messages sent to Telegram API.

**Mitigation**:

- Progress notifications: debounced to 10 min intervals
- Permission notifications: one per permission request (agent-controlled frequency)
- All `bot.sendMessage()` calls use `.catch(() => {})` to prevent unhandled rejections
- If rate limited, the notification is silently dropped — execution continues

### 5.5 Concurrent Messages from Same Chat

**Scenario**: User sends a new message while a multi-turn task is running.

**Handling**:

- `chat.js` checks `executor.hasActiveTask(chatId)` before starting a new task
- If active task exists: cancel it, notify user, process new message
- This prevents overlapping SSE readers for the same chat

### 5.6 Permission Decision Failures

**Scenario**: The `approve()` or `reject()` fetch call fails.

**Handling**:

- Error is logged but does NOT crash the SSE loop
- The permission request will timeout on OpenCode's side
- The agent will receive an error and may retry or report the issue
- The executor continues processing subsequent events

## 6. Architecture Decisions

### AD-1: Deny-List Over Allow-List for Permissions

**Decision**: Auto-approve by default, reject only deny-listed actions.

**Rationale**:

- Development agents need broad access: file I/O, git, npm, build tools, testing
- An allow-list would require constant maintenance as new tools are added
- The deny-list covers clearly destructive operations (sudo, system paths)
- All decisions are logged for auditability

**Trade-off**: Less security than allow-list, but practical for a dev environment. The deny-list can be extended as needed.

### AD-2: No Timeout / No Iteration Limit

**Decision**: Tasks run until natural completion, with no artificial limits.

**Rationale**:

- SDD workflows (proposal → design → spec → tasks → implement) can take 30+ minutes
- Complex refactoring may require many turns
- Users can manually cancel with `/pausar` at any time
- Progress notifications every 10 min provide visibility

**Trade-off**: Risk of runaway tasks if the agent gets stuck in a loop. Mitigated by the user's ability to cancel and the completion heuristic.

### AD-3: New SSE Reader Per Turn (Not Reused)

**Decision**: Each `sendMessage()` call opens a fresh SSE connection. On pause/resume, a new reader is created.

**Rationale**:

- SSE readers are `ReadableStreamDefaultReader` — once cancelled, they're dead
- Reusing a cancelled reader throws `TypeError: Reader is locked`
- The `opencode.sendMessage()` function already creates a new reader per call
- This is the simplest and most reliable approach

**Trade-off**: Slight overhead of creating new SSE connections, but negligible compared to the work done per turn.

### AD-4: Singleton Executor Over Per-Request Instances

**Decision**: One `MultiTurnExecutor` instance shared across all commands.

**Rationale**:

- `/pausar` and `/reanudar` need access to the same task registry as `chat.js`
- A singleton ensures consistent state across all entry points
- Prevents race conditions from multiple executor instances
- Easy to export: `module.exports = new MultiTurnExecutor(bot)`

### AD-5: Heuristic-Based Completion Detection

**Decision**: Use keyword matching + tool activity analysis to detect completion.

**Rationale**:

- OpenCode doesn't provide an explicit "task complete" signal
- The agent naturally goes `idle` when done, but also between tool batches
- Combining idle status with output analysis gives reasonable accuracy
- Conservative by design: prefers to continue rather than terminate early

**Trade-off**: May occasionally over-continue (agent says "done" but executor sends one more turn). This is harmless — the agent will just confirm completion again.

### AD-6: Feature Flag for Rollback

**Decision**: `TELEGRAM_MULTI_TURN` env var (default: `true`) to enable/disable multi-turn.

**Rationale**:

- Quick rollback without code changes
- Can be toggled at runtime by restarting the bot
- When `false`, `chat.js` falls back to existing single-turn behavior
- Zero impact on existing functionality when disabled

### AD-7: Executor Integrates with Existing `sendMessage()` (Not New API)

**Decision**: The executor calls `opencode.sendMessage()` in a loop, not a new dedicated API.

**Rationale**:

- `sendMessage()` already supports `onApproval` callback (line 616 of `opencode.js`)
- It already handles SSE parsing, event filtering, and session tracking
- Reusing it avoids code duplication and ensures consistency
- The executor adds the loop logic on top

**Contract requirement**: The executor needs to cancel the SSE reader on pause. Currently `sendMessage()` creates an internal `sseAbort` function but does NOT expose it to callers. The executor needs a way to abort the current turn's SSE stream.

**Decision**: Add `signal` option to `sendMessage()` using the standard `AbortController` pattern:

```javascript
// In executor._runTurn():
taskState.abortController = new AbortController();
const result = await opencode.sendMessage(sessionId, opencodeSessionId, agent, prompt, {
  cwd: taskState.cwd,
  chatId: String(taskState.chatId),
  onEvent: taskState.onEvent,
  onApproval: this._createApprovalHandler(taskState),
  signal: taskState.abortController.signal, // NEW — enables pause
});
```

```javascript
// In opencode.sendMessage() — modification to SSE fetch:
const streamRes = await fetch(`${SERVER_URL}/event`, {
  signal: options.signal, // NEW — AbortSignal from executor
});
```

When `executor.pauseTask()` calls `taskState.abortController.abort()`, the `fetch()` is cancelled, the reader throws `AbortError`, and `sendMessage()` rejects. The executor catches this expected rejection during pause (status === 'cancelling') and treats it as normal, not an error.

**Why AbortController over returning sseAbort**: The `AbortController` pattern is a web standard, testable, and composable. Returning an internal `sseAbort` function would couple the executor to `opencode.js` internals. The `signal` approach is cleaner: `sendMessage()` doesn't need to know about the executor's pause logic.

### AD-8: Feature Flag for Rollback

**Decision**: `TELEGRAM_MULTI_TURN` env var (default: `true`) to enable/disable multi-turn.

**Rationale**:

- Quick rollback without code changes
- Can be toggled at runtime by restarting the bot
- When `false`, `chat.js` falls back to existing single-turn behavior
- Zero impact on existing functionality when disabled

## 7. Migration Plan

### 7.1 Important Discovery: Dual DB Module Warning

**Two separate modules** open independent connections to `data/devhub.db`:

| Module                                    | Connection              | Used By                                |
| ----------------------------------------- | ----------------------- | -------------------------------------- |
| `telegram-bot/lib/db-bridge.js`           | `new Database(DB_PATH)` | session-bridge, chat.js, executor      |
| `telegram-bot/services/db.js`             | `new Database(DB_PATH)` | pausar.js, reanudar.js, other commands |
| `telegram-bot/services/activityLogger.js` | `new Database(DB_PATH)` | logging only                           |

**Implication**: `pausar.js` and `reanudar.js` currently import `../services/db`, NOT `../lib/db-bridge`. The executor uses `db-bridge.js` for session status updates. Both connections see the same SQLite file (WAL mode allows concurrent readers), but **prepared statements are not shared**. This is not a blocker — SQLite handles concurrent connections fine in WAL mode — but it means:

- The executor updates `agent_hub_sessions.status` via `db-bridge.updateSessionStatus()`
- `pausar.js`/`reanudar.js` will read the updated status via their own `db` connection
- No race condition risk for our use case (status updates are infrequent)

**Future improvement**: Consolidate to a single DB module, but out of scope for this change.

### Phase 1: Prerequisite Bugfix (Permission Deadlock)

**Files**: `telegram-bot/commands/chat.js`

**Change**: Add `onApproval` callback to the existing `runOpenCodeHeadless()` function. This is a standalone fix that should be deployed first.

```javascript
// In runOpenCodeHeadless(), add to sendMessage options:
onApproval: createSimpleApprovalHandler(session.id, agent, String(chatId)),
```

The `createSimpleApprovalHandler` is a lightweight version of the executor's approval logic that can be used in single-turn mode.

### Phase 2: Executor Service

**Files**: `telegram-bot/services/executor.js` (new)

**Change**: Create the `MultiTurnExecutor` class with full multi-turn loop, approval handler, progress notifier, and pause/resume support.

### Phase 2.5: OpenCode SSE Abort Support

**Files**: `telegram-bot/services/opencode.js`

**Change**: Add `signal` option to `sendMessage()` to support SSE stream cancellation on pause. This is a minimal, non-breaking change:

```javascript
// In sendMessage(), modify the SSE fetch call (~line 533):
const streamRes = await fetch(`${SERVER_URL}/event`, {
  signal: options.signal, // NEW — AbortSignal for pause support
});
```

Also handle `AbortError` in the SSE processing loop:

```javascript
// In the catch block (~line 700):
} catch (err) {
  if (err.name === 'AbortError') {
    // Expected during pause — don't treat as error
    logger.debug(`SSE stream aborted for session ${opencodeSessionId}`);
    reject(err);
    return;
  }
  reject(err);
}
```

**Why this is needed**: The executor's `pauseTask()` needs to cancel the active SSE reader. The `AbortController.signal` pattern is the standard web API for this. Without it, the executor would need to reach into `opencode.js` internals to call `sseAbort()`, creating tight coupling.

**No changes needed to `opencode.js` for `onApproval`**: Already fully supported at line 616.

### Phase 2.5: OpenCode SSE Abort Support

**Files**: `telegram-bot/services/opencode.js`

**Change**: Add `signal` option to `sendMessage()` to support SSE stream cancellation on pause. This is a minimal, non-breaking change:

```javascript
// In sendMessage(), modify the SSE fetch call (~line 533):
const streamRes = await fetch(`${SERVER_URL}/event`, {
  signal: options.signal, // NEW — AbortSignal for pause support
});
```

Also handle `AbortError` in the SSE processing loop:

```javascript
// In the catch block (~line 700):
} catch (err) {
  if (err.name === 'AbortError') {
    // Expected during pause — don't treat as error
    logger.debug(`SSE stream aborted for session ${opencodeSessionId}`);
    reject(err);
    return;
  }
  reject(err);
}
```

**Why this is needed**: The executor's `pauseTask()` needs to cancel the active SSE reader. The `AbortController.signal` pattern is the standard web API for this. Without it, the executor would need to reach into `opencode.js` internals to call `sseAbort()`, creating tight coupling.

**No changes needed to `opencode.js` for `onApproval`**: Already fully supported at line 616.

### Phase 3: Integration with chat.js

**Files**: `telegram-bot/commands/chat.js`

**Change**: Add multi-turn detection and delegation:

```javascript
const USE_MULTI_TURN = process.env.TELEGRAM_MULTI_TURN !== 'false';

if (USE_MULTI_TURN && isMultiTurnTask(text)) {
  const executor = getExecutor(bot, db);
  return executor.startMultiTurn(chatId, agent, text, { onEvent });
}
// else: existing single-turn behavior
```

### Phase 4: Update /pausar and /reanudar

**Files**: `telegram-bot/commands/pausar.js`, `telegram-bot/commands/reanudar.js`

**Change**: Add executor integration before falling back to existing DB-only behavior:

```javascript
// In pausar.js:
const executor = getExecutor(bot, db);
if (executor.hasActiveTask(chatId)) {
  await executor.pauseTask(chatId);
  return bot.sendMessage(chatId, '⏸️ Ejecución pausada...');
}
// else: existing fallback (db.pauseAgent)
```

### Phase 5: Feature Flag Rollout

**Environment**: `.env` file

```
TELEGRAM_MULTI_TURN=true  # default
```

**Rollback**: Set `TELEGRAM_MULTI_TURN=false` and restart bot.

### Deployment Checklist

- [ ] Deploy Phase 1 (permission deadlock fix) — verify no more SSE hangs
- [ ] Deploy Phase 2 (executor service) — no behavior change yet
- [ ] Deploy Phase 3 (chat.js integration) — multi-turn active
- [ ] Deploy Phase 4 (pausar/reanudar) — session controls active
- [ ] Test with SDD full cycle (proposal → design → spec → tasks → implement)
- [ ] Test pause/resume mid-execution
- [ ] Test user interruption during active task
- [ ] Test feature flag rollback (`TELEGRAM_MULTI_TURN=false`)
- [ ] Verify no regressions in single-turn flow

### Rollback Procedure

1. Set `TELEGRAM_MULTI_TURN=false` in `.env`
2. Restart the Telegram bot
3. All messages fall back to single-turn `runOpenCodeHeadless()` path
4. `/pausar` and `/reanudar` fall back to existing DB-only behavior
5. No data loss — existing sessions remain in DB with their status
