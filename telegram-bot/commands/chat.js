const conversation = require('../services/conversation');
const opencode = require('../services/opencode');
const formatter = require('../services/formatter');
const logger = require('../utils/logger');

// ---------------------------------------------------------------------------
// Telegram Markdown escaping (MarkdownV2)
// Characters that MUST be escaped: _ * [ ] ( ) ~ ` > # + - = | { } . !
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
 * Routes user messages through the configured OpenCode agent.
 */
module.exports = async function chat(bot, msg) {
  const chatId = msg.chat.id;
  const text = msg.text || '';
  let thinkingMsg;

  try {
    logger.info(
      `Chat message from user ${msg.from.username || msg.from.id}: "${text.substring(0, 60)}${text.length > 60 ? '...' : ''}"`
    );

    // 1. Get current agent
    const agent = conversation.getAgent(chatId);

    // 2. Build context prompt with conversation history
    const contextPrompt = conversation.buildContextPrompt(chatId, text);

    // 3. Send "thinking" status message
    try {
      thinkingMsg = await bot.sendMessage(chatId, '⏳ Pensando...', {
        reply_to_message_id: msg.message_id,
      });
    } catch (err) {
      logger.warn(`Could not send thinking message: ${err.message}`);
    }

    // 4. Call OpenCode agent with retry + exponential backoff
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

    // If all retries failed, preserve error in conversation context and notify user
    if (lastError && !response) {
      // Save error as assistant message so next turn has context of the failure
      const errorMsg = `⚠️ Error: ${lastError.message}`;
      conversation.addMessage(chatId, 'user', text);
      conversation.addMessage(chatId, 'assistant', errorMsg);

      if (thinkingMsg) {
        try {
          await bot.deleteMessage(chatId, thinkingMsg.message_id);
        } catch (_) {}
      }

      bot.sendMessage(chatId, escapeForTelegram(errorMsg), { parse_mode: 'MarkdownV2' });
      return;
    }

    const finalReply = sanitizeReply(response);

    // 5. Delete the "thinking" message
    if (thinkingMsg) {
      try {
        await bot.deleteMessage(chatId, thinkingMsg.message_id);
      } catch (err) {
        logger.warn(`Could not delete thinking message: ${err.message}`);
      }
    }

    // 6. Add user message to conversation
    conversation.addMessage(chatId, 'user', text);

    // 7. Add assistant response to conversation
    conversation.addMessage(chatId, 'assistant', finalReply);

    // 8. Send response to Telegram as plain text for better readability
    const TELEGRAM_LIMIT = 4096;
    const CHUNK_SIZE = 4000;
    const plain = String(finalReply || '');

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
    // 9. On error: delete thinking message and show error
    if (thinkingMsg) {
      try {
        await bot.deleteMessage(chatId, thinkingMsg.message_id);
      } catch (deleteErr) {
        // Ignore delete errors
      }
    }

    // Preserve error in conversation context
    conversation.addMessage(chatId, 'user', text);
    const errorMsg = `⚠️ Error: ${err.message}`;
    conversation.addMessage(chatId, 'assistant', errorMsg);

    bot.sendMessage(chatId, escapeForTelegram(formatter.formatError(err.message)), {
      parse_mode: 'MarkdownV2',
    });
  }
};
