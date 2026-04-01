/**
 * @file conversation-manager.js
 * @description ConversationManager que persiste conversaciones en SQLite, gestiona
 * ventanas de contexto con truncamiento por tokens y estima el uso de tokens por conversación.
 *
 * Reemplaza el Map en memoria de conversation.js con persistencia real que sobrevive
 * a reinicios del bot.
 *
 * Uso:
 *   const { getDb } = require('../db');
 *   const ConversationManager = require('./providers/conversation-manager');
 *   const db = getDb();
 *   const cm = new ConversationManager(db, { maxMessages: 30, maxTokens: 32000 });
 *   const messages = cm.getMessages(chatId);
 */

const logger = require('../../utils/logger');

class ConversationManager {
  /**
   * @param {import('better-sqlite3').Database} db - Instancia de base de datos SQLite.
   * @param {Object} [options]
   * @param {number} [options.maxMessages=30] - Máximo de mensajes a mantener por conversación.
   * @param {number} [options.maxTokens=32000] - Límite de tokens para el contexto.
   * @param {string} [options.systemPrompt] - Prompt de sistema por defecto.
   * @param {function(string): number} [options.estimateTokensFn] - Función para estimar tokens.
   */
  constructor(db, options = {}) {
    this.db = db;
    this.maxMessages = options.maxMessages || 30;
    this.maxTokens = options.maxTokens || 32000;
    this.systemPrompt = options.systemPrompt || this._defaultSystemPrompt();
    this.estimateTokensFn = options.estimateTokensFn || ((text) => Math.ceil(text.length / 4));

    this._initTable();
  }

  /**
   * Crea la tabla de conversaciones si no existe.
   * @private
   */
  _initTable() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS llm_conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('system', 'user', 'assistant', 'tool')),
        content TEXT NOT NULL,
        tool_call_id TEXT,
        tool_name TEXT,
        token_count INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_llm_conv_chat ON llm_conversations(chat_id);
      CREATE INDEX IF NOT EXISTS idx_llm_conv_created ON llm_conversations(created_at);
    `);
  }

  /**
   * Obtiene los mensajes de una conversación formateados para la API del LLM.
   * Trunca desde los mensajes más viejos si se excede el límite de tokens.
   *
   * @param {string|number} chatId
   * @param {Object} [options]
   * @param {number} [options.maxTokens] - Override del límite de tokens.
   * @param {boolean} [options.includeSystem] - Incluir prompt de sistema (default: true).
   * @returns {Array<{role: string, content: string, tool_call_id?: string, name?: string}>}
   */
  getMessages(chatId, options = {}) {
    const maxTokens = options.maxTokens || this.maxTokens;
    const includeSystem = options.includeSystem !== false;

    // Obtener mensajes recientes, ordenados del más nuevo al más viejo para truncación
    const rows = this.db
      .prepare(
        `
      SELECT role, content, tool_call_id, tool_name, token_count
      FROM llm_conversations
      WHERE chat_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `
      )
      .all(String(chatId), this.maxMessages);

    // Invertir para obtener orden cronológico
    rows.reverse();

    // Construir array de mensajes comenzando con system prompt
    const messages = includeSystem ? [{ role: 'system', content: this.systemPrompt }] : [];

    let totalTokens = messages.reduce((sum, m) => sum + this.estimateTokensFn(m.content), 0);

    // Agregar mensajes mientras no se exceda el límite de tokens
    for (const row of rows) {
      const tokens = row.token_count || this.estimateTokensFn(row.content);
      if (totalTokens + tokens > maxTokens) {
        logger.debug(
          `Truncating conversation for chat ${chatId}: ${totalTokens + tokens} > ${maxTokens} tokens`
        );
        break;
      }
      totalTokens += tokens;
      messages.push({
        role: row.role,
        content: row.content,
        ...(row.tool_call_id && { tool_call_id: row.tool_call_id }),
        ...(row.tool_name && { name: row.tool_name }),
      });
    }

    return messages;
  }

  /**
   * Agrega un mensaje a la conversación.
   *
   * @param {string|number} chatId
   * @param {string} role - 'user', 'assistant', 'system' o 'tool'.
   * @param {string} content
   * @param {Object} [options]
   * @param {string} [options.toolCallId] - ID de la llamada a herramienta asociada.
   * @param {string} [options.toolName] - Nombre de la herramienta (para role='tool').
   */
  addMessage(chatId, role, content, options = {}) {
    const tokenCount = this.estimateTokensFn(content);

    this.db
      .prepare(
        `
      INSERT INTO llm_conversations (chat_id, role, content, tool_call_id, tool_name, token_count)
      VALUES (?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        String(chatId),
        role,
        content,
        options.toolCallId || null,
        options.toolName || null,
        tokenCount
      );

    // Limpiar mensajes antiguos más allá de maxMessages
    this.db
      .prepare(
        `
      DELETE FROM llm_conversations
      WHERE chat_id = ? AND id NOT IN (
        SELECT id FROM llm_conversations
        WHERE chat_id = ?
        ORDER BY created_at DESC
        LIMIT ?
      )
    `
      )
      .run(String(chatId), String(chatId), this.maxMessages);
  }

  /**
   * Borra todos los mensajes de una conversación.
   *
   * @param {string|number} chatId
   */
  clearConversation(chatId) {
    this.db.prepare('DELETE FROM llm_conversations WHERE chat_id = ?').run(String(chatId));
  }

  /**
   * Obtiene estadísticas de una conversación.
   *
   * @param {string|number} chatId
   * @returns {Object}
   * @returns {number} stats.messageCount - Cantidad de mensajes.
   * @returns {number} stats.totalTokens - Total de tokens estimados.
   * @returns {string|null} stats.firstMessage - Timestamp del primer mensaje.
   * @returns {string|null} stats.lastMessage - Timestamp del último mensaje.
   */
  getStats(chatId) {
    const row = this.db
      .prepare(
        `
      SELECT COUNT(*) as count,
             SUM(token_count) as total_tokens,
             MIN(created_at) as first_message,
             MAX(created_at) as last_message
      FROM llm_conversations
      WHERE chat_id = ?
    `
      )
      .get(String(chatId));

    return {
      messageCount: row?.count || 0,
      totalTokens: row?.total_tokens || 0,
      firstMessage: row?.first_message || null,
      lastMessage: row?.last_message || null,
    };
  }

  /**
   * Limpia conversaciones antiguas (anteriores a maxAgeMs).
   *
   * @param {number} maxAgeMs - Edad máxima en milisegundos. Default: 24 horas.
   * @returns {number} Cantidad de registros eliminados.
   */
  cleanupOld(maxAgeMs = 86_400_000) {
    const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
    const result = this.db
      .prepare(
        `
      DELETE FROM llm_conversations
      WHERE created_at < ?
    `
      )
      .run(cutoff);
    return result.changes;
  }

  /**
   * Genera el prompt de sistema por defecto para el bot de Telegram.
   *
   * @private
   * @returns {string}
   */
  _defaultSystemPrompt() {
    return [
      'Sos un asistente de DevHub, una herramienta de gestión de proyectos para desarrolladores.',
      'Podés ayudar con: crear tareas, ver proyectos, consultar milestones, gestionar agentes,',
      'revisar código, y responder preguntas sobre el estado del proyecto.',
      'Respondé en español rioplatense (voseo), de forma clara y directa.',
      'Si no sabés algo, decilo honestamente.',
    ].join(' ');
  }
}

module.exports = ConversationManager;
