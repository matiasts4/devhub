const conversation = require('../services/conversation');
const formatter = require('../services/formatter');
const logger = require('../utils/logger');

/**
 * /reset — Reset current conversation history.
 */
module.exports = async function reset(bot, msg) {
  const chatId = msg.chat.id;

  try {
    logger.info(`/reset called by user ${msg.from.username || msg.from.id}`);

    conversation.resetConversation(chatId);
    logger.info(`Conversación reiniciada en chat ${chatId}`);

    bot.sendMessage(chatId, formatter.formatSuccess('Conversación reiniciada. Historial limpio.'), {
      parse_mode: 'Markdown',
    });
  } catch (err) {
    logger.error(`Error en /reset: ${err.message}`);
    bot.sendMessage(chatId, formatter.formatError(err.message), { parse_mode: 'Markdown' });
  }
};
