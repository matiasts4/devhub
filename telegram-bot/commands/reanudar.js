const { quarantineLegacyCommand } = require('../services/command-quarantine');

/**
 * /reanudar [agente] — Resume a paused agent.
 * If args provided: find agent by agent_id and resume it.
 * If no args: resume ALL paused agents.
 *
 * Multi-turn integration: If there's a paused multi-turn session for this chat,
 * it takes priority and resumes the SSE execution loop. Falls back to the
 * existing DB-only behavior when no paused multi-turn session exists.
 */
module.exports = async function reanudar(bot, msg, args) {
  return quarantineLegacyCommand(bot, msg, 'reanudar');
};
