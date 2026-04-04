const sessionBridge = require('../services/session-bridge');
const formatter = require('../services/formatter');
const logger = require('../utils/logger');

/**
 * /session — Session management command.
 *
 * Subcommands:
 *   /session          — Show current session or create new one
 *   /session new      — Force create a new session
 *   /session info     — Show detailed session info with token usage
 *   /session switch <id> — Switch to a different session
 */
module.exports = async function session(bot, msg, args) {
  const chatId = msg.chat.id;
  const subcommand = (args || '').trim().toLowerCase();

  try {
    // Parse subcommand
    if (subcommand === 'new') {
      return handleNewSession(bot, msg, chatId);
    }

    if (subcommand === 'info') {
      return handleSessionInfo(bot, msg, chatId);
    }

    if (subcommand.startsWith('switch ')) {
      const sessionId = subcommand.replace('switch ', '').trim();
      return handleSwitchSession(bot, msg, chatId, sessionId);
    }

    // No subcommand — show current session or create one
    return handleShowSession(bot, msg, chatId);
  } catch (err) {
    logger.error(`Error en /session: ${err.message}`);
    bot.sendMessage(chatId, formatter.formatError(err.message), {
      parse_mode: 'Markdown',
    });
  }
};

/**
 * Show current session or create a new one if none exists.
 */
async function handleShowSession(bot, msg, chatId) {
  const active = sessionBridge.getActiveSession(chatId);

  if (!active) {
    // No active session — create one
    const session = await sessionBridge.createSession(chatId);
    const shortId = session.id.substring(0, 8);

    return bot.sendMessage(
      chatId,
      formatter.formatSuccess(`Nueva sesión creada.\nID: \`${shortId}\`\nTítulo: ${session.title}`),
      { parse_mode: 'Markdown' }
    );
  }

  const shortId = active.id.substring(0, 8);
  const usage = active.usage;
  const tokenInfo = usage ? `\nTokens: ${usage.total_tokens || 0} total` : '';

  return bot.sendMessage(
    chatId,
    `📋 *Sesión activa*\n\n` +
      `ID: \`${shortId}\`\n` +
      `Título: ${esc(active.title)}\n` +
      `Estado: ${esc(active.status)}${tokenInfo}\n` +
      `Actualizada: ${active.updated_at || '—'}`,
    { parse_mode: 'Markdown' }
  );
}

/**
 * Force create a new session.
 */
async function handleNewSession(bot, msg, chatId) {
  const session = await sessionBridge.createSession(chatId);
  const shortId = session.id.substring(0, 8);

  return bot.sendMessage(
    chatId,
    formatter.formatSuccess(`Nueva sesión creada.\nID: \`${shortId}\`\nTítulo: ${session.title}`),
    { parse_mode: 'Markdown' }
  );
}

/**
 * Show detailed session info with token usage.
 */
async function handleSessionInfo(bot, msg, chatId) {
  const active = sessionBridge.getActiveSession(chatId);

  if (!active) {
    return bot.sendMessage(chatId, '⚠️ No hay sesión activa. Usá /session para crear una.', {
      parse_mode: 'Markdown',
    });
  }

  const usage = active.usage;
  const shortId = active.id.substring(0, 8);
  const ocId = active.opencode_session_id ? active.opencode_session_id.substring(0, 12) : '—';

  let usageLines = '';
  if (usage) {
    usageLines =
      `\n\n📊 *Uso de tokens*\n` +
      `Prompt: ${usage.prompt_tokens || 0}\n` +
      `Completion: ${usage.completion_tokens || 0}\n` +
      `Total: ${usage.total_tokens || 0}\n` +
      `Tool calls: ${usage.tool_calls_count || 0}`;
  }

  return bot.sendMessage(
    chatId,
    `📋 *Detalle de sesión*\n\n` +
      `ID: \`${shortId}\`\n` +
      `OpenCode: \`${ocId}\`\n` +
      `Título: ${esc(active.title)}\n` +
      `Estado: ${esc(active.status)}\n` +
      `Proyecto: ${active.project_id ? active.project_id.substring(0, 8) : '—'}\n` +
      `Creada: ${active.created_at || '—'}\n` +
      `Actualizada: ${active.updated_at || '—'}${usageLines}`,
    { parse_mode: 'Markdown' }
  );
}

/**
 * Switch to a different session.
 */
function handleSwitchSession(bot, msg, chatId, sessionId) {
  if (!sessionId) {
    return bot.sendMessage(chatId, '⚠️ Usá: /session switch <id>', { parse_mode: 'Markdown' });
  }

  const result = sessionBridge.switchSession(chatId, sessionId);

  if (!result) {
    return bot.sendMessage(chatId, formatter.formatError(`Sesión "${sessionId}" no encontrada`), {
      parse_mode: 'Markdown',
    });
  }

  const shortId = result.id.substring(0, 8);

  return bot.sendMessage(
    chatId,
    formatter.formatSuccess(`Sesión cambiada a \`${shortId}\`: ${esc(result.title)}`),
    { parse_mode: 'Markdown' }
  );
}

function esc(text) {
  if (text == null) return '';
  return String(text).replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');
}
