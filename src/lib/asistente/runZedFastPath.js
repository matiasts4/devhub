/**
 * Execute local intent router and build API/SSE payloads.
 */

import { resolveZedIntent } from './zedIntentRouter';
import { formatZedToolResultsReply } from './zedFastPathResponse';
import { encodeZedSseEvent } from './zedStreamProtocol';
import { labelForZedToolStart, labelForZedToolDone } from './zedToolLabels';
import { zedLog } from './utils/zed-logger';
import { recordFastPath } from './zedMetrics';
import { mergeOpensIntoRequestContext } from './runZedChatLoop';

function toolResultOk(result) {
  const r = result && typeof result === 'object' ? result : null;
  if (!r) return true;
  if (r.error === 'command_requires_approval') return true;
  if (r.action === 'would close' || r.action === 'would_execute') return true;
  return !r.error;
}

/** Tools / intents that must not short-circuit the connected LLM. */
const AGENT_OR_PROGRAM_TOOLS = new Set([
  'launch_agent_session',
  'launch_swarm',
  'create_plan',
  'execute_plan_step',
]);

/**
 * True when the local intent router would open/run an external agent TUI
 * (Grok, OpenCode, …) or multi-step agent work — those belong to the LLM path.
 *
 * @param {{ intent?: string, matched?: string, steps?: Array<{ tool?: string, input?: Record<string, unknown> }> }} resolved
 */
export function shouldDeferAgentIntentToLlm(resolved) {
  if (!resolved || !Array.isArray(resolved.steps)) return false;
  const intent = String(resolved.intent || '');
  const matched = String(resolved.matched || '');
  if (
    /launch_agent|open_terminal_agent|execute_agent|create_plan|launch_swarm/i.test(intent) ||
    /launch_agent|open_terminal_agent|execute_agent|create_plan/i.test(matched)
  ) {
    return true;
  }
  for (const step of resolved.steps) {
    if (!step) continue;
    if (AGENT_OR_PROGRAM_TOOLS.has(step.tool)) return true;
    if (step.tool === 'open_terminal' && step.input?.program) return true;
    if (step.tool === 'execute_in_terminal' && step.input?.program) return true;
  }
  return false;
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
  if (process.env.ZED_FAST_PATH === '0') {
    zedLog.orchestration('fast_path_disabled', {
      msgId,
      reason: 'ZED_FAST_PATH=0 — routing to connected LLM',
    });
    return { hit: false };
  }

  const resolved = resolveZedIntent(message, requestContext);
  if (resolved.tier === 'llm' || !resolved.steps?.length) {
    return { hit: false };
  }

  // Agent TUIs / multi-step agent launches must go through the connected model.
  // Fast-path is only for cheap local workspace ops (list/close/open empty shell/URL).
  // Spec: docs/designs/ZED-ARCHITECTURE-01-asistente-vs-agente.md §2–5
  // ("abre OpenCode" may open a panel, but orchestrating agent sessions is LLM/Agent mode).
  if (shouldDeferAgentIntentToLlm(resolved)) {
    zedLog.orchestration('fast_path_defer_llm', {
      msgId,
      intent: resolved.intent,
      matched: resolved.matched,
      reason: 'agent_or_program_launch',
    });
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
    // Keep catalog + display-name pool in sync across multi open_terminal steps.
    mergeOpensIntoRequestContext(requestContext, [{ tool: step.tool, result }]);
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

  zedLog.orchestration('fast_path_done', {
    msgId,
    intent: resolved.intent,
    matched: resolved.matched,
    steps: resolved.steps.length,
    duration_ms: duration,
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
        matched: resolved.matched,
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
