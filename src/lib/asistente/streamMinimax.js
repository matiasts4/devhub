/**
 * MiniMax streaming client for Zed.
 *
 * Consumes Anthropic-compatible SSE from /v1/messages with stream: true,
 * forwards text deltas live, and reconstructs native tool_use blocks.
 */

import { zedLog } from './utils/zed-logger';
import { parseZedSseBuffer } from './zedStreamProtocol';
import { BASE_URL, MinimaxError, isRetryableStatus } from './minimaxClient';

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
 * @param {Array} params.messages
 * @param {string} params.apiKey
 * @param {Array} [params.tools]
 * @param {number} [params.timeoutMs]
 * @param {(text: string) => void} [params.onTextDelta]
 * @param {(thinking: string) => void} [params.onThinkingDelta]
 * @returns {Promise<{ text: string, toolCalls: Array<{id: string, name: string, input: object}>, stopReason: string|null, usage: object, messageId: string|null, model: string|null }>}
 */
export async function streamMinimaxOnce({
  model,
  maxTokens,
  system,
  messages,
  apiKey,
  tools,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  onTextDelta = () => {},
  onThinkingDelta = () => {},
}) {
  const body = {
    model,
    max_tokens: maxTokens,
    stream: true,
    ...(system ? { system } : {}),
    messages,
    ...(tools && tools.length ? { tools } : {}),
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    throw new MinimaxError(err.message, { retryable: true });
  }

  if (!response.ok) {
    clearTimeout(timeoutId);
    const errText = await response.text();
    throw new MinimaxError(`MiniMax API error ${response.status}: ${errText}`, {
      upstream_status: response.status,
      retryable: isRetryableStatus(response.status),
    });
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  let currentText = '';
  /** @type {{ index: number, id: string, name: string, partialInput: string } | null} */
  let currentTool = null;
  const toolCalls = [];
  let stopReason = null;
  let usage = {};
  let messageId = null;
  let modelName = null;

  function handleEvent({ event, data }) {
    if (event === 'ping') return;
    if (!data || typeof data !== 'object') return;

    const type = data.type;
    if (type === 'message_start') {
      const msg = data.message || {};
      messageId = msg.id || messageId;
      modelName = msg.model || modelName;
      usage = msg.usage || usage;
      zedLog.info('API', 'MiniMax streaming message_start', { messageId, model: modelName });
      return;
    }

    if (type === 'content_block_start') {
      const block = data.content_block || {};
      if (block.type === 'tool_use') {
        currentTool = {
          index: data.index,
          id: block.id,
          name: block.name,
          partialInput: '',
        };
      }
      return;
    }

    if (type === 'content_block_delta') {
      const delta = data.delta || {};
      if (delta.type === 'text_delta') {
        const text = delta.text || '';
        currentText += text;
        onTextDelta(text);
      } else if (delta.type === 'input_json_delta' && currentTool) {
        currentTool.partialInput += delta.partial_json || '';
      } else if (delta.type === 'thinking_delta') {
        onThinkingDelta(delta.thinking || '');
      }
      return;
    }

    if (type === 'content_block_stop') {
      if (currentTool && currentTool.index === data.index) {
        let input = {};
        if (currentTool.partialInput.trim()) {
          try {
            input = JSON.parse(currentTool.partialInput);
          } catch {
            input = { _parse_error: currentTool.partialInput };
          }
        }
        toolCalls.push({
          id: currentTool.id,
          name: currentTool.name,
          input,
        });
        currentTool = null;
      }
      return;
    }

    if (type === 'message_delta') {
      const delta = data.delta || {};
      stopReason = delta.stop_reason || stopReason;
      usage = { ...usage, ...(data.usage || {}) };
      return;
    }

    if (type === 'message_stop') {
      zedLog.info('API', 'MiniMax streaming message_stop');
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
    throw new MinimaxError(err.message, { retryable: false });
  } finally {
    clearTimeout(timeoutId);
    try {
      reader.releaseLock();
    } catch {
      // ignore
    }
  }

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
 * Start a MiniMax stream with retry/backoff only for connection/start errors.
 *
 * @param {Parameters<typeof streamMinimaxOnce>[0] & { maxRetries?: number, timeoutMs?: number }} params
 */
export async function streamMinimax({
  maxRetries = Number(process.env.ZED_MINIMAX_MAX_RETRIES) || DEFAULT_MAX_RETRIES,
  timeoutMs = Number(process.env.ZED_MINIMAX_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
  ...params
}) {
  let lastError;
  const start = Date.now();

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      const result = await streamMinimaxOnce({ ...params, timeoutMs });
      const duration = Date.now() - start;
      zedLog.info('API', `MiniMax streaming response (${duration}ms)`, {
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
        `MiniMax streaming retry ${attempt + 1}/${maxRetries + 1} after ${Math.round(backoff)}ms`
      );
      await sleep(backoff);
    }
  }

  throw lastError;
}
