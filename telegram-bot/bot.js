/**
 * DevHub Telegram Bot — Entry Point
 *
 * Long-polling Telegram bot that lets you control DevHub from your phone.
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

// ── Command handlers ────────────────────────────────────────────────────────
const commands = {
  estado: require('./commands/estado'),
  tareas: require('./commands/tareas'),
  progreso: require('./commands/progreso'),
  agentes: require('./commands/agentes'),
  pausar: require('./commands/pausar'),
  reanudar: require('./commands/reanudar'),
  continuar: require('./commands/continuar'),
  spawn: require('./commands/spawn'),
  sesiones: require('./commands/sesiones'),
  help: require('./commands/help'),
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
logger.info(`   Polling activo — esperando comandos...`);

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
    `👋 ¡Hola *${name}*! Soy el bot de DevHub.\n\nUsá /help para ver los comandos disponibles.`,
    { parse_mode: 'Markdown' }
  );
  logger.info(`Nuevo usuario: ${name} (${chatId})`);
});

// ── Command routing ─────────────────────────────────────────────────────────
const commandMap = [
  { pattern: /^\/estado(.*)/, handler: commands.estado },
  { pattern: /^\/tareas(.*)/, handler: commands.tareas },
  { pattern: /^\/progreso(.*)/, handler: commands.progreso },
  { pattern: /^\/agentes(.*)/, handler: commands.agentes },
  { pattern: /^\/pausar(.*)/, handler: commands.pausar },
  { pattern: /^\/reanudar(.*)/, handler: commands.reanudar },
  { pattern: /^\/continuar(.*)/, handler: commands.continuar },
  { pattern: /^\/spawn(.*)/, handler: commands.spawn },
  { pattern: /^\/sesiones(.*)/, handler: commands.sesiones },
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

// ── Unknown command handler ─────────────────────────────────────────────────
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text || '';

  // Skip if it's a known command (already handled above)
  if (text.startsWith('/')) {
    const isKnown = commandMap.some(({ pattern }) => pattern.test(text));
    if (!isKnown && isAllowed(chatId)) {
      bot.sendMessage(
        chatId,
        `❓ Comando no reconocido. Usá /help para ver los comandos disponibles.`,
        { parse_mode: 'Markdown' }
      );
    }
    return;
  }

  // Non-command messages — ignore silently
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
