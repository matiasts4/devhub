const conversation = require('../services/conversation');
const opencode = require('../services/opencode');
const formatter = require('../services/formatter');
const logger = require('../utils/logger');
const { quarantineLegacyCommand } = require('../services/command-quarantine');

/**
 * /agente [nombre] — View or change the current agent for this chat.
 */
module.exports = async function agente(bot, msg, args) {
  const chatId = msg.chat.id;

  try {
    logger.info(`/agente called by user ${msg.from.username || msg.from.id}`);

    // No args — show current agent
    if (!args) {
      const currentAgent = conversation.getAgent(chatId);
      bot.sendMessage(chatId, formatter.formatSuccess(`Agente actual: *${currentAgent}*`), {
        parse_mode: 'Markdown',
      });
      return;
    }

    // Telegram stays read-only for local provider/agent orchestration.
    return quarantineLegacyCommand(bot, msg, 'agente', 'agente', {
      commandText: `/agente ${args}`,
    });

    // Validate against known agents
    const knownAgents = ['gentleman', 'sdd-orchestrator', 'build', 'plan', 'qa'];
    const requested = args.toLowerCase().trim();

    if (!knownAgents.includes(requested)) {
      bot.sendMessage(
        chatId,
        formatter.formatError(
          `Agente "${requested}" no reconocido. Agentes disponibles: ${knownAgents.join(', ')}`
        ),
        { parse_mode: 'Markdown' }
      );
      return;
    }

    // Set the new agent
    conversation.setAgent(chatId, requested);
    logger.info(`Agente cambiado a "${requested}" en chat ${chatId}`);

    bot.sendMessage(chatId, formatter.formatSuccess(`Agente cambiado a *${requested}*`), {
      parse_mode: 'Markdown',
    });
  } catch (err) {
    logger.error(`Error en /agente: ${err.message}`);
    bot.sendMessage(chatId, formatter.formatError(err.message), { parse_mode: 'Markdown' });
  }
};
