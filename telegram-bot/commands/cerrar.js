const sessionBridge = require('../services/session-bridge');
const db = require('../lib/db-bridge');
const formatter = require('../services/formatter');
const logger = require('../utils/logger');

/**
 * /cerrar — Mark the current active session as completed.
 *
 * Ends and archives the active session without starting a new one.
 * The next message will automatically create a fresh session.
 */
module.exports = async function cerrar(bot, msg, _args) {
  const chatId = msg.chat.id;

  try {
    logger.info(`/cerrar called by user ${msg.from.username || msg.from.id}`);

    const existing = sessionBridge.getActiveSession(chatId);

    if (!existing) {
      return bot.sendMessage(chatId, '⚠️ No hay ninguna sesión activa para cerrar.', {
        parse_mode: 'Markdown',
      });
    }

    db.updateSessionStatus(existing.id, 'completed');
    logger.info(`Session ${existing.id} closed for chat ${chatId}`);

    const shortId = existing.id.substring(0, 8);

    await bot.sendMessage(
      chatId,
      formatter.formatSuccess(`✅ Sesión actual terminada y archivada.\nID: \`${shortId}\``),
      { parse_mode: 'Markdown' }
    );
  } catch (err) {
    logger.error(`Error en /cerrar: ${err.message}`);
    bot.sendMessage(chatId, formatter.formatError(err.message), { parse_mode: 'Markdown' });
  }
};
