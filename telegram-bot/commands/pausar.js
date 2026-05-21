const { quarantineLegacyCommand } = require('../services/command-quarantine');

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
  return quarantineLegacyCommand(bot, msg, 'pausar');
};
