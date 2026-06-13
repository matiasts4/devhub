/**
 * Execute fast-path intent and build API/SSE payloads.
 */

import { resolveZedFastPathIntent } from './zedFastPath';
import { formatZedToolResultsReply } from './zedFastPathResponse';
import { encodeZedSseEvent } from './zedStreamProtocol';
import { labelForZedToolStart, labelForZedToolDone } from './zedToolLabels';
import { zedLog } from './utils/zed-logger';

function toolResultOk(result) {
  const r = result && typeof result === 'object' ? result : null;
  if (!r) return true;
  if (r.error === 'command_requires_approval') return true;
  if (r.action === 'would close' || r.action === 'would_execute') return true;
  return !r.error;
}

/**
 * @param {object} params
 * @param {string} params.message
 * @param {import('./tools/registry').ToolRegistry} params.registry
 * @param {object} params.requestContext
 * @param {string} [params.msgId]
 * @returns {Promise<{ hit: true, body: object, text: string, toolResults: Array, intent: object } | { hit: false }>}
 */
export async function tryZedFastPath({ message, registry, requestContext, msgId = '' }) {
  const intent = resolveZedFastPathIntent(message, requestContext);
  if (!intent || intent.confidence < 0.85) {
    return { hit: false };
  }

  const started = Date.now();
  zedLog.orchestration('fast_path', {
    msgId,
    intent: intent.intent,
    steps: intent.steps.length,
    confidence: intent.confidence,
    matched: intent.matched,
  });

  const toolResults = [];
  for (const step of intent.steps) {
    let result;
    try {
      result = await registry.execute(step.tool, step.input, requestContext);
    } catch (err) {
      result = { error: err.message };
    }
    toolResults.push({ tool: step.tool, input: step.input, result });
    zedLog.toolResult(step.tool, result, Date.now() - started);
  }

  const text = formatZedToolResultsReply(toolResults);
  const duration = Date.now() - started;

  return {
    hit: true,
    intent,
    text,
    toolResults,
    body: {
      text,
      tool_results: toolResults,
      model: 'zed-fast-path',
      msgId,
      meta: {
        fast_path: true,
        intent: intent.intent,
        confidence: intent.confidence,
        duration_ms: duration,
        steps: intent.steps.length,
      },
    },
  };
}

/**
 * Minimal SSE stream for fast path (same events useZedChat expects).
 *
 * @param {{ text: string, toolResults: Array, intent: object, msgId: string, model?: string }} payload
 * @returns {ReadableStream}
 */
export function createZedFastPathSseStream({ text, toolResults, intent, msgId, model = 'zed-fast-path' }) {
  const encoder = new TextEncoder();

  return new ReadableStream({
    start(controller) {
      for (const entry of toolResults) {
        controller.enqueue(
          encoder.encode(
            encodeZedSseEvent('tool_start', {
              tool: entry.tool,
              input: entry.input,
              label: labelForZedToolStart(entry.tool, entry.input),
            })
          )
        );

        const ok = toolResultOk(entry.result);
        controller.enqueue(
          encoder.encode(
            encodeZedSseEvent('tool_result', {
              tool: entry.tool,
              input: entry.input,
              result: entry.result,
              ok,
              label: ok ? labelForZedToolDone(entry.tool) : null,
            })
          )
        );
      }

      controller.enqueue(encoder.encode(encodeZedSseEvent('text_delta', { text })));

      controller.enqueue(
        encoder.encode(
          encodeZedSseEvent('done', {
            text,
            tool_results: toolResults,
            model,
            msgId,
            meta: { fast_path: true, intent: intent.intent, steps: intent.steps?.length || 1 },
          })
        )
      );

      controller.close();
    },
  });
}

export default tryZedFastPath;
