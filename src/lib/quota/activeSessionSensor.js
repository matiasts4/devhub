import { PROVIDERS } from './types.js';

/**
 * Detects active AI Provider based on terminal process name, command, or session metadata.
 * @param {string|null} commandOrTitle - Command line or tab title (e.g., 'grok agent', 'claude code', 'agy')
 * @returns {string} One of PROVIDERS enum values
 */
export function detectProviderFromSession(commandOrTitle) {
  if (!commandOrTitle) return PROVIDERS.GROK;

  const lower = commandOrTitle.toLowerCase();

  if (lower.includes('grok')) return PROVIDERS.GROK;
  if (lower.includes('claude') || lower.includes('anthropic')) return PROVIDERS.CLAUDE;
  if (lower.includes('agy') || lower.includes('antigravity')) return PROVIDERS.ANTIGRAVITY;
  if (lower.includes('kimi') || lower.includes('moonshot')) return PROVIDERS.KIMI;
  if (lower.includes('opencode')) return PROVIDERS.OPENCODE;
  if (lower.includes('codex') || lower.includes('openai')) return PROVIDERS.CODEX;

  return PROVIDERS.GROK; // default fallback
}
