const db = require('../services/db');
const formatter = require('../services/formatter');
const logger = require('../utils/logger');

/**
 * /estado — Shows dashboard of all active projects.
 */
module.exports = async function estado(bot, msg) {
  const chatId = msg.chat.id;

  try {
    logger.info(`/estado called by user ${msg.from.username || msg.from.id}`);

    const projects = db.getDashboard();
    const text = formatter.formatDashboard(projects);

    bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
  } catch (err) {
    logger.error(`Error in /estado: ${err.message}`);
    bot.sendMessage(chatId, formatter.formatError(err.message), { parse_mode: 'Markdown' });
  }
};
