/**
 * @file provider-registry.js
 * @description Registry centralizado de proveedores LLM — crea, configura y registra
 * todos los adapters disponibles en el FailoverOrchestrator.
 *
 * Responsabilidades:
 * - Lazy-load de adapters (solo se requieren cuando se necesitan)
 * - Lectura de configuración desde variables de entorno
 * - Creación de instancias de proveedores según config
 * - Registro en el FailoverOrchestrator con prioridad
 * - Validación básica de credenciales en startup
 * - Export de singleton para uso global
 *
 * @example
 * // Uso con singleton (recomendado):
 * const { getLLMBridge } = require('./providers/provider-registry');
 * const bridge = getLLMBridge();
 * const result = await bridge.chat([{ role: 'user', content: 'Hola' }]);
 *
 * @example
 * // Uso con configuración personalizada:
 * const { createLLMBridge } = require('./providers/provider-registry');
 * const bridge = createLLMBridge({
 *   order: ['openrouter', 'direct'],
 *   maxRetries: 5,
 * });
 */

const FailoverOrchestrator = require('./failover-orchestrator');
const logger = require('../../utils/logger');
const fs = require('fs');
const path = require('path');

const SETTINGS_PATH = path.join(__dirname, '..', '..', '..', 'data', 'llm-providers-config.json');

// ============================================================================
// LAZY-LOADED ADAPTERS
// ============================================================================
// Se cargan bajo demanda para evitar require circular y reducir startup time.

let OpenRouterAdapter = null;
let OpenCodeZenAdapter = null;
let DirectApiAdapter = null;
let CopilotAdapter = null;

/**
 * Carga un adapter de forma lazy (solo la primera vez que se pide).
 *
 * @param {string} name - Nombre del proveedor ('openrouter', 'zen', 'direct', 'copilot')
 * @returns {Class|null} Clase del adapter o null si no existe
 */
function loadAdapter(name) {
  switch (name) {
    case 'openrouter':
      if (!OpenRouterAdapter) {
        try {
          OpenRouterAdapter = require('./openrouter-adapter');
        } catch (err) {
          logger.debug('OpenRouter adapter not available: ' + err.message);
          return null;
        }
      }
      return OpenRouterAdapter;

    case 'zen':
      if (!OpenCodeZenAdapter) {
        try {
          OpenCodeZenAdapter = require('./zen-adapter');
        } catch (err) {
          logger.debug('Zen adapter not available: ' + err.message);
          return null;
        }
      }
      return OpenCodeZenAdapter;

    case 'direct':
      if (!DirectApiAdapter) {
        try {
          DirectApiAdapter = require('./direct-adapter');
        } catch (err) {
          logger.debug('Direct adapter not available: ' + err.message);
          return null;
        }
      }
      return DirectApiAdapter;

    case 'copilot':
      if (!CopilotAdapter) {
        try {
          CopilotAdapter = require('./copilot-adapter');
        } catch (err) {
          logger.debug('Copilot adapter not available: ' + err.message);
          return null;
        }
      }
      return CopilotAdapter;

    default:
      logger.warn('Unknown provider adapter: "' + name + '"');
      return null;
  }
}

function loadAppSettings() {
  try {
    if (!fs.existsSync(SETTINGS_PATH)) return null;
    var raw = fs.readFileSync(SETTINGS_PATH, 'utf8');
    var parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (err) {
    logger.warn('Failed to read LLM settings file: ' + err.message);
    return null;
  }
}

function getFileConfig(name, appSettings) {
  var providers = (appSettings && appSettings.providers) || {};
  var provider = providers[name] || {};

  switch (name) {
    case 'openrouter':
      return {
        apiKey: provider.OPENROUTER_API_KEY,
        model: provider.OPENROUTER_MODEL,
        baseUrl: provider.OPENROUTER_BASE_URL,
        enabled: provider.enabled,
      };
    case 'zen':
      return {
        apiKey: provider.ZEN_API_KEY,
        model: provider.ZEN_MODEL,
        baseUrl: provider.ZEN_BASE_URL,
        enabled: provider.enabled,
      };
    case 'direct':
      return {
        apiKey: provider.LLM_API_KEY,
        model: provider.LLM_MODEL,
        baseUrl: provider.LLM_BASE_URL,
        enabled: provider.enabled,
      };
    case 'copilot':
      return {
        apiKey: provider.COPILOT_TOKEN,
        model: provider.COPILOT_MODEL,
        enabled: provider.enabled,
      };
    default:
      return {};
  }
}

function cleanObject(obj) {
  var cleaned = {};
  for (var key in obj) {
    if (obj[key] !== undefined && obj[key] !== null && obj[key] !== '') {
      cleaned[key] = obj[key];
    }
  }
  // Preservar 'enabled' si explícitamente es false
  if (obj.enabled === false) {
    cleaned.enabled = false;
  }
  return cleaned;
}

function mergeProviderConfig(name, appSettings, overrides) {
  var envConfig = cleanObject(getEnvConfig(name));
  var fileConfig = cleanObject(getFileConfig(name, appSettings));
  var overridesClean = cleanObject(overrides || {});
  
  var merged = Object.assign({}, envConfig, fileConfig, overridesClean);

  if (merged.enabled === undefined) {
    merged.enabled = true;
  }

  // Prevenir undefined de defaultHeaders u otras props profundas (opcional)
  return merged;
}

// ============================================================================
// CONFIGURACIÓN DESDE ENTORNO
// ============================================================================

/**
 * Obtiene la configuración de un proveedor desde variables de entorno.
 *
 * Cada proveedor tiene su propio set de variables de entorno con defaults
 * razonables. Si no hay credenciales configuradas, el proveedor se saltea.
 *
 * @param {string} name - Nombre del proveedor
 * @returns {Object} Configuración del proveedor
 */
function getEnvConfig(name) {
  switch (name) {
    case 'openrouter':
      return {
        apiKey: process.env.OPENROUTER_API_KEY,
        model: process.env.OPENROUTER_MODEL || 'qwen/qwen-2.5-72b-instruct',
        baseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
        enabled: process.env.OPENROUTER_ENABLED !== 'false',
      };

    case 'zen':
      return {
        apiKey: process.env.ZEN_API_KEY,
        model: process.env.ZEN_MODEL || 'zen-default',
        baseUrl: process.env.ZEN_BASE_URL || 'https://zen.opencode.ai/v1',
        enabled: process.env.ZEN_ENABLED !== 'false',
      };

    case 'direct':
      return {
        apiKey: process.env.LLM_API_KEY,
        model: process.env.LLM_MODEL || 'gpt-4o-mini',
        baseUrl: process.env.LLM_BASE_URL,
        enabled: process.env.LLM_ENABLED !== 'false',
      };

    case 'copilot':
      return {
        apiKey: process.env.COPILOT_TOKEN,
        model: process.env.COPILOT_MODEL || 'gpt-4o',
        enabled: process.env.COPILOT_ENABLED !== 'false',
      };

    default:
      return {};
  }
}

// ============================================================================
// CREACIÓN DEL BRIDGE
// ============================================================================

/**
 * Crea y configura el LLM bridge con todos los proveedores disponibles.
 *
 * Proceso:
 * 1. Crea un FailoverOrchestrator con opciones globales
 * 2. Itera el orden de proveedores (por defecto: copilot > openrouter > zen > direct)
 * 3. Para cada proveedor: carga el adapter lazy, lee config de env, valida credenciales
 * 4. Registra el proveedor en el orchestrator con su prioridad
 * 5. Loguea el resultado final
 *
 * @param {Object} [options] - Opciones de configuración
 * @param {Object} [options.providers] - Overrides de configuración por proveedor
 * @param {string[]} [options.order] - Orden personalizado de proveedores
 * @param {number} [options.maxRetries=3] - Reintentos globales por defecto
 * @param {number} [options.timeout=60000] - Timeout global por defecto en ms
 * @returns {FailoverOrchestrator} Instancia configurada del orchestrator
 */
function createLLMBridge(options) {
  options = options || {};
  var appSettings = loadAppSettings();

  var orchestrator = new FailoverOrchestrator({
    defaultMaxRetries: options.maxRetries || 3,
    defaultTimeout: options.timeout || 60000,
  });

  if (appSettings && appSettings.bridgeEnabled === false) {
    logger.info('LLM Bridge disabled by app settings (bridgeEnabled=false)');
    return orchestrator;
  }

  // Orden por defecto (prioridad de failover)
  var defaultOrder = ['copilot', 'openrouter', 'zen', 'direct'];
  var providerOrder =
    options.order ||
    (Array.isArray(appSettings && appSettings.priorityOrder) && appSettings.priorityOrder.length > 0
      ? appSettings.priorityOrder
      : defaultOrder);

  var registeredCount = 0;

  for (var i = 0; i < providerOrder.length; i++) {
    var name = providerOrder[i];
    var AdapterClass = loadAdapter(name);

    if (!AdapterClass) {
      logger.debug('Provider "' + name + '" not available (adapter not found)');
      continue;
    }

    var overrideConfig = (options.providers && options.providers[name]) || {};
    var providerConfig = mergeProviderConfig(name, appSettings, overrideConfig);

    // Skip si no hay API key y no hay baseUrl (excepto direct que puede tener solo baseUrl)
    if (!providerConfig.apiKey && !providerConfig.baseUrl && name !== 'direct') {
      logger.debug('Provider "' + name + '" skipped: no API key configured');
      continue;
    }

    // Para el adapter direct, se requiere baseUrl
    if (name === 'direct' && !providerConfig.baseUrl) {
      logger.debug('Provider "direct" skipped: no LLM_BASE_URL configured');
      continue;
    }

    try {
      var provider = new AdapterClass(providerConfig);
      orchestrator.register(name, provider, i + 1, providerConfig.enabled !== false);
      registeredCount++;
      logger.info('Provider "' + name + '" registered (model: ' + provider.config.model + ')');
    } catch (err) {
      logger.warn('Failed to initialize provider "' + name + '": ' + err.message);
    }
  }

  if (registeredCount === 0) {
    logger.warn('No LLM providers configured. The bot will not be able to process chat messages.');
  } else {
    var activeNames = providerOrder.filter(function (n) {
      return orchestrator.getProvider(n) !== null;
    });
    logger.info(
      'LLM Bridge initialized with ' + registeredCount + ' provider(s): ' + activeNames.join(', ')
    );
  }

  return orchestrator;
}

// ============================================================================
// SINGLETON
// ============================================================================

var _bridge = null;

/**
 * Obtiene o crea el singleton del LLM bridge.
 * Las opciones solo se usan en la primera llamada (creación).
 *
 * @param {Object} [options] - Opciones de configuración (solo primera vez)
 * @returns {FailoverOrchestrator}
 */
function getLLMBridge(options) {
  if (!_bridge) {
    _bridge = createLLMBridge(options);
  }
  return _bridge;
}

/**
 * Resetea el singleton del bridge (útil para testing o reconfiguración).
 */
function resetLLMBridge() {
  _bridge = null;
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  createLLMBridge,
  getLLMBridge,
  resetLLMBridge,
  getEnvConfig,
  loadAdapter,
};
