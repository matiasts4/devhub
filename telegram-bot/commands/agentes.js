const db = require('../services/db');
const formatter = require('../services/formatter');
const logger = require('../utils/logger');

/**
 * /agentes — Shows status of all registered agents.
 */
module.exports = async function agentes(bot, msg) {
  const chatId = msg.chat.id;

  try {
    logger.info(`/agentes called by user ${msg.from.username || msg.from.id}`);

    const agents = db.getAgents();
    const text = formatter.formatAgents(agents);

    bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
  } catch (err) {
    logger.error(`Error in /agentes: ${err.message}`);
    bot.sendMessage(chatId, formatter.formatError(err.message), { parse_mode: 'Markdown' });
  }
};
