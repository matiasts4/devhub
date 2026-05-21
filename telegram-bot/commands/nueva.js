const sessionBridge = require('../services/session-bridge');
const db = require('../lib/db-bridge');
const formatter = require('../services/formatter');
const logger = require('../utils/logger');

/**
 * /nueva — Close current session and start a fresh one.
 *
 * - Closes the current active session (marks it as 'completed').
 * - Forces creation of a new blank session.
 */
module.exports = async function nueva(bot, msg, _args) {
  const chatId = msg.chat.id;

  try {
    logger.info(`/nueva called by user ${msg.from.username || msg.from.id}`);

    // Check for an existing active session
    const existing = sessionBridge.getActiveSession(chatId);

    let projectId = null;
    let directory = null;

    if (existing) {
      projectId = existing.project_id;
      directory = existing.directory;
      db.updateSessionStatus(existing.id, 'completed');
      logger.info(`Session ${existing.id} marked as completed for chat ${chatId}`);
    }

    // Force a new session inheriting the previous project/dir if available
    const session = await sessionBridge.createSession(chatId, projectId, directory);
    const shortId = session.id.substring(0, 8);

    await bot.sendMessage(
      chatId,
      formatter.formatSuccess(
        `✅ Sesión anterior cerrada. Iniciando nueva sesión en blanco.\nID: \`${shortId}\``
      ),
      { parse_mode: 'Markdown' }
    );
  } catch (err) {
    logger.error(`Error en /nueva: ${err.message}`);
    bot.sendMessage(chatId, formatter.formatError(err.message), { parse_mode: 'Markdown' });
  }
};
