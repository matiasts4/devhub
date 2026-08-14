import {
  getLlmProviderConfigSync,
  getRawLlmProviderSync,
  getZedSettingsSync,
  invalidateLlmProviderConfigCache,
} from '@/lib/llmProviderConfig';
import { BASE_URL, KIMI_CODE_BASE_URL } from './grokClient';
import { isXaiOAuthMode, resolveXaiOAuthAccessToken } from '@/lib/xai-oauth';
import { readFile, writeFile } from 'fs/promises';
import path from 'path';

const PLACEHOLDER_PATTERNS = [
  /PLACEHOLDER/i,
  /^your[-_]?api[-_]?key$/i,
  /^changeme$/i,
  /^replace[-_]?with/i,
];

const CONFIG_PATH = path.join(process.cwd(), 'data', 'llm-providers-config.json');

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isUsableZedApiKey(value) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed.length < 16) return false;
  return !PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(trimmed));
}

/**
 * Resolve MiniMax API key for Zed assistant chat.
 *
 * @returns {{ apiKey: string|null, source: 'MINIMAX_API_KEY'|'ANTHROPIC_API_KEY'|'llm-providers-config'|null }}
 */
export function resolveZedApiKey() {
  const envCandidates = [
    ['MINIMAX_API_KEY', process.env.MINIMAX_API_KEY],
    ['ANTHROPIC_API_KEY', process.env.ANTHROPIC_API_KEY],
  ];

  for (const [source, value] of envCandidates) {
    if (isUsableZedApiKey(value)) {
      return { apiKey: value.trim(), source };
    }
  }

  const minimaxConfig = getLlmProviderConfigSync('minimax');
  const configKey = minimaxConfig?.MINIMAX_API_KEY;
  if (isUsableZedApiKey(configKey)) {
    return { apiKey: configKey.trim(), source: 'llm-providers-config' };
  }

  return { apiKey: null, source: null };
}

const DEFAULT_XAI_MODEL = 'grok-4.20-0309-non-reasoning';
const DEFAULT_XAI_OAUTH_MODEL = 'grok-build-0.1';
const DEFAULT_MINIMAX_MODEL = 'minimax-coding-plan/MiniMax-M3';
const DEFAULT_KIMI_CODE_MODEL = 'kimi-for-coding';

/**
 * Sync API-key only path (no OAuth refresh). Used by tests and as fallback.
 * @returns {{ apiKey: string|null, source: 'XAI_API_KEY'|'llm-providers-config'|null }}
 */
function resolveXaiApiKeySync() {
  if (isUsableZedApiKey(process.env.XAI_API_KEY)) {
    return { apiKey: process.env.XAI_API_KEY.trim(), source: 'XAI_API_KEY' };
  }
  const xaiConfig = getRawLlmProviderSync('xai');
  if (xaiConfig?.enabled === false) {
    return { apiKey: null, source: null };
  }
  // When subscription OAuth is the explicit mode, don't treat empty API key as ready.
  if (isXaiOAuthMode(xaiConfig) && !isUsableZedApiKey(xaiConfig?.XAI_API_KEY)) {
    return { apiKey: null, source: null };
  }
  const configKey = xaiConfig?.XAI_API_KEY;
  if (isUsableZedApiKey(configKey)) {
    return { apiKey: configKey.trim(), source: 'llm-providers-config' };
  }
  return { apiKey: null, source: null };
}

function resolveXaiModel(xaiConfig) {
  if (typeof process.env.XAI_MODEL === 'string' && process.env.XAI_MODEL.trim()) {
    return process.env.XAI_MODEL.trim();
  }
  const cfg = xaiConfig || getRawLlmProviderSync('xai');
  if (cfg?.XAI_MODEL) return cfg.XAI_MODEL;
  return isXaiOAuthMode(cfg) ? DEFAULT_XAI_OAUTH_MODEL : DEFAULT_XAI_MODEL;
}

function resolveKimiCodeApiKey() {
  if (isUsableZedApiKey(process.env.KIMI_CODE_API_KEY)) {
    return { apiKey: process.env.KIMI_CODE_API_KEY.trim(), source: 'KIMI_CODE_API_KEY' };
  }
  const kimiConfig = getRawLlmProviderSync('kimi_code');
  if (kimiConfig?.enabled === false) {
    return { apiKey: null, source: null };
  }
  const configKey = kimiConfig?.KIMI_CODE_API_KEY;
  if (isUsableZedApiKey(configKey)) {
    return { apiKey: configKey.trim(), source: 'llm-providers-config' };
  }
  return { apiKey: null, source: null };
}

function resolveKimiCodeModel() {
  if (typeof process.env.KIMI_CODE_MODEL === 'string' && process.env.KIMI_CODE_MODEL.trim()) {
    return process.env.KIMI_CODE_MODEL.trim();
  }
  const kimiConfig = getRawLlmProviderSync('kimi_code');
  return kimiConfig?.KIMI_CODE_MODEL || DEFAULT_KIMI_CODE_MODEL;
}

function resolveMinimaxModel() {
  if (typeof process.env.MINIMAX_MODEL === 'string' && process.env.MINIMAX_MODEL.trim()) {
    return process.env.MINIMAX_MODEL.trim();
  }
  const minimaxConfig = getRawLlmProviderSync('minimax');
  return minimaxConfig?.MINIMAX_MODEL || DEFAULT_MINIMAX_MODEL;
}

function resolveZedProviderPreference() {
  if (typeof process.env.ZED_LLM_PROVIDER === 'string' && process.env.ZED_LLM_PROVIDER.trim()) {
    return process.env.ZED_LLM_PROVIDER.trim();
  }
  const preferred = getZedSettingsSync()?.provider;
  return typeof preferred === 'string' && preferred.trim() ? preferred.trim() : null;
}

async function persistRefreshedXaiTokens(updated) {
  if (!updated?.access_token) return;
  try {
    const raw = await readFile(CONFIG_PATH, 'utf8');
    const config = JSON.parse(raw);
    if (!config.providers) config.providers = {};
    if (!config.providers.xai) config.providers.xai = {};
    config.providers.xai.XAI_OAUTH_ACCESS_TOKEN = updated.access_token;
    if (updated.refresh_token) {
      config.providers.xai.XAI_OAUTH_REFRESH_TOKEN = updated.refresh_token;
    }
    config.providers.xai.XAI_OAUTH_EXPIRES_AT = updated.expires_at;
    await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
    invalidateLlmProviderConfigCache();
  } catch {
    // Best-effort — in-memory token still works for this process.
  }
}

/**
 * Resolve xAI credentials: SuperGrok OAuth subscription first when configured,
 * otherwise API key.
 *
 * @returns {Promise<{ apiKey: string|null, source: string|null }>}
 */
async function resolveXaiCredentials() {
  const xaiConfig = getRawLlmProviderSync('xai');
  if (xaiConfig?.enabled === false) {
    return { apiKey: null, source: null };
  }

  // Explicit API key mode, or env key always wins over subscription tokens.
  if (isUsableZedApiKey(process.env.XAI_API_KEY) && !isXaiOAuthMode(xaiConfig)) {
    return { apiKey: process.env.XAI_API_KEY.trim(), source: 'XAI_API_KEY' };
  }

  if (isXaiOAuthMode(xaiConfig)) {
    try {
      const oauth = await resolveXaiOAuthAccessToken(xaiConfig);
      if (oauth.updated) {
        await persistRefreshedXaiTokens(oauth.updated);
      }
      if (oauth.accessToken) {
        return { apiKey: oauth.accessToken, source: oauth.source };
      }
    } catch {
      // Fall through to API key if OAuth refresh fails and a key exists.
    }
  }

  // API key path (pay-as-you-go console key).
  const api = resolveXaiApiKeySync();
  if (api.apiKey) return api;

  // Last resort: OAuth tokens even if mode wasn't detected (partial config).
  if (xaiConfig?.XAI_OAUTH_REFRESH_TOKEN || xaiConfig?.XAI_OAUTH_ACCESS_TOKEN) {
    try {
      const oauth = await resolveXaiOAuthAccessToken(xaiConfig);
      if (oauth.updated) await persistRefreshedXaiTokens(oauth.updated);
      if (oauth.accessToken) {
        return { apiKey: oauth.accessToken, source: oauth.source || 'xai-oauth' };
      }
    } catch {
      // ignore
    }
  }

  return { apiKey: null, source: null };
}

function buildMinimaxConfig() {
  const minimax = resolveZedApiKey();
  if (!minimax.apiKey) return null;
  return {
    apiKey: minimax.apiKey,
    source: minimax.source,
    provider: 'minimax',
    model: resolveMinimaxModel(),
    baseUrl: null,
  };
}

function buildKimiCodeConfig() {
  const kimi = resolveKimiCodeApiKey();
  if (!kimi.apiKey) return null;
  return {
    apiKey: kimi.apiKey,
    source: kimi.source,
    provider: 'kimi_code',
    model: resolveKimiCodeModel(),
    baseUrl: KIMI_CODE_BASE_URL,
  };
}

async function buildXaiConfig() {
  const xai = await resolveXaiCredentials();
  if (!xai.apiKey) return null;
  const xaiConfig = getRawLlmProviderSync('xai');
  return {
    apiKey: xai.apiKey,
    source: xai.source,
    provider: 'xai',
    model: resolveXaiModel(xaiConfig),
    baseUrl: BASE_URL,
    authMode: isXaiOAuthMode(xaiConfig) ? 'oauth' : 'api_key',
  };
}

/**
 * Synchronous resolution — API keys only (no OAuth refresh).
 * Prefer {@link resolveZedLlmConfig} in request handlers.
 *
 * @returns {{ apiKey: string|null, source: string|null, provider: 'xai'|'minimax'|'kimi_code', model: string, baseUrl: string|null }}
 */
export function resolveZedLlmConfigSync() {
  const preferred = resolveZedProviderPreference();
  const xaiConfig = getRawLlmProviderSync('xai');

  if (preferred === 'minimax') {
    return (
      buildMinimaxConfig() || {
        apiKey: null,
        source: null,
        provider: 'minimax',
        model: resolveMinimaxModel(),
        baseUrl: null,
      }
    );
  }
  if (preferred === 'kimi_code') {
    return (
      buildKimiCodeConfig() || {
        apiKey: null,
        source: null,
        provider: 'kimi_code',
        model: DEFAULT_KIMI_CODE_MODEL,
        baseUrl: KIMI_CODE_BASE_URL,
      }
    );
  }
  if (preferred === 'xai') {
    const api = resolveXaiApiKeySync();
    return {
      apiKey: api.apiKey,
      source: api.source,
      provider: 'xai',
      model: resolveXaiModel(xaiConfig),
      baseUrl: BASE_URL,
      authMode: isXaiOAuthMode(xaiConfig) ? 'oauth' : 'api_key',
    };
  }

  const api = resolveXaiApiKeySync();
  if (api.apiKey) {
    return {
      apiKey: api.apiKey,
      source: api.source,
      provider: 'xai',
      model: resolveXaiModel(xaiConfig),
      baseUrl: BASE_URL,
      authMode: 'api_key',
    };
  }
  return (
    buildKimiCodeConfig() ||
    buildMinimaxConfig() || {
      apiKey: null,
      source: null,
      provider: 'minimax',
      model: resolveMinimaxModel(),
      baseUrl: null,
    }
  );
}

/**
 * Resolve which LLM provider + credentials Zed should use this turn.
 *
 * When `settings.zed.provider` (or `ZED_LLM_PROVIDER`) is set, that provider is
 * used exclusively. Otherwise legacy auto-select prefers Grok when configured,
 * then MiniMax.
 *
 * Supports SuperGrok OAuth (subscription) via providers.xai tokens — refreshes
 * the access token when near expiry.
 *
 * @returns {Promise<{ apiKey: string|null, source: string|null, provider: 'xai'|'minimax'|'kimi_code', model: string, baseUrl: string|null, authMode?: string }>}
 */
export async function resolveZedLlmConfig() {
  const preferred = resolveZedProviderPreference();

  if (preferred === 'minimax') {
    return (
      buildMinimaxConfig() || {
        apiKey: null,
        source: null,
        provider: 'minimax',
        model: resolveMinimaxModel(),
        baseUrl: null,
      }
    );
  }
  if (preferred === 'kimi_code') {
    return (
      buildKimiCodeConfig() || {
        apiKey: null,
        source: null,
        provider: 'kimi_code',
        model: DEFAULT_KIMI_CODE_MODEL,
        baseUrl: KIMI_CODE_BASE_URL,
      }
    );
  }
  if (preferred === 'xai') {
    return (
      (await buildXaiConfig()) || {
        apiKey: null,
        source: null,
        provider: 'xai',
        model: resolveXaiModel(),
        baseUrl: BASE_URL,
        authMode: isXaiOAuthMode(getRawLlmProviderSync('xai')) ? 'oauth' : 'api_key',
      }
    );
  }

  return (
    (await buildXaiConfig()) ||
    buildKimiCodeConfig() ||
    buildMinimaxConfig() || {
      apiKey: null,
      source: null,
      provider: 'minimax',
      model: resolveMinimaxModel(),
      baseUrl: null,
    }
  );
}
