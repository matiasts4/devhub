const conversations = new Map();

/**
 * Gets or creates a conversation for a given chatId.
 * @param {string|number} chatId
 * @returns {{ messages: Array<{role: string, content: string, timestamp: number}>, agent: string, maxMessages: number }}
 */
function getConversation(chatId) {
  if (!conversations.has(chatId)) {
    conversations.set(chatId, {
      messages: [],
      agent: 'gentleman',
      maxMessages: 20,
    });
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
  if (conv.messages.length === 0) return newMessage;

  const contextLines = conv.messages.map(
    (m) => `${m.role === 'user' ? 'Usuario' : 'Asistente'}: ${m.content}`
  );

  return [
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
  getHistory,
  getConversationCount,
  cleanupOldConversations,
};
