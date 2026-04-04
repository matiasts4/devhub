const sessionBridge = require('../services/session-bridge');
const opencode = require('../services/opencode');
const formatter = require('../services/formatter');
const logger = require('../utils/logger');
const { getUsage } = require('../lib/db-bridge');

/**
 * /status — Show current session status, active tools, token usage.
 */
module.exports = async function status(bot, msg) {
  const chatId = msg.chat.id;

  try {
    const active = sessionBridge.getActiveSession(chatId);

    if (!active) {
      return bot.sendMessage(chatId, '⚠️ No hay sesión activa. Usá /session para crear una.', {
        parse_mode: 'Markdown',
      });
    }

    const serverStatus = opencode.getServerStatus();
    const usage = getUsage(active.id);
    const shortId = active.id.substring(0, 8);
    const ocId = active.opencode_session_id ? active.opencode_session_id.substring(0, 12) : '—';

    const serverLine = serverStatus.running
      ? `🟢 OpenCode: puerto activo`
      : `⚪ OpenCode: no iniciado`;

    let usageLines = '';
    if (usage) {
      usageLines =
        `\n\n📊 *Uso de tokens*\n` +
        `Prompt: ${usage.prompt_tokens || 0}\n` +
        `Completion: ${usage.completion_tokens || 0}\n` +
        `Total: ${usage.total_tokens || 0}\n` +
        `Tool calls: ${usage.tool_calls_count || 0}\n` +
        `Duración: ${formatDuration(usage.total_duration_ms)}`;
    }

    const lines = [
      `📋 *Estado de sesión*`,
      '',
      `ID: \`${shortId}\``,
      `OpenCode: \`${ocId}\``,
      `Título: ${esc(active.title)}`,
      `Estado: ${esc(active.status)}`,
      `Proyecto: ${active.project_id ? active.project_id.substring(0, 8) : '—'}`,
      `Directorio: ${esc(active.directory || '—')}`,
      serverLine,
      usageLines,
    ];

    return bot.sendMessage(chatId, lines.join('\n'), {
      parse_mode: 'Markdown',
    });
  } catch (err) {
    logger.error(`Error en /status: ${err.message}`);
    bot.sendMessage(chatId, formatter.formatError(err.message), {
      parse_mode: 'Markdown',
    });
  }
};

function formatDuration(ms) {
  if (!ms) return '—';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

function esc(text) {
  if (text == null) return '';
  return String(text).replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');
}
