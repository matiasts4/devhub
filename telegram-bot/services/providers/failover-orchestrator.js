/**
 * @file failover-orchestrator.js
 * @description Orquestador de failover que gestiona la cadena de proveedores LLM.
 *
 * Maneja la cadena de prioridad: Copilot → OpenRouter → Zen → Direct.
 * Clasifica errores y decide automáticamente entre reintentar o hacer failover
 * al siguiente proveedor disponible.
 *
 * Patrones implementados:
 * - Circuit breaker con tracking de fallos consecutivos
 * - Retry con exponential backoff para errores recuperables
 * - Failover inmediato para errores de autenticación/cuota
 * - Health tracking con estados: healthy/degraded/unhealthy/disabled
 */

const { ERROR_TYPES, createClassifiedError } = require('./provider-interface');
const logger = require('../../utils/logger');

// ============================================================================
// CONSTANTES DE CLASIFICACIÓN
// ============================================================================

/**
 * Errores que deben trigger failover inmediato (sin reintento).
 * Estos errores no van a resolverse con un retry — hay que pasar al siguiente proveedor.
 */
const FAILOVER_ERRORS = new Set([
  ERROR_TYPES.AUTH_ERROR,
  ERROR_TYPES.QUOTA_EXCEEDED,
  ERROR_TYPES.MODEL_UNAVAILABLE,
]);

/**
 * Errores que deben reintentarse antes de hacer failover.
 * Son errores transitorios que pueden resolverse con un retry.
 */
const RETRY_ERRORS = new Set([
  ERROR_TYPES.RATE_LIMIT,
  ERROR_TYPES.TIMEOUT,
  ERROR_TYPES.SERVER_ERROR,
  ERROR_TYPES.CONTEXT_OVERFLOW,
]);

// ============================================================================
// FAILOVER ORCHESTRATOR
// ============================================================================

/**
 * Orquestador de failover que gestiona múltiples proveedores LLM.
 *
 * Intenta proveedores en orden de prioridad y hace failover automático
 * ante errores. Clasifica errores para decidir entre retry y failover.
 *
 * @example
 * const orchestrator = new FailoverOrchestrator();
 * orchestrator.register('copilot', copilotProvider, 1);
 * orchestrator.register('openrouter', openrouterProvider, 2);
 *
 * const response = await orchestrator.chat(messages, { tools: [...] });
 */
class FailoverOrchestrator {
  /**
   * @param {Object} [options] - Opciones del orquestador.
   * @param {number} [options.defaultMaxRetries=3] - Reintentos por defecto.
   * @param {number} [options.defaultTimeout=60000] - Timeout por defecto en ms.
   */
  constructor(options = {}) {
    /** @type {Map<string, { provider: LLMProvider, priority: number, consecutiveFailures: number, lastError: string|null, enabled: boolean, credentialsValid: boolean|null }>} */
    this.providers = new Map();
    /** @type {string[]} */
    this.order = [];
    this.totalRequests = 0;
    this.totalFailovers = 0;
    this.defaultMaxRetries = options.defaultMaxRetries || 3;
    this.defaultTimeout = options.defaultTimeout || 60000;
  }

  /**
   * Registra un proveedor en el orquestador.
   *
   * @param {string} name - Identificador único del proveedor.
   * @param {LLMProvider} provider - Instancia de LLMProvider.
   * @param {number} priority - Prioridad (menor número = mayor prioridad, 1 es primero).
   * @param {boolean} [enabled=true] - Si el proveedor está habilitado.
   * @returns {FailoverOrchestrator} this para chaining.
   */
  register(name, provider, priority, enabled = true) {
    this.providers.set(name, {
      provider,
      priority,
      consecutiveFailures: 0,
      lastError: null,
      enabled,
      credentialsValid: null, // null = aún no validada
    });
    this._rebuildOrder();
    return this;
  }

  /**
   * Método principal de chat — intenta proveedores en orden de prioridad
   * con failover automático ante errores.
   *
   * @param {ChatMessage[]} messages - Historial de mensajes.
   * @param {ChatOptions} [options] - Opciones de la solicitud (tools, temperature, etc.).
   * @returns {Promise<ChatResponse>} Respuesta del primer proveedor exitoso.
   * @throws {ErrorClassification} Si todos los proveedores fallan.
   */
  async chat(messages, options = {}) {
    this.totalRequests++;
    const availableProviders = this._getAvailableProviders();

    if (availableProviders.length === 0) {
      throw createClassifiedError(
        ERROR_TYPES.AUTH_ERROR,
        'No hay proveedores disponibles. Verifica la configuración.'
      );
    }

    let lastError = null;

    for (const { name, provider } of availableProviders) {
      try {
        const response = await this._tryProvider(provider, name, messages, options);

        // Éxito — resetear contador de fallos
        const info = this.providers.get(name);
        info.consecutiveFailures = 0;
        info.lastError = null;
        return response;
      } catch (error) {
        lastError = error;
        const info = this.providers.get(name);
        info.consecutiveFailures++;
        info.lastError = error.message || String(error);

        logger.warn(`Provider "${name}" failed: ${error.message || error}`);

        // Error de failover — saltar al siguiente proveedor sin más reintentos
        if (error.type && FAILOVER_ERRORS.has(error.type)) {
          this.totalFailovers++;
          logger.info(`Failover from "${name}" to next provider (error: ${error.type})`);
          continue;
        }

        // Errores de retry — ya se agotaron los reintentos en _tryProvider
        this.totalFailovers++;
        logger.info(`Provider "${name}" exhausted retries, trying next`);
      }
    }

    // Todos los proveedores fallaron
    throw (
      lastError || createClassifiedError(ERROR_TYPES.SERVER_ERROR, 'Todos los proveedores fallaron')
    );
  }

  /**
   * Intenta un proveedor individual con lógica de retry.
   *
   * @param {LLMProvider} provider - Proveedor a intentar.
   * @param {string} name - Nombre del proveedor (para logging).
   * @param {ChatMessage[]} messages - Mensajes del chat.
   * @param {ChatOptions} options - Opciones de la solicitud.
   * @returns {Promise<ChatResponse>}
   * @throws {ErrorClassification} Si se agotan los reintentos.
   * @private
   */
  async _tryProvider(provider, name, messages, options) {
    const maxRetries = provider.config.maxRetries ?? this.defaultMaxRetries;
    const timeout = provider.config.timeout ?? this.defaultTimeout;
    let lastError = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          const delay = this._getRetryDelay(lastError, attempt);
          logger.info(
            `Retrying provider "${name}" (attempt ${attempt}/${maxRetries}) after ${delay}ms`
          );
          await new Promise((r) => setTimeout(r, delay));
        }

        // Para timeouts, reducir el timeout en reintentos
        const currentTimeout =
          attempt > 0 && lastError?.type === ERROR_TYPES.TIMEOUT
            ? Math.floor(timeout * 0.5)
            : timeout;

        // Race entre la respuesta del proveedor y el timeout
        const response = await Promise.race([
          provider.chat(messages, { ...options, timeout: currentTimeout }),
          new Promise((_, reject) =>
            setTimeout(
              () =>
                reject(
                  createClassifiedError(ERROR_TYPES.TIMEOUT, `Timeout after ${currentTimeout}ms`)
                ),
              currentTimeout + 5000
            )
          ),
        ]);

        return response;
      } catch (error) {
        lastError = error.type ? error : this._classifyError(error);

        // No reintentar errores de failover
        if (lastError.type && FAILOVER_ERRORS.has(lastError.type)) {
          break;
        }

        // No reintentar context overflow más de una vez
        if (lastError.type === ERROR_TYPES.CONTEXT_OVERFLOW && attempt > 0) {
          break;
        }
      }
    }

    throw lastError || createClassifiedError(ERROR_TYPES.SERVER_ERROR, `Provider "${name}" failed`);
  }

  /**
   * Clasifica un error crudo en un ErrorClassification.
   *
   * @param {Error} error - Error original.
   * @returns {ErrorClassification} Error clasificado.
   * @private
   */
  _classifyError(error) {
    const message = error.message || error.code || String(error);
    const status = error.status || error.statusCode;

    // Rate limiting (429)
    if (status === 429) {
      const retryAfter = error.headers?.['retry-after']
        ? parseInt(error.headers['retry-after'], 10) * 1000
        : null;
      return createClassifiedError(ERROR_TYPES.RATE_LIMIT, message, { retryAfter });
    }

    // Authentication errors (401/403)
    if (status === 401 || status === 403) {
      return createClassifiedError(ERROR_TYPES.AUTH_ERROR, message);
    }

    // Quota exceeded
    if (message.toLowerCase().includes('quota') || message.toLowerCase().includes('billing')) {
      return createClassifiedError(ERROR_TYPES.QUOTA_EXCEEDED, message);
    }

    // Context overflow
    if (message.includes('context_length') || message.toLowerCase().includes('maximum context')) {
      return createClassifiedError(ERROR_TYPES.CONTEXT_OVERFLOW, message);
    }

    // Model unavailable
    if (message.includes('model_not_found') || message.toLowerCase().includes('not available')) {
      return createClassifiedError(ERROR_TYPES.MODEL_UNAVAILABLE, message);
    }

    // Server errors (5xx)
    if (status >= 500) {
      return createClassifiedError(ERROR_TYPES.SERVER_ERROR, message);
    }

    // Default: server error
    return createClassifiedError(ERROR_TYPES.SERVER_ERROR, message);
  }

  /**
   * Calcula el delay para el próximo reintento con exponential backoff.
   *
   * @param {ErrorClassification|null} error - Último error clasificado.
   * @param {number} attempt - Número de intento actual (1-based).
   * @returns {number} Delay en milisegundos.
   * @private
   */
  _getRetryDelay(error, attempt) {
    // Si el error tiene retryAfter (de un 429), usarlo directamente
    if (error?.retryAfter) return error.retryAfter;

    // Rate limit: backoff agresivo (2^attempt * 1s)
    if (error?.type === ERROR_TYPES.RATE_LIMIT) {
      return Math.pow(2, attempt) * 1000;
    }

    // Server error: backoff suave (1s fijo)
    if (error?.type === ERROR_TYPES.SERVER_ERROR) {
      return 1000;
    }

    // Default: exponential backoff (2^(attempt-1) * 2s)
    return Math.pow(2, attempt - 1) * 2000;
  }

  /**
   * Retorna los proveedores disponibles ordenados por prioridad.
   *
   * @returns {Array<{ name: string, provider: LLMProvider, priority: number }>}
   * @private
   */
  _getAvailableProviders() {
    const available = [];
    for (const [name, info] of this.providers) {
      if (info.enabled) {
        available.push({ name, provider: info.provider, priority: info.priority });
      }
    }
    available.sort((a, b) => a.priority - b.priority);
    return available;
  }

  /**
   * Reconstruye la lista ordenada de nombres de proveedores.
   * @private
   */
  _rebuildOrder() {
    const sorted = [];
    for (const [name, info] of this.providers) {
      sorted.push({ name, priority: info.priority });
    }
    sorted.sort((a, b) => a.priority - b.priority);
    this.order = sorted.map((s) => s.name);
  }

  /**
   * Retorna el primer proveedor saludable disponible.
   *
   * @returns {LLMProvider|null}
   */
  getActiveProvider() {
    const available = this._getAvailableProviders();
    return available.length > 0 ? available[0].provider : null;
  }

  /**
   * Reconfigura el orden de prioridad de proveedores.
   *
   * @param {string[]} order - Array de nombres de proveedores en orden de prioridad.
   */
  setProviderOrder(order) {
    for (let i = 0; i < order.length; i++) {
      const name = order[i];
      const info = this.providers.get(name);
      if (info) {
        info.priority = i + 1;
      }
    }
    this._rebuildOrder();
  }

  /**
   * Retorna el estado de salud de todos los proveedores.
   *
   * @returns {Object<string, ProviderHealthStatus>}
   */
  getProviderStatus() {
    const status = {};
    for (const [name, info] of this.providers) {
      let healthStatus = 'healthy';
      if (!info.enabled) {
        healthStatus = 'disabled';
      } else if (info.consecutiveFailures >= 3) {
        healthStatus = 'unhealthy';
      } else if (info.consecutiveFailures >= 1) {
        healthStatus = 'degraded';
      }

      status[name] = {
        name,
        enabled: info.enabled,
        credentialsValid: info.credentialsValid,
        consecutiveFailures: info.consecutiveFailures,
        lastError: info.lastError,
        status: healthStatus,
      };
    }
    return status;
  }

  /**
   * Resetea el contador de fallos de un proveedor.
   *
   * @param {string} name - Nombre del proveedor.
   */
  resetProviderFailures(name) {
    const info = this.providers.get(name);
    if (info) {
      info.consecutiveFailures = 0;
      info.lastError = null;
    }
  }

  /**
   * Retorna una instancia de proveedor específica.
   *
   * @param {string} name - Nombre del proveedor.
   * @returns {LLMProvider|null}
   */
  getProvider(name) {
    const info = this.providers.get(name);
    return info ? info.provider : null;
  }

  /**
   * Retorna estadísticas del orquestador.
   *
   * @returns {{ totalRequests: number, totalFailovers: number, activeProviders: number, totalProviders: number }}
   */
  getStats() {
    return {
      totalRequests: this.totalRequests,
      totalFailovers: this.totalFailovers,
      activeProviders: this._getAvailableProviders().length,
      totalProviders: this.providers.size,
    };
  }
}

module.exports = FailoverOrchestrator;
