const db = require('../services/db');
const formatter = require('../services/formatter');
const logger = require('../utils/logger');

/**
 * /reanudar [agente] — Resume a paused agent.
 * If args provided: find agent by agent_id and resume it.
 * If no args: resume ALL paused agents.
 */
module.exports = async function reanudar(bot, msg, args) {
  try {
    const chatId = msg.chat.id;

    if (args && args.trim()) {
      // Resume a specific agent by agent_id (partial match)
      const search = args.trim();
      const agents = db.getAgents();
      const match = agents.find(
        (a) =>
          a.agent_id === search ||
          a.agent_id.includes(search) ||
          (a.nombre && a.nombre.toLowerCase().includes(search.toLowerCase()))
      );

      if (!match) {
        return bot.sendMessage(
          chatId,
          formatter.formatError(`No se encontró ningún agente con "${search}"`),
          {
            parse_mode: 'Markdown',
          }
        );
      }

      db.resumeAgent(match.agent_id);
      logger.info(`Agente reanudado: ${match.agent_id} (${match.nombre})`);

      return bot.sendMessage(
        chatId,
        formatter.formatSuccess(
          `Agente "${match.nombre}" (${match.agent_id}) reanudado correctamente`
        )
      );
    }

    // Resume ALL paused agents
    const agents = db.getAgents();
    const pausedAgents = agents.filter((a) => a.status === 'paused');

    if (pausedAgents.length === 0) {
      return bot.sendMessage(
        chatId,
        formatter.formatSuccess('No hay agentes pausados para reanudar'),
        {
          parse_mode: 'Markdown',
        }
      );
    }

    for (const agent of pausedAgents) {
      db.resumeAgent(agent.agent_id);
      logger.info(`Agente reanudado (masivo): ${agent.agent_id} (${agent.nombre})`);
    }

    const names = pausedAgents.map((a) => a.nombre || a.agent_id).join(', ');
    return bot.sendMessage(
      chatId,
      formatter.formatSuccess(`${pausedAgents.length} agente(s) reanudados: ${names}`)
    );
  } catch (err) {
    logger.error(`Error en /reanudar: ${err.message}`);
    return bot.sendMessage(msg.chat.id, formatter.formatError(err.message), {
      parse_mode: 'Markdown',
    });
  }
};
