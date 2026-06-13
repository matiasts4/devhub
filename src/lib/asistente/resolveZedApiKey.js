import { getLlmProviderConfigSync } from '@/lib/llmProviderConfig';

const PLACEHOLDER_PATTERNS = [
  /PLACEHOLDER/i,
  /^your[-_]?api[-_]?key$/i,
  /^changeme$/i,
  /^replace[-_]?with/i,
];

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
 * Prefers valid env vars; skips placeholder .env values; falls back to
 * data/llm-providers-config.json (same source as swarm agent wrappers).
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