/**
 * xAI Grok API client for Zed.
 *
 * Mirrors minimaxClient.js (timeout/retry/backoff/error shape) but speaks
 * OpenAI Chat Completions (xAI's wire format) instead of Anthropic Messages.
 * The response is normalized to the same `{ content: [...] }` Anthropic
 * content-block shape callMinimax returns, so runZedChatLoop.js needs no
 * provider-specific branching to read the result.
 *
 * xAI's Responses API (`/v1/responses`) is now the vendor-recommended
 * surface, but Chat Completions remains supported ("Deprecated" but live,
 * function-calling included — docs.x.ai/developers/model-capabilities/text/comparison,
 * checked 2026-07) and keeps this client symmetric with minimaxClient.js.
 */

import { zedLog } from './utils/zed-logger';
import { toOpenAiMessages, toOpenAiTools, fromOpenAiMessage } from './zedConversationAdapter';

export const BASE_URL = 'https://api.x.ai/v1/chat/completions';
export const KIMI_CODE_BASE_URL = 'https://api.kimi.com/coding/v1/chat/completions';

const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_MAX_RETRIES = 2;

export class GrokError extends Error {
  /**
   * @param {string} message
   * @param {object} [meta]
   * @param {number|null} [meta.upstream_status]
   * @param {boolean} [meta.retryable]
   * @param {number} [meta.attempt]
   */
  constructor(message, { upstream_status = null, retryable = false, attempt = 1 } = {}) {
    super(message);
    this.name = 'GrokError';
    this.upstream_status = upstream_status;
    this.retryable = retryable;
    this.attempt = attempt;
  }
}

export function isRetryableStatus(status) {
  if (!status) return true;
  return status === 429 || status === 502 || status === 503 || status === 504;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Single Grok request with timeout. No retries.
 *
 * @param {object} params
 * @param {string} params.model
 * @param {number} params.maxTokens
 * @param {string} [params.system]
 * @param {Array} params.messages Anthropic-shaped internal conversation
 * @param {string} params.apiKey
 * @param {Array} [params.tools] Anthropic-shaped tool defs (input_schema)
 * @param {number} [params.timeoutMs]
 * @param {string} [params.baseUrl] OpenAI-compatible chat/completions URL
 */
export async function callGrokOnce({
  model,
  maxTokens,
  system,
  messages,
  apiKey,
  tools,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  baseUrl = BASE_URL,
}) {
  const body = {
    model,
    max_tokens: maxTokens,
    messages: toOpenAiMessages(system, messages),
    ...(tools && tools.length ? { tools: toOpenAiTools(tools) } : {}),
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new GrokError(`Grok API error ${response.status}: ${errText}`, {
        upstream_status: response.status,
        retryable: isRetryableStatus(response.status),
      });
    }

    const data = await response.json();
    const choice = data.choices?.[0];
    return {
      content: fromOpenAiMessage(choice?.message || {}),
      stop_reason: choice?.finish_reason ?? null,
      usage: data.usage || {},
      id: data.id || null,
      model: data.model || model,
    };
  } catch (err) {
    if (err instanceof GrokError) throw err;
    throw new GrokError(err.message, { retryable: true });
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Call Grok with retries and backoff for transient failures.
 *
 * @param {object} params
 * @param {string} params.model
 * @param {number} params.maxTokens
 * @param {string} [params.system]
 * @param {Array} params.messages
 * @param {string} params.apiKey
 * @param {Array} [params.tools]
 * @param {number} [params.timeoutMs]
 * @param {number} [params.maxRetries]
 * @param {string} [params.baseUrl]
 */
export async function callGrok({
  model,
  maxTokens,
  system,
  messages,
  apiKey,
  tools,
  timeoutMs = Number(process.env.ZED_GROK_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
  maxRetries = Number(process.env.ZED_GROK_MAX_RETRIES) || DEFAULT_MAX_RETRIES,
  baseUrl = BASE_URL,
}) {
  let lastError;
  const start = Date.now();

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      const data = await callGrokOnce({
        model,
        maxTokens,
        system,
        messages,
        apiKey,
        tools,
        timeoutMs,
        baseUrl,
      });

      const duration = Date.now() - start;
      const contentTypes = data.content?.map((b) => b.type) || [];
      const hasToolUse = contentTypes.includes('tool_use');
      zedLog.info('API', `Grok response (${duration}ms)`, { contentTypes, hasToolUse });
      zedLog.apiResponse?.(
        duration,
        contentTypes,
        contentTypes.includes('text'),
        false,
        hasToolUse
      );
      return data;
    } catch (err) {
      lastError = err;
      const isLastAttempt = attempt > maxRetries;
      const retryable = err instanceof GrokError ? err.retryable : true;

      if (!retryable || isLastAttempt) {
        throw new GrokError(err.message, {
          upstream_status: err.upstream_status ?? null,
          retryable,
          attempt,
        });
      }

      const backoff = 250 * 2 ** (attempt - 1) + Math.random() * 100;
      zedLog.info(
        'API',
        `Grok retry ${attempt + 1}/${maxRetries + 1} after ${Math.round(backoff)}ms`
      );
      await sleep(backoff);
    }
  }

  throw lastError;
}
