/**
 * DevHub Telegram Bot — Entry Point
 *
 * Long-polling Telegram bot that lets you control DevHub from your phone.
 * Features:
 *   - Project/task management commands
 *   - Agent lifecycle control (pause, resume, launch)
 *   - Direct chat with OpenCode agents (plain text messages)
 *
 * Usage:
 *   cp .env.example .env   # configure TELEGRAM_BOT_TOKEN and ALLOWED_USER_IDS
 *   npm install
 *   node bot.js
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });

const TelegramBot = require('node-telegram-bot-api');
const { isAllowed } = require('./services/auth');
const logger = require('./utils/logger');
const formatter = require('./services/formatter');
const conversation = require('./services/conversation');
const chatHandler = require('./commands/chat');

// ── Command handlers ────────────────────────────────────────────────────────
const commands = {
  // Query commands
  estado: require('./commands/estado'),
  tareas: require('./commands/tareas'),
  progreso: require('./commands/progreso'),
  agentes: require('./commands/agentes'),
  help: require('./commands/help'),

  // Action commands
  pausar: require('./commands/pausar'),
  reanudar: require('./commands/reanudar'),
  continuar: require('./commands/continuar'),
  spawn: require('./commands/spawn'),
  sesiones: require('./commands/sesiones'),

  // Chat management commands
  agente: require('./commands/agente'),
  reset: require('./commands/reset'),
  historial: require('./commands/historial'),
};

// ── Validation ──────────────────────────────────────────────────────────────
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN no configurado en .env');
  console.error('   Obtené un token gratis con @BotFather en Telegram.');
  process.exit(1);
}

// ── Bot initialization ──────────────────────────────────────────────────────
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

logger.info('✅ DevHub Telegram Bot iniciado');
logger.info('   Polling activo — esperando comandos...');
logger.info('   Modo chat: mensajes de texto → OpenCode agents');

// ── Periodic cleanup ────────────────────────────────────────────────────────
setInterval(() => {
  conversation.cleanupOldConversations();
  const count = conversation.getConversationCount();
  if (count > 0) {
    logger.info(`Conversaciones activas: ${count}`);
  }
}, 600_000); // Every 10 minutes

// ── /start command ──────────────────────────────────────────────────────────
bot.onText(/^\/start/, (msg) => {
  const chatId = msg.chat.id;
  if (!isAllowed(chatId)) {
    bot.sendMessage(chatId, '⛔ Acceso no autorizado.');
    return;
  }
  const name = msg.from.first_name || 'Usuario';
  bot.sendMessage(
    chatId,
    `👋 ¡Hola *${name}*! Soy el bot de DevHub.\n\n` +
      `🔹 Usá /help para ver los comandos de gestión\n` +
      `💬 O simplemente escribime cualquier cosa para chatear con OpenCode`,
    { parse_mode: 'Markdown' }
  );
  logger.info(`Nuevo usuario: ${name} (${chatId})`);
});

// ── Command routing ─────────────────────────────────────────────────────────
const commandMap = [
  // Query
  { pattern: /^\/estado(.*)/, handler: commands.estado },
  { pattern: /^\/tareas(.*)/, handler: commands.tareas },
  { pattern: /^\/progreso(.*)/, handler: commands.progreso },
  { pattern: /^\/agentes(.*)/, handler: commands.agentes },
  // Action
  { pattern: /^\/pausar(.*)/, handler: commands.pausar },
  { pattern: /^\/reanudar(.*)/, handler: commands.reanudar },
  { pattern: /^\/continuar(.*)/, handler: commands.continuar },
  { pattern: /^\/spawn(.*)/, handler: commands.spawn },
  { pattern: /^\/sesiones(.*)/, handler: commands.sesiones },
  // Chat management
  { pattern: /^\/agente(.*)/, handler: commands.agente },
  { pattern: /^\/reset(.*)/, handler: commands.reset },
  { pattern: /^\/historial(.*)/, handler: commands.historial },
  // Help
  { pattern: /^\/help(.*)/, handler: commands.help },
];

commandMap.forEach(({ pattern, handler }) => {
  bot.onText(pattern, (msg, match) => {
    const chatId = msg.chat.id;

    // Auth guard
    if (!isAllowed(chatId)) {
      bot.sendMessage(chatId, '⛔ Acceso no autorizado.');
      return;
    }

    // Extract args (everything after the command name)
    const args = match[1] ? match[1].trim() : '';

    // Execute handler with error handling
    handler(bot, msg, args).catch((err) => {
      logger.error(`Error en comando: ${err.message}`);
      bot.sendMessage(chatId, formatter.formatError(err.message), {
        parse_mode: 'Markdown',
      });
    });
  });
});

// ── Plain text message handler → OpenCode chat ──────────────────────────────
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text || '';

  // Skip commands (handled above)
  if (text.startsWith('/')) {
    return;
  }

  // Skip non-text messages (photos, stickers, etc.)
  if (!text.trim()) {
    return;
  }

  // Auth guard
  if (!isAllowed(chatId)) {
    bot.sendMessage(chatId, '⛔ Acceso no autorizado.');
    return;
  }

  // Route to chat handler
  chatHandler(bot, msg).catch((err) => {
    logger.error(`Error en chat: ${err.message}`);
    bot.sendMessage(chatId, formatter.formatError(err.message), {
      parse_mode: 'Markdown',
    });
  });
});

// ── Graceful shutdown ───────────────────────────────────────────────────────
process.on('SIGINT', () => {
  logger.info('Recibida señal de apagado. Cerrando bot...');
  bot.stopPolling();
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Recibida señal de terminación. Cerrando bot...');
  bot.stopPolling();
  process.exit(0);
});
