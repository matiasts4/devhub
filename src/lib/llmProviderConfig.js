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
 * Synchronous variant — reads from the in-memory cache only.
 * Callers should prefer the async version if cache may be cold.
 *
 * @param {string} providerKey
 * @returns {{ ANTHROPIC_BASE_URL?: string; MINIMAX_MODEL?: string; enabled?: boolean } | null}
 */
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
