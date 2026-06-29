/**
 * MiniMax API client for Zed.
 *
 * Wraps the blocking Anthropic-compatible endpoint with timeout,
 * transient-error retry/backoff, and normalized error metadata.
 */

import { zedLog } from './utils/zed-logger';

export const BASE_URL = 'https://api.minimax.io/anthropic/v1/messages';

const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_MAX_RETRIES = 2;

export class MinimaxError extends Error {
  /**
   * @param {string} message
   * @param {object} [meta]
   * @param {number|null} [meta.upstream_status]
   * @param {boolean} [meta.retryable]
   * @param {number} [meta.attempt]
   */
  constructor(message, { upstream_status = null, retryable = false, attempt = 1 } = {}) {
    super(message);
    this.name = 'MinimaxError';
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
 * Single MiniMax request with timeout. No retries.
 *
 * @param {object} params
 * @param {string} params.model
 * @param {number} params.maxTokens
 * @param {string} [params.system]
 * @param {Array} params.messages
 * @param {string} params.apiKey
 * @param {Array} [params.tools]
 * @param {number} [params.timeoutMs]
 */
export async function callMinimaxOnce({
  model,
  maxTokens,
  system,
  messages,
  apiKey,
  tools,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  const body = {
    model,
    max_tokens: maxTokens,
    ...(system ? { system } : {}),
    messages,
    ...(tools && tools.length ? { tools } : {}),
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new MinimaxError(`MiniMax API error ${response.status}: ${errText}`, {
        upstream_status: response.status,
        retryable: isRetryableStatus(response.status),
      });
    }

    return await response.json();
  } catch (err) {
    if (err instanceof MinimaxError) throw err;
    throw new MinimaxError(err.message, { retryable: true });
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Call MiniMax with retries and backoff for transient failures.
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
 */
export async function callMinimax({
  model,
  maxTokens,
  system,
  messages,
  apiKey,
  tools,
  timeoutMs = Number(process.env.ZED_MINIMAX_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
  maxRetries = Number(process.env.ZED_MINIMAX_MAX_RETRIES) || DEFAULT_MAX_RETRIES,
}) {
  let lastError;
  const start = Date.now();

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      const data = await callMinimaxOnce({
        model,
        maxTokens,
        system,
        messages,
        apiKey,
        tools,
        timeoutMs,
      });

      const duration = Date.now() - start;
      const contentTypes = data.content?.map((b) => b.type) || [];
      const hasToolUse = contentTypes.includes('tool_use');
      zedLog.info('API', `MiniMax response (${duration}ms)`, { contentTypes, hasToolUse });
      zedLog.apiResponse?.(
        duration,
        contentTypes,
        contentTypes.includes('text'),
        contentTypes.includes('thinking'),
        hasToolUse
      );
      return data;
    } catch (err) {
      lastError = err;
      const isLastAttempt = attempt > maxRetries;
      const retryable = err instanceof MinimaxError ? err.retryable : true;

      if (!retryable || isLastAttempt) {
        throw new MinimaxError(err.message, {
          upstream_status: err.upstream_status ?? null,
          retryable,
          attempt,
        });
      }

      const backoff = 250 * 2 ** (attempt - 1) + Math.random() * 100;
      zedLog.info(
        'API',
        `MiniMax retry ${attempt + 1}/${maxRetries + 1} after ${Math.round(backoff)}ms`
      );
      await sleep(backoff);
    }
  }

  throw lastError;
}
