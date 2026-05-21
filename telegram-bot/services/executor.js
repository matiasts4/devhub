/**
 * Multi-Turn Executor — Orchestrates autonomous multi-turn agent execution.
 *
 * Manages the lifecycle of long-running tasks that span multiple turns
 * within a single OpenCode session. Handles:
 *   - Permission auto-approval with deny-list
 *   - Progress notifications
 *   - Task state tracking
 *   - Pause/resume controls
 *
 * Usage:
 *   const { getExecutor } = require('./services/executor');
 *   const executor = getExecutor(bot, db);
 *   await executor.startMultiTurn(chatId, agent, prompt, { onEvent });
 */

const logger = require('../utils/logger');
const { logAgentEvent } = require('./activityLogger');
const opencode = require('./opencode');
const sessionBridge = require('./session-bridge');
const { classifyTaskIntent, shouldUseMultiTurn, isMultiTurnTask } = require('../utils/task');

// ---------------------------------------------------------------------------
// Deny-list configuration
// ---------------------------------------------------------------------------

const DEFAULT_DENY_LIST = ['sudo', 'rm -rf /', '/etc/', '/root/', 'chmod 777 /'];

// ---------------------------------------------------------------------------
// Simple approval handler (for single-turn mode — Phase 1)
// ---------------------------------------------------------------------------

/**
 * Create a simple permission approval handler for single-turn execution.
 * Auto-approves by default, rejects deny-listed actions.
 *
 * @param {string} sessionId - AgentHub session ID (for logging)
 * @param {string} agentName - Agent name
 * @param {string} chatId - Telegram chat ID
 * @param {object} options
 * @param {TelegramBot} [options.bot] - Bot instance for notifications
 * @param {Array<string>} [options.denyList] - Custom deny-list
 * @returns {function} onApproval callback
 */
function createSimpleApprovalHandler(sessionId, agentName, chatId, options = {}) {
  const denyList = options.denyList || DEFAULT_DENY_LIST;
  const bot = options.bot || null;

  return async function onApproval(request) {
    const { action, tool, permissionID, approve, reject } = request;
    const actionStr = action || tool || 'unknown';
    const isDestructive = _checkDenyList(actionStr, denyList);

    if (isDestructive) {
      try {
        await reject();
        logAgentEvent({
          sessionId,
          agentName,
          eventType: 'permission_decision',
          toolName: actionStr,
          status: 'error',
          message: `Permiso rechazado: ${actionStr}`,
          metadata: JSON.stringify({
            decision: 'rejected',
            reason: 'deny-list match',
            action: actionStr,
            permissionID,
          }),
        });

        if (bot && chatId) {
          bot
            .sendMessage(
              chatId,
              `⚠️ Permiso rechazado: ${actionStr.substring(0, 100)} (comando no permitido)`
            )
            .catch(() => {});
        }
      } catch (err) {
        logger.error(`Error rejecting permission: ${err.message}`);
      }
    } else {
      try {
        await approve();
        logAgentEvent({
          sessionId,
          agentName,
          eventType: 'permission_decision',
          toolName: actionStr,
          status: 'ok',
          message: `Permiso aprobado: ${actionStr}`,
          metadata: JSON.stringify({
            decision: 'approved',
            reason: 'not in deny-list',
            action: actionStr,
            permissionID,
          }),
        });
      } catch (err) {
        logger.error(`Error approving permission: ${err.message}`);
      }
    }
  };
}

// ---------------------------------------------------------------------------
// Deny-list checker
// ---------------------------------------------------------------------------

/**
 * Check if an action matches any entry in the deny-list.
 * Uses case-insensitive substring matching.
 *
 * @param {string} action - The action/command to check
 * @param {Array<string>} denyList - List of deny patterns
 * @returns {boolean} True if action matches a deny-list entry
 */
function _checkDenyList(action, denyList) {
  if (!action) return false;
  const combined = action.toLowerCase();
  return denyList.some((pattern) => combined.includes(pattern.toLowerCase()));
}

// ---------------------------------------------------------------------------
// Multi-Turn Executor
// ---------------------------------------------------------------------------

let _instance = null;

/**
 * MultiTurnExecutor manages all active multi-turn tasks across Telegram chats.
 * Singleton pattern — use getExecutor() to obtain the shared instance.
 */
class MultiTurnExecutor {
  /**
   * @param {TelegramBot} bot - Telegram bot instance
   * @param {object} db - Database bridge instance
   * @param {object} options
   * @param {number} [options.progressIntervalMs=45000] - Progress notification interval (45s)
   * @param {Array<string>} [options.denyList] - Permission deny-list
   */
  constructor(bot, db, options = {}) {
    this.bot = bot;
    this.db = db;
    this.tasks = new Map(); // chatId -> TaskState
    this.options = {
      progressIntervalMs: options.progressIntervalMs ?? 600_000, // 10 min
      autoApprove: options.autoApprove ?? true,
      denyList: options.denyList ?? [...DEFAULT_DENY_LIST],
      completionKeywords: options.completionKeywords ?? [
        'completado',
        'done',
        'finished',
        'task complete',
        'all tasks completed',
        'implementación completada',
      ],
    };
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Check if a chat has an active (running) multi-turn task.
   *
   * @param {string|number} chatId
   * @returns {boolean}
   */
  hasActiveTask(chatId) {
    const task = this.tasks.get(String(chatId));
    return task && task.status === 'running';
  }

  /**
   * Check if a chat has a paused session in the database.
   *
   * @param {string|number} chatId
   * @returns {boolean}
   */
  hasPausedTask(chatId) {
    const chatIdStr = String(chatId);
    const mapping = this.db.getTelegramSession(chatIdStr);
    if (!mapping) return false;
    const session = this.db.getSession(mapping.session_id);
    return session && session.status === 'paused';
  }

  /**
   * Get the current task state for a chat.
   *
   * @param {string|number} chatId
   * @returns {object|null} TaskState or null
   */
  getTaskState(chatId) {
    return this.tasks.get(String(chatId)) || null;
  }

  /**
   * Start a multi-turn execution loop.
   *
   * @param {string|number} chatId - Telegram chat ID
   * @param {string} agent - Agent name
   * @param {string} prompt - User prompt
   * @param {object} options
   * @param {function} [options.onEvent] - Event callback for UI updates
   * @returns {Promise<string>} Final output when task completes
   */
  async startMultiTurn(chatId, agent, prompt, options = {}) {
    const chatIdStr = String(chatId);

    // Cancel any existing active task for this chat
    if (this.hasActiveTask(chatIdStr)) {
      await this.cancelTask(chatIdStr, 'replaced by new task');
    }

    // Resolve or create session
    const { session, isNew } = await sessionBridge.resolveSession(chatIdStr);
    const directory = session.directory || process.cwd();

    // Create task state
    const taskState = {
      chatId: chatIdStr,
      agent,
      sessionId: session.id,
      opencodeSessionId: session.opencode_session_id,
      status: 'running',
      turnCount: 0,
      lastActivity: new Date(),
      startedAt: new Date(),
      sseAbort: null,
      abortController: null,
      progressInterval: null,
      toolsExecuted: new Map(),
      lastProgressSummary: new Date(),
      cwd: directory,
      onEvent: options.onEvent || null,
      originalPrompt: prompt,
    };

    this.tasks.set(chatIdStr, taskState);

    // Update DB status
    this.db.updateSessionStatus(session.id, 'busy');

    // Log start
    logAgentEvent({
      sessionId: session.id,
      agentName: agent,
      eventType: 'multiturn_start',
      message: `Multi-turn task started: ${prompt.substring(0, 100)}`,
      metadata: JSON.stringify({
        chatId: chatIdStr,
        promptLength: prompt.length,
        opencodeSessionId: session.opencode_session_id,
      }),
    });

    // Send start notification
    this._sendStartNotification(taskState, prompt);

    // Start progress interval
    this._startProgressInterval(taskState);

    // Enter the multi-turn loop
    return this._runLoop(taskState, prompt);
  }

  /**
   * Pause an active multi-turn task.
   *
   * @param {string|number} chatId
   * @returns {Promise<object>} Task state snapshot
   */
  async pauseTask(chatId, reason = 'paused by user') {
    const chatIdStr = String(chatId);
    const task = this.tasks.get(chatIdStr);

    if (!task || task.status !== 'running') {
      return null;
    }

    task.status = 'cancelling';

    // Abort current SSE stream
    if (task.abortController) {
      task.abortController.abort();
    }

    // Stop progress interval
    this._stopProgressInterval(task);

    // Update DB — use correct status based on reason
    const dbStatus = reason === 'bot shutdown' ? 'error' : 'paused';
    this.db.updateSessionStatus(task.sessionId, dbStatus);
    this.db.updateSessionTaskState(task.sessionId, task.turnCount, new Date().toISOString());

    // Log
    logAgentEvent({
      sessionId: task.sessionId,
      agentName: task.agent,
      eventType: 'multiturn_cancelled',
      message: `Task paused after ${task.turnCount} turns`,
      metadata: JSON.stringify({ chatId: chatIdStr, turnCount: task.turnCount }),
    });

    const elapsedMin = Math.round((Date.now() - task.startedAt.getTime()) / 60000);

    // Send confirmation
    this.bot
      .sendMessage(
        chatIdStr,
        `⏸️ Ejecución pausada después de ${task.turnCount} turnos (${elapsedMin} min)`
      )
      .catch(() => {});

    // Keep task in Map with paused status (for resume)
    task.status = 'paused';

    return { chatId: chatIdStr, turnCount: task.turnCount, elapsedMin };
  }

  /**
   * Resume a paused multi-turn task.
   *
   * @param {string|number} chatId
   * @returns {Promise<string>} Final output when task completes
   */
  async resumeTask(chatId) {
    const chatIdStr = String(chatId);

    // Check for paused task in DB
    const mapping = this.db.getTelegramSession(chatIdStr);
    if (!mapping) {
      return null;
    }

    const session = this.db.getSession(mapping.session_id);
    if (!session || session.status !== 'paused') {
      return null;
    }

    // Create or restore task state
    let taskState = this.tasks.get(chatIdStr);
    if (!taskState) {
      taskState = {
        chatId: chatIdStr,
        agent: session.agent_model || 'sdd-orchestrator',
        sessionId: session.id,
        opencodeSessionId: session.opencode_session_id,
        status: 'running',
        turnCount: session.turn_count || 0,
        lastActivity: new Date(),
        startedAt: new Date(),
        sseAbort: null,
        abortController: null,
        progressInterval: null,
        toolsExecuted: new Map(),
        lastProgressSummary: new Date(),
        cwd: session.directory || process.cwd(),
        onEvent: null,
        originalPrompt:
          session.original_prompt ||
          session.initial_prompt ||
          'Retomá la tarea en progreso y reconstruí el contexto necesario antes de seguir.',
      };
      this.tasks.set(chatIdStr, taskState);
    } else {
      taskState.status = 'running';
      taskState.startedAt = new Date();
      taskState.toolsExecuted = new Map();
    }

    // Update DB
    this.db.updateSessionStatus(session.id, 'busy');

    // Restart progress interval
    this._startProgressInterval(taskState);

    // Send resume notification
    const nextTurn = taskState.turnCount + 1;
    this.bot.sendMessage(chatIdStr, `▶️ Ejecución reanudada (turno ${nextTurn})`).catch(() => {});

    // Log
    logAgentEvent({
      sessionId: session.id,
      agentName: taskState.agent,
      eventType: 'multiturn_start',
      message: `Task resumed at turn ${nextTurn}`,
      metadata: JSON.stringify({ chatId: chatIdStr, turnCount: taskState.turnCount }),
    });

    // Re-enter loop with a "continue" message
    return this._runLoop(
      taskState,
      'Continuá con la tarea desde donde quedaste. Seguí trabajando en lo que estabas haciendo.'
    );
  }

  /**
   * Cancel an active multi-turn task.
   *
   * @param {string|number} chatId
   * @param {string} [reason='cancelled']
   */
  async cancelTask(chatId, reason = 'cancelled') {
    const chatIdStr = String(chatId);
    const task = this.tasks.get(chatIdStr);

    if (!task) return;

    task.status = 'cancelling';

    // Abort SSE
    if (task.abortController) {
      task.abortController.abort();
    }

    // Stop progress
    this._stopProgressInterval(task);

    // Update DB — differentiate user cancellation from system error
    const dbStatus = reason === 'bot shutdown' ? 'error' : 'paused';
    this.db.updateSessionStatus(task.sessionId, dbStatus);
    this.db.updateSessionTaskState(task.sessionId, task.turnCount, new Date().toISOString());

    // Log
    logAgentEvent({
      sessionId: task.sessionId,
      agentName: task.agent,
      eventType: 'multiturn_cancelled',
      message: `Task cancelled: ${reason}`,
      metadata: JSON.stringify({ chatId: chatIdStr, reason }),
    });

    // Remove from registry
    this.tasks.delete(chatIdStr);
  }

  /**
   * Cancel all active tasks (for shutdown).
   */
  async cancelAll() {
    const promises = [];
    for (const [chatId] of this.tasks) {
      promises.push(this.cancelTask(chatId, 'bot shutdown'));
    }
    await Promise.allSettled(promises);
  }

  // -----------------------------------------------------------------------
  // Internal: Multi-turn loop
  // -----------------------------------------------------------------------

  /**
   * Run the multi-turn execution loop.
   *
   * @param {object} taskState
   * @param {string} initialPrompt
   * @returns {Promise<string>}
   * @private
   */
  async _runLoop(taskState, initialPrompt) {
    let prompt = initialPrompt;
    let lastOutput = '';

    while (taskState.status === 'running') {
      try {
        const result = await this._runTurn(taskState, prompt);
        lastOutput = result.output;
        taskState.turnCount++;
        taskState.lastActivity = new Date();

        // Track tools
        if (result.events) {
          for (const event of result.events) {
            if (event.type === 'tool.start' || event.type === 'tool.execute') {
              const toolName =
                (event.properties && event.properties.name) ||
                (event.properties && event.properties.tool) ||
                'unknown';
              taskState.toolsExecuted.set(
                toolName,
                (taskState.toolsExecuted.get(toolName) || 0) + 1
              );
            }
          }
        }

        // Log turn completion
        logAgentEvent({
          sessionId: taskState.sessionId,
          agentName: taskState.agent,
          eventType: 'multiturn_turn_complete',
          message: `Turn ${taskState.turnCount} completed`,
          metadata: JSON.stringify({
            turnCount: taskState.turnCount,
            durationMs: result.durationMs,
            errorCount: result.errorCount,
          }),
        });

        // Persist turn count to DB
        this.db.updateSessionTaskState(
          taskState.sessionId,
          taskState.turnCount,
          new Date().toISOString()
        );

        // Evaluate completion
        const isComplete = this._evaluateCompletion(taskState, lastOutput, result.events || []);

        if (isComplete) {
          // Task is done
          taskState.status = 'completed';
          this._stopProgressInterval(taskState);
          this.db.updateSessionStatus(taskState.sessionId, 'completed');

          // Log completion
          logAgentEvent({
            sessionId: taskState.sessionId,
            agentName: taskState.agent,
            eventType: 'multiturn_complete',
            message: `Task completed after ${taskState.turnCount} turns`,
            metadata: JSON.stringify({
              turnCount: taskState.turnCount,
              totalDurationMs: Date.now() - taskState.startedAt.getTime(),
              toolsExecuted: Array.from(taskState.toolsExecuted.entries()),
            }),
          });

          // Send end notification
          this._sendEndNotification(taskState, lastOutput);

          // Remove from registry
          this.tasks.delete(taskState.chatId);

          return lastOutput;
        }

        // Not complete — prepare continuation prompt
        prompt = this._buildContinuationPrompt(taskState, lastOutput);
      } catch (err) {
        if (err.name === 'AbortError') {
          // Pause or cancellation — not an error
          logger.debug(`SSE aborted for chat ${taskState.chatId} (turn ${taskState.turnCount})`);
          return 'Ejecución pausada.';
        }

        if (taskState.status === 'cancelling') {
          return 'Ejecución cancelada.';
        }

        // Real error
        taskState.status = 'error';
        this._stopProgressInterval(taskState);
        this.db.updateSessionStatus(taskState.sessionId, 'error');

        logAgentEvent({
          sessionId: taskState.sessionId,
          agentName: taskState.agent,
          eventType: 'multiturn_error',
          message: err.message,
          status: 'error',
          metadata: JSON.stringify({
            chatId: taskState.chatId,
            turnCount: taskState.turnCount,
          }),
        });

        this._sendEndNotification(taskState, `Error: ${err.message}`);
        this.tasks.delete(taskState.chatId);

        throw err;
      }
    }

    // Status changed to something other than running (e.g., paused)
    return 'Ejecución pausada.';
  }

  /**
   * Run a single turn by calling opencode.sendMessage().
   *
   * @param {object} taskState
   * @param {string} prompt
   * @returns {Promise<{output: string, events: Array, durationMs: number, errorCount: number}>}
   * @private
   */
  async _runTurn(taskState, prompt) {
    // Create fresh AbortController for this turn
    taskState.abortController = new AbortController();

    const result = await opencode.sendMessage(
      taskState.sessionId,
      taskState.opencodeSessionId,
      taskState.agent,
      prompt,
      {
        cwd: taskState.cwd,
        chatId: taskState.chatId,
        onEvent: taskState.onEvent,
        onApproval: this._createApprovalHandler(taskState),
        signal: taskState.abortController.signal,
      }
    );

    return result;
  }

  // -----------------------------------------------------------------------
  // Internal: Approval handler
  // -----------------------------------------------------------------------

  /**
   * Create a permission approval handler for this task.
   *
   * @param {object} taskState
   * @returns {function} onApproval callback
   * @private
   */
  _createApprovalHandler(taskState) {
    const self = this;

    return async function onApproval(request) {
      const { action, tool, permissionID, approve, reject } = request;
      const actionStr = action || tool || 'unknown';
      const isDestructive = _checkDenyList(actionStr, self.options.denyList);

      if (isDestructive) {
        try {
          await reject();
          logAgentEvent({
            sessionId: taskState.sessionId,
            agentName: taskState.agent,
            eventType: 'permission_decision',
            toolName: actionStr,
            status: 'error',
            message: `Permiso rechazado: ${actionStr}`,
            metadata: JSON.stringify({
              decision: 'rejected',
              reason: 'deny-list match',
              action: actionStr,
              permissionID,
            }),
          });

          // Send Telegram notification for rejected permissions
          self.bot
            .sendMessage(
              taskState.chatId,
              `⚠️ Permiso rechazado: ${actionStr.substring(0, 100)} (comando no permitido)`
            )
            .catch(() => {});
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
            toolName: actionStr,
            status: 'ok',
            message: `Permiso aprobado: ${actionStr}`,
            metadata: JSON.stringify({
              decision: 'approved',
              reason: 'not in deny-list',
              action: actionStr,
              permissionID,
            }),
          });
        } catch (err) {
          logger.error(`Error approving permission: ${err.message}`);
        }
      }
    };
  }

  // -----------------------------------------------------------------------
  // Internal: Completion heuristic
  // -----------------------------------------------------------------------

  /**
   * Evaluate whether the task is complete based on output and events.
   *
   * @param {object} taskState
   * @param {string} output - Last turn output
   * @param {Array} events - SSE events from the turn
   * @returns {boolean}
   * @private
   */
  _evaluateCompletion(taskState, output, events) {
    const lowerOutput = (output || '').toLowerCase();
    const hasCompletionKeyword = this.options.completionKeywords.some((kw) =>
      lowerOutput.includes(kw)
    );
    const turnToolEvents = events.filter(
      (e) => e.type === 'tool.start' || e.type === 'tool.execute'
    );
    const usedToolsThisTurn = turnToolEvents.length > 0;
    const usedToolsAcrossTask = (taskState.toolsExecuted?.size || 0) > 0 || usedToolsThisTurn;
    const substantiveOutput = _isSubstantiveCompletionOutput(output);

    if (!hasCompletionKeyword) {
      return false;
    }

    if (usedToolsAcrossTask) {
      return true;
    }

    return substantiveOutput;
  }

  /**
   * Build a continuation prompt for the next turn.
   *
   * @param {object} taskState
   * @param {string} lastOutput
   * @returns {string}
   * @private
   */
  _buildContinuationPrompt(taskState, lastOutput) {
    const originalObjective =
      taskState.originalPrompt ||
      'Retomá la tarea en progreso y reconstruí el objetivo antes de seguir trabajando.';
    const previousOutput = String(lastOutput || '').trim();
    const summarizedOutput = previousOutput
      ? previousOutput.substring(0, 600)
      : 'Sin salida útil todavía.';

    return [
      `Continuá trabajando en la tarea. Turno ${taskState.turnCount + 1}.`,
      `Objetivo original: ${originalObjective}`,
      `Último resultado observado: ${summarizedOutput}`,
      'Instrucciones: seguí con el objetivo original, verificá resultados concretos y no pierdas el contexto.',
      'No marques la tarea como completa hasta tener un resultado concreto y verificable. Si todavía falta trabajo, explicá qué falta y seguí ejecutándolo.',
    ].join('\n\n');
  }

  // -----------------------------------------------------------------------
  // Internal: Progress notifications
  // -----------------------------------------------------------------------

  /**
   * Start the periodic progress notification interval.
   *
   * @param {object} taskState
   * @private
   */
  _startProgressInterval(taskState) {
    taskState.progressInterval = setInterval(() => {
      if (taskState.status !== 'running') {
        this._stopProgressInterval(taskState);
        return;
      }
      this._sendProgressSummary(taskState);
    }, this.options.progressIntervalMs);
  }

  /**
   * Stop the progress notification interval.
   *
   * @param {object} taskState
   * @private
   */
  _stopProgressInterval(taskState) {
    if (taskState.progressInterval) {
      clearInterval(taskState.progressInterval);
      taskState.progressInterval = null;
    }
  }

  /**
   * Send a progress summary to Telegram.
   *
   * @param {object} taskState
   * @private
   */
  _sendProgressSummary(taskState) {
    const elapsed = Math.round((Date.now() - taskState.startedAt.getTime()) / 60000);
    const tools = Array.from(taskState.toolsExecuted.entries())
      .map(([name, count]) => `${name} (x${count})`)
      .join(', ');

    const msg =
      `📊 Progreso: ${elapsed} min transcurridos, ${taskState.turnCount} turnos\n` +
      `Herramientas: ${tools || 'ninguna aún'}`;

    this.bot.sendMessage(taskState.chatId, msg).catch((err) => {
      logger.warn(`Failed to send progress for chat ${taskState.chatId}: ${err.message}`);
    });
  }

  // -----------------------------------------------------------------------
  // Internal: Start/End notifications
  // -----------------------------------------------------------------------

  /**
   * Send a task start notification to Telegram.
   *
   * @param {object} taskState
   * @param {string} prompt
   * @private
   */
  _sendStartNotification(taskState, prompt) {
    const truncated = prompt.length > 200 ? prompt.substring(0, 200) + '...' : prompt;

    const msg =
      `🚀 Tarea multi-turn iniciada\n` +
      `Agente: ${taskState.agent}\n` +
      `Prompt: ${truncated}\n` +
      `Sesión: ${taskState.opencodeSessionId.substring(0, 8)}...`;

    this.bot.sendMessage(taskState.chatId, msg).catch((err) => {
      logger.warn(`Failed to send start notification: ${err.message}`);
    });
  }

  /**
   * Send a task end notification to Telegram.
   *
   * @param {object} taskState
   * @param {string} output
   * @private
   */
  _sendEndNotification(taskState, output) {
    const elapsed = Math.round((Date.now() - taskState.startedAt.getTime()) / 60000);
    const tools = Array.from(taskState.toolsExecuted.entries())
      .map(([name, count]) => `${name} (x${count})`)
      .join(', ');

    const statusEmoji =
      taskState.status === 'completed' ? '✅' : taskState.status === 'error' ? '❌' : '⏸️';

    const msg =
      `${statusEmoji} Tarea finalizada\n` +
      `Estado: ${taskState.status}\n` +
      `Duración: ${elapsed} min\n` +
      `Turnos: ${taskState.turnCount}\n` +
      `Herramientas: ${tools || 'ninguna'}`;

    this.bot.sendMessage(taskState.chatId, msg).catch((err) => {
      logger.warn(`Failed to send end notification: ${err.message}`);
    });
  }
}

// ---------------------------------------------------------------------------
// Singleton getter
// ---------------------------------------------------------------------------

/**
 * Get or create the shared MultiTurnExecutor singleton.
 *
 * @param {TelegramBot} bot - Telegram bot instance
 * @param {object} db - Database bridge instance
 * @param {object} [options] - Executor options
 * @returns {MultiTurnExecutor}
 */
function getExecutor(bot, db, options = {}) {
  if (!_instance) {
    const envProgressIntervalMs = parseInt(process.env.TELEGRAM_PROGRESS_INTERVAL_MS, 10);

    _instance = new MultiTurnExecutor(bot, db, {
      progressIntervalMs:
        options.progressIntervalMs ??
        (Number.isFinite(envProgressIntervalMs) ? envProgressIntervalMs : 45_000),
      ...options,
    });
  }
  return _instance;
}

/**
 * Reset the singleton (useful for testing).
 */
function resetExecutor() {
  if (_instance) {
    _instance.cancelAll().catch(() => {});
    _instance = null;
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  MultiTurnExecutor,
  getExecutor,
  resetExecutor,
  createSimpleApprovalHandler,
  _checkDenyList,
  classifyTaskIntent,
  shouldUseMultiTurn,
  isMultiTurnTask,
};

function _isSubstantiveCompletionOutput(output) {
  const text = String(output || '').trim();

  if (!text) return false;
  if (text.length >= 240) return true;

  const lines = text.split(/\n+/).filter(Boolean);
  if (lines.length >= 4 && text.length >= 120) return true;

  return (
    /(`[^`]+`|\/[\w./-]+|\b(archivo|archivos|resultado|resultados|verific|test|tests|comando|comandos|cambio|cambios|updated|created|fixed|implemented|ran)\b)/i.test(
      text
    ) && text.length >= 120
  );
}
