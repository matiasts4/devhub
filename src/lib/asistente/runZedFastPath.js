/**
 * Execute local intent router and build API/SSE payloads.
 */

import { resolveZedIntent } from './zedIntentRouter';
import { formatZedToolResultsReply } from './zedFastPathResponse';
import { encodeZedSseEvent } from './zedStreamProtocol';
import { labelForZedToolStart, labelForZedToolDone } from './zedToolLabels';
import { zedLog } from './utils/zed-logger';
import { recordFastPath } from './zedMetrics';

function toolResultOk(result) {
  const r = result && typeof result === 'object' ? result : null;
  if (!r) return true;
  if (r.error === 'command_requires_approval') return true;
  if (r.action === 'would close' || r.action === 'would_execute') return true;
  return !r.error;
}

function buildConfirmationPreview(resolved) {
  const stepSummary = (resolved.steps || [])
    .map((s) => `${s.tool}${s.input?.name ? ` (${s.input.name})` : ''}`)
    .join(' → ');
  return `¿Confirmás esta acción? ${stepSummary || resolved.intent}`;
}

/**
 * @param {object} params
 * @param {string} params.message
 * @param {import('./tools/registry').ToolRegistry} params.registry
 * @param {object} params.requestContext
 * @param {string} [params.msgId]
 * @param {boolean} [params.confirmed]
 * @returns {Promise<{ hit: true, body: object, text: string, toolResults: Array, intent: object, needsConfirmation?: boolean } | { hit: false }>}
 */
export async function tryZedFastPath({
  message,
  registry,
  requestContext,
  msgId = '',
  confirmed = false,
}) {
  if (process.env.ZED_FAST_PATH === '0') return { hit: false };

  const resolved = resolveZedIntent(message, requestContext);
  if (resolved.tier === 'llm' || !resolved.steps?.length) {
    return { hit: false };
  }

  if (resolved.needsConfirmation && !confirmed) {
    const text = buildConfirmationPreview(resolved);
    zedLog.orchestration('fast_path_confirm', {
      msgId,
      intent: resolved.intent,
      tier: resolved.tier,
      confidence: resolved.confidence,
    });
    recordFastPath({
      intent: resolved.intent,
      durationMs: 0,
      steps: resolved.steps.length,
      hit: true,
      needsConfirmation: true,
    });
    return {
      hit: true,
      needsConfirmation: true,
      intent: resolved,
      text,
      toolResults: [],
      body: {
        text,
        tool_results: [],
        model: 'zed-fast-path',
        msgId,
        meta: {
          fast_path: true,
          needs_confirmation: true,
          tier: resolved.tier,
          intent: resolved.intent,
          confidence: resolved.confidence,
          pending_steps: resolved.steps,
        },
      },
    };
  }

  const started = Date.now();
  zedLog.orchestration('fast_path', {
    msgId,
    intent: resolved.intent,
    tier: resolved.tier,
    steps: resolved.steps.length,
    confidence: resolved.confidence,
    matched: resolved.matched,
    source: requestContext?.source || 'text',
  });

  const toolResults = [];
  for (const step of resolved.steps) {
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

  recordFastPath({
    intent: resolved.intent,
    durationMs: duration,
    steps: resolved.steps.length,
    hit: true,
    needsConfirmation: false,
  });

  return {
    hit: true,
    intent: resolved,
    text,
    toolResults,
    body: {
      text,
      tool_results: toolResults,
      model: 'zed-fast-path',
      msgId,
      meta: {
        fast_path: true,
        tier: resolved.tier,
        intent: resolved.intent,
        confidence: resolved.confidence,
        duration_ms: duration,
        steps: resolved.steps.length,
      },
    },
  };
}

/**
 * Minimal SSE stream for fast path (same events useZedChat expects).
 */
export function createZedFastPathSseStream({
  text,
  toolResults,
  intent,
  msgId,
  model = 'zed-fast-path',
  meta = {},
}) {
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
            meta: {
              fast_path: true,
              intent: intent?.intent,
              steps: intent?.steps?.length || toolResults.length,
              ...meta,
            },
          })
        )
      );

      controller.close();
    },
  });
}

export default tryZedFastPath;
