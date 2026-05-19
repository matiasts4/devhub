const formatter = require('./formatter');
const sessionBridge = require('./session-bridge');
const persister = require('./telegram-persister');

async function quarantineLegacyCommand(
  bot,
  msg,
  commandName,
  legacyLabel = commandName,
  options = {}
) {
  const chatId = msg.chat.id;
  const adapterOutcome = sessionBridge.resolveTelegramAdapterContext({
    chatId,
    telegramUserId: msg.from?.id,
    messageId: msg.message_id,
    text: options.commandText || `/${commandName}`,
  });

  const text = formatter.formatCommandQuarantined(legacyLabel, adapterOutcome?.outcome?.intent || null, {
    degraded:
      adapterOutcome?.outcome?.denial_reason === 'actor-not-allowlisted' ||
      adapterOutcome?.outcome?.denial_reason === 'durable-read-unavailable',
  });

  const activeSession = sessionBridge.getActiveSession(chatId);
  if (activeSession?.id) {
    persister.persistMessage(chatId, activeSession.id, 'assistant', text, { adapterOutcome });
  }

  return bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
}

module.exports = {
  quarantineLegacyCommand,
};
