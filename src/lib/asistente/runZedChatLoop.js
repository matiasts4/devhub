/**
 * Extracted Zed chat tool loop — shared by JSON and SSE responses.
 */

import { parseToolCalls } from './parseToolCalls';
import { zedLog } from './utils/zed-logger';
import { encodeZedSseEvent } from './zedStreamProtocol';
import { labelForZedToolStart, labelForZedToolDone } from './zedToolLabels';
import { mergeWorkspaceTerminalProcesses } from './workspaceTerminalRegistry';
import {
  isLlmShortCircuitEnabled,
  matchesShortCircuitableResults,
  shouldShortCircuitAfterTools,
} from './zedShortCircuit';
import { formatZedToolResultsReply } from './zedFastPathResponse';
import { streamMinimax } from './streamMinimax';
import { streamGrok } from './streamGrok';

export function toolHasRequiredSchema(toolDef) {
  if (!toolDef || !toolDef.parameters) return false;
  return Object.values(toolDef.parameters).some((p) => p && p.required === true);
}

/**
 * Merge opens from this request into context for mid-turn name resolution.
 *
 * @param {object} requestContext
 * @param {Array<{ tool: string, result: unknown }>} turnToolResults
 */
export function mergeOpensIntoRequestContext(requestContext, turnToolResults) {
  if (!requestContext || typeof requestContext !== 'object') return;
  const list = Array.isArray(requestContext.workspace_terminals)
    ? [...requestContext.workspace_terminals]
    : [];
  for (const entry of turnToolResults) {
    if (entry.tool !== 'open_terminal') continue;
    const r = entry.result;
    let parsed = r;
    if (typeof r === 'string') {
      try {
        parsed = JSON.parse(r);
      } catch {
        parsed = null;
      }
    }
    if (!parsed || parsed.error) continue;
    if (typeof parsed.terminalId !== 'string') continue;
    const existing = list.find((t) => t.terminalId === parsed.terminalId);
    const row = {
      terminalId: parsed.terminalId,
      displayName: parsed.displayName || parsed.terminalId,
      cwd: parsed.cwd || null,
    };
    if (existing) {
      Object.assign(existing, row);
    } else {
      list.push(row);
    }
  }
  requestContext.workspace_terminals = list;
}

/**
 * Execute a single tool call, emitting lifecycle events and returning the
 * normalized result. Used by both the parallel and sequential phases.
 *
 * @param {import('./tools/registry').ToolRegistry} registry
 * @param {object} requestContext
 * @param {{ name: string, input: object, id?: string }} tc
 * @param {(evt: { type: string, payload: unknown }) => void} emit
 */
async function executeSingleTool(registry, requestContext, tc, emit) {
  const name = tc.name;
  let effectiveInput = tc.input || {};
  if (!effectiveInput || Object.keys(effectiveInput).length === 0) {
    const toolDef = registry.get(name);
    if (toolHasRequiredSchema(toolDef)) {
      const result = { error: 'missing required parameters' };
      emit('tool_result', { tool: name, result, ok: false });
      return { tool: name, input: effectiveInput || {}, result, id: tc.id };
    }
    effectiveInput = {};
  }

  emit('tool_start', {
    tool: name,
    input: effectiveInput,
    label: labelForZedToolStart(name, effectiveInput),
  });
  zedLog.toolCall(name, effectiveInput);

  const toolStart = Date.now();
  let result;
  try {
    result = await registry.execute(name, effectiveInput, requestContext);
  } catch (err) {
    result = { error: err.message };
  }
  zedLog.toolResult(name, result, Date.now() - toolStart);

  const ok = !result?.error;
  emit('tool_result', {
    tool: name,
    input: effectiveInput,
    result,
    ok,
    label: ok ? labelForZedToolDone(name) : null,
  });

  return { tool: name, input: effectiveInput, result, id: tc.id };
}

/**
 * @param {object} params
 * @param {string} params.systemPrompt
 * @param {Array} params.conversation
 * @param {import('./tools/registry').ToolRegistry} params.registry
 * @param {Array} params.anthropicTools
 * @param {string} params.apiKey
 * @param {object} params.requestContext
 * @param {number} params.maxTurns
 * @param {typeof import('./minimaxClient').callMinimax} params.callMinimax Blocking call fn for the
 *   selected provider — route.js injects `callMinimax` or `callGrok` here (same signature/response
 *   shape, see grokClient.js).
 * @param {string} params.model
 * @param {number} [params.maxTokens]
 * @param {(evt: { type: string, payload: unknown }) => void} [params.onEvent]
 * @param {boolean} [params.enableStreaming] when true, use SSE streaming for lower TTFT
 * @param {'minimax'|'xai'|'kimi_code'} [params.provider] selects the streaming client
 * @param {string|null} [params.baseUrl] OpenAI-compatible URL for xai/kimi_code streaming
 * @returns {Promise<{ finalText: string, allToolResults: Array, meta: object }>}
 */
export async function runZedChatLoop({
  systemPrompt,
  conversation,
  registry,
  anthropicTools,
  apiKey,
  requestContext,
  maxTurns,
  callMinimax,
  model,
  maxTokens = 2048,
  onEvent = null,
  enableStreaming = false,
  provider = 'minimax',
  baseUrl = null,
}) {
  const emit = (type, payload) => {
    if (typeof onEvent === 'function') onEvent({ type, payload });
  };

  let turn = 0;
  let finalText = '';
  const allToolResults = [];
  const meta = {};

  while (turn < maxTurns) {
    turn++;
    zedLog.info('TURN', `Starting turn ${turn}`, { conversationLength: conversation.length });
    const turnToolResults = [];

    let data;
    let streamedThisTurn = false;
    try {
      if (enableStreaming) {
        streamedThisTurn = true;
        const streamFn =
          provider === 'minimax'
            ? streamMinimax
            : (streamParams) => streamGrok({ ...streamParams, baseUrl: baseUrl || undefined });
        const streamingResult = await streamFn({
          model,
          maxTokens,
          system: systemPrompt,
          messages: conversation,
          apiKey,
          tools: anthropicTools,
          onTextDelta: (text) => {
            if (text) emit('text_delta', { text });
          },
          onThinkingDelta: (thinking) => {
            if (thinking) emit('thinking', { thinking });
          },
        });
        data = {
          content: [
            ...(streamingResult.text ? [{ type: 'text', text: streamingResult.text }] : []),
            ...streamingResult.toolCalls.map((tc) => ({
              type: 'tool_use',
              id: tc.id,
              name: tc.name,
              input: tc.input,
            })),
          ],
        };
      } else {
        data = await callMinimax({
          model,
          maxTokens,
          system: systemPrompt,
          messages: conversation,
          apiKey,
          tools: anthropicTools,
        });
      }
    } catch (err) {
      emit('error', {
        message: err.message,
        upstream_status: err.upstream_status,
        retryable: err.retryable,
        attempt: err.attempt,
      });
      throw err;
    }

    if (!data.content || !Array.isArray(data.content)) {
      finalText = 'No pude procesar tu mensaje. Error interno.';
      break;
    }

    const content = data.content;
    const toolUseBlocks = content.filter((b) => b.type === 'tool_use');
    const textBlocks = content.filter((b) => b.type === 'text');
    const thinkingBlocks = content.filter((b) => b.type === 'thinking');

    const hasNativeToolUse = toolUseBlocks.length > 0;
    let toolCalls = [];
    let rawText = '';

    if (hasNativeToolUse) {
      toolCalls = toolUseBlocks.map((b) => ({
        name: b.name,
        input: b.input || {},
        id: b.id,
      }));
      rawText = textBlocks.map((b) => b.text || '').join('\n');
      if (!rawText.trim() && thinkingBlocks.length) {
        rawText = thinkingBlocks.map((b) => b.thinking || b.text || '').join('\n');
      }
    } else {
      rawText = textBlocks.map((b) => b.text).join('\n');
      toolCalls = parseToolCalls(rawText);
      if (toolCalls.length > 0) {
        zedLog.orchestration('legacy_tool_parse', { count: toolCalls.length });
      }
    }

    if (!streamedThisTurn && rawText.trim()) {
      emit('text_delta', { text: rawText });
    }

    if (toolCalls.length > 0) {
      const resultsByIndex = new Array(toolCalls.length);

      // Run parallel-safe tools concurrently while preserving call order for
      // the conversation history.
      await Promise.all(
        toolCalls.map(async (tc, i) => {
          const toolDef = registry.get(tc.name);
          if (toolDef?.parallel) {
            resultsByIndex[i] = await executeSingleTool(registry, requestContext, tc, emit);
          }
        })
      );

      // Run remaining tools sequentially (writes, UI mutators, etc.).
      for (let i = 0; i < toolCalls.length; i++) {
        if (!resultsByIndex[i]) {
          resultsByIndex[i] = await executeSingleTool(registry, requestContext, toolCalls[i], emit);
        }
      }

      turnToolResults.push(...resultsByIndex);

      if (hasNativeToolUse) {
        conversation.push({ role: 'assistant', content });
        for (const r of turnToolResults) {
          conversation.push({
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: r.id || `textual-${r.tool}`,
                content: JSON.stringify(r.result),
              },
            ],
          });
        }
      } else {
        conversation.push({ role: 'assistant', content: rawText });
        for (const r of turnToolResults) {
          conversation.push({
            role: 'user',
            content: `Tool ${r.tool} result: ${JSON.stringify(r.result)}`,
          });
        }
      }

      allToolResults.push(...turnToolResults);
      mergeOpensIntoRequestContext(requestContext, turnToolResults);

      if (matchesShortCircuitableResults(turnToolResults) && !isLlmShortCircuitEnabled()) {
        zedLog.orchestration('short_circuit_disabled', {
          turn,
          tools: turnToolResults.map((t) => t.tool),
          reason: 'ZED_LLM_SHORT_CIRCUIT=0 — continuing LLM turns',
        });
      }

      if (shouldShortCircuitAfterTools(turnToolResults)) {
        finalText = formatZedToolResultsReply(turnToolResults);
        meta.short_circuited = true;
        emit('text_delta', { text: finalText });
        zedLog.orchestration('short_circuit', {
          turn,
          tools: turnToolResults.map((t) => t.tool),
        });
        break;
      }
    } else {
      finalText = rawText;
      if (!finalText.trim() && thinkingBlocks.length > 0) {
        finalText =
          thinkingBlocks
            .map((b) => b.thinking || b.text || '')
            .join('\n')
            .trim() || '(El modelo está razonando, aún no tiene respuesta final...)';
      }
      break;
    }

    if (turn >= maxTurns) {
      meta.max_turns_reached = true;
      break;
    }
  }

  return { finalText, allToolResults, meta };
}

/**
 * Build a ReadableStream of SSE events from the loop.
 *
 * @param {Parameters<typeof runZedChatLoop>[0] & { msgId: string, model: string }} params
 */
export function createZedSseStream(params) {
  const encoder = new TextEncoder();
  let controllerRef = null;

  return new ReadableStream({
    async start(controller) {
      controllerRef = controller;
      try {
        const { finalText, allToolResults, meta } = await runZedChatLoop({
          ...params,
          enableStreaming: true,
          onEvent: ({ type, payload }) => {
            controller.enqueue(encoder.encode(encodeZedSseEvent(type, payload)));
          },
        });
        controller.enqueue(
          encoder.encode(
            encodeZedSseEvent('done', {
              text: finalText,
              tool_results: allToolResults,
              model: params.model,
              msgId: params.msgId,
              meta,
            })
          )
        );
        controller.close();
      } catch (err) {
        controller.enqueue(
          encoder.encode(
            encodeZedSseEvent('error', {
              message: err.message,
              upstream_status: err.upstream_status,
            })
          )
        );
        controller.close();
      }
    },
    cancel() {
      controllerRef = null;
    },
  });
}

export { mergeWorkspaceTerminalProcesses };
