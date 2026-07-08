/* eslint-env node */
/**
 * @module llmProviderConfig
 * Thin read-only helper that reads llm-providers-config.json once per module
 * instance and returns the config for a named provider.
 */

import fs from 'fs/promises';
import { readFileSync } from 'node:fs';
import path from 'path';

const CONFIG_PATH = path.join(process.cwd(), 'data', 'llm-providers-config.json');

/** In-memory cache — survives multiple calls within the same module instance */
let _cache = null;

/**
 * Drop the in-memory cache so the next read reflects the file on disk.
 * Call this after writing `data/llm-providers-config.json` from an API route
 * (e.g. Settings UI saves) so Zed/agent callers pick up new keys/models
 * without a server restart.
 */
export function invalidateLlmProviderConfigCache() {
  _cache = null;
}

/**
 * Load the full config from disk (cached after first read).
 * @returns {Promise<object>}
 */
async function loadConfig() {
  if (_cache) return _cache;
  try {
    const raw = await fs.readFile(CONFIG_PATH, 'utf8');
    _cache = JSON.parse(raw);
  } catch {
    _cache = { providers: {}, modelOptions: {} };
  }
  return _cache;
}

/**
 * List the provider keys present in the config (regardless of `enabled`).
 * Server-side enumeration helper for the `/api/agenthub/llm/status` route.
 *
 * @param {{ useCache?: boolean }} [opts]
 * @returns {Promise<string[]>} e.g. ['openrouter', 'copilot', 'opencode', 'minimax']
 */
export async function listLlmProviderKeys(opts = {}) {
  const useCache = opts.useCache !== false;
  if (useCache && _cache) {
    return Object.keys(_cache?.providers || {});
  }
  const config = await loadConfig();
  return Object.keys(config?.providers || {});
}

/**
 * Synchronous variant of {@link listLlmProviderKeys}.
 * @returns {string[]}
 */
export function listLlmProviderKeysSync() {
  if (_cache) return Object.keys(_cache?.providers || {});
  try {
    const raw = readFileSync(CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return Object.keys(parsed?.providers || {});
  } catch {
    return [];
  }
}

/**
 * List the human-readable `name` for every provider in the config. The
 * contract is: `name === providerKey` (no separate `name` field is stored in
 * `data/llm-providers-config.json`; the key IS the name). The route uses
 * this to populate the `provider` field of the response without leaking any
 * per-provider config object.
 *
 * @param {{ useCache?: boolean }} [opts]
 * @returns {Promise<string[]>}
 */
export async function listLlmProviderNames(opts = {}) {
  const keys = await listLlmProviderKeys(opts);
  return keys.slice();
}

export function listLlmProviderNamesSync() {
  return listLlmProviderKeysSync().slice();
}

/**
 * Get the config for a named LLM provider.
 *
 * @param {string} providerKey - e.g. 'minimax', 'openrouter', 'opencode'
 * @returns {Promise<{ ANTHROPIC_BASE_URL?: string; MINIMAX_MODEL?: string; enabled?: boolean } | null>}
 *   Returns null if the provider is absent or enabled === false.
 */
export async function getLlmProviderConfig(providerKey) {
  if (!providerKey) return null;
  const config = await loadConfig();
  const provider = config?.providers?.[providerKey];
  if (!provider) return null;
  if (provider.enabled === false) return null;
  return provider;
}

/**
 * Derive a generic field schema for an unknown provider's env-var key.
 * Used by the frontend UI as a fallback when a backend provider has no
 * entry in the lightweight `PROVIDER_META` map.
 *
 * @param {string} key - Env-var name, e.g. 'FUTURE_API_KEY'
 * @returns {{ label: string; type: 'password' | 'url' | 'select' | 'text'; options?: string[] }}
 */
export function deriveSchemaForUnknown(key) {
  if (!key) return { label: String(key), type: 'text' };
  if (key.endsWith('_API_KEY')) return { label: key, type: 'password' };
  if (key.endsWith('_BASE_URL')) return { label: key, type: 'url' };
  if (key.endsWith('_MODEL')) return { label: key, type: 'select', options: [] };
  return { label: key, type: 'text' };
}

/**
 * Synchronous variant — reads from the in-memory cache only.
 * Callers should prefer the async version if cache may be cold.
 *
 * @param {string} providerKey
 * @returns {{ ANTHROPIC_BASE_URL?: string; MINIMAX_MODEL?: string; enabled?: boolean } | null}
 */
export function getLlmFullConfigSync() {
  if (_cache) return _cache;
  try {
    const raw = readFileSync(CONFIG_PATH, 'utf8');
    _cache = JSON.parse(raw);
    return _cache;
  } catch {
    return { providers: {}, modelOptions: {}, zed: {} };
  }
}

/**
 * Provider row from config, including when `enabled: false` (for Zed settings UI).
 *
 * @param {string} providerKey
 * @returns {object|null}
 */
export function getRawLlmProviderSync(providerKey) {
  if (!providerKey) return null;
  const config = getLlmFullConfigSync();
  return config?.providers?.[providerKey] ?? null;
}

/**
 * Zed assistant provider preference (`config.zed.provider`).
 *
 * @returns {{ provider?: string }}
 */
export function getZedSettingsSync() {
  const config = getLlmFullConfigSync();
  return config?.zed && typeof config.zed === 'object' ? config.zed : {};
}

export function getLlmProviderConfigSync(providerKey) {
  if (!providerKey) return null;
  // Try cache first
  if (_cache) {
    const provider = _cache?.providers?.[providerKey];
    if (!provider) return null;
    if (provider.enabled === false) return null;
    return provider;
  }
  // Fallback: direct sync read (for sync callers at module startup)
  try {
    const raw = readFileSync(CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    const provider = parsed?.providers?.[providerKey];
    if (!provider) return null;
    if (provider.enabled === false) return null;
    return provider;
  } catch {
    return null;
  }
}
