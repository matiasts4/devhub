const sessionBridge = require('../services/session-bridge');
const formatter = require('../services/formatter');
const logger = require('../utils/logger');

/**
 * /cambiar <id> — Switch to a different session by ID.
 *
 * Alias for "session switch <id>".
 * Usage: /cambiar <session-id>
 */
module.exports = async function cambiar(bot, msg, args) {
  const chatId = msg.chat.id;

  try {
    logger.info(`/cambiar called by user ${msg.from.username || msg.from.id}`);

    const sessionId = (args || '').trim();

    if (!sessionId) {
      return bot.sendMessage(chatId, '⚠️ Uso: /cambiar <id-de-sesion>', {
        parse_mode: 'Markdown',
      });
    }

    const result = sessionBridge.switchSession(chatId, sessionId);

    if (!result) {
      return bot.sendMessage(
        chatId,
        formatter.formatError(
          `Sesión "${sessionId}" no encontrada.\nUsá /sesiones para ver las disponibles.`
        ),
        { parse_mode: 'Markdown' }
      );
    }

    const shortId = result.id.substring(0, 8);
    const title = result.title || '—';

    await bot.sendMessage(
      chatId,
      formatter.formatSuccess(`Sesión cambiada.\nID: \`${shortId}\`\nTítulo: ${title}`),
      { parse_mode: 'Markdown' }
    );
  } catch (err) {
    logger.error(`Error en /cambiar: ${err.message}`);
    bot.sendMessage(chatId, formatter.formatError(err.message), { parse_mode: 'Markdown' });
  }
};
