const { quarantineLegacyCommand } = require('../services/command-quarantine');

/**
 * /continuar [proyecto] — Get next task and launch an agent for it.
 *
 * Steps:
 * 1. Parse project name/id from args
 * 2. Find project with db.getProjectByName(args)
 * 3. If no project found, show error
 * 4. Get next task with db.getNextTask(project.id)
 * 5. If no task available, respond "No hay tareas pendientes disponibles"
 * 6. Check if Next.js is running with api.health() — if not, error "Next.js no está corriendo"
 * 7. Generate a unique agent_id: `telegram-${Date.now()}`
 * 8. Register agent in DB (use db.getDb() directly to insert into agent_registry)
 * 9. Call api.executeAgent({ taskId: task.id, agentId })
 * 10. Call api.buildPrompt({ taskId: task.id, agentId })
 * 11. Call api.launchAgent({ task: prompt_text, profileName: 'default', projectId: project.id })
 * 12. Respond with formatter.formatLaunch(task.title, agentId, 'default')
 *
 * Steps 9-11 are wrapped in try/catch. If any step fails,
 * the agent is still registered but the error is reported.
 * The prompt from buildPrompt might be in different formats — check the response structure.
 * If buildPrompt returns { prompt: '...' } use that. If it returns { content: '...' } use that.
 * If launchAgent fails, try a simpler launch with just task.title as the task description.
 */
module.exports = async function continuar(bot, msg, args) {
  return quarantineLegacyCommand(bot, msg, 'continuar');
};
