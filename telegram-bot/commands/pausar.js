const db = require('../services/db');
const formatter = require('../services/formatter');
const logger = require('../utils/logger');

/**
 * /pausar [agente] — Pause an agent or all agents.
 * If args provided: find agent by agent_id (partial match ok) and pause it.
 * If no args: pause ALL agents with status 'working' or 'idle'.
 *
 * Multi-turn integration: If there's an active multi-turn task for this chat,
 * it takes priority and pauses the SSE execution loop. Falls back to the
 * existing DB-only behavior when no multi-turn task is active.
 */
module.exports = async function pausar(bot, msg, args) {
  try {
    const chatId = msg.chat.id;

    // === Multi-turn executor integration ===
    const USE_MULTI_TURN = process.env.TELEGRAM_MULTI_TURN !== 'false';
    if (USE_MULTI_TURN) {
      const { getExecutor } = require('../services/executor');
      const dbBridge = require('../lib/db-bridge');
      const executor = getExecutor(bot, dbBridge);

      // Check for active multi-turn task
      if (executor.hasActiveTask(chatId)) {
        const result = await executor.pauseTask(chatId);
        if (result) {
          logger.info(`Multi-turn task paused for chat ${chatId}: ${result.turnCount} turns`);
          return; // Executor already sent the confirmation message
        }
      }
    }

    // === Fallback: existing DB-only behavior ===
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
