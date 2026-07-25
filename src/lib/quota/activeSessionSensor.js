import { PROVIDERS } from './types.js';

/**
 * Detects active AI Provider based on terminal process name, command, or session metadata.
 * @param {string|null} commandOrTitle - Command line or tab title (e.g., 'grok agent', 'claude code', 'agy')
 * @returns {string|null} One of PROVIDERS enum values, or null when nothing matches
 *   (callers fall back to the first enabled provider instead of a wrong guess).
 */
export function detectProviderFromSession(commandOrTitle) {
  if (!commandOrTitle) return null;

  const lower = commandOrTitle.toLowerCase();

  if (lower.includes('grok')) return PROVIDERS.GROK;
  if (lower.includes('claude') || lower.includes('anthropic')) return PROVIDERS.CLAUDE;
  if (lower.includes('agy') || lower.includes('antigravity')) return PROVIDERS.ANTIGRAVITY;
  if (lower.includes('kimi') || lower.includes('moonshot')) return PROVIDERS.KIMI;
  if (lower.includes('opencode')) return PROVIDERS.OPENCODE;
  if (lower.includes('codex') || lower.includes('openai')) return PROVIDERS.CODEX;
  if (
    lower.includes('z.ai') ||
    lower.includes('zai') ||
    lower.includes('glm') ||
    lower.includes('zhipu')
  )
    return PROVIDERS.ZAI;

  return null; // unknown session — let the caller decide (user order wins)
}
