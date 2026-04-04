const sessionBridge = require('../services/session-bridge');
const db = require('../lib/db-bridge');
const formatter = require('../services/formatter');
const logger = require('../utils/logger');
const opencode = require('../services/opencode');

/**
 * /project — Project context management.
 *
 * Subcommands:
 *   /project           — Show current project
 *   /project list      — List available projects
 *   /project switch <name> — Switch active project
 */
module.exports = async function project(bot, msg, args) {
  const chatId = msg.chat.id;
  const subcommand = (args || '').trim().toLowerCase();

  try {
    if (subcommand === 'list') {
      return handleListProjects(bot, msg, chatId);
    }

    if (subcommand.startsWith('switch ')) {
      const name = subcommand.replace('switch ', '').trim();
      return handleSwitchProject(bot, msg, chatId, name);
    }

    // No subcommand — show current project
    return handleShowProject(bot, msg, chatId);
  } catch (err) {
    logger.error(`Error en /project: ${err.message}`);
    bot.sendMessage(chatId, formatter.formatError(err.message), {
      parse_mode: 'Markdown',
    });
  }
};

/**
 * Show current project context.
 */
async function handleShowProject(bot, msg, chatId) {
  const active = sessionBridge.getActiveSession(chatId);

  if (!active || !active.project_id) {
    return bot.sendMessage(
      chatId,
      '📁 *Sin proyecto activo*\n\nUsá /project list para ver disponibles o /project switch <nombre> para cambiar.',
      { parse_mode: 'Markdown' }
    );
  }

  const project = db.findProject(active.project_id);
  const projName = project ? project.name : active.project_id;
  const projDir = active.directory || '—';

  return bot.sendMessage(
    chatId,
    `📁 *Proyecto activo*\n\n` +
      `Nombre: ${esc(projName)}\n` +
      `ID: \`${active.project_id.substring(0, 8)}\`\n` +
      `Directorio: ${esc(projDir)}`,
    { parse_mode: 'Markdown' }
  );
}

/**
 * List all available active projects.
 */
async function handleListProjects(bot, msg, chatId) {
  const projects = db.getActiveProjects();

  if (!projects || projects.length === 0) {
    return bot.sendMessage(chatId, '📁 *No hay proyectos activos*', { parse_mode: 'Markdown' });
  }

  const lines = ['📁 *Proyectos disponibles*', ''];

  for (const p of projects) {
    const status = p.status === 'active' ? '✅' : '⏸️';
    const progress = p.progress != null ? ` (${p.progress}%)` : '';
    lines.push(`${status} *${esc(p.name)}*${progress}`);
    if (p.directory) {
      lines.push(`   📂 ${esc(p.directory)}`);
    }
    lines.push('');
  }

  lines.push('💡 Usá /project switch <nombre> para cambiar');

  return bot.sendMessage(chatId, lines.join('\n'), {
    parse_mode: 'Markdown',
  });
}

/**
 * Switch the active project.
 */
async function handleSwitchProject(bot, msg, chatId, name) {
  if (!name) {
    return bot.sendMessage(chatId, '⚠️ Usá: /project switch <nombre>', { parse_mode: 'Markdown' });
  }

  const result = sessionBridge.switchProject(chatId, name);

  if (!result) {
    const projects = db.getActiveProjects();
    const available = projects.map((p) => p.name).join(', ');
    return bot.sendMessage(
      chatId,
      formatter.formatError(
        `Proyecto "${name}" no encontrado. Disponibles: ${available || 'ninguno'}`
      ),
      { parse_mode: 'Markdown' }
    );
  }

  return bot.sendMessage(
    chatId,
    formatter.formatSuccess(`Proyecto cambiado a: *${result.project.name}*`),
    { parse_mode: 'Markdown' }
  );
}

function esc(text) {
  if (text == null) return '';
  return String(text).replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');
}
