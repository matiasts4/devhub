const db = require('../services/db');
const api = require('../services/api');
const formatter = require('../services/formatter');
const logger = require('../utils/logger');

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
  try {
    const chatId = msg.chat.id;

    // 1. Parse project name/id from args
    if (!args || !args.trim()) {
      return bot.sendMessage(
        chatId,
        formatter.formatError('Uso: /continuar <proyecto>. Ejemplo: /continuar devhub'),
        { parse_mode: 'Markdown' }
      );
    }

    // 2. Find project
    const project = db.getProjectByName(args.trim());
    if (!project) {
      return bot.sendMessage(
        chatId,
        formatter.formatError(`No se encontró el proyecto "${args.trim()}"`),
        { parse_mode: 'Markdown' }
      );
    }

    // 4. Get next task
    const task = db.getNextTask(project.id);
    if (!task) {
      return bot.sendMessage(
        chatId,
        formatter.formatSuccess('No hay tareas pendientes disponibles'),
        { parse_mode: 'Markdown' }
      );
    }

    // 6. Check Next.js health
    try {
      await api.health();
    } catch {
      return bot.sendMessage(chatId, formatter.formatError('Next.js no está corriendo'), {
        parse_mode: 'Markdown',
      });
    }

    // 7. Generate unique agent_id
    const agentId = `telegram-${Date.now()}`;

    // 8. Register agent in DB
    const conn = db.getDb();
    try {
      conn
        .prepare(
          `INSERT INTO agent_registry (agent_id, project_id, nombre, modelo_llm, status, current_task_id, last_heartbeat, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), datetime('now'))`
        )
        .run(agentId, project.id, `Telegram Auto`, 'default', 'working', task.id);
    } finally {
      conn.close();
    }

    logger.info(
      `Agente registrado: ${agentId} para tarea "${task.title}" en proyecto "${project.name}"`
    );

    // Send processing message
    bot.sendMessage(chatId, '⏳ Procesando...', { parse_mode: 'Markdown' });

    // 9-11. Execute, build prompt, and launch — wrapped in try/catch
    try {
      // 9. Execute agent (assign task, create git branch)
      await api.executeAgent({ taskId: task.id, agentId });

      // 10. Build prompt
      const promptResponse = await api.buildPrompt({ taskId: task.id, agentId });

      // Handle different response formats
      let promptText;
      if (promptResponse && promptResponse.prompt) {
        promptText = promptResponse.prompt;
      } else if (promptResponse && promptResponse.content) {
        promptText = promptResponse.content;
      } else if (typeof promptResponse === 'string') {
        promptText = promptResponse;
      } else {
        // Fallback to task title + description
        promptText = task.description ? `${task.title}\n\n${task.description}` : task.title;
      }

      // 11. Launch agent with the built prompt
      try {
        await api.launchAgent({
          task: promptText,
          profileName: 'default',
          projectId: project.id,
        });
      } catch (launchErr) {
        logger.warn(
          `Launch falló con prompt completo, intentando versión simple: ${launchErr.message}`
        );
        // Fallback: simpler launch with just task title
        await api.launchAgent({
          task: task.title,
          profileName: 'default',
          projectId: project.id,
        });
      }

      // 12. Success response
      logger.info(`Agente ${agentId} lanzado exitosamente para tarea "${task.title}"`);
      return bot.sendMessage(chatId, formatter.formatLaunch(task.title, agentId, 'default'), {
        parse_mode: 'Markdown',
      });
    } catch (err) {
      // Agent is already registered, but report the error
      logger.error(`Error lanzando agente ${agentId}: ${err.message}`);
      return bot.sendMessage(
        chatId,
        formatter.formatError(
          `Agente registrado (${agentId}) pero falló el lanzamiento: ${err.message}`
        ),
        { parse_mode: 'Markdown' }
      );
    }
  } catch (err) {
    logger.error(`Error en /continuar: ${err.message}`);
    return bot.sendMessage(msg.chat.id, formatter.formatError(err.message), {
      parse_mode: 'Markdown',
    });
  }
};
