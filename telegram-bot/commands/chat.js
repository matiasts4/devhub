const conversation = require('../services/conversation');
const formatter = require('../services/formatter');
const logger = require('../utils/logger');
const { getLLMBridgeService, resetLLMBridgeService } = require('../services/providers/llm-bridge');
const fs = require('fs');
const path = require('path');

// Feature flag — set LLM_BRIDGE_ENABLED=false to use legacy opencode.js
const LLM_BRIDGE_ENABLED = process.env.LLM_BRIDGE_ENABLED !== 'false';
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

/**
 * Handles regular text messages (non-command).
 * Routes user messages through the LLM Bridge (or legacy OpenCode if disabled).
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

    let response;

    if (LLM_BRIDGE_ENABLED && db) {
      // === NEW PATH: LLM Bridge with failover ===
      const bridge = getBridge(db);
      const status = bridge.getStatus();

      if (Object.keys(status.providers).length === 0) {
        // No providers configured — fall back to legacy
        logger.warn('No LLM providers configured, falling back to legacy opencode');
        response = await runLegacyOpencode(agent, text, chatId);
      } else {
        response = await bridge.chat(chatId, text, {
          enableTools: true,
        });
      }
    } else {
      // === LEGACY PATH: tmux-based OpenCode ===
      response = await runLegacyOpencode(agent, text, chatId);
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
    const TELEGRAM_LIMIT = 4096;
    const CHUNK_SIZE = 4000;
    const plain = String(response || 'Sin respuesta');

    if (plain.length <= TELEGRAM_LIMIT) {
      bot.sendMessage(chatId, plain);
    } else {
      const chunks = [];
      for (let i = 0; i < plain.length; i += CHUNK_SIZE) {
        chunks.push(plain.substring(i, i + CHUNK_SIZE));
      }
      logger.info(`Response split into ${chunks.length} chunks (${plain.length} chars)`);
      for (const chunk of chunks) {
        bot.sendMessage(chatId, chunk);
      }
    }

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
 * Legacy OpenCode runner (tmux-based) — kept as fallback.
 *
 * @param {string} agent - Current agent name.
 * @param {string} text - User message.
 * @param {string|number} chatId - Telegram chat ID.
 * @returns {Promise<string>} Sanitized response.
 */
async function runLegacyOpencode(agent, text, chatId) {
  const opencode = require('../services/opencode');
  const contextPrompt = conversation.buildContextPrompt(chatId, text);

  const MAX_RETRIES = 2;
  const BASE_DELAY_MS = 3_000;
  let response;
  let lastError;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
        logger.info(`Retry attempt ${attempt}/${MAX_RETRIES} after ${delay}ms`);
        await new Promise((r) => setTimeout(r, delay));
      }
      response = await opencode.run(agent, contextPrompt, { timeout: 120_000 });
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
