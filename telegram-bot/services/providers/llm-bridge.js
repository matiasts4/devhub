/**
 * @file llm-bridge.js
 * @description LLM Bridge — punto de entrada principal que commands/chat.js invoca.
 *
 * Orquesta:
 * 1. ConversationManager (historial de mensajes en SQLite)
 * 2. ToolRegistry (herramientas MCP como function calling)
 * 3. FailoverOrchestrator (cadena de proveedores con failover automático)
 *
 * Maneja el loop de tool calls: si el LLM solicita herramientas, las ejecuta
 * y continúa la conversación hasta obtener una respuesta final en texto.
 *
 * Uso:
 *   const { getLLMBridgeService } = require('./providers/llm-bridge');
 *   const bridge = getLLMBridgeService(db, { maxMessages: 30 });
 *   const response = await bridge.chat(chatId, userMessage);
 */

const { getLLMBridge: getProviderBridge, resetLLMBridge: resetProviderBridge } = require('./provider-registry');
const { getToolRegistry } = require('./tool-registry');
const ConversationManager = require('./conversation-manager');
const { ERROR_TYPES, createClassifiedError } = require('./provider-interface');
const logger = require('../../utils/logger');

class LLMBridge {
  /**
   * @param {import('better-sqlite3').Database} db - Instancia SQLite.
   * @param {Object} [options]
   * @param {number} [options.maxMessages=30] - Máximo de mensajes por conversación.
   * @param {number} [options.maxTokens=32000] - Límite de tokens de contexto.
   * @param {string} [options.systemPrompt] - Prompt de sistema personalizado.
   * @param {number} [options.maxToolIterations=5] - Máximo de iteraciones de tool calls.
   * @param {boolean} [options.enabled=true] - Si el bridge está habilitado.
   * @param {Object} [options.orchestratorOptions] - Opciones para el FailoverOrchestrator.
   * @param {Object} [options.toolRegistryOptions] - Opciones para el ToolRegistry.
   */
  constructor(db, options = {}) {
    this.db = db;
    this.conversationManager = new ConversationManager(db, {
      maxMessages: options.maxMessages || 30,
      maxTokens: options.maxTokens || 32000,
      systemPrompt: options.systemPrompt,
    });
    this.orchestrator = getProviderBridge(options.orchestratorOptions);
    this.toolRegistry = getToolRegistry(options.toolRegistryOptions);
    this.maxToolIterations = options.maxToolIterations || 5;
    this.enabled = options.enabled !== false;
  }

  /**
   * Main chat method — the single entry point for commands/chat.js.
   *
   * @param {string|number} chatId - Telegram chat ID.
   * @param {string} userMessage - User's message.
   * @param {Object} [options]
   * @param {boolean} [options.enableTools] - Enable tool calling (default: true).
   * @param {function(string): void} [options.onChunk] - Streaming callback.
   * @param {number} [options.maxTokens] - Override token limit for this request.
   * @param {number} [options.temperature] - Temperature override.
   * @returns {Promise<string>} Final response text.
   */
  async chat(chatId, userMessage, options = {}) {
    if (!this.enabled) {
      throw createClassifiedError(ERROR_TYPES.SERVER_ERROR, 'LLM Bridge is disabled');
    }

    // Add user message to conversation history
    this.conversationManager.addMessage(chatId, 'user', userMessage);

    // Get conversation history as LLM messages (with system prompt + truncation)
    const messages = this.conversationManager.getMessages(chatId, {
      maxTokens: options.maxTokens,
    });

    // Get enabled tools from registry
    const tools = options.enableTools !== false ? this.toolRegistry.getEnabledTools() : [];

    // Execute chat with automatic tool call loop
    const response = await this._chatWithToolLoop(messages, tools, options);

    // Add assistant response to conversation history
    this.conversationManager.addMessage(chatId, 'assistant', response.content);

    return response.content;
  }

  /**
   * Chat with automatic tool call handling.
   *
   * If the LLM requests tool calls, executes them and continues the conversation.
   * Repeats until no more tool calls or max iterations reached.
   *
   * @param {Array<Object>} messages - LLM message array (with system prompt).
   * @param {Array<Object>} tools - Enabled tool schemas.
   * @param {Object} options - Chat options (temperature, onChunk, etc.).
   * @returns {Promise<{content: string, toolCalls: Array, model: string}>}
   * @private
   */
  async _chatWithToolLoop(messages, tools, options) {
    const orchestrator = this.orchestrator;
    const toolRegistry = this.toolRegistry;
    let currentMessages = [...messages];
    let iterations = 0;

    while (iterations < this.maxToolIterations) {
      iterations++;

      const chatOptions = {
        tools: tools.length > 0 ? tools : undefined,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
      };

      logger.debug(
        `LLM Bridge chat iteration ${iterations}/${this.maxToolIterations}, ${currentMessages.length} messages`
      );

      let response;
      if (options.onChunk) {
        // Streaming mode — pass through to orchestrator
        response = await orchestrator.chat(currentMessages, {
          ...chatOptions,
          stream: true,
          onChunk: options.onChunk,
        });
      } else {
        response = await orchestrator.chat(currentMessages, chatOptions);
      }

      // If no tool calls, we're done — return final text response
      if (!response.toolCalls || response.toolCalls.length === 0) {
        logger.debug(`LLM Bridge completed in ${iterations} iteration(s)`);
        return response;
      }

      logger.debug(`LLM requested ${response.toolCalls.length} tool call(s)`);

      // Execute each tool call and append results to conversation
      for (const toolCall of response.toolCalls) {
        // Add assistant message with tool call to conversation
        currentMessages.push({
          role: 'assistant',
          content: response.content || null,
          tool_calls: [
            {
              id: toolCall.id,
              type: 'function',
              function: {
                name: toolCall.name,
                arguments: JSON.stringify(toolCall.arguments),
              },
            },
          ],
        });

        // Execute the tool via registry
        const result = await toolRegistry.executeToolCall(toolCall);

        // Add tool result to conversation
        currentMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          name: toolCall.name,
          content: result,
        });
      }
    }

    // Max iterations reached — force a final response without tools
    logger.warn(
      `LLM Bridge hit max tool iterations (${this.maxToolIterations}), forcing final response`
    );

    const finalResponse = await orchestrator.chat(currentMessages, {
      tools: [], // No tools — force text response
      temperature: options.temperature,
      maxTokens: options.maxTokens,
      systemPrompt:
        'Respondé con un resumen conciso de lo que encontraste. No solicites más herramientas.',
    });

    return finalResponse;
  }

  /**
   * Get bridge status and provider health.
   *
   * @returns {Object} Status object with providers, tools, and orchestrator stats.
   */
  getStatus() {
    return {
      enabled: this.enabled,
      providers: this.orchestrator.getProviderStatus(),
      tools: this.toolRegistry.getStats(),
      orchestrator: this.orchestrator.getStats(),
    };
  }

  /**
   * Enable or disable tool tiers at runtime.
   *
   * @param {number[]} tiers - Array of tier numbers to enable.
   */
  setToolTiers(tiers) {
    this.toolRegistry.enabledTiers = tiers;
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let _bridge = null;

/**
 * Get or create the singleton LLMBridge service.
 *
 * @param {import('better-sqlite3').Database} db - SQLite database instance.
 * @param {Object} [options] - Bridge configuration options.
 * @returns {LLMBridge}
 */
function getLLMBridgeService(db, options) {
  if (!_bridge) {
    _bridge = new LLMBridge(db, options);
  }
  return _bridge;
}

/**
 * Reset the singleton (useful for testing or reconfiguration).
 */
function resetLLMBridgeService() {
  _bridge = null;
  resetProviderBridge();
}

module.exports = {
  LLMBridge,
  getLLMBridgeService,
  resetLLMBridgeService,
};
