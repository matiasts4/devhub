const conversation = require('../services/conversation');
const formatter = require('../services/formatter');
const logger = require('../utils/logger');

/**
 * /nueva_sesion [full] — Start a fresh chat session.
 * Default preserves current agent.
 * Use "/nueva_sesion full" to also reset agent to gentleman.
 */
module.exports = async function nuevaSesion(bot, msg, args) {
  const chatId = msg.chat.id;

  try {
    logger.info(`/nueva_sesion called by user ${msg.from.username || msg.from.id}`);

    const mode = (args || '').trim().toLowerCase();
    const keepAgent = mode !== 'full';

    const { sessionId, agent } = conversation.startNewSession(chatId, { keepAgent });

    const note = keepAgent
      ? `Nueva sesión iniciada. Se mantiene el agente actual: *${agent}*.`
      : `Nueva sesión iniciada y agente reiniciado a *${agent}*.`;

    bot.sendMessage(
      chatId,
      formatter.formatSuccess(`${note}\nSession ID: \`${sessionId}\``),
      { parse_mode: 'Markdown' }
    );
  } catch (err) {
    logger.error(`Error en /nueva_sesion: ${err.message}`);
    bot.sendMessage(chatId, formatter.formatError(err.message), { parse_mode: 'Markdown' });
  }
};
