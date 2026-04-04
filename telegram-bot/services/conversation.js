/**
 * Conversation Service — DB-backed conversation history for Telegram.
 *
 * Replaces the previous in-memory Map with SQLite persistence via
 * telegram-persister. Messages survive bot restarts and are visible
 * in the web UI.
 *
 * This module maintains backward compatibility with the old API
 * (getConversation, addMessage, buildContextPrompt, etc.) but
 * delegates all persistence to telegram-persister.js.
 */

const persister = require('./telegram-persister');
const sessionBridge = require('./session-bridge');
const logger = require('../utils/logger');

// Lightweight in-memory cache for agent settings per chat (not messages)
const agentCache = new Map();

/**
 * Gets or creates a conversation reference for a chatId.
 * Returns metadata only — messages are in the DB.
 */
function getConversation(chatId) {
  const session = sessionBridge.getActiveSession(chatId);
  const agent = agentCache.get(String(chatId)) || 'gentleman';

  return {
    messages: [], // Messages are now in DB, not in-memory
    agent,
    maxMessages: 20,
    sessionId: session?.id || null,
    createdAt: session ? new Date(session.created_at).getTime() : Date.now(),
  };
}

/**
 * Adds a message to the conversation — persists to SQLite.
 * @param {string|number} chatId
 * @param {'user'|'assistant'} role
 * @param {string} content
 */
function addMessage(chatId, role, content) {
  const session = sessionBridge.getActiveSession(chatId);
  if (!session) {
    logger.warn(`Cannot add message: no active session for chat ${chatId}`);
    return;
  }

  persister.persistMessage(chatId, session.id, role, content);
}

/**
 * Builds a context prompt from DB messages + new user message.
 * @param {string|number} chatId
 * @param {string} newMessage
 * @returns {string}
 */
function buildContextPrompt(chatId, newMessage) {
  const session = sessionBridge.getActiveSession(chatId);
  if (!session) {
    // No session yet — just return the new message with instructions
    const instructionBlock = [
      '[INSTRUCCIONES DE SALIDA PARA TELEGRAM]',
      '- Respondé SOLO con la respuesta final para el usuario.',
      '- NO incluyas razonamiento interno, thinking, análisis, ni pasos de depuración.',
      '- NO repitas ni cites el bloque de contexto.',
      '- Idioma: español rioplatense, claro y directo.',
      '',
      '[NUEVO MENSAJE DEL USUARIO]',
      newMessage,
    ].join('\n');
    return instructionBlock;
  }

  return persister.buildContextPrompt(session.id, newMessage);
}

/**
 * Sets the agent for a conversation.
 */
function setAgent(chatId, agent) {
  agentCache.set(String(chatId), agent);
}

/**
 * Gets the current agent for a conversation.
 */
function getAgent(chatId) {
  return agentCache.get(String(chatId)) || 'gentleman';
}

/**
 * Resets (deletes) a conversation — clears agent cache only.
 * Messages remain in DB for audit trail.
 */
function resetConversation(chatId) {
  agentCache.delete(String(chatId));
  logger.info(`Conversation reset for chat ${chatId} (messages preserved in DB)`);
}

/**
 * Starts a fresh session for a chat, optionally preserving current agent.
 */
function startNewSession(chatId, options = {}) {
  const { keepAgent = true } = options;
  const preservedAgent = keepAgent ? getAgent(chatId) : 'gentleman';

  // Create a new session via session-bridge
  sessionBridge
    .resolveSession(chatId)
    .then(({ session }) => {
      logger.info(`New session started for chat ${chatId}: ${session.id}`);
    })
    .catch((err) => {
      logger.error(`Failed to start new session for chat ${chatId}: ${err.message}`);
    });

  return { sessionId: `sess-${Date.now().toString(36)}`, agent: preservedAgent };
}

/**
 * Returns lightweight session metadata for the chat.
 */
function getSessionInfo(chatId) {
  const session = sessionBridge.getActiveSession(chatId);
  const agent = getAgent(chatId);

  return {
    sessionId: session?.id || `sess-${Date.now().toString(36)}`,
    agent,
    messageCount: session ? persister.getSessionMessages(session.id).length : 0,
    createdAt: session ? new Date(session.created_at).getTime() : Date.now(),
  };
}

/**
 * Returns a sanitized history view with truncated previews.
 */
function getHistory(chatId) {
  const session = sessionBridge.getActiveSession(chatId);
  if (!session) return [];

  const messages = persister.getSessionMessages(session.id, 20);
  return messages.map((m) => ({
    role: m.role,
    preview: m.content.length > 100 ? m.content.substring(0, 100) + '...' : m.content,
    timestamp: new Date(m.created_at).toLocaleTimeString(),
  }));
}

/**
 * Returns the total number of active conversations (with agents in cache).
 */
function getConversationCount() {
  return agentCache.size;
}

/**
 * Cleanup old conversations — clears agent cache for chats inactive > maxAgeMs.
 */
function cleanupOldConversations(maxAgeMs = 3_600_000) {
  const now = Date.now();
  for (const [chatId] of agentCache) {
    const session = sessionBridge.getActiveSession(chatId);
    if (session) {
      const lastActivity = new Date(session.updated_at).getTime();
      if (now - lastActivity > maxAgeMs) {
        agentCache.delete(chatId);
      }
    } else {
      agentCache.delete(chatId);
    }
  }
}

module.exports = {
  getConversation,
  addMessage,
  buildContextPrompt,
  setAgent,
  getAgent,
  resetConversation,
  startNewSession,
  getSessionInfo,
  getHistory,
  getConversationCount,
  cleanupOldConversations,
};
