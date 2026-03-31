const conversation = require('../services/conversation');
const formatter = require('../services/formatter');
const logger = require('../utils/logger');

/**
 * /historial — Show recent conversation history (last 10 messages).
 */
module.exports = async function historial(bot, msg) {
  const chatId = msg.chat.id;

  try {
    logger.info(`/historial called by user ${msg.from.username || msg.from.id}`);

    const history = conversation.getHistory(chatId);

    if (history.length === 0) {
      bot.sendMessage(chatId, formatter.formatSuccess('No hay mensajes en esta conversación.'), {
        parse_mode: 'Markdown',
      });
      return;
    }

    // Limit to last 10 messages
    const recent = history.slice(-10);

    const lines = ['*📜 Historial reciente*', ''];

    for (const entry of recent) {
      const roleLabel = entry.role === 'user' ? 'Usuario' : 'Asistente';
      lines.push(`🕐 ${entry.timestamp} — ${roleLabel}: ${entry.preview}`);
    }

    bot.sendMessage(chatId, lines.join('\n'), { parse_mode: 'Markdown' });
  } catch (err) {
    logger.error(`Error en /historial: ${err.message}`);
    bot.sendMessage(chatId, formatter.formatError(err.message), { parse_mode: 'Markdown' });
  }
};
