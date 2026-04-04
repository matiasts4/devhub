/**
 * Telegram Persister — Persists Telegram messages to `agent_hub_messages`.
 *
 * This replaces the in-memory `conversation.addMessage()` pattern with
 * durable SQLite writes, so messages survive bot restarts and are visible
 * in the web UI.
 *
 * Usage:
 *   const persister = require('./telegram-persister');
 *   persister.persistMessage(chatId, sessionId, 'user', text);
 *   persister.persistMessage(chatId, sessionId, 'assistant', output);
 *   const history = persister.getSessionMessages(sessionId);
 */

const { insertMessage, getMessagesForSession, getSession } = require('../lib/db-bridge');
const crypto = require('crypto');
const logger = require('../utils/logger');

/**
 * Persist a message to agent_hub_messages.
 *
 * @param {string|number} chatId - Telegram chat ID (for logging)
 * @param {string} sessionId - AgentHub session ID
 * @param {'user'|'assistant'} role - Message role
 * @param {string} content - Message content
 * @param {object} [options] - Optional: meta, tool_call_id, tool_name
 */
function persistMessage(chatId, sessionId, role, content, options = {}) {
  try {
    const session = getSession(sessionId);
    if (!session) {
      logger.warn(`Cannot persist message: session ${sessionId} not found for chat ${chatId}`);
      return null;
    }

    const result = insertMessage({
      id: crypto.randomUUID(),
      session_id: sessionId,
      role,
      content,
      meta: options.meta || null,
      source: 'telegram',
      tool_call_id: options.tool_call_id || null,
      tool_name: options.tool_name || null,
    });

    logger.debug(`Persisted ${role} message for session ${sessionId} (chat ${chatId})`);
    return result;
  } catch (err) {
    logger.error(`Failed to persist message for session ${sessionId}: ${err.message}`);
    return null;
  }
}

/**
 * Get all messages for a session from the database.
 *
 * @param {string} sessionId - AgentHub session ID
 * @param {number} [limit] - Optional max messages to fetch
 * @returns {Array}
 */
function getSessionMessages(sessionId, limit) {
  try {
    return getMessagesForSession(sessionId, limit);
  } catch (err) {
    logger.error(`Failed to get messages for session ${sessionId}: ${err.message}`);
    return [];
  }
}

/**
 * Build a context prompt from DB messages + new user message.
 * Replaces conversation.buildContextPrompt() but reads from SQLite.
 *
 * @param {string} sessionId - AgentHub session ID
 * @param {string} newMessage - The new user message to append
 * @param {number} [maxMessages=20] - Max history messages to include
 * @returns {string}
 */
function buildContextPrompt(sessionId, newMessage, maxMessages = 20) {
  const messages = getSessionMessages(sessionId, maxMessages);

  const instructionBlock = [
    '[INSTRUCCIONES DE SALIDA PARA TELEGRAM]',
    '- Respondé SOLO con la respuesta final para el usuario.',
    '- NO incluyas razonamiento interno, thinking, análisis, ni pasos de depuración.',
    '- NO repitas ni cites el bloque de contexto.',
    '- Idioma: español rioplatense, claro y directo.',
    '',
  ];

  if (messages.length === 0) {
    return [...instructionBlock, '[NUEVO MENSAJE DEL USUARIO]', newMessage].join('\n');
  }

  const contextLines = messages.map(
    (m) => `${m.role === 'user' ? 'Usuario' : 'Asistente'}: ${m.content}`
  );

  return [
    ...instructionBlock,
    `[CONTEXTO DE CONVERSACIÓN PREVIA — ${messages.length} mensajes]`,
    ...contextLines,
    '',
    '[NUEVO MENSAJE DEL USUARIO]',
    newMessage,
  ].join('\n');
}

module.exports = {
  persistMessage,
  getSessionMessages,
  buildContextPrompt,
};
