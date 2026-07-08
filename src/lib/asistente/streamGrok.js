/**
 * xAI Grok streaming client for Zed.
 *
 * Consumes OpenAI-compatible SSE from /v1/chat/completions with stream:
 * true, forwards text deltas live, and reconstructs tool_calls into the
 * same `{ text, toolCalls, stopReason, usage, messageId, model }` shape
 * streamMinimax returns so runZedChatLoop.js stays provider-agnostic.
 */

import { zedLog } from './utils/zed-logger';
import { parseZedSseBuffer } from './zedStreamProtocol';
import { toOpenAiMessages, toOpenAiTools, parseToolCallArguments } from './zedConversationAdapter';
import { BASE_URL, GrokError, isRetryableStatus } from './grokClient';

const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_MAX_RETRIES = 2;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {object} params
 * @param {string} params.model
 * @param {number} params.maxTokens
 * @param {string} [params.system]
 * @param {Array} params.messages Anthropic-shaped internal conversation
 * @param {string} params.apiKey
 * @param {Array} [params.tools] Anthropic-shaped tool defs (input_schema)
 * @param {number} [params.timeoutMs]
 * @param {(text: string) => void} [params.onTextDelta]
 * @param {(thinking: string) => void} [params.onThinkingDelta] unused (Chat Completions returns no reasoning stream)
 * @param {string} [params.baseUrl] OpenAI-compatible chat/completions URL
 * @returns {Promise<{ text: string, toolCalls: Array<{id: string, name: string, input: object}>, stopReason: string|null, usage: object, messageId: string|null, model: string|null }>}
 */
export async function streamGrokOnce({
  model,
  maxTokens,
  system,
  messages,
  apiKey,
  tools,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  onTextDelta = () => {},
  // eslint-disable-next-line no-unused-vars
  onThinkingDelta = () => {},
  baseUrl = BASE_URL,
}) {
  const body = {
    model,
    max_tokens: maxTokens,
    stream: true,
    messages: toOpenAiMessages(system, messages),
    ...(tools && tools.length ? { tools: toOpenAiTools(tools) } : {}),
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    throw new GrokError(err.message, { retryable: true });
  }

  if (!response.ok) {
    clearTimeout(timeoutId);
    const errText = await response.text();
    throw new GrokError(`Grok API error ${response.status}: ${errText}`, {
      upstream_status: response.status,
      retryable: isRetryableStatus(response.status),
    });
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  let currentText = '';
  /** @type {Map<number, { id: string, name: string, partialArgs: string }>} */
  const toolCallsByIndex = new Map();
  let stopReason = null;
  let usage = {};
  let messageId = null;
  let modelName = null;

  function handleEvent({ data }) {
    if (data === '[DONE]') return;
    if (!data || typeof data !== 'object') return;

    messageId = data.id || messageId;
    modelName = data.model || modelName;
    if (data.usage) usage = { ...usage, ...data.usage };

    const choice = data.choices?.[0];
    if (!choice) return;

    const delta = choice.delta || {};
    if (typeof delta.content === 'string' && delta.content) {
      currentText += delta.content;
      onTextDelta(delta.content);
    }

    if (Array.isArray(delta.tool_calls)) {
      for (const tc of delta.tool_calls) {
        const index = tc.index ?? 0;
        const existing = toolCallsByIndex.get(index) || { id: null, name: null, partialArgs: '' };
        if (tc.id) existing.id = tc.id;
        if (tc.function?.name) existing.name = tc.function.name;
        if (tc.function?.arguments) existing.partialArgs += tc.function.arguments;
        toolCallsByIndex.set(index, existing);
      }
    }

    if (choice.finish_reason) {
      stopReason = choice.finish_reason;
    }
  }

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parsed = parseZedSseBuffer(buffer);
      buffer = parsed.remainder;
      for (const evt of parsed.events) handleEvent(evt);
    }

    if (buffer.trim()) {
      const parsed = parseZedSseBuffer(`${buffer}\n\n`);
      for (const evt of parsed.events) handleEvent(evt);
      buffer = parsed.remainder;
    }
  } catch (err) {
    clearTimeout(timeoutId);
    try {
      reader.releaseLock();
    } catch {
      // ignore
    }
    throw new GrokError(err.message, { retryable: false });
  } finally {
    clearTimeout(timeoutId);
    try {
      reader.releaseLock();
    } catch {
      // ignore
    }
  }

  const toolCalls = Array.from(toolCallsByIndex.values()).map((tc) => ({
    id: tc.id,
    name: tc.name,
    input: parseToolCallArguments(tc.partialArgs),
  }));

  return {
    text: currentText,
    toolCalls,
    stopReason,
    usage,
    messageId,
    model: modelName,
  };
}

/**
 * Start a Grok stream with retry/backoff only for connection/start errors.
 *
 * @param {Parameters<typeof streamGrokOnce>[0] & { maxRetries?: number, timeoutMs?: number }} params
 */
export async function streamGrok({
  maxRetries = Number(process.env.ZED_GROK_MAX_RETRIES) || DEFAULT_MAX_RETRIES,
  timeoutMs = Number(process.env.ZED_GROK_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
  baseUrl = BASE_URL,
  ...params
}) {
  let lastError;
  const start = Date.now();

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      const result = await streamGrokOnce({ ...params, timeoutMs, baseUrl });
      const duration = Date.now() - start;
      zedLog.info('API', `Grok streaming response (${duration}ms)`, {
        toolCalls: result.toolCalls.length,
        stopReason: result.stopReason,
      });
      zedLog.apiResponse?.(
        duration,
        ['streaming'],
        result.text.length > 0,
        false,
        result.toolCalls.length > 0
      );
      return result;
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
        `Grok streaming retry ${attempt + 1}/${maxRetries + 1} after ${Math.round(backoff)}ms`
      );
      await sleep(backoff);
    }
  }

  throw lastError;
}
