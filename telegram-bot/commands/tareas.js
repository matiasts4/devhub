const db = require('../services/db');
const formatter = require('../services/formatter');
const logger = require('../utils/logger');

/**
 * /tareas [proyecto] — Shows pending/in_progress tasks for a project.
 *
 * If no project is specified, lists tasks from the first active project.
 */
module.exports = async function tareas(bot, msg, args) {
  const chatId = msg.chat.id;

  try {
    logger.info(
      `/tareas called by user ${msg.from.username || msg.from.id}${args ? ` with args: "${args}"` : ''}`
    );

    let project;

    if (args && args.trim()) {
      // User specified a project name or ID
      project = db.getProjectByName(args.trim());

      if (!project) {
        bot.sendMessage(chatId, formatter.formatError(`Proyecto "${args.trim()}" no encontrado`), {
          parse_mode: 'Markdown',
        });
        return;
      }
    } else {
      // No project specified — use first active project
      const activeProjects = db.getActiveProjects();

      if (!activeProjects || activeProjects.length === 0) {
        bot.sendMessage(chatId, formatter.formatError('No hay proyectos activos'), {
          parse_mode: 'Markdown',
        });
        return;
      }

      project = activeProjects[0];
    }

    const tasks = db.getTasks(project.id);
    const text = formatter.formatTasks(tasks, project.name);

    bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
  } catch (err) {
    logger.error(`Error in /tareas: ${err.message}`);
    bot.sendMessage(chatId, formatter.formatError(err.message), { parse_mode: 'Markdown' });
  }
};
