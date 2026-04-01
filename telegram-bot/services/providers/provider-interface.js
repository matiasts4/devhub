/**
 * @file provider-interface.js
 * @description Contrato abstracto que TODOS los proveedores de LLM deben implementar.
 * Define la interfaz LLMProvider, tipos de datos estandarizados, clasificación de errores
 * y orquestadores de failover.
 *
 * Este archivo es la base del sistema de adapters — cualquier nuevo proveedor (OpenAI,
 * Anthropic, Gemini, Ollama, etc.) debe extender LLMProvider e implementar todos sus métodos.
 */

// ============================================================================
// TIPOS DE DATOS ESTANDARIZADOS
// ============================================================================

/**
 * Respuesta estandarizada de cualquier proveedor LLM.
 * Todos los adapters deben retornar este formato para garantizar interoperabilidad.
 *
 * @typedef {Object} ChatResponse
 * @property {string} content - Texto de la respuesta generada por el modelo.
 * @property {ToolCall[]} toolCalls - Lista de llamadas a herramientas solicitadas por el LLM (function calling).
 * @property {UsageStats} usage - Estadísticas de consumo de tokens.
 * @property {string} model - Identificador del modelo que generó la respuesta (ej: "gpt-4o", "claude-3.5-sonnet").
 * @property {string} finishReason - Motivo de finalización: "stop" | "length" | "tool_calls" | "content_filter" | "error".
 */

/**
 * Estadísticas de uso de tokens para una respuesta.
 *
 * @typedef {Object} UsageStats
 * @property {number} promptTokens - Tokens consumidos en el prompt de entrada.
 * @property {number} completionTokens - Tokens generados en la respuesta.
 * @property {number} totalTokens - Suma total de tokens (prompt + completion).
 */

/**
 * Definición de una herramienta (tool) disponible para function calling.
 * Se mapea al formato estándar de tool definitions de los proveedores.
 *
 * @typedef {Object} ToolDefinition
 * @property {string} name - Nombre único de la herramienta (ej: "search_codebase", "run_command").
 * @property {string} description - Descripción clara de qué hace la herramienta y cuándo usarla.
 * @property {Object} parameters - JSON Schema que define los parámetros esperados.
 *   Debe seguir el formato JSON Schema Draft 7 o superior.
 *   Ejemplo: { type: "object", properties: { query: { type: "string" } }, required: ["query"] }
 */

/**
 * Representa una llamada a herramienta solicitada por el LLM.
 *
 * @typedef {Object} ToolCall
 * @property {string} id - Identificador único de la llamada (generado por el proveedor).
 * @property {string} name - Nombre de la herramienta a ejecutar (debe coincidir con un ToolDefinition.name).
 * @property {Object} arguments - Argumentos parseados para la herramienta.
 *   Los argumentos vienen como objeto JavaScript ya parseado (no string JSON).
 */

// ============================================================================
// CLASIFICACIÓN DE ERRORES
// ============================================================================

/**
 * Tipos de error clasificados para manejo estratégico.
 * Cada tipo determina una acción específica del sistema de retry/failover.
 *
 * @typedef {Object} ErrorClassification
 * @property {string} type - Uno de los tipos definidos en ERROR_TYPES.
 * @property {string} message - Mensaje legible del error.
 * @property {number|null} retryAfter - Segundos a esperar antes de reintentar (solo para RATE_LIMIT).
 * @property {Error|null} originalError - Error original del proveedor (para debugging).
 *
 * @description
 * Tipos de error y su manejo recomendado:
 *
 * | Tipo                  | Acción                        | Reintentar | Failover |
 * |-----------------------|-------------------------------|------------|----------|
 * | RATE_LIMIT            | Esperar y reintentar          | ✅ Sí      | ❌ No    |
 * | AUTH_ERROR            | Fallar inmediatamente         | ❌ No      | ✅ Sí    |
 * | QUOTA_EXCEEDED        | Fallar inmediatamente         | ❌ No      | ✅ Sí    |
 * | TIMEOUT               | Reintentar con timeout menor  | ✅ Sí      | ❌ No    |
 * | MODEL_UNAVAILABLE     | Fallar inmediatamente         | ❌ No      | ✅ Sí    |
 * | SERVER_ERROR          | Reintentar una vez            | ✅ 1 vez   | ❌ No    |
 * | CONTEXT_OVERFLOW      | Truncar contexto y reintentar | ✅ Sí      | ❌ No    |
 */

const ERROR_TYPES = Object.freeze({
  /** El proveedor rechazó la solicitud por límite de tasa (429 Too Many Requests). */
  RATE_LIMIT: 'RATE_LIMIT',

  /** Credenciales inválidas, API key expirada o sin permisos (401/403). */
  AUTH_ERROR: 'AUTH_ERROR',

  /** Se excedió la cuota mensual o de crédito del proveedor. */
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',

  /** La solicitud excedió el tiempo máximo de espera. */
  TIMEOUT: 'TIMEOUT',

  /** El modelo solicitado no está disponible temporalmente. */
  MODEL_UNAVAILABLE: 'MODEL_UNAVAILABLE',

  /** Error interno del servidor del proveedor (5xx). */
  SERVER_ERROR: 'SERVER_ERROR',

  /** El contexto excede la ventana máxima del modelo. */
  CONTEXT_OVERFLOW: 'CONTEXT_OVERFLOW',
});

/**
 * Crea un error clasificado para manejo de failover/retry.
 *
 * @param {string} type - Tipo de error (uno de ERROR_TYPES).
 * @param {string} message - Mensaje descriptivo del error.
 * @param {Object} [options] - Opciones adicionales.
 * @param {number|null} [options.retryAfter=null] - Segundos a esperar antes de reintentar.
 * @param {Error|null} [options.originalError=null] - Error original del proveedor.
 * @returns {ErrorClassification}
 */
function createClassifiedError(type, message, options = {}) {
  return {
    type,
    message,
    retryAfter: options.retryAfter ?? null,
    originalError: options.originalError ?? null,
  };
}

// ============================================================================
// CONFIGURACIÓN DE PROVEEDOR
// ============================================================================

/**
 * Configuración base para cualquier proveedor LLM.
 *
 * @typedef {Object} ProviderConfig
 * @property {string} name - Nombre identificador del proveedor (ej: "openai", "anthropic", "gemini").
 * @property {string} [apiKey] - API key del proveedor. Algunos proveedores locales pueden no requerirla.
 * @property {string} model - Modelo a utilizar (ej: "gpt-4o", "claude-3-5-sonnet-20241022").
 * @property {string} [baseUrl] - URL base personalizada para el endpoint del proveedor.
 *   Útil para proxies, OpenAI-compatible servers, o instancias self-hosted.
 * @property {number} [maxRetries=3] - Cantidad máxima de reintentos ante errores recuperables.
 * @property {number} [timeout=60000] - Timeout en milisegundos para cada solicitud.
 * @property {boolean} [enabled=true] - Si el proveedor está habilitado para uso en el failover chain.
 */

// ============================================================================
// INTERFAZ ABSTRACTA: LLMProvider
// ============================================================================

/**
 * Clase abstracta que define el contrato que TODOS los proveedores LLM deben implementar.
 *
 * Para crear un nuevo proveedor:
 * 1. Extender esta clase
 * 2. Implementar TODOS los métodos marcados como abstractos
 * 3. Sobreescribir `getName()` con el identificador del proveedor
 * 4. Exportar la clase para registro en el orquestador
 *
 * @example
 * const { LLMProvider } = require('./providers/provider-interface');
 *
 * class OpenAIProvider extends LLMProvider {
 *   constructor(config) {
 *     super(config);
 *     this.client = new OpenAI({ apiKey: config.apiKey });
 *   }
 *
 *   async chat(messages, options) {
 *     // implementación real...
 *   }
 *
 *   // ... implementar resto de métodos
 * }
 *
 * module.exports = OpenAIProvider;
 */
class LLMProvider {
  /**
   * @param {ProviderConfig} config - Configuración del proveedor.
   */
  constructor(config) {
    if (this.constructor === LLMProvider) {
      throw new Error('LLMProvider es una clase abstracta. Debe ser extendida.');
    }
    this.config = config;
  }

  // ---- Métodos obligatorios ----

  /**
   * Envía una solicitud de chat al proveedor y retorna la respuesta.
   *
   * @abstract
   * @param {Array<ChatMessage>} messages - Historial de mensajes de la conversación.
   *   Cada mensaje debe tener: { role: "system"|"user"|"assistant", content: string }
   * @param {ChatOptions} [options] - Opciones adicionales para la solicitud.
   * @param {ChatOptions.tools} [options.tools] - Lista de ToolDefinition disponibles.
   * @param {ChatOptions.temperature} [options.temperature] - Temperatura de generación (0-2).
   * @param {ChatOptions.maxTokens} [options.maxTokens] - Límite máximo de tokens de salida.
   * @param {ChatOptions.stopSequences} [options.stopSequences] - Secuencias que detienen la generación.
   * @returns {Promise<ChatResponse>} Respuesta estandarizada del proveedor.
   * @throws {ErrorClassification} Error clasificado si la solicitud falla.
   */
  async chat(messages, options = {}) {
    throw new Error('Not implemented: chat()');
  }

  /**
   * Variante streaming del chat. Invoca el callback `onChunk` por cada fragmento generado.
   *
   * @abstract
   * @param {Array<ChatMessage>} messages - Historial de mensajes de la conversación.
   * @param {ChatOptions} [options] - Opciones adicionales para la solicitud.
   * @param {function(string): void} onChunk - Callback invocado con cada fragmento de texto generado.
   * @returns {Promise<ChatResponse>} Respuesta completa al finalizar el stream.
   * @throws {ErrorClassification} Error clasificado si el stream falla.
   */
  async streamChat(messages, options = {}, onChunk) {
    throw new Error('Not implemented: streamChat()');
  }

  /**
   * Retorna la lista de modelos disponibles para este proveedor.
   *
   * @abstract
   * @returns {Promise<string[]>} Lista de identificadores de modelos (ej: ["gpt-4o", "gpt-4o-mini"]).
   */
  async getModels() {
    throw new Error('Not implemented: getModels()');
  }

  /**
   * Valida que las credenciales del proveedor sean correctas y estén activas.
   * Se ejecuta al iniciar el bot para verificar que el proveedor puede conectarse.
   *
   * @abstract
   * @returns {Promise<{ valid: boolean, error?: string }>} Resultado de la validación.
   *   - `valid: true` si las credenciales son correctas.
   *   - `valid: false, error: "mensaje"` si hay un problema de autenticación o configuración.
   */
  async validateCredentials() {
    throw new Error('Not implemented: validateCredentials()');
  }

  // ---- Métodos opcionales con defaults ----

  /**
   * Retorna el nombre identificador del proveedor.
   * Por defecto usa `config.name`. Sobreescribir si se necesita lógica adicional.
   *
   * @returns {string} Nombre del proveedor (ej: "openai", "anthropic").
   */
  getName() {
    return this.config.name;
  }

  /**
   * Retorna el tamaño máximo de la ventana de contexto del modelo configurado.
   * Por defecto retorna 128000 (valor conservador). Sobreescribir con el valor real del modelo.
   *
   * @returns {number} Máxima cantidad de tokens de contexto (entrada + salida).
   */
  getMaxTokens() {
    return 128000;
  }

  /**
   * Estima la cantidad de tokens en un texto.
   * Implementación conservadora: ~4 caracteres por token (promedio para texto en inglés).
   * Sobreescribir con un tokenizer real del proveedor para mayor precisión.
   *
   * @param {string} text - Texto a estimar.
   * @returns {number} Cantidad estimada de tokens.
   */
  estimateTokens(text) {
    if (!text) return 0;
    // Estimación conservadora: ~4 caracteres por token
    return Math.ceil(text.length / 4);
  }
}

// ============================================================================
// INTERFAZ: FailoverOrchestrator
// ============================================================================

/**
 * Orquestador de failover que gestiona la cadena de proveedores.
 * Intenta proveedores en orden de prioridad y hace failover automático ante errores.
 *
 * @interface
 * @description
 * Responsabilidades:
 * - Mantener una lista ordenada de proveedores LLMProvider
 * - Intentar cada proveedor en secuencia ante fallos
 * - Clasificar errores para decidir retry vs failover
 * - Reportar estado de salud de cada proveedor
 *
 * @example
 * const orchestrator = new FailoverOrchestrator({
 *   providers: [openaiProvider, anthropicProvider, geminiProvider],
 *   order: ['openai', 'anthropic', 'gemini'],
 * });
 *
 * const response = await orchestrator.chat(messages, { tools: [...] });
 */

/**
 * @typedef {Object} FailoverOrchestrator
 * @property {function(Array<ChatMessage>, ChatOptions): Promise<ChatResponse>} chat -
 *   Intenta enviar el chat a los proveedores en orden. Ante un error failover-able,
 *   pasa al siguiente proveedor. Retorna la primera respuesta exitosa.
 * @property {function(): LLMProvider|null} getActiveProvider -
 *   Retorna el proveedor actualmente activo (el primero en la cadena que está habilitado).
 * @property {function(string[]): void} setProviderOrder -
 *   Configura el orden de prioridad de proveedores.
 *   @param {string[]} order - Array de nombres de proveedores en orden de prioridad.
 * @property {function(): Object<string, ProviderHealthStatus>} getProviderStatus -
 *   Retorna el estado de salud de todos los proveedores registrados.
 */

/**
 * Estado de salud de un proveedor individual.
 *
 * @typedef {Object} ProviderHealthStatus
 * @property {string} name - Nombre del proveedor.
 * @property {boolean} enabled - Si está habilitado en la configuración.
 * @property {boolean} credentialsValid - Si las credenciales son válidas.
 * @property {number} consecutiveFailures - Cantidad de fallos consecutivos actuales.
 * @property {string|null} lastError - Último error registrado (null si no hay errores).
 * @property {string} status - Estado calculado: "healthy" | "degraded" | "unhealthy" | "disabled".
 */

// ============================================================================
// INTERFAZ: LLMBridge
// ============================================================================

/**
 * Interfaz principal del puente LLM. Es el punto de entrada que `commands/chat.js` invocará.
 * Abstrae toda la complejidad de proveedores, failover y gestión de conversación.
 *
 * @interface
 * @description
 * Este es el único punto de contacto entre el bot de Telegram y el sistema de LLMs.
 * `commands/chat.js` debe importar y usar SOLO esta interfaz, nunca interactuar
 * directamente con proveedores individuales.
 *
 * @example
 * const bridge = require('./services/providers/llm-bridge');
 *
 * // En commands/chat.js:
 * const response = await bridge.chat(chatId, message, { tools: [...] });
 */

/**
 * @typedef {Object} LLMBridge
 * @property {function(string|number, string, BridgeChatOptions): Promise<ChatResponse>} chat -
 *   Punto de entrada principal para enviar un mensaje al LLM.
 *   @param {string|number} chatId - ID del chat de Telegram.
 *   @param {string} message - Mensaje del usuario.
 *   @param {BridgeChatOptions} [options] - Opciones de la solicitud.
 *   @returns {Promise<ChatResponse>} Respuesta del LLM.
 *
 * @property {function(BridgeConfig): void} configure -
 *   Configura o reconfigura el bridge en runtime.
 *   @param {BridgeConfig} config - Nueva configuración.
 *
 * @property {function(): BridgeStatus} getStatus -
 *   Retorna el estado de salud completo del sistema.
 *   @returns {BridgeStatus} Estado actual del bridge y sus proveedores.
 */

/**
 * Opciones extendidas para el chat del bridge (incluye contexto de Telegram).
 *
 * @typedef {Object} BridgeChatOptions
 * @property {ToolDefinition[]} [tools] - Herramientas disponibles para function calling.
 * @property {number} [temperature] - Temperatura de generación.
 * @property {number} [maxTokens] - Límite de tokens de salida.
 * @property {string} [systemPrompt] - Prompt de sistema personalizado para esta solicitud.
 * @property {boolean} [streaming] - Si se debe usar streaming (default: false).
 * @property {function(string): void} [onChunk] - Callback para streaming.
 */

/**
 * Configuración del bridge LLM.
 *
 * @typedef {Object} BridgeConfig
 * @property {ProviderConfig[]} providers - Lista de configuraciones de proveedores.
 * @property {string[]} [providerOrder] - Orden de prioridad (si no se especifica, usa el orden de `providers`).
 * @property {number} [defaultMaxRetries=3] - Reintentos por defecto para todos los proveedores.
 * @property {number} [defaultTimeout=60000] - Timeout por defecto en milisegundos.
 */

/**
 * Estado de salud del bridge completo.
 *
 * @typedef {Object} BridgeStatus
 * @property {boolean} configured - Si el bridge tiene configuración válida.
 * @property {string|null} activeProvider - Nombre del proveedor activo actual.
 * @property {ProviderHealthStatus[]} providers - Estado de cada proveedor.
 * @property {number} totalRequests - Total de solicitudes procesadas (desde inicio).
 * @property {number} totalFailovers - Total de failovers ejecutados (desde inicio).
 */

// ============================================================================
// TIPOS AUXILIARES
// ============================================================================

/**
 * Mensaje de chat estandarizado.
 *
 * @typedef {Object} ChatMessage
 * @property {"system"|"user"|"assistant"|"tool"} role - Rol del mensaje.
 * @property {string} content - Contenido textual del mensaje.
 * @property {string} [toolCallId] - ID de la llamada a herramienta asociada (solo para role="tool").
 * @property {string} [name] - Nombre de la herramienta (solo para role="tool").
 */

/**
 * Opciones de chat para proveedores individuales.
 *
 * @typedef {Object} ChatOptions
 * @property {ToolDefinition[]} [tools] - Herramientas disponibles.
 * @property {number} [temperature=1.0] - Temperatura de generación (0-2).
 * @property {number} [maxTokens] - Límite de tokens de salida.
 * @property {string[]} [stopSequences] - Secuencias de parada.
 * @property {number} [topP] - Top-p (nucleus sampling).
 * @property {string} [systemPrompt] - Prompt de sistema override.
 */

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Clase abstracta base
  LLMProvider,

  // Clasificación de errores
  ERROR_TYPES,
  createClassifiedError,

  // Tipos (exportados como JSDoc para IDE support)
  // NOTA: Los typedefs de JSDoc no se exportan como valores runtime,
  // pero están disponibles para autocompletado en editores que soportan JSDoc.
};
