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
const activityLogger = require('./services/activityLogger');
const { getDb } = require('./services/db');

// Boot-time system log
activityLogger.logSystem('startup', 'Bot iniciado con polling activo');

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
  nueva_sesion: require('./commands/nueva_sesion'),
};

// ── Validation ──────────────────────────────────────────────────────────────
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN no configurado en .env');
  console.error('   Obtené un token gratis con @BotFather en Telegram.');
  process.exit(1);
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function extractCommandName(pattern) {
  const m = pattern.source.match(/\/(\w+)/);
  return m ? m[1] : 'unknown';
}

function logInboundCommand(chatId, cmdName, args) {
  activityLogger.logActivity({
    chatId: String(chatId),
    eventType: 'command',
    direction: 'inbound',
    source: 'telegram',
    command: cmdName,
    contentPreview: args ? `${cmdName} ${args}` : cmdName,
    status: 'pending',
  });
}

function logOutboundCommand(chatId, cmdName, status, errMsg) {
  activityLogger.logActivity({
    chatId: String(chatId),
    eventType: status === 'error' ? 'error' : 'command',
    direction: 'outbound',
    source: 'telegram',
    command: cmdName,
    contentPreview: errMsg
      ? `Error: ${errMsg.substring(0, 480)}`
      : `Comando ${cmdName} ejecutado exitosamente`,
    status,
    metadata: errMsg ? JSON.stringify({ error: errMsg }) : null,
  });
}

// ── Bot initialization ──────────────────────────────────────────────────────
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

const fs = require('fs');
const path = require('path');
const settingsPath = path.join(__dirname, '..', 'data', 'llm-providers-config.json');

let chatMode = 'OpenCode agents (Legacy)';
try {
  if (process.env.LLM_BRIDGE_ENABLED !== 'false') {
    if (fs.existsSync(settingsPath)) {
      const parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      if (parsed?.bridgeEnabled !== false) {
        const activeProviders = Object.entries(parsed.providers || {})
          .filter(([_, p]) => p.enabled !== false)
          .sort((a, b) => (a[1].priority || 99) - (b[1].priority || 99));
          
        if (activeProviders.length > 0) {
          chatMode = `LLM Bridge (${activeProviders[0][0]} prioritario)`;
        } else {
          chatMode = 'LLM Bridge (sin proveedores, fallback a OpenCode)';
        }
      }
    } else {
      chatMode = 'LLM Bridge (config por defecto)';
    }
  }
} catch (e) {}

logger.info('✅ DevHub Telegram Bot iniciado');
logger.info('   Polling activo — esperando comandos...');
logger.info(`   Modo chat: mensajes de texto → ${chatMode}`);

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
      '🔹 Usá /help para ver los comandos de gestión\n' +
      '💬 O simplemente escribime cualquier cosa para chatear con OpenCode',
    { parse_mode: 'Markdown' }
  );
  logger.info(`Nuevo usuario: ${name} (${chatId})`);

  activityLogger.logActivity({
    chatId: String(chatId),
    eventType: 'system',
    direction: 'inbound',
    source: 'telegram',
    command: 'start',
    contentPreview: `${name} inició el bot`,
    status: 'ok',
  });
  activityLogger.upsertSession({
    chatId: String(chatId),
    userName: name,
  });
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
  { pattern: /^\/nueva_sesion(.*)/, handler: commands.nueva_sesion },
  { pattern: /^\/new_session(.*)/, handler: commands.nueva_sesion },
  { pattern: /^\/newsession(.*)/, handler: commands.nueva_sesion },
  // Help
  { pattern: /^\/help(.*)/, handler: commands.help },
];

commandMap.forEach(({ pattern, handler }) => {
  bot.onText(pattern, (msg, match) => {
    const chatId = msg.chat.id;

    // Auth guard
    if (!isAllowed(chatId)) {
      activityLogger.logActivity({
        chatId: String(chatId),
        eventType: 'error',
        direction: 'inbound',
        source: 'telegram',
        command: extractCommandName(pattern),
        contentPreview: `Intento no autorizado de ${msg.from.username || msg.from.first_name || chatId}`,
        status: 'error',
      });
      bot.sendMessage(chatId, '⛔ Acceso no autorizado.');
      return;
    }

    const args = match[1] ? match[1].trim() : '';
    const cmdName = extractCommandName(pattern);

    // Log inbound + update session
    logInboundCommand(chatId, cmdName, args);
    activityLogger.upsertSession({
      chatId: String(chatId),
      userName: msg.from.username || msg.from.first_name || String(chatId),
    });

    // Execute handler
    handler(bot, msg, args)
      .then(() => {
        logOutboundCommand(chatId, cmdName, 'ok');
      })
      .catch((err) => {
        logger.error(`Error en comando: ${err.message}`);
        logOutboundCommand(chatId, cmdName, 'error', err.message);
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

  if (text.startsWith('/')) return;
  if (!text.trim()) return;

  if (!isAllowed(chatId)) {
    bot.sendMessage(chatId, '⛔ Acceso no autorizado.');
    return;
  }

  const userName = msg.from.username || msg.from.first_name || String(chatId);

  activityLogger.logActivity({
    chatId: String(chatId),
    eventType: 'chat_message',
    direction: 'inbound',
    source: 'telegram',
    contentPreview: text.substring(0, 500),
    status: 'ok',
  });
  activityLogger.upsertSession({ chatId: String(chatId), userName });

  chatHandler(bot, msg, getDb())
    .then(() => {
      const agent = conversation.getAgent(chatId);
      activityLogger.logActivity({
        chatId: String(chatId),
        eventType: 'chat_response',
        direction: 'outbound',
        source: 'opencode',
        contentPreview: `Respuesta del agente ${agent}`,
        status: 'ok',
        metadata: JSON.stringify({ agent }),
      });
    })
    .catch((err) => {
      logger.error(`Error en chat: ${err.message}`);
      activityLogger.logActivity({
        chatId: String(chatId),
        eventType: 'error',
        direction: 'outbound',
        source: 'opencode',
        contentPreview: `Error en chat: ${err.message.substring(0, 480)}`,
        status: 'error',
        metadata: JSON.stringify({ error: err.message }),
      });
      bot.sendMessage(chatId, formatter.formatError(err.message), {
        parse_mode: 'Markdown',
      });
    });
});

// ── Graceful shutdown ───────────────────────────────────────────────────────
process.on('SIGINT', () => {
  activityLogger.logSystem('shutdown', 'Bot apagado por señal SIGINT');
  logger.info('Recibida señal de apagado. Cerrando bot...');
  bot.stopPolling();
  activityLogger.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  activityLogger.logSystem('shutdown', 'Bot apagado por señal SIGTERM');
  logger.info('Recibida señal de terminación. Cerrando bot...');
  bot.stopPolling();
  activityLogger.close();
  process.exit(0);
});
