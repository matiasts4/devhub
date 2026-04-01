const conversations = new Map();

function createSession(agent = 'gentleman') {
  return {
    messages: [],
    agent,
    maxMessages: 20,
    sessionId: `sess-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`,
    createdAt: Date.now(),
  };
}

/**
 * Gets or creates a conversation for a given chatId.
 * @param {string|number} chatId
 * @returns {{ messages: Array<{role: string, content: string, timestamp: number}>, agent: string, maxMessages: number }}
 */
function getConversation(chatId) {
  if (!conversations.has(chatId)) {
    conversations.set(chatId, createSession());
  }
  return conversations.get(chatId);
}

/**
 * Adds a message to the conversation and trims to maxMessages.
 * @param {string|number} chatId
 * @param {'user'|'assistant'} role
 * @param {string} content
 */
function addMessage(chatId, role, content) {
  const conv = getConversation(chatId);
  conv.messages.push({ role, content, timestamp: Date.now() });
  while (conv.messages.length > conv.maxMessages) {
    conv.messages.shift();
  }
}

/**
 * Builds a context prompt that includes previous conversation history
 * followed by the new user message.
 * @param {string|number} chatId
 * @param {string} newMessage
 * @returns {string}
 */
function buildContextPrompt(chatId, newMessage) {
  const conv = getConversation(chatId);
  const instructionBlock = [
    '[INSTRUCCIONES DE SALIDA PARA TELEGRAM]',
    '- Respondé SOLO con la respuesta final para el usuario.',
    '- NO incluyas razonamiento interno, thinking, análisis, ni pasos de depuración.',
    '- NO repitas ni cites el bloque de contexto.',
    '- Idioma: español rioplatense, claro y directo.',
    '',
  ];

  if (conv.messages.length === 0) {
    return [...instructionBlock, '[NUEVO MENSAJE DEL USUARIO]', newMessage].join('\n');
  }

  const contextLines = conv.messages.map(
    (m) => `${m.role === 'user' ? 'Usuario' : 'Asistente'}: ${m.content}`
  );

  return [
    ...instructionBlock,
    `[CONTEXTO DE CONVERSACIÓN PREVIA — ${conv.messages.length} mensajes]`,
    ...contextLines,
    '',
    '[NUEVO MENSAJE DEL USUARIO]',
    newMessage,
  ].join('\n');
}

/**
 * Sets the agent for a conversation.
 * @param {string|number} chatId
 * @param {string} agent
 */
function setAgent(chatId, agent) {
  const conv = getConversation(chatId);
  conv.agent = agent;
}

/**
 * Gets the current agent for a conversation.
 * @param {string|number} chatId
 * @returns {string}
 */
function getAgent(chatId) {
  return getConversation(chatId).agent;
}

/**
 * Resets (deletes) a conversation entirely.
 * @param {string|number} chatId
 */
function resetConversation(chatId) {
  conversations.delete(chatId);
}

/**
 * Starts a fresh session for a chat, optionally preserving current agent.
 * @param {string|number} chatId
 * @param {{ keepAgent?: boolean }} options
 * @returns {{ sessionId: string, agent: string }}
 */
function startNewSession(chatId, options = {}) {
  const { keepAgent = true } = options;
  const current = conversations.get(chatId);
  const preservedAgent = keepAgent && current?.agent ? current.agent : 'gentleman';

  const fresh = createSession(preservedAgent);
  conversations.set(chatId, fresh);

  return { sessionId: fresh.sessionId, agent: fresh.agent };
}

/**
 * Returns lightweight session metadata for the chat.
 * @param {string|number} chatId
 * @returns {{ sessionId: string, agent: string, messageCount: number, createdAt: number }}
 */
function getSessionInfo(chatId) {
  const conv = getConversation(chatId);
  return {
    sessionId: conv.sessionId,
    agent: conv.agent,
    messageCount: conv.messages.length,
    createdAt: conv.createdAt,
  };
}

/**
 * Returns a sanitized history view with truncated previews.
 * @param {string|number} chatId
 * @returns {Array<{role: string, preview: string, timestamp: string}>}
 */
function getHistory(chatId) {
  const conv = getConversation(chatId);
  return conv.messages.map((m) => ({
    role: m.role,
    preview: m.content.length > 100 ? m.content.substring(0, 100) + '...' : m.content,
    timestamp: new Date(m.timestamp).toLocaleTimeString(),
  }));
}

/**
 * Returns the total number of active conversations.
 * @returns {number}
 */
function getConversationCount() {
  return conversations.size;
}

/**
 * Removes conversations whose last message is older than maxAgeMs.
 * Default: 1 hour (3600000 ms).
 * @param {number} maxAgeMs
 */
function cleanupOldConversations(maxAgeMs = 3_600_000) {
  const now = Date.now();
  for (const [chatId, conv] of conversations) {
    const lastMsg = conv.messages[conv.messages.length - 1];
    if (lastMsg && now - lastMsg.timestamp > maxAgeMs) {
      conversations.delete(chatId);
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
