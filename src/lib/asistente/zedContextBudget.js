/**
 * Context budget heuristics for Zed.
 *
 * Anthropic/MiniMax charge by tokens; we do not have a live tokenizer, so we
 * use a conservative char-to-token ratio (4 chars ≈ 1 token for English/Spanish
 * mixed text) to keep the prompt below a configurable ceiling.
 */

const CHARS_PER_TOKEN = 4;
const DEFAULT_MAX_INPUT_TOKENS = 6000;
const DEFAULT_MAX_HISTORY_MESSAGES = 20;

function clamp(value, min, max) {
  if (Number.isNaN(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * Rough token estimate for a string or array of strings.
 *
 * @param {string | Array<string>} input
 * @returns {number}
 */
export function estimateTokens(input) {
  const text = Array.isArray(input) ? input.join('\n') : String(input ?? '');
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Choose max_tokens for the model based on the user's message.
 *
 * @param {string} message
 * @param {number} [defaultMax]
 * @param {number} [simpleMax]
 * @returns {number}
 */
export function resolveMaxTokens(message, defaultMax = 2048, simpleMax = 512) {
  const text = typeof message === 'string' ? message.toLowerCase() : '';
  const boundary = '(?:^|[^a-z0-9áéíóúñ])';
  const endBoundary = '(?:$|[^a-z0-9áéíóúñ])';
  const simplePatterns = new RegExp(
    `${boundary}(explica|explicame|explicá|qu[eé]|cu[aá]l|cu[aá]les|qui[eé]n|c[oó]mo|por\\s+qu[eé]|what|which|who|how|why|define|resume|resumí|summarize)${endBoundary}`,
    'i'
  );
  const isSimple =
    simplePatterns.test(text) && !/\b(ejecuta|corre|run|abre|lanza|crea|plan|roadmap)\b/.test(text);
  return isSimple ? simpleMax : defaultMax;
}

/**
 * Trim the oldest messages from history until the estimated input tokens fit.
 * Always keeps the most recent user message (handled separately by the caller).
 *
 * @param {string} systemPrompt
 * @param {Array<{role: string, content: string}>} history
 * @param {number} [maxTokens]
 * @returns {{ history: Array<{role: string, content: string}>, estimatedInputTokens: number, droppedCount: number }}
 */
export function fitHistoryWithinBudget(
  systemPrompt,
  history,
  maxTokens = Number(process.env.ZED_MAX_INPUT_TOKENS) || DEFAULT_MAX_INPUT_TOKENS
) {
  const safeMax = clamp(maxTokens, 1000, 16000);
  const systemTokens = estimateTokens(systemPrompt);
  const budgetForHistory = safeMax - systemTokens;

  const safeHistory = Array.isArray(history)
    ? history.filter(
        (m) =>
          m &&
          typeof m === 'object' &&
          (m.role === 'user' || m.role === 'assistant') &&
          typeof m.content === 'string'
      )
    : [];

  // Keep the last N messages as a hard ceiling.
  const cappedHistory = safeHistory.slice(-DEFAULT_MAX_HISTORY_MESSAGES);

  let currentTokens = cappedHistory.reduce((sum, m) => sum + estimateTokens(m.content), 0);

  const trimmed = cappedHistory;
  while (currentTokens > budgetForHistory && trimmed.length > 0) {
    const removed = trimmed.shift();
    currentTokens -= estimateTokens(removed.content);
  }

  return {
    history: trimmed,
    estimatedInputTokens: systemTokens + currentTokens,
    droppedCount: cappedHistory.length - trimmed.length,
  };
}
