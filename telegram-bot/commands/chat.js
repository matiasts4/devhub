const conversation = require('../services/conversation');
const sessionBridge = require('../services/session-bridge');
const formatter = require('../services/formatter');
const logger = require('../utils/logger');
const { getLLMBridgeService, resetLLMBridgeService } = require('../services/providers/llm-bridge');
const opencode = require('../services/opencode');
const api = require('../services/api');
const { createSimpleApprovalHandler } = require('../services/executor');
const fs = require('fs');
const path = require('path');

// Feature flags
const USE_OPENCODE = process.env.TELEGRAM_USE_OPENCODE !== 'false'; // default: true
const USE_MULTI_TURN = process.env.TELEGRAM_MULTI_TURN !== 'false'; // default: true
const LLM_BRIDGE_ENABLED = process.env.LLM_BRIDGE_ENABLED !== 'false';
const TRACE_PERSISTENCE = process.env.TRACE_PERSISTENCE_ENABLED !== 'false'; // default: true
const SETTINGS_PATH = path.join(__dirname, '..', '..', 'data', 'llm-providers-config.json');

// Lazy-loaded bridge instance
let llmBridge = null;
let settingsMtime = null;

function getSettingsState() {
  try {
    if (!fs.existsSync(SETTINGS_PATH)) {
      return { bridgeEnabled: LLM_BRIDGE_ENABLED, mtime: null };
    }

    const stat = fs.statSync(SETTINGS_PATH);
    const raw = fs.readFileSync(SETTINGS_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      bridgeEnabled: parsed?.bridgeEnabled !== false,
      mtime: stat.mtimeMs,
    };
  } catch (err) {
    logger.warn('Failed to read LLM settings state: ' + err.message);
    return { bridgeEnabled: LLM_BRIDGE_ENABLED, mtime: null };
  }
}

function getBridge(db) {
  const state = getSettingsState();
  if (state.mtime !== settingsMtime) {
    settingsMtime = state.mtime;
    llmBridge = null;
    resetLLMBridgeService();
  }

  if (!llmBridge) {
    llmBridge = getLLMBridgeService(db, {
      maxMessages: 30,
      maxTokens: 32000,
      maxToolIterations: 5,
      enabled: state.bridgeEnabled,
      orchestratorOptions: {
        defaultMaxRetries: 3,
        defaultTimeout: 60000,
      },
    });
  }
  return llmBridge;
}

// ---------------------------------------------------------------------------
// Telegram Markdown escaping (MarkdownV2)
// ---------------------------------------------------------------------------
function escapeForTelegram(text) {
  if (!text) return '';
  return String(text).replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

function sanitizeReply(text) {
  const raw = String(text || '');
  const userMarker = '[NUEVO MENSAJE DEL USUARIO]';
  const markerPos = raw.lastIndexOf(userMarker);
  const focused = markerPos >= 0 ? raw.substring(markerPos) : raw;

  const cleaned = focused
    .replace(/^\s*Thinking:.*$/gim, '')
    .replace(/^\s*\[INSTRUCCIONES DE SALIDA PARA TELEGRAM\].*$/gim, '')
    .replace(/^\s*\[CONTEXTO DE CONVERSACIÓN PREVIA[^\]]*\].*$/gim, '')
    .replace(/^\s*\[NUEVO MENSAJE DEL USUARIO\]\s*\n?[^\n]*\n?/gim, '')
    .replace(/^\s*(?:Usuario|Asistente):\s.*$/gim, '')
    .replace(/^\s*[→>-]\s*Read\b.*$/gim, '')
    .replace(/^\s*[⚙🔧].*$/gim, '')
    .replace(/^\s*(?:mcp\d*_|engram_|mem_|tool_)[\w.-]*\b.*$/gim, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // Fallback to original if sanitization was too aggressive
  if (cleaned.length < 24 && raw.length >= 24) return raw.trim();
  return cleaned || raw.trim();
}

function sendChunkedResponse(bot, chatId, text) {
  const TELEGRAM_LIMIT = 4096;
  const plain = String(text || 'Sin respuesta');

  if (plain.length <= TELEGRAM_LIMIT) {
    bot.sendMessage(chatId, plain);
  } else {
    // Basic structural chunking by newline to avoid breaking tags
    const lines = plain.split('\n');
    let currentChunk = '';
    const chunks = [];

    for (const line of lines) {
      if ((currentChunk.length + line.length + 1) > TELEGRAM_LIMIT) {
        if (currentChunk.trim()) {
          chunks.push(currentChunk.trim());
        }
        
        // If a single line is too long, we must hard-chunk it
        if (line.length > TELEGRAM_LIMIT) {
          let remainder = line;
          while (remainder.length > TELEGRAM_LIMIT) {
            chunks.push(remainder.substring(0, TELEGRAM_LIMIT));
            remainder = remainder.substring(TELEGRAM_LIMIT);
          }
          currentChunk = remainder + '\n';
        } else {
          currentChunk = line + '\n';
        }
      } else {
         currentChunk += line + '\n';
      }
    }
    
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    logger.info(`Response split into ${chunks.length} chunks (${plain.length} chars)`);
    for (const chunk of chunks) {
      bot.sendMessage(chatId, chunk);
    }
  }
}

/**
 * Handles regular text messages (non-command).
 * Routes user messages through OpenCode headless (default) or LLM Bridge (fallback).
 *
 * @param {TelegramBot} bot - Telegram bot instance.
 * @param {TelegramMessage} msg - Incoming message object.
 * @param {import('better-sqlite3').Database} db - SQLite database instance.
 */
module.exports = async function chat(bot, msg, db) {
  const chatId = msg.chat.id;
  const text = msg.text || '';
  let thinkingMsg;

  try {
    logger.info(
      `Chat message from user ${msg.from.username || msg.from.id}: "${text.substring(0, 60)}${text.length > 60 ? '...' : ''}"`
    );

    // 1. Get current agent (for session management)
    const agent = conversation.getAgent(chatId);

    // 2. Send "thinking" status message
    try {
      thinkingMsg = await bot.sendMessage(chatId, '⏳ Pensando...', {
        reply_to_message_id: msg.message_id,
      });
    } catch (err) {
      logger.warn(`Could not send thinking message: ${err.message}`);
    }

    const onEvent = (info) => {
      if (thinkingMsg) {
        bot
          .editMessageText(`⏳ Pensando...\n${info}`, {
            chat_id: chatId,
            message_id: thinkingMsg.message_id,
          })
          .catch(() => {});
      }
    };

    let response;

    if (USE_OPENCODE) {
      // === NEW PATH: OpenCode headless with persistent sessions ===
      // Check if this should be a multi-turn task
      if (USE_MULTI_TURN && isMultiTurnTask(text)) {
        const { getExecutor } = require('../services/executor');
        const dbBridge = require('../lib/db-bridge');
        const executor = getExecutor(bot, dbBridge);

        // Cancel any existing active task for this chat
        if (executor.hasActiveTask(chatId)) {
          await executor.cancelTask(chatId, 'replaced by new message');
          bot
            .sendMessage(chatId, '⚠️ Tarea anterior cancelada. Procesando nuevo mensaje...')
            .catch(() => {});
        }

        response = await executor.startMultiTurn(chatId, agent, text, { onEvent });
      } else {
        response = await runOpenCodeHeadless(bot, agent, text, chatId, onEvent);
      }
    } else if (LLM_BRIDGE_ENABLED && db) {
      // === FALLBACK PATH: LLM Bridge with failover ===
      const bridge = getBridge(db);
      const status = bridge.getStatus();

      if (Object.keys(status.providers).length === 0) {
        // No providers configured — fall back to legacy
        logger.warn('No LLM providers configured, falling back to legacy opencode');
        response = await runLegacyOpencode(agent, text, chatId, onEvent);
      } else {
        response = await bridge.chat(chatId, text, {
          enableTools: true,
        });
      }
    } else {
      // === LEGACY PATH: tmux-based OpenCode ===
      response = await runLegacyOpencode(agent, text, chatId, onEvent);
    }

    // 3. Delete the "thinking" message
    if (thinkingMsg) {
      try {
        await bot.deleteMessage(chatId, thinkingMsg.message_id);
      } catch (err) {
        logger.warn(`Could not delete thinking message: ${err.message}`);
      }
    }

    // 4. Send response to Telegram
    sendChunkedResponse(bot, chatId, response);

    logger.info(`Agent "${agent}" responded to chat ${chatId}`);
  } catch (err) {
    // On error: delete thinking message and show error
    if (thinkingMsg) {
      try {
        await bot.deleteMessage(chatId, thinkingMsg.message_id);
      } catch (_) {}
    }

    conversation.addMessage(chatId, 'user', text);
    const errorMsg = `⚠️ Error: ${err.message}`;
    conversation.addMessage(chatId, 'assistant', errorMsg);

    bot.sendMessage(chatId, escapeForTelegram(formatter.formatError(err.message)), {
      parse_mode: 'MarkdownV2',
    });
  }
};

/**
 * Heuristic to determine if a message should trigger multi-turn execution.
 * Multi-turn tasks are typically longer or contain SDD/implementation keywords.
 *
 * @param {string} text - User message text
 * @returns {boolean} True if this looks like a multi-turn task
 */
function isMultiTurnTask(text) {
  if (!text) return false;

  // Long messages are likely complex tasks
  if (text.length > 100) return true;

  // SDD and implementation keywords
  const keywords = [
    'implement',
    'create',
    'following',
    'build',
    'fix',
    'refactor',
    'sdd',
    'proposal',
    'design',
    'spec',
    'task',
    'workflow',
    'implementar',
    'crear',
    'construir',
    'arreglar',
    'corregir',
  ];

  const lower = text.toLowerCase();
  return keywords.some((kw) => lower.includes(kw));
}

/**
 * Run a message through OpenCode headless with persistent sessions.
 * Resolves session via session-bridge, sends message, and optionally
 * persists traces to the Next.js API.
 *
 * @param {TelegramBot} bot - Telegram bot instance (for permission notifications).
 * @param {string} agent - Agent name.
 * @param {string} text - User message.
 * @param {string|number} chatId - Telegram chat ID.
 * @param {function} onEvent - Callback for real-time events.
 * @returns {Promise<string>} Sanitized response.
 */
async function runOpenCodeHeadless(bot, agent, text, chatId, onEvent) {
  // 1. Resolve or create session
  const { session, isNew } = await sessionBridge.resolveSession(chatId);
  const directory = session?.directory || process.cwd();

  if (isNew) {
    logger.info(`New OpenCode session created: ${session.id}`);
  }

  // 2. Build prompt (with or without context)
  const contextPrompt = conversation.buildContextPrompt(chatId, text);

  const MAX_RETRIES = 2;
  const BASE_DELAY_MS = 1_000;
  let result;
  let lastError;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
        logger.info(`Retry attempt ${attempt}/${MAX_RETRIES} after ${delay}ms`);
        await new Promise((r) => setTimeout(r, delay));
      }

      result = await opencode.sendMessage(
        session.id,
        session.opencode_session_id,
        agent,
        contextPrompt,
        {
          cwd: directory,
          chatId: String(chatId),
          onEvent,
          onApproval: createSimpleApprovalHandler(session.id, agent, String(chatId), { bot }),
        }
      );

      lastError = null;
      break;
    } catch (err) {
      lastError = err;
      logger.warn(
        `OpenCode sendMessage failed (attempt ${attempt + 1}/${MAX_RETRIES + 1}): ${err.message}`
      );
    }
  }

  if (lastError && !result) {
    throw lastError;
  }

  // 3. Persist traces to Next.js API (if enabled)
  if (TRACE_PERSISTENCE && result?.events?.length > 0) {
    persistTraces(session.id, result.events, String(chatId)).catch((err) => {
      logger.warn(`Failed to persist traces: ${err.message}`);
    });
  }

  // 4. Store usage stats
  if (result?.durationMs != null) {
    const { upsertUsage } = require('../lib/db-bridge');
    upsertUsage({
      session_id: session.id,
      total_duration_ms: result.durationMs,
      tool_calls_count:
        result.events?.filter((e) => e.type === 'tool.execute' || e.type === 'tool.start').length ||
        0,
    });
  }

  // 5. Add messages to conversation history
  conversation.addMessage(chatId, 'user', text);
  const output = result?.output || 'Sin respuesta del agente.';
  conversation.addMessage(chatId, 'assistant', output);

  return sanitizeReply(output);
}

/**
 * Persist trace events to the Next.js API for web UI visibility.
 *
 * @param {string} sessionId - AgentHub session ID.
 * @param {Array} events - SSE events from OpenCode.
 * @param {string} telegramChatId - Telegram chat ID.
 */
async function persistTraces(sessionId, events, telegramChatId) {
  const traces = [];

  for (const event of events) {
    const props = event.properties || {};
    const eventType = event.type || '';

    let traceType = 'text';
    if (eventType.includes('tool')) {
      traceType =
        eventType.includes('start') || eventType.includes('execute') ? 'tool_start' : 'tool_end';
    } else if (eventType.includes('session.status')) {
      traceType = 'session_status';
    } else if (eventType.includes('message.assistant') || eventType.includes('text.delta')) {
      traceType = 'text';
    }

    traces.push({
      session_id: sessionId,
      trace_type: traceType,
      tool_name: props.name || props.tool || null,
      tool_input: props.input ? JSON.stringify(props.input) : null,
      tool_output: props.output || null,
      tool_status: eventType.includes('error') ? 'error' : 'ok',
      content: props.text || props.delta || props.message || null,
      metadata: JSON.stringify({
        source: 'telegram',
        telegram_chat_id: telegramChatId,
        event_type: eventType,
      }),
    });
  }

  if (traces.length === 0) return;

  const NEXT_JS_URL = process.env.NEXT_JS_URL || 'http://localhost:3000';

  await fetch(`${NEXT_JS_URL}/api/agenthub/traces/persist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ traces }),
  });
}

/**
 * Legacy OpenCode runner (tmux-based) — kept as fallback.
 *
 * @param {string} agent - Current agent name.
 * @param {string} text - User message.
 * @param {string|number} chatId - Telegram chat ID.
 * @returns {Promise<string>} Sanitized response.
 */
async function runLegacyOpencode(agent, text, chatId, onEvent) {
  const contextPrompt = conversation.buildContextPrompt(chatId, text);

  const MAX_RETRIES = 2;
  const BASE_DELAY_MS = 1_000;
  let response;
  let lastError;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
        logger.info(`Retry attempt ${attempt}/${MAX_RETRIES} after ${delay}ms`);
        await new Promise((r) => setTimeout(r, delay));
      }
      response = await opencode.run(agent, contextPrompt, { timeout: 120_000, onEvent });
      lastError = null;
      break;
    } catch (err) {
      lastError = err;
      logger.warn(
        `OpenCode run failed (attempt ${attempt + 1}/${MAX_RETRIES + 1}): ${err.message}`
      );
    }
  }

  if (lastError && !response) {
    throw lastError;
  }

  return sanitizeReply(response);
}
