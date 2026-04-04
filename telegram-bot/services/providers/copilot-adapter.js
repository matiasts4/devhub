/**
 * @file copilot-adapter.js
 * @description Adapter para GitHub Copilot usando OAuth Device Flow.
 *
 * Usa api.githubcopilot.com (endpoint interno de Copilot IDE) con el mismo
 * mecanismo de autenticación que OpenCode, aider y neovim-copilot:
 *   1. OAuth Device Flow → gho_... (token persistente)
 *   2. Intercambio por copilot_token (efímero, 30 min TTL) via copilot_internal/v2/token
 *   3. Llamadas a api.githubcopilot.com con ese copilot_token
 *
 * Soporta todos los modelos del catálogo interno de Copilot (GPT-5.3-Codex,
 * GPT-5.4-mini, etc.) y el parámetro reasoning_effort (low/medium/high/xhigh).
 */

'use strict';

const { LLMProvider, ERROR_TYPES, createClassifiedError } = require('./provider-interface');
const logger = require('../../utils/logger');

const COPILOT_API_BASE = 'https://api.githubcopilot.com';
const COPILOT_INTERNAL_URL = 'https://api.github.com/copilot_internal/v2/token';
const EDITOR_VERSION = 'vscode/1.85.1';
const EDITOR_PLUGIN_VERSION = 'copilot-chat/0.12.2023120701';
const USER_AGENT = 'GithubCopilot/1.138.0';

// Cache de copilot_token en memoria (proceso del bot)
let _tokenCache = { token: null, expiresAt: 0 };

// ============================================================================
// CLASE: CopilotAdapter
// ============================================================================

class CopilotAdapter extends LLMProvider {
  /**
   * @param {Object} config
   * @param {string} config.apiKey — OAuth token (gho_...) obtenido por Device Flow
   * @param {string} [config.model='gpt-4o'] — Modelo a usar
   * @param {string} [config.reasoningEffort] — 'low' | 'medium' | 'high' | 'xhigh'
   */
  constructor(config = {}) {
    super({
      name: 'copilot',
      apiKey: (config.apiKey || process.env.COPILOT_OAUTH_TOKEN || process.env.COPILOT_TOKEN || '').trim(),
      model: config.model || process.env.COPILOT_MODEL || 'gpt-4o',
      maxRetries: config.maxRetries || 3,
      timeout: config.timeout || 60000,
      enabled: config.enabled !== false,
      ...config,
    });

    this.reasoningEffort = config.reasoningEffort || process.env.COPILOT_REASONING_EFFORT || null;
  }

  // ============================================================================
  // TOKEN MANAGEMENT
  // ============================================================================

  /**
   * Obtiene un copilot_token válido, refrescando si está por vencer.
   * El oauthToken es el gho_... persistente.
   */
  async _getCopilotToken() {
    const oauthToken = this.config.apiKey;
    if (!oauthToken) throw new Error('No hay token OAuth de Copilot configurado. Autenticáte desde Ajustes > GitHub Copilot.');

    const now = Date.now();
    if (_tokenCache.token && _tokenCache.expiresAt - now > 5 * 60 * 1000) {
      return _tokenCache.token;
    }

    logger.info('[Copilot] Obteniendo nuevo copilot_token...');
    const res = await fetch(COPILOT_INTERNAL_URL, {
      method: 'GET',
      headers: {
        Authorization: `token ${oauthToken}`,
        'editor-version': EDITOR_VERSION,
        'editor-plugin-version': EDITOR_PLUGIN_VERSION,
        'user-agent': USER_AGENT,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const msg = body?.message || `HTTP ${res.status}`;
      throw new Error(
        res.status === 401 || res.status === 403
          ? `Sin acceso a Copilot. Verificá tu suscripción. (${msg})`
          : `Error obteniendo copilot_token: ${msg}`,
      );
    }

    const data = await res.json();
    const expMatch = data.token?.match(/exp=(\d+)/);
    const expiresAt = expMatch ? parseInt(expMatch[1]) * 1000 : now + 25 * 60 * 1000;

    _tokenCache = { token: data.token, expiresAt };
    logger.info('[Copilot] copilot_token renovado, vence en ~30 min');
    return data.token;
  }

  /**
   * Headers estándar para api.githubcopilot.com
   */
  async _getHeaders() {
    const copilotToken = await this._getCopilotToken();
    return {
      Authorization: `Bearer ${copilotToken}`,
      'Content-Type': 'application/json',
      'editor-version': EDITOR_VERSION,
      'editor-plugin-version': EDITOR_PLUGIN_VERSION,
      'user-agent': USER_AGENT,
      'copilot-integration-id': 'vscode-chat',
    };
  }

  // ============================================================================
  // MÉTODOS PRINCIPALES
  // ============================================================================

  /**
   * Chat con GitHub Copilot.
   * Soporta reasoning_effort: 'low' | 'medium' | 'high' | 'xhigh'
   */
  async chat(messages, options = {}) {
    try {
      const headers = await this._getHeaders();
      let model = options.model || this.config.model;
      
      const MAP = {
        'gpt-5.4-mini': 'gpt-4o-mini', 'GPT-5.4 mini': 'gpt-4o-mini',
        'gpt-5.2-codex': 'gpt-4o', 'GPT-5.2-Codex': 'gpt-4o',
        'gpt-5.3-codex': 'gpt-4o', 'GPT-5.3-Codex': 'gpt-4o',
        'gpt-4.1': 'gpt-4o', 'GPT-4.1': 'gpt-4o',
        'GPT-5.1': 'gpt-4o', 'gpt-5.1': 'gpt-4o',
        'GPT-5.2': 'gpt-4o', 'gpt-5.2': 'gpt-4o',
        'Claude Haiku 4.5': 'claude-3.5-sonnet', 'claude-haiku-4.5': 'claude-3.5-sonnet',
        'Gemini 2.5 Pro': 'gpt-4o', 'gemini-2.5-pro': 'gpt-4o',
      };
      if (MAP[model]) {
        logger.warn(`[Copilot Adapter] Mapped ${model} -> ${MAP[model]}`);
        model = MAP[model];
      }

      const reasoningEffort = options.reasoningEffort || this.reasoningEffort;

      const body = {
        model,
        messages: this._normalizeMessages(messages),
        max_tokens: options.maxTokens || options.max_tokens || 4096,
        stream: false,
      };

      // Temperatura solo para modelos que la soportan (no para reasoning models)
      if (options.temperature !== undefined) {
        body.temperature = options.temperature;
      }

      // reasoning_effort para GPT-5.3-Codex, GPT-5.4-mini, o4-mini, etc.
      if (reasoningEffort && reasoningEffort !== 'none') {
        body.reasoning_effort = reasoningEffort;
      }

      const res = await fetch(`${COPILOT_API_BASE}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.config.timeout || 60000),
      });

      if (!res.ok) {
        await this._handleApiError(res);
      }

      const data = await res.json();
      const choice = data.choices?.[0];

      return {
        content: choice?.message?.content || '',
        model: data.model || model,
        usage: data.usage || {},
        finishReason: choice?.finish_reason || 'stop',
      };
    } catch (error) {
      throw this._mapError(error);
    }
  }

  /**
   * Streaming chat con GitHub Copilot.
   */
  async *chatStream(messages, options = {}) {
    try {
      const headers = await this._getHeaders();
      let model = options.model || this.config.model;
      
      const MAP = {
        'gpt-5.4-mini': 'gpt-4o-mini', 'GPT-5.4 mini': 'gpt-4o-mini',
        'gpt-5.2-codex': 'gpt-4o', 'GPT-5.2-Codex': 'gpt-4o',
        'gpt-5.3-codex': 'gpt-4o', 'GPT-5.3-Codex': 'gpt-4o',
        'gpt-4.1': 'gpt-4o', 'GPT-4.1': 'gpt-4o',
        'GPT-5.1': 'gpt-4o', 'gpt-5.1': 'gpt-4o',
        'GPT-5.2': 'gpt-4o', 'gpt-5.2': 'gpt-4o',
        'Claude Haiku 4.5': 'claude-3.5-sonnet', 'claude-haiku-4.5': 'claude-3.5-sonnet',
        'Gemini 2.5 Pro': 'gpt-4o', 'gemini-2.5-pro': 'gpt-4o',
      };
      if (MAP[model]) {
        logger.warn(`[Copilot Adapter] Mapped ${model} -> ${MAP[model]}`);
        model = MAP[model];
      }

      const reasoningEffort = options.reasoningEffort || this.reasoningEffort;

      const body = {
        model,
        messages: this._normalizeMessages(messages),
        max_tokens: options.maxTokens || options.max_tokens || 4096,
        stream: true,
      };

      if (options.temperature !== undefined) body.temperature = options.temperature;
      if (reasoningEffort && reasoningEffort !== 'none') body.reasoning_effort = reasoningEffort;

      const res = await fetch(`${COPILOT_API_BASE}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.config.timeout || 120000),
      });

      if (!res.ok) await this._handleApiError(res);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data:')) continue;
          const jsonStr = trimmed.slice(5).trim();
          if (jsonStr === '[DONE]') return;

          try {
            const chunk = JSON.parse(jsonStr);
            const delta = chunk.choices?.[0]?.delta?.content;
            if (delta) yield { content: delta };
          } catch {
            // ignorar líneas malformadas
          }
        }
      }
    } catch (error) {
      throw this._mapError(error);
    }
  }

  /**
   * Valida que el token OAuth pueda obtener un copilot_token.
   */
  async validateCredentials() {
    if (!this.config.apiKey) {
      return { valid: false, error: 'No hay token OAuth. Autenticáte desde Ajustes.' };
    }

    try {
      // Forzar renovación del token para validar
      _tokenCache = { token: null, expiresAt: 0 };
      await this._getCopilotToken();
      return { valid: true };
    } catch (err) {
      return { valid: false, error: err.message };
    }
  }

  /**
   * Lista los modelos disponibles en api.githubcopilot.com
   */
  async getModels() {
    try {
      const headers = await this._getHeaders();
      const res = await fetch(`${COPILOT_API_BASE}/models`, {
        headers,
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        // Fallback a lista conocida si el endpoint no responde
        return this._getKnownModels();
      }

      const data = await res.json();
      const models = Array.isArray(data)
        ? data
        : Array.isArray(data.data)
          ? data.data
          : Array.isArray(data.models)
            ? data.models
            : [];

      const ids = models
        .map((m) => (typeof m === 'string' ? m : m?.id || m?.name))
        .filter(Boolean)
        .sort();

      return ids.length > 0 ? ids : this._getKnownModels();
    } catch {
      return this._getKnownModels();
    }
  }

  /**
   * Lista de modelos conocidos del catálogo interno de Copilot.
   * Se usa como fallback si /models no responde.
   */
  _getKnownModels() {
    return [
      'gpt-4o',
      'gpt-4o-mini',
      'gpt-4.1',
      'gpt-4.1-mini',
      'gpt-5',
      'gpt-5-mini',
      'gpt-5.3-codex',
      'gpt-5.4-mini',
      'o3',
      'o3-mini',
      'o4-mini',
    ];
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  _normalizeMessages(messages) {
    return messages.map((m) => ({
      role: m.role || 'user',
      content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
    }));
  }

  async _handleApiError(res) {
    const body = await res.json().catch(() => ({}));
    const msg = body?.error?.message || body?.message || `HTTP ${res.status}`;

    if (res.status === 401 || res.status === 403) {
      // Invalidar cache para forzar renovación
      _tokenCache = { token: null, expiresAt: 0 };
      throw new Error(`Copilot: sin autorización. ${msg}`);
    }
    if (res.status === 429) throw new Error(`Copilot: rate limit alcanzado. ${msg}`);
    if (res.status >= 500) throw new Error(`Copilot: error del servidor. ${msg}`);
    throw new Error(`Copilot: ${msg}`);
  }

  _mapError(error) {
    const msg = error.message || String(error);

    if (msg.includes('rate limit') || msg.includes('429')) {
      return createClassifiedError(msg, ERROR_TYPES.RATE_LIMIT, true);
    }
    if (msg.includes('timeout') || msg.includes('ETIMEDOUT')) {
      return createClassifiedError(msg, ERROR_TYPES.TIMEOUT, true);
    }
    if (msg.includes('sin autorización') || msg.includes('401') || msg.includes('403')) {
      return createClassifiedError(msg, ERROR_TYPES.AUTH, false);
    }
    return createClassifiedError(msg, ERROR_TYPES.UNKNOWN, false);
  }

  isAvailable() {
    return !!(this.config.enabled && this.config.apiKey);
  }

  async isHealthy() {
    const result = await this.validateCredentials();
    return result.valid;
  }
}

module.exports = CopilotAdapter;
