/**
 * @file openai-compatible-adapter.js
 * @description Adapter base para cualquier proveedor compatible con la API de OpenAI.
 *
 * Este adapter extiende LLMProvider y usa el paquete `openai` npm para comunicarse
 * con cualquier endpoint que siga el formato de la API de OpenAI. Esto incluye:
 * - OpenRouter (baseURL: https://openrouter.ai/api/v1)
 * - OpenCode Zen (baseURL configurable)
 * - Direct API / OpenAI (baseURL: https://api.openai.com/v1)
 * - Cualquier servidor compatible (Ollama, LM Studio, vLLM, etc.)
 *
 * Los adapters específicos de cada proveedor deben extender esta clase y definir
 * su baseURL por defecto, lógica de modelos, y cualquier comportamiento especial.
 *
 * @example
 * // Uso directo (para pruebas o proveedores simples):
 * const { OpenAICompatibleAdapter } = require('./providers/openai-compatible-adapter');
 * const provider = new OpenAICompatibleAdapter({
 *   name: 'my-provider',
 *   apiKey: process.env.MY_API_KEY,
 *   model: 'gpt-4o',
 *   baseUrl: 'https://api.example.com/v1',
 * });
 *
 * const response = await provider.chat([
 *   { role: 'user', content: 'Hola, ¿cómo estás?' }
 * ]);
 *
 * @example
 * // Extendiendo para un proveedor específico:
 * class OpenRouterAdapter extends OpenAICompatibleAdapter {
 *   constructor(config) {
 *     super({
 *       ...config,
 *       baseUrl: config.baseUrl || 'https://openrouter.ai/api/v1',
 *     });
 *   }
 *
 *   async getModels() {
 *     // Lógica específica de OpenRouter...
 *   }
 * }
 */

const { LLMProvider, ERROR_TYPES, createClassifiedError } = require('./provider-interface');

// Lazy require del paquete openai para evitar errores si no está instalado
let OpenAIClient;
try {
  const openaiModule = require('openai');
  OpenAIClient = openaiModule.OpenAI || openaiModule.default;
} catch (e) {
  // Se manejará en validateCredentials si no está disponible
  OpenAIClient = null;
}

// ============================================================================
// CLASE: OpenAICompatibleAdapter
// ============================================================================

/**
 * Adapter base para proveedores compatibles con la API de OpenAI.
 *
 * Extiende LLMProvider e implementa todos los métodos abstractos usando
 * el cliente oficial de OpenAI con baseURL configurable.
 *
 * @extends LLMProvider
 */
class OpenAICompatibleAdapter extends LLMProvider {
  /**
   * Crea una nueva instancia del adapter.
   *
   * @param {ProviderConfig} config - Configuración del proveedor.
   * @param {string} config.name - Nombre identificador del proveedor.
   * @param {string} config.apiKey - API key del proveedor.
   * @param {string} config.model - Modelo a utilizar.
   * @param {string} [config.baseUrl] - URL base del endpoint (sin trailing slash).
   *   Si no se proporciona, usa el endpoint por defecto de OpenAI.
   * @param {number} [config.maxRetries=3] - Reintentos ante errores recuperables.
   * @param {number} [config.timeout=60000] - Timeout en milisegundos.
   * @param {boolean} [config.enabled=true] - Si el proveedor está habilitado.
   */
  constructor(config) {
    super(config);

    if (!OpenAIClient) {
      throw new Error('El paquete "openai" no está instalado. Ejecuta: npm install openai');
    }

    // Construir el cliente OpenAI con configuración flexible
    const clientOptions = {
      apiKey: (config.apiKey || 'sk-placeholder').trim(), // Algunos proveedores no requieren API key
      maxRetries: config.maxRetries ?? 3,
    };

    // Si se proporciona baseUrl, usarla como baseURL del cliente
    if (config.baseUrl) {
      clientOptions.baseURL = config.baseUrl;
    }

    // Default headers
    if (config.defaultHeaders) {
      clientOptions.defaultHeaders = config.defaultHeaders;
    }

    // Timeout: el cliente openai no tiene timeout nativo en el constructor,
    // se maneja a nivel de request con AbortController en los métodos
    this.timeout = config.timeout ?? 60000;

    this.client = new OpenAIClient(clientOptions);
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
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), this.timeout);

    try {
      const params = this._buildCompletionParams(messages, options);

      const response = await this.client.chat.completions.create(params, {
        signal: abortController.signal,
      });

      clearTimeout(timeoutId);
      return this._mapResponse(response);
    } catch (error) {
      clearTimeout(timeoutId);
      throw this._mapError(error);
    }
  }

  /**
   * Variante streaming del chat. Invoca `onChunk` por cada fragmento generado.
   *
   * @param {ChatMessage[]} messages - Historial de mensajes de la conversación.
   * @param {ChatOptions} [options] - Opciones adicionales para la solicitud.
   * @param {function(string): void} onChunk - Callback invocado con cada fragmento de texto.
   * @returns {Promise<ChatResponse>} Respuesta completa al finalizar el stream.
   * @throws {ErrorClassification} Error clasificado si el stream falla.
   */
  async streamChat(messages, options = {}, onChunk) {
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), this.timeout);

    try {
      const params = this._buildCompletionParams(messages, {
        ...options,
        stream: true,
      });

      const stream = await this.client.chat.completions.create(params, {
        signal: abortController.signal,
      });

      let fullContent = '';
      let toolCalls = [];
      let usage = null;
      let finishReason = null;
      let model = null;

      for await (const chunk of stream) {
        model = chunk.model;
        const delta = chunk.choices?.[0]?.delta;

        if (!delta) continue;

        // Acumular contenido de texto
        if (delta.content) {
          fullContent += delta.content;
          if (typeof onChunk === 'function') {
            onChunk(delta.content);
          }
        }

        // Acumular tool calls del stream
        if (delta.tool_calls && delta.tool_calls.length > 0) {
          for (const tc of delta.tool_calls) {
            if (!toolCalls[tc.index]) {
              toolCalls[tc.index] = {
                id: tc.id || '',
                name: tc.function?.name || '',
                arguments: '',
              };
            }
            if (tc.id) toolCalls[tc.index].id = tc.id;
            if (tc.function?.name) toolCalls[tc.index].name = tc.function.name;
            if (tc.function?.arguments) {
              toolCalls[tc.index].arguments += tc.function.arguments;
            }
          }
        }

        // Capturar finish_reason del último chunk
        if (chunk.choices?.[0]?.finish_reason) {
          finishReason = chunk.choices[0].finish_reason;
        }
      }

      // Parsear argumentos de tool calls
      const parsedToolCalls = toolCalls.filter(Boolean).map((tc) => ({
        id: tc.id,
        name: tc.name,
        arguments: this._safeParseJSON(tc.arguments),
      }));

      clearTimeout(timeoutId);

      return {
        content: fullContent,
        toolCalls: parsedToolCalls,
        usage: usage || { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        model: model || this.config.model,
        finishReason: finishReason || 'stop',
      };
    } catch (error) {
      clearTimeout(timeoutId);
      throw this._mapError(error);
    }
  }

  /**
   * Retorna la lista de modelos disponibles para este proveedor.
   *
   * Implementación por defecto: intenta consultar el endpoint /v1/models.
   * Si falla (algunos proveedores no exponen este endpoint), retorna un
   * array con el modelo configurado como fallback.
   *
   * @returns {Promise<string[]>} Lista de identificadores de modelos.
   */
  async getModels() {
    try {
      const response = await this.client.models.list();
      if (response.data && Array.isArray(response.data)) {
        return response.data.map((m) => m.id).sort();
      }
    } catch (error) {
      // Algunos proveedores no exponen el endpoint de modelos.
      // Log silencioso — no es crítico para el funcionamiento.
      // Los adapters hijos pueden sobrescribir este método.
    }

    // Fallback: retornar el modelo configurado
    return [this.config.model];
  }

  /**
   * Valida que las credenciales del proveedor sean correctas y estén activas.
   * Realiza una llamada mínima al API para verificar conectividad y autenticación.
   *
   * @returns {Promise<{ valid: boolean, error?: string }>} Resultado de la validación.
   */
  async validateCredentials() {
    try {
      // Intentar una llamada mínima: listar modelos o hacer un chat vacío
      // Primero intentamos models.list() que es más ligero
      await this.client.models.list();
      return { valid: true };
    } catch (error) {
      // Si models.list() falla, intentar con un chat mínimo
      try {
        await this.client.chat.completions.create({
          model: this.config.model,
          messages: [{ role: 'user', content: 'test' }],
          max_tokens: 1,
        });
        return { valid: true };
      } catch (chatError) {
        const classified = this._mapError(chatError);
        return {
          valid: false,
          error: classified.message || 'Error desconocido al validar credenciales',
        };
      }
    }
  }

  // ============================================================================
  // MÉTODOS PRIVADOS / HELPERS
  // ============================================================================

  /**
   * Construye los parámetros para chat.completions.create().
   *
   * @param {ChatMessage[]} messages - Mensajes de la conversación.
   * @param {ChatOptions & { stream?: boolean }} options - Opciones de la solicitud.
   * @returns {Object} Parámetros para la API de OpenAI.
   * @private
   */
  _buildCompletionParams(messages, options = {}) {
    const params = {
      model: this.config.model,
      messages: this._mapMessages(messages),
    };

    // Opciones de generación
    if (options.temperature !== undefined) {
      params.temperature = options.temperature;
    }
    if (options.maxTokens !== undefined) {
      params.max_tokens = options.maxTokens;
    }
    if (options.stopSequences && options.stopSequences.length > 0) {
      params.stop = options.stopSequences;
    }
    if (options.topP !== undefined) {
      params.top_p = options.topP;
    }

    // Herramientas (function calling)
    if (options.tools && options.tools.length > 0) {
      params.tools = this._convertTools(options.tools);
    }

    // Streaming
    if (options.stream) {
      params.stream = true;
    }

    return params;
  }

  /**
   * Convierte ToolDefinition[] al formato de function calling de OpenAI.
   *
   * @param {ToolDefinition[]} tools - Definiciones de herramientas estandarizadas.
   * @returns {Array<{ type: 'function', function: Object }>} Herramientas en formato OpenAI.
   * @private
   */
  _convertTools(tools) {
    return tools.map((tool) => {
      if (tool.type === 'function' && tool.function) {
        return tool;
      }
      return {
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters || {
            type: 'object',
            properties: {},
          },
        },
      };
    });
  }

  /**
   * Mapea mensajes estandarizados al formato esperado por OpenAI.
   * En la mayoría de los casos, el formato ya es compatible, pero este método
   * permite a los adapters hijos agregar lógica específica de mapeo.
   *
   * @param {ChatMessage[]} messages - Mensajes estandarizados.
   * @returns {ChatMessage[]} Mensajes en formato OpenAI.
   * @private
   */
  _mapMessages(messages) {
    // El formato de mensajes ya es compatible con OpenAI:
    // { role, content, tool_call_id?, name? }
    return messages;
  }

  /**
   * Mapea la respuesta de OpenAI al formato ChatResponse estandarizado.
   *
   * @param {Object} response - Respuesta cruda de OpenAI.
   * @returns {ChatResponse} Respuesta estandarizada.
   * @private
   */
  _mapResponse(response) {
    const choice = response.choices?.[0] || {};
    const message = choice.message || {};

    // Mapear tool calls
    const toolCalls = (message.tool_calls || []).map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: this._safeParseJSON(tc.function.arguments),
    }));

    // Mapear uso de tokens
    const usage = response.usage
      ? {
          promptTokens: response.usage.prompt_tokens || 0,
          completionTokens: response.usage.completion_tokens || 0,
          totalTokens: response.usage.total_tokens || 0,
        }
      : { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

    return {
      content: message.content || '',
      toolCalls,
      usage,
      model: response.model || this.config.model,
      finishReason: choice.finish_reason || 'stop',
    };
  }

  /**
   * Parsea JSON de forma segura. Si falla, retorna un objeto vacío y loguea el error.
   *
   * @param {string} jsonString - String JSON a parsear.
   * @returns {Object} Objeto parseado o vacío si falla.
   * @private
   */
  _safeParseJSON(jsonString) {
    if (!jsonString) return {};
    try {
      return JSON.parse(jsonString);
    } catch (e) {
      // En producción, usar logger adecuado
      console.warn(`[OpenAICompatibleAdapter] Error parseando JSON de tool call: ${jsonString}`);
      return {};
    }
  }

  /**
   * Mapea errores de la API de OpenAI a ErrorClassification estandarizado.
   *
   * Esta es la pieza central de la resiliencia del sistema. Cada tipo de error
   * determina la estrategia de recovery (retry, failover, truncar contexto, etc.).
   *
   * @param {Error} error - Error original de la API de OpenAI.
   * @returns {ErrorClassification} Error clasificado para manejo estratégico.
   * @private
   */
  _mapError(error) {
    // Error de timeout / abort
    if (error.name === 'AbortError' || error.code === 'ECONNABORTED') {
      return createClassifiedError(
        ERROR_TYPES.TIMEOUT,
        'La solicitud excedió el tiempo de espera',
        {
          originalError: error,
        }
      );
    }

    // Error de red / conexión
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return createClassifiedError(
        ERROR_TYPES.SERVER_ERROR,
        `Error de conexión: ${error.message}`,
        {
          originalError: error,
        }
      );
    }

    // Error con status HTTP (API errors)
    if (error.status || error.statusCode) {
      const status = error.status || error.statusCode;
      const message = error.message || `Error HTTP ${status}`;
      const headers = error.headers || {};

      switch (status) {
        case 429: {
          // Rate limit — intentar extraer Retry-After
          const retryAfter = headers['retry-after'] ? parseInt(headers['retry-after'], 10) : null;
          return createClassifiedError(
            ERROR_TYPES.RATE_LIMIT,
            `Límite de tasa excedido: ${message}`,
            {
              retryAfter,
              originalError: error,
            }
          );
        }

        case 401:
          return createClassifiedError(
            ERROR_TYPES.AUTH_ERROR,
            `Credenciales inválidas: ${message}`,
            { originalError: error }
          );

        case 403: {
          // 403 puede ser auth error o quota excedida
          const body = error.error || error.response?.data || {};
          const bodyMessage = body.message || body.error?.message || '';
          const isQuota =
            bodyMessage.toLowerCase().includes('quota') ||
            bodyMessage.toLowerCase().includes('billing') ||
            bodyMessage.toLowerCase().includes('credit') ||
            message.toLowerCase().includes('quota') ||
            message.toLowerCase().includes('billing');

          if (isQuota) {
            return createClassifiedError(ERROR_TYPES.QUOTA_EXCEEDED, `Cuota excedida: ${message}`, {
              originalError: error,
            });
          }
          return createClassifiedError(ERROR_TYPES.AUTH_ERROR, `Acceso denegado: ${message}`, {
            originalError: error,
          });
        }

        case 404: {
          // Modelo no encontrado
          const body = error.error || error.response?.data || {};
          const bodyMessage = body.message || body.error?.message || '';
          const isModelNotFound =
            bodyMessage.toLowerCase().includes('model') ||
            message.toLowerCase().includes('model') ||
            message.toLowerCase().includes('not found');

          if (isModelNotFound) {
            return createClassifiedError(
              ERROR_TYPES.MODEL_UNAVAILABLE,
              `Modelo no encontrado: ${message}`,
              { originalError: error }
            );
          }
          return createClassifiedError(
            ERROR_TYPES.SERVER_ERROR,
            `Recurso no encontrado: ${message}`,
            { originalError: error }
          );
        }

        case 500:
        case 502:
        case 503:
        case 504:
          return createClassifiedError(
            ERROR_TYPES.SERVER_ERROR,
            `Error del servidor (${status}): ${message}`,
            { originalError: error }
          );

        default: {
          const body = error.error || error.response?.data || {};
          let bodyMessage = '';
          if (typeof body === 'string') bodyMessage = body;
          else if (body.message) bodyMessage = body.message;
          else if (body.error?.message) bodyMessage = body.error.message;
          
          return createClassifiedError(
            ERROR_TYPES.SERVER_ERROR,
            `Error HTTP ${status}: ${message} ${bodyMessage ? '- Detalles: ' + bodyMessage : ''}`,
            { originalError: error }
          );
        }
      }
    }

    // Error con código de tipo (OpenAI SDK errors)
    if (error.code) {
      const code = error.code;
      const message = error.message || `Error: ${code}`;

      // context_length_exceeded → CONTEXT_OVERFLOW
      if (
        code === 'context_length_exceeded' ||
        message.toLowerCase().includes('context_length') ||
        message.toLowerCase().includes('maximum context') ||
        message.toLowerCase().includes('token limit')
      ) {
        return createClassifiedError(
          ERROR_TYPES.CONTEXT_OVERFLOW,
          `El contexto excede el límite del modelo: ${message}`,
          { originalError: error }
        );
      }

      // Model not found
      if (
        code === 'model_not_found' ||
        message.toLowerCase().includes('model not found') ||
        message.toLowerCase().includes('invalid model')
      ) {
        return createClassifiedError(
          ERROR_TYPES.MODEL_UNAVAILABLE,
          `Modelo no disponible: ${message}`,
          { originalError: error }
        );
      }

      // Rate limit
      if (code === 'rate_limit_exceeded') {
        return createClassifiedError(
          ERROR_TYPES.RATE_LIMIT,
          `Límite de tasa excedido: ${message}`,
          { originalError: error }
        );
      }

      // Auth errors
      if (code === 'invalid_api_key' || code === 'authentication_error') {
        return createClassifiedError(ERROR_TYPES.AUTH_ERROR, `Error de autenticación: ${message}`, {
          originalError: error,
        });
      }
    }

    // Fallback: error genérico del servidor
    return createClassifiedError(
      ERROR_TYPES.SERVER_ERROR,
      error.message || 'Error desconocido del proveedor',
      { originalError: error }
    );
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  OpenAICompatibleAdapter,
};
