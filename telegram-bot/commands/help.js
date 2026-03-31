const formatter = require('../services/formatter');
const logger = require('../utils/logger');

/**
 * /help — Shows list of available commands.
 */
module.exports = async function help(bot, msg) {
  const chatId = msg.chat.id;

  try {
    logger.info(`/help called by user ${msg.from.username || msg.from.id}`);

    const text = formatter.formatHelp();

    bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
  } catch (err) {
    logger.error(`Error in /help: ${err.message}`);
    bot.sendMessage(chatId, formatter.formatError(err.message), { parse_mode: 'Markdown' });
  }
};
