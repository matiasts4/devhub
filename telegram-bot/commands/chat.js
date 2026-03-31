const conversation = require('../services/conversation');
const opencode = require('../services/opencode');
const formatter = require('../services/formatter');
const logger = require('../utils/logger');

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

    // 4. Call OpenCode agent
    const response = await opencode.run(agent, contextPrompt, { timeout: 120000 });

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
    conversation.addMessage(chatId, 'assistant', response);

    // 8. Send response to Telegram (handle 4096 char limit)
    const TELEGRAM_LIMIT = 4096;
    const CHUNK_SIZE = 4000;

    if (response.length <= TELEGRAM_LIMIT) {
      bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
    } else {
      // Split into multiple messages
      const chunks = [];
      for (let i = 0; i < response.length; i += CHUNK_SIZE) {
        chunks.push(response.substring(i, i + CHUNK_SIZE));
      }

      logger.info(`Response split into ${chunks.length} chunks (${response.length} chars)`);

      for (const chunk of chunks) {
        bot.sendMessage(chatId, chunk, { parse_mode: 'Markdown' });
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

    logger.error(`Error in chat handler: ${err.message}`);
    bot.sendMessage(chatId, formatter.formatError(err.message), { parse_mode: 'Markdown' });
  }
};
