/**
 * @file direct-adapter.js
 * @description Adapter universal para cualquier proveedor compatible con la API de OpenAI.
 *
 * Este es el fallback definitivo — permite conectar con cualquier endpoint OpenAI-compatible
 * que el usuario configure manualmente mediante variables de entorno o configuración directa.
 *
 * Casos de uso:
 * - OpenAI directa (api.openai.com/v1)
 * - Ollama local (localhost:11434/v1)
 * - LM Studio, vLLM, o cualquier servidor compatible
 * - Proxies o gateways personalizados
 *
 * @example
 * const DirectApiAdapter = require('./providers/direct-adapter');
 *
 * // Con OpenAI directa:
 * const openai = new DirectApiAdapter({
 *   apiKey: process.env.OPENAI_API_KEY,
 *   model: 'gpt-4o-mini',
 *   baseUrl: 'https://api.openai.com/v1',
 * });
 *
 * // Con Ollama local:
 * const ollama = new DirectApiAdapter({
 *   model: 'llama3',
 *   baseUrl: 'http://localhost:11434/v1',
 * });
 */

const { OpenAICompatibleAdapter } = require('./openai-compatible-adapter');

/**
 * Adapter universal para proveedores OpenAI-compatible.
 *
 * No asume ningún proveedor específico — el usuario debe configurar baseUrl,
 * apiKey y model explícitamente. Es el fallback más flexible del sistema.
 *
 * @extends OpenAICompatibleAdapter
 */
class DirectApiAdapter extends OpenAICompatibleAdapter {
  /**
   * Crea una nueva instancia del adapter directo.
   *
   * @param {ProviderConfig} [config={}] - Configuración del proveedor.
   * @param {string} [config.apiKey] - API key (fallback: LLM_API_KEY).
   * @param {string} [config.model='gpt-4o-mini'] - Modelo a usar (fallback: LLM_MODEL).
   * @param {string} [config.baseUrl] - URL base del endpoint (fallback: LLM_BASE_URL). **Requerida**.
   * @param {number} [config.maxRetries=3] - Reintentos ante errores recuperables.
   * @param {number} [config.timeout=60000] - Timeout en milisegundos.
   * @param {boolean} [config.enabled=true] - Si el proveedor está habilitado.
   */
  constructor(config = {}) {
    super({
      name: 'direct',
      apiKey: config.apiKey || process.env.LLM_API_KEY,
      model: config.model || process.env.LLM_MODEL || 'gpt-4o-mini',
      baseUrl: config.baseUrl || process.env.LLM_BASE_URL,
      maxRetries: config.maxRetries || 3,
      timeout: config.timeout || 60000,
      enabled: config.enabled !== false,
      ...config,
    });
  }

  /**
   * Retorna el nombre identificador del proveedor.
   *
   * @returns {string} 'direct'
   */
  getName() {
    return 'direct';
  }
}

module.exports = DirectApiAdapter;
