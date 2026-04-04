const sessionBridge = require('../services/session-bridge');
const api = require('../services/api');
const formatter = require('../services/formatter');
const logger = require('../utils/logger');
const { getUsage } = require('../lib/db-bridge');

/**
 * /sesiones — Enhanced session listing.
 *
 * Queries agent_hub_sessions via sessionBridge for local session history,
 * with token usage and project info. Falls back to API for remote sessions.
 */
module.exports = async function sesiones(bot, msg) {
  try {
    const chatId = msg.chat.id;

    // Get sessions for this Telegram chat
    const sessions = sessionBridge.getSessions(chatId, 10);

    if (!sessions || sessions.length === 0) {
      return bot.sendMessage(chatId, '📋 No hay sesiones. Usá /session para crear una.', {
        parse_mode: 'Markdown',
      });
    }

    const lines = ['📋 *Sesiones recientes*', ''];

    for (let i = 0; i < sessions.length; i++) {
      const s = sessions[i];
      const shortId = s.id.substring(0, 8);
      const isActive = s.status === 'active' || s.status === 'busy';
      const icon = isActive ? '🟢' : s.status === 'completed' ? '✅' : '⚪';

      const title = s.title || `Sesión ${shortId}`;
      const project = s.project_id ? s.project_id.substring(0, 8) : '—';
      const updated = s.updated_at ? timeSince(s.updated_at) : '—';

      lines.push(`${icon} *${i + 1}. ${esc(title)}*`);
      lines.push(`   ID: \`${shortId}\` | Proyecto: ${esc(project)} | ${updated}`);

      // Show token usage if available
      const usage = getUsage(s.id);
      if (usage && usage.total_tokens > 0) {
        lines.push(`   Tokens: ${usage.total_tokens} | Tools: ${usage.tool_calls_count || 0}`);
      }

      lines.push('');
    }

    lines.push('💡 Usá /session switch <id> para cambiar de sesión');

    logger.info(`Sesiones para chat ${chatId}: ${sessions.length}`);
    return bot.sendMessage(chatId, lines.join('\n'), { parse_mode: 'Markdown' });
  } catch (err) {
    logger.error(`Error en /sesiones: ${err.message}`);
    return bot.sendMessage(msg.chat.id, formatter.formatError(err.message), {
      parse_mode: 'Markdown',
    });
  }
};

function timeSince(isoString) {
  if (!isoString) return 'desconocido';
  const then = new Date(isoString).getTime();
  const now = Date.now();
  const diffMs = Math.max(0, now - then);
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'hace <1 min';
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `hace ${days}d`;
}

function esc(text) {
  if (text == null) return '';
  return String(text).replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');
}
