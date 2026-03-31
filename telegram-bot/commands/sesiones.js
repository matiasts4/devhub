const api = require('../services/api');
const formatter = require('../services/formatter');
const logger = require('../utils/logger');

/**
 * /sesiones — Show active OpenCode sessions.
 * Call api.getSessions()
 * Format the response as a simple list
 * If no sessions, say "No hay sesiones activas"
 */
module.exports = async function sesiones(bot, msg) {
  try {
    const chatId = msg.chat.id;

    const sessions = await api.getSessions();

    if (!sessions || sessions.length === 0) {
      return bot.sendMessage(chatId, formatter.formatSuccess('No hay sesiones activas'), {
        parse_mode: 'Markdown',
      });
    }

    const lines = ['*🖥 Sesiones activas*', ''];

    for (const s of sessions) {
      const id = s.id || s.session_id || 'desconocido';
      const project = s.project || s.project_name || '—';
      const status = s.status || 'unknown';
      const agent = s.agent || s.agent_id || '—';

      lines.push(`• *${esc(id)}*`);
      lines.push(`  Proyecto: ${esc(project)} | Estado: ${esc(status)} | Agente: ${esc(agent)}`);
      lines.push('');
    }

    logger.info(`Sesiones activas: ${sessions.length}`);
    return bot.sendMessage(chatId, lines.join('\n'), { parse_mode: 'Markdown' });
  } catch (err) {
    logger.error(`Error en /sesiones: ${err.message}`);
    return bot.sendMessage(msg.chat.id, formatter.formatError(err.message), {
      parse_mode: 'Markdown',
    });
  }
};

function esc(text) {
  if (text == null) return '';
  return String(text).replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');
}
