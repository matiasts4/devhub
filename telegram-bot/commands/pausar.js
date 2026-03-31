const db = require('../services/db');
const formatter = require('../services/formatter');
const logger = require('../utils/logger');

/**
 * /pausar [agente] — Pause an agent or all agents.
 * If args provided: find agent by agent_id (partial match ok) and pause it.
 * If no args: pause ALL agents with status 'working' or 'idle'.
 */
module.exports = async function pausar(bot, msg, args) {
  try {
    const chatId = msg.chat.id;

    if (args && args.trim()) {
      // Pause a specific agent by agent_id (partial match)
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

      db.pauseAgent(match.agent_id);
      logger.info(`Agente pausado: ${match.agent_id} (${match.nombre})`);

      return bot.sendMessage(
        chatId,
        formatter.formatSuccess(
          `Agente "${match.nombre}" (${match.agent_id}) pausado correctamente`
        )
      );
    }

    // Pause ALL active agents
    const agents = db.getAgents();
    const activeAgents = agents.filter((a) => a.status === 'working' || a.status === 'idle');

    if (activeAgents.length === 0) {
      return bot.sendMessage(
        chatId,
        formatter.formatSuccess('No hay agentes activos para pausar'),
        {
          parse_mode: 'Markdown',
        }
      );
    }

    for (const agent of activeAgents) {
      db.pauseAgent(agent.agent_id);
      logger.info(`Agente pausado (masivo): ${agent.agent_id} (${agent.nombre})`);
    }

    const names = activeAgents.map((a) => a.nombre || a.agent_id).join(', ');
    return bot.sendMessage(
      chatId,
      formatter.formatSuccess(`${activeAgents.length} agente(s) pausados: ${names}`)
    );
  } catch (err) {
    logger.error(`Error en /pausar: ${err.message}`);
    return bot.sendMessage(msg.chat.id, formatter.formatError(err.message), {
      parse_mode: 'Markdown',
    });
  }
};
