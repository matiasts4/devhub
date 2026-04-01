/**
 * @file zen-adapter.js
 * @description Adapter para OpenCode Zen — proveedor con trials gratuitos y modelos optimizados.
 *
 * Extiende OpenAICompatibleAdapter con configuración específica de Zen:
 * - Base URL por defecto apuntando al endpoint de Zen
 * - Modelos disponibles de Zen (default, large, turbo, coder)
 * - Límites de contexto por modelo
 *
 * @example
 * const OpenCodeZenAdapter = require('./providers/zen-adapter');
 * const zen = new OpenCodeZenAdapter({
 *   apiKey: process.env.ZEN_API_KEY,
 *   model: 'zen-large',
 * });
 *
 * const response = await zen.chat([
 *   { role: 'user', content: 'Hola, ¿cómo estás?' }
 * ]);
 */

const { OpenAICompatibleAdapter } = require('./openai-compatible-adapter');

/**
 * Adapter para OpenCode Zen.
 *
 * Proveedor con trials gratuitos y modelos optimizados para diferentes casos de uso.
 * Toda la lógica de comunicación, retry, error mapping y streaming viene heredada
 * de OpenAICompatibleAdapter.
 *
 * @extends OpenAICompatibleAdapter
 */
class OpenCodeZenAdapter extends OpenAICompatibleAdapter {
  /**
   * Crea una nueva instancia del adapter de Zen.
   *
   * @param {ProviderConfig} [config={}] - Configuración del proveedor.
   * @param {string} [config.apiKey] - API key de Zen (fallback: ZEN_API_KEY).
   * @param {string} [config.model='zen-default'] - Modelo a usar (fallback: ZEN_MODEL).
   * @param {string} [config.baseUrl='https://zen.opencode.ai/v1'] - URL base (fallback: ZEN_BASE_URL).
   * @param {number} [config.maxRetries=3] - Reintentos ante errores recuperables.
   * @param {number} [config.timeout=60000] - Timeout en milisegundos.
   * @param {boolean} [config.enabled=true] - Si el proveedor está habilitado.
   */
  constructor(config = {}) {
    super({
      name: 'zen',
      apiKey: config.apiKey || process.env.ZEN_API_KEY,
      model: config.model || process.env.ZEN_MODEL || 'zen-default',
      baseUrl: config.baseUrl || process.env.ZEN_BASE_URL || 'https://zen.opencode.ai/v1',
      maxRetries: config.maxRetries || 3,
      timeout: config.timeout || 60000,
      enabled: config.enabled !== false,
      ...config,
    });
  }

  /**
   * Retorna el tamaño máximo de contexto según el modelo configurado.
   *
   * @returns {number} Máxima cantidad de tokens de contexto.
   */
  getMaxTokens() {
    const model = this.config.model;
    if (model.includes('zen-large')) return 128000;
    if (model.includes('zen-turbo')) return 32000;
    return 64000;
  }

  /**
   * Retorna la lista de modelos disponibles en OpenCode Zen.
   *
   * @returns {Promise<string[]>} Lista de modelos de Zen.
   */
  async getModels() {
    return ['zen-default', 'zen-large', 'zen-turbo', 'zen-coder'];
  }

  /**
   * Retorna el nombre identificador del proveedor.
   *
   * @returns {string} 'zen'
   */
  getName() {
    return 'zen';
  }
}

module.exports = OpenCodeZenAdapter;
