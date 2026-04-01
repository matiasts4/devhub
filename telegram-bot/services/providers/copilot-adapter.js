/**
 * @file copilot-adapter.js
 * @description Adapter para GitHub Copilot — proveedor primario en la cadena de failover.
 *
 * A diferencia de los demás adapters (que son compatibles con OpenAI), Copilot tiene
 * su propio SDK. Este adapter implementa un enfoque dual:
 *
 * 1. Intenta usar @copilot-extensions/preview-sdk (SDK oficial de Copilot)
 * 2. Si no está disponible, fallback a la API compatible con OpenAI en api.githubcopilot.com
 *
 * Modelos soportados: GPT-4o, GPT-4o-mini, Claude 3.5 Sonnet, Claude 3 Opus, o1, o1-mini, o3-mini
 *
 * @example
 * const CopilotAdapter = require('./providers/copilot-adapter');
 * const copilot = new CopilotAdapter({
 *   apiKey: process.env.COPILOT_TOKEN,
 *   model: 'gpt-4o',
 * });
 *
 * const response = await copilot.chat([
 *   { role: 'user', content: 'Hola, ¿cómo estás?' }
 * ]);
 */

const { LLMProvider, ERROR_TYPES, createClassifiedError } = require('./provider-interface');
const logger = require('../../utils/logger');

// ============================================================================
// CLASE: CopilotAdapter
// ============================================================================

/**
 * Adapter para GitHub Copilot con soporte dual (SDK oficial + fallback OpenAI-compatible).
 *
 * Extiende LLMProvider directamente (NO OpenAICompatibleAdapter) porque Copilot
 * tiene su propio formato de API y SDK dedicado.
 *
 * @extends LLMProvider
 */
class CopilotAdapter extends LLMProvider {
  /**
   * Crea una nueva instancia del adapter de Copilot.
   *
   * @param {Object} [config={}] - Configuración del proveedor.
   * @param {string} [config.apiKey] - Token de GitHub Copilot.
   * @param {string} [config.model='gpt-4o'] - Modelo a utilizar.
   * @param {number} [config.maxRetries=3] - Reintentos ante errores recuperables.
   * @param {number} [config.timeout=60000] - Timeout en milisegundos.
   * @param {boolean} [config.enabled=true] - Si el proveedor está habilitado.
   */
  constructor(config = {}) {
    super({
      name: 'copilot',
      apiKey: (config.apiKey || process.env.COPILOT_TOKEN || '').trim(),
      model: config.model || process.env.COPILOT_MODEL || 'gpt-4o',
      maxRetries: config.maxRetries || 3,
      timeout: config.timeout || 60000,
      enabled: config.enabled !== false,
      ...config,
    });

    this.client = null;
    this._useFallback = false;
  }

  /**
   * Inicializa perezosamente el cliente de Copilot.
   *
   * Intenta primero el SDK oficial (@copilot-extensions/preview-sdk).
   * Si no está disponible, hace fallback al endpoint OpenAI-compatible
   * en api.githubcopilot.com usando el paquete `openai`.
   *
   * @returns {Object} Cliente de Copilot inicializado.
   * @private
   */
  _getClient() {
    if (this.client) return this.client;

    // Intentar SDK oficial de Copilot primero
    try {
      const { CopilotClient } = require('@copilot-extensions/preview-sdk');
      this.client = new CopilotClient({
        token: this.config.apiKey,
        model: this.config.model,
      });
      logger.info('Copilot SDK initialized successfully');
      return this.client;
    } catch (sdkErr) {
      // Fallback: usar API compatible con OpenAI
      logger.warn(
        'Copilot SDK not available (' + sdkErr.message + '), using OpenAI-compatible fallback'
      );

      // Lazy require del paquete openai
      let OpenAI;
      try {
        const openaiModule = require('openai');
        OpenAI = openaiModule.OpenAI || openaiModule.default;
      } catch (e) {
        throw new Error(
          'Ni el SDK de Copilot ni el paquete "openai" están disponibles. ' +
            'Instala uno de ellos: npm install @copilot-extensions/preview-sdk openai'
        );
      }

      this.client = new OpenAI({
        apiKey: this.config.apiKey,
        baseURL: 'https://api.githubcopilot.com',
        defaultHeaders: {
          'Editor-Version': 'DevHub/1.0.0',
        },
      });
      this._useFallback = true;
      return this.client;
    }
  }

  // ============================================================================
  // MÉTODOS PRINCIPALES
  // ============================================================================

  /**
   * Envía una solicitud de chat al proveedor y retorna la respuesta.
   *
   * @param {ChatMessage[]} messages - Historial de mensajes de la conversación.
   * @param {ChatOptions} [options] - Opciones adicionales para la solicitud.
   * @returns {Promise<ChatResponse>} Respuesta estandarizada del proveedor.
   * @throws {ErrorClassification} Error clasificado si la solicitud falla.
   */
  async chat(messages, options = {}) {
    const client = this._getClient();

    try {
      if (this._useFallback) {
        return this._chatViaOpenAI(client, messages, options);
      }
      return this._chatViaSDK(client, messages, options);
    } catch (error) {
      throw this._mapError(error);
    }
  }

  /**
   * Chat usando el SDK oficial de Copilot.
   *
   * @param {Object} client - Instancia de CopilotClient.
   * @param {ChatMessage[]} messages - Mensajes de la conversación.
   * @param {ChatOptions} options - Opciones de la solicitud.
   * @returns {Promise<ChatResponse>} Respuesta estandarizada.
   * @private
   */
  async _chatViaSDK(client, messages, options) {
    const response = await client.chat({
      messages: messages.map(function (m) {
        return {
          role: m.role,
          content: m.content,
        };
      }),
      tools: options.tools
        ? options.tools.map(function (t) {
            return {
              type: 'function',
              function: {
                name: t.function.name,
                description: t.function.description,
                parameters: t.function.parameters,
              },
            };
          })
        : undefined,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
    });

    return {
      content: (response.message && response.message.content) || '',
      toolCalls: (response.message && response.message.tool_calls
        ? response.message.tool_calls
        : []
      ).map(function (tc) {
        return {
          id: tc.id,
          name: tc.function.name,
          arguments: JSON.parse(tc.function.arguments || '{}'),
        };
      }),
      usage: {
        promptTokens: (response.usage && response.usage.prompt_tokens) || 0,
        completionTokens: (response.usage && response.usage.completion_tokens) || 0,
        totalTokens: (response.usage && response.usage.total_tokens) || 0,
      },
      model: response.model || this.config.model,
      finishReason: response.finish_reason || 'stop',
    };
  }

  /**
   * Chat usando el fallback OpenAI-compatible (api.githubcopilot.com).
   *
   * @param {Object} client - Instancia de OpenAI client.
   * @param {ChatMessage[]} messages - Mensajes de la conversación.
   * @param {ChatOptions} options - Opciones de la solicitud.
   * @returns {Promise<ChatResponse>} Respuesta estandarizada.
   * @private
   */
  async _chatViaOpenAI(client, messages, options) {
    const params = {
      model: this.config.model,
      messages: messages.map(function (m) {
        return {
          role: m.role,
          content: m.content,
        };
      }),
    };

    if (options.temperature !== undefined) {
      params.temperature = options.temperature;
    }
    if (options.maxTokens !== undefined) {
      params.max_tokens = options.maxTokens;
    }

    if (options.tools && options.tools.length > 0) {
      params.tools = options.tools;
    }

    const response = await client.chat.completions.create(params);
    var choice = response.choices[0];

    return {
      content: (choice.message && choice.message.content) || '',
      toolCalls: (choice.message && choice.message.tool_calls ? choice.message.tool_calls : []).map(
        function (tc) {
          return {
            id: tc.id,
            name: tc.function.name,
            arguments: JSON.parse(tc.function.arguments || '{}'),
          };
        }
      ),
      usage: {
        promptTokens: (response.usage && response.usage.prompt_tokens) || 0,
        completionTokens: (response.usage && response.usage.completion_tokens) || 0,
        totalTokens: (response.usage && response.usage.total_tokens) || 0,
      },
      model: response.model || this.config.model,
      finishReason: choice.finish_reason || 'stop',
    };
  }

  /**
   * Variante streaming del chat. Invoca `onChunk` por cada fragmento generado.
   *
   * NOTA: El SDK de Copilot no soporta streaming de la misma forma que OpenAI.
   * En modo fallback (OpenAI-compatible), se usa streaming nativo. En modo SDK,
   * se delega a chat() no-streaming.
   *
   * @param {ChatMessage[]} messages - Historial de mensajes de la conversación.
   * @param {ChatOptions} [options] - Opciones adicionales para la solicitud.
   * @param {function(string): void} onChunk - Callback invocado con cada fragmento de texto.
   * @returns {Promise<ChatResponse>} Respuesta completa al finalizar el stream.
   * @throws {ErrorClassification} Error clasificado si el stream falla.
   */
  async streamChat(messages, options = {}, onChunk) {
    const client = this._getClient();

    if (this._useFallback) {
      // Streaming nativo vía OpenAI-compatible
      const abortController = new AbortController();
      var timeoutId = setTimeout(function () {
        abortController.abort();
      }, this.config.timeout);

      try {
        var stream = await client.chat.completions.create(
          {
            model: this.config.model,
            messages: messages.map(function (m) {
              return { role: m.role, content: m.content };
            }),
            stream: true,
            temperature: options.temperature,
            max_tokens: options.maxTokens,
          },
          { signal: abortController.signal }
        );

        var fullContent = '';
        for await (var chunk of stream) {
          var delta =
            (chunk.choices &&
              chunk.choices[0] &&
              chunk.choices[0].delta &&
              chunk.choices[0].delta.content) ||
            '';
          if (delta) {
            fullContent += delta;
            if (typeof onChunk === 'function') {
              onChunk(delta);
            }
          }
        }

        clearTimeout(timeoutId);

        return {
          content: fullContent,
          toolCalls: [],
          usage: {
            promptTokens: 0,
            completionTokens: this.estimateTokens(fullContent),
            totalTokens: 0,
          },
          model: this.config.model,
          finishReason: 'stop',
        };
      } catch (error) {
        clearTimeout(timeoutId);
        throw this._mapError(error);
      }
    }

    // El SDK de Copilot no soporta streaming — usar modo no-streaming
    logger.warn('Copilot SDK streaming not available, using non-streaming mode');
    return this.chat(messages, options);
  }

  /**
   * Retorna la lista de modelos disponibles en GitHub Copilot.
   *
   * @returns {Promise<string[]>} Lista de identificadores de modelos.
   */
  async getModels() {
    return [
      'gpt-4o',
      'gpt-4o-mini',
      'claude-3.5-sonnet',
      'claude-3-opus',
      'o1',
      'o1-mini',
      'o3-mini',
    ];
  }

  /**
   * Valida que las credenciales de Copilot sean correctas y estén activas.
   *
   * Realiza una llamada mínima al API para verificar conectividad y autenticación.
   * Errores de rate limit u otros errores transitorios se consideran como
   * credenciales válidas (solo 401/403 indican credenciales inválidas).
   *
   * @returns {Promise<{ valid: boolean, error?: string }>} Resultado de la validación.
   */
  async validateCredentials() {
    try {
      var client = this._getClient();

      // Hacer una llamada mínima para verificar credenciales
      await client.chat.completions.create({
        model: this.config.model,
        messages: [{ role: 'user', content: 'test' }],
        max_tokens: 1,
      });
      return { valid: true };
    } catch (error) {
      var status = error.status || error.statusCode;
      if (status === 401 || status === 403) {
        return { valid: false, error: 'Token inválido o sin permisos' };
      }
      // Otros errores (rate limit, etc.) significan que las credenciales son válidas
      return { valid: true };
    }
  }

  /**
   * Retorna el tamaño máximo de la ventana de contexto del modelo configurado.
   *
   * @returns {number} Máxima cantidad de tokens de contexto (entrada + salida).
   */
  getMaxTokens() {
    var model = this.config.model;
    if (model.indexOf('gpt-4o') !== -1) return 128000;
    if (model.indexOf('claude-3.5-sonnet') !== -1) return 200000;
    if (model.indexOf('claude-3-opus') !== -1) return 200000;
    if (model.indexOf('o1') !== -1) return 200000;
    if (model.indexOf('o3') !== -1) return 200000;
    return 128000;
  }

  /**
   * Retorna el nombre identificador del proveedor.
   *
   * @returns {string} 'copilot'
   */
  getName() {
    return 'copilot';
  }

  // ============================================================================
  // MANEJO DE ERRORES
  // ============================================================================

  /**
   * Mapea errores de la API de Copilot a ErrorClassification estandarizado.
   *
   * @param {Error} error - Error original de la API.
   * @returns {ErrorClassification} Error clasificado para manejo estratégico.
   * @private
   */
  _mapError(error) {
    var status = error.status || error.statusCode;
    var message = error.message || String(error);

    // Rate limit (429)
    if (status === 429) {
      var retryAfter =
        error.headers && error.headers['retry-after']
          ? parseInt(error.headers['retry-after'], 10) * 1000
          : null;
      return createClassifiedError(ERROR_TYPES.RATE_LIMIT, message, { retryAfter: retryAfter });
    }

    // Auth errors (401/403)
    if (status === 401 || status === 403) {
      return createClassifiedError(ERROR_TYPES.AUTH_ERROR, message);
    }

    // Quota exceeded
    if (message.indexOf('quota') !== -1 || message.indexOf('billing') !== -1) {
      return createClassifiedError(ERROR_TYPES.QUOTA_EXCEEDED, message);
    }

    // Context overflow
    if (message.indexOf('context_length') !== -1 || message.indexOf('maximum context') !== -1) {
      return createClassifiedError(ERROR_TYPES.CONTEXT_OVERFLOW, message);
    }

    // Model unavailable
    if (message.indexOf('model_not_found') !== -1 || message.indexOf('not available') !== -1) {
      return createClassifiedError(ERROR_TYPES.MODEL_UNAVAILABLE, message);
    }

    // Server errors (5xx)
    if (status >= 500) {
      return createClassifiedError(ERROR_TYPES.SERVER_ERROR, message);
    }

    // Fallback: error genérico
    return createClassifiedError(ERROR_TYPES.SERVER_ERROR, message);
  }
}

module.exports = CopilotAdapter;
