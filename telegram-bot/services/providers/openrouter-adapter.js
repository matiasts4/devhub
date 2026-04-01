/**
 * @file openrouter-adapter.js
 * @description Adapter para OpenRouter — puerta de acceso a modelos gratuitos como Qwen,
 * Llama, Gemma y más a través de una API compatible con OpenAI.
 *
 * OpenRouter es un agregador multi-proveedor que unifica el acceso a decenas de modelos
 * de diferentes compañías (OpenAI, Anthropic, Google, Meta, etc.) bajo una sola API key.
 * Su principal ventaja es ofrecer modelos gratuitos (free tier) ideales para desarrollo
 * y uso personal sin costo.
 *
 * Este adapter extiende OpenAICompatibleAdapter porque OpenRouter usa el mismo formato
 * de API que OpenAI — solo cambia la baseURL y algunos headers opcionales.
 *
 * @see https://openrouter.ai/docs
 * @see https://openrouter.ai/models?max_price=0 (modelos gratuitos)
 *
 * @example
 * // Uso básico con variables de entorno:
 * const OpenRouterAdapter = require('./providers/openrouter-adapter');
 * const provider = new OpenRouterAdapter();
 *
 * const response = await provider.chat([
 *   { role: 'user', content: 'Hola, ¿cómo estás?' }
 * ]);
 * console.log(response.content);
 *
 * @example
 * // Configuración personalizada con modelo específico:
 * const provider = new OpenRouterAdapter({
 *   apiKey: process.env.OPENROUTER_API_KEY,
 *   model: 'meta-llama/llama-3.3-70b-instruct',
 *   timeout: 90000,
 * });
 *
 * @example
 * // Streaming con callback:
 * let fullText = '';
 * await provider.streamChat(
 *   [{ role: 'user', content: 'Escribe un poema corto' }],
 *   {},
 *   (chunk) => {
 *     fullText += chunk;
 *     process.stdout.write(chunk);
 *   }
 * );
 */

const { OpenAICompatibleAdapter } = require('./openai-compatible-adapter');

// ============================================================================
// CLASE: OpenRouterAdapter
// ============================================================================

/**
 * Adapter para OpenRouter que extiende OpenAICompatibleAdapter.
 *
 * OpenRouter usa el formato de API de OpenAI, por lo que la herencia es directa.
 * Las diferencias clave son:
 * - Base URL: https://openrouter.ai/api/v1
 * - Headers opcionales: HTTP-Referer y X-Title para tracking de uso
 * - Modelos gratuitos disponibles sin costo
 *
 * @extends OpenAICompatibleAdapter
 */
class OpenRouterAdapter extends OpenAICompatibleAdapter {
  /**
   * Crea una nueva instancia del adapter de OpenRouter.
   *
   * @param {Object} [config={}] - Configuración del proveedor.
   * @param {string} [config.apiKey] - API key de OpenRouter. Default: process.env.OPENROUTER_API_KEY.
   * @param {string} [config.model] - Modelo a usar. Default: 'qwen/qwen-2.5-72b-instruct' (gratuito).
   * @param {string} [config.baseUrl] - URL base. Default: 'https://openrouter.ai/api/v1'.
   * @param {number} [config.maxRetries=3] - Reintentos ante errores recuperables.
   * @param {number} [config.timeout=60000] - Timeout en milisegundos.
   * @param {boolean} [config.enabled=true] - Si el proveedor está habilitado.
   * @param {string} [config.appName] - Nombre de la app para el header X-Title (opcional).
   * @param {string} [config.appUrl] - URL de la app para el header HTTP-Referer (opcional).
   */
  constructor(config = {}) {
    const appName = config.appName || process.env.OPENROUTER_APP_NAME || 'DevHub Bot';
    const appUrl = config.appUrl || process.env.OPENROUTER_APP_URL || 'https://github.com/matiasts4/devhub';

    const mergedConfig = {
      name: 'openrouter',
      apiKey: config.apiKey || process.env.OPENROUTER_API_KEY,
      model: config.model || process.env.OPENROUTER_MODEL || 'qwen/qwen-2.5-72b-instruct',
      baseUrl: config.baseUrl || process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
      maxRetries: config.maxRetries || 3,
      timeout: config.timeout || 60000,
      enabled: config.enabled !== false,
      appName,
      appUrl,
      defaultHeaders: {
        'HTTP-Referer': appUrl,
        'X-Title': appName,
        ...(config.defaultHeaders || {})
      },
      ...config,
    };
    
    super(mergedConfig);
  }

  // ============================================================================
  // MÉTODOS OVERRIDE
  // ============================================================================

  /**
   * Retorna el tamaño máximo de contexto del modelo configurado.
   *
   * OpenRouter soporta modelos con ventanas de contexto muy variadas,
   * desde 8K hasta 200K tokens. Este método retorna valores conservadores
   * basados en el modelo actualmente configurado.
   *
   * @override
   * @returns {number} Máxima cantidad de tokens de contexto.
   */
  getMaxTokens() {
    const model = this.config.model;

    // Qwen 2.5 series
    if (model.includes('qwen') && model.includes('72b')) return 131072;
    if (model.includes('qwen') && model.includes('32b')) return 32768;
    if (model.includes('qwen') && model.includes('14b')) return 32768;
    if (model.includes('qwen') && model.includes('7b')) return 32768;

    // Llama 3 series
    if (model.includes('llama-3.3')) return 131072;
    if (model.includes('llama-3.1')) return 131072;
    if (model.includes('llama-3')) return 8192;

    // Claude series
    if (model.includes('claude-3.5')) return 200000;
    if (model.includes('claude-3')) return 200000;

    // Google Gemma
    if (model.includes('gemma-2')) return 8192;

    // Mistral
    if (model.includes('mistral') && model.includes('7b')) return 32768;
    if (model.includes('mistral') && model.includes('large')) return 131072;

    // OpenAI
    if (model.includes('gpt-4o')) return 128000;
    if (model.includes('gpt-4o-mini')) return 128000;

    // Default conservador para modelos desconocidos
    return 128000;
  }

  /**
   * Retorna una lista curada de modelos populares y gratuitos disponibles en OpenRouter.
   *
   * A diferencia de otros proveedores, OpenRouter tiene cientos de modelos.
   * Esta lista se enfoca en los más útiles y estables del free tier.
   *
   * Para la lista completa, ver: https://openrouter.ai/models?max_price=0
   *
   * @override
   * @returns {Promise<string[]>} Lista de identificadores de modelos.
   */
  async getModels() {
    // Lista curada de modelos populares y mayormente gratuitos en OpenRouter.
    // Incluye modelos free tier y de muy bajo costo.
    return [
      // Qwen (Alibaba) — excelentes modelos gratuitos
      'qwen/qwen-2.5-72b-instruct',
      'qwen/qwen-2.5-coder-32b-instruct',
      'qwen/qwen-2.5-32b-instruct',

      // Llama (Meta) — modelos open source de referencia
      'meta-llama/llama-3.3-70b-instruct',
      'meta-llama/llama-3.1-8b-instruct',

      // Google Gemma
      'google/gemma-2-27b-it',

      // Mistral
      'mistralai/mistral-7b-instruct',

      // Anthropic Claude (no gratuito, pero popular)
      'anthropic/claude-3.5-sonnet',

      // OpenAI (no gratuito, pero popular)
      'openai/gpt-4o-mini',
    ];
  }

  /**
   * Retorna el nombre identificador del proveedor.
   *
   * @override
   * @returns {string} 'openrouter'
   */
  getName() {
    return 'openrouter';
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = OpenRouterAdapter;
