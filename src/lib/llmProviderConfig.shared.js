/**
 * Client-safe shared utilities for LLM provider configuration.
 *
 * This module is intentionally free of Node.js-only imports (`fs`, `node:fs`,
 * `path`, etc.) so it can be safely bundled into Client Components.
 *
 * For server-side provider config loading (which reads
 * `data/llm-providers-config.json` from disk), import from
 * `@/lib/llmProviderConfig` instead.
 */

/**
 * Derive a default input schema for an unknown provider env-var key.
 *
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
