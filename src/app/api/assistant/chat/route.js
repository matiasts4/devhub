// Asistente ZED chat route. The textual `TOOL:` / `PARAM:` protocol is parsed
// by `parseToolCalls` (extracted in T-001), the system prompt lives at
// `docs/prompts/asistente/zed-system-prompt.md` and is loaded once at module
// init (D7), and the tool loop is bounded by `MAX_TURNS` (D6).
//
// Critical model id: `minimax-coding-plan/MiniMax-M3` (the older M2.7
// identifier returns 401 from `https://api.minimax.io/anthropic/v1/messages`).

import fs from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { ToolRegistry } from '@/lib/asistente/tools/registry';
import { parseToolCalls } from '@/lib/asistente/parseToolCalls';
import {
  terminalTool,
  listTerminalsTool,
  reviewTerminalTool,
  executeInTerminalTool,
  closeTerminalTool,
} from '@/lib/asistente/tools/terminal';
import { browserTool } from '@/lib/asistente/tools/browser';
import { fileTool, reviewLogFileTool } from '@/lib/asistente/tools/files';
import { swarmTool } from '@/lib/asistente/tools/swarm';
import { zedLog } from '@/lib/asistente/utils/zed-logger';
import { resolveZedApiKey } from '@/lib/asistente/resolveZedApiKey';
import { MAX_ZED_TERMINAL_PANELS } from '@/lib/terminal/workspaceTerminalLimits';

export const MODEL = 'minimax-coding-plan/MiniMax-M3';
export const BASE_URL = 'https://api.minimax.io/anthropic/v1/messages';

const PROMPT_PATH = path.join(
  process.cwd(),
  'docs',
  'prompts',
  'asistente',
  'zed-system-prompt.md'
);

function clamp(value, min, max) {
  if (Number.isNaN(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export let MAX_TURNS = clamp(parseInt(process.env.ZED_MAX_TURNS, 10) || 6, 1, 20);

let SYSTEM_PROMPT = null;
function loadSystemPrompt() {
  if (SYSTEM_PROMPT) return SYSTEM_PROMPT;
  if (!fs.existsSync(PROMPT_PATH)) {
    throw new Error(
      `System prompt not found at ${PROMPT_PATH}. Run \`mkdir -p docs/prompts/asistente\` and create the file.`
    );
  }
  SYSTEM_PROMPT = fs.readFileSync(PROMPT_PATH, 'utf8');
  return SYSTEM_PROMPT;
}

// Back-compat: tests may still import this name. Thin wrapper.
export async function buildZedSystemPrompt() {
  return loadSystemPrompt();
}

async function callMinimax({ model, maxTokens, system, messages, apiKey, tools }) {
  const body = {
    model,
    max_tokens: maxTokens,
    ...(system ? { system } : {}),
    messages,
    ...(tools && tools.length ? { tools } : {}),
  };

  const start = Date.now();
  const response = await fetch(BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });
  const duration = Date.now() - start;

  if (!response.ok) {
    const errText = await response.text();
    const err = new Error(`MiniMax API error ${response.status}: ${errText}`);
    err.upstream_status = response.status;
    throw err;
  }

  const data = await response.json();
  const contentTypes = data.content?.map((b) => b.type) || [];
  const hasToolUse = contentTypes.includes('tool_use');
  zedLog.info('API', `MiniMax response (${duration}ms)`, {
    contentTypes,
    hasToolUse,
  });
  // Also emit the detailed apiResponse for the readable log (includes tool_use flag)
  zedLog.apiResponse?.(duration, contentTypes, contentTypes.includes('text'), contentTypes.includes('thinking'), hasToolUse);
  return data;
}

function buildRegistry() {
  const registry = new ToolRegistry();
  registry.register(terminalTool);
  registry.register(listTerminalsTool);
  registry.register(reviewTerminalTool);
  registry.register(executeInTerminalTool);
  registry.register(closeTerminalTool);
  registry.register(browserTool);
  registry.register(fileTool);
  registry.register(reviewLogFileTool);
  registry.register(swarmTool);
  return registry;
}

// T-015: a tool's `parameters` schema may have zero required keys
// (e.g. list_terminals, get_swarm_status). The no-params check below MUST
// only short-circuit when at least one schema entry is `required: true`.
// Otherwise it incorrectly surfaces a canonical error for tools that
// legitimately accept zero parameters.
function toolHasRequiredSchema(toolDef) {
  if (!toolDef || !toolDef.parameters) return false;
  return Object.values(toolDef.parameters).some((p) => p && p.required === true);
}

export async function POST(request) {
  const msgId = Date.now().toString(36);

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'malformed body' }, { status: 400 });
    }
    const { message, context: clientContext = {}, history } = body;
    const requestContext = {
      ...clientContext,
      max_terminal_panels:
        Number(clientContext?.max_terminal_panels) || MAX_ZED_TERMINAL_PANELS,
      terminal_panel_count: Number(clientContext?.terminal_panel_count) || 0,
      _terminal_opens_this_request: 0,
    };

    // T-033: optional history array from the client. Allows the assistant to
    // remember recent turns. The server still owns the per-turn tool loop
    // (callMinimax + tool dispatch), but the cross-turn context now flows
    // through the wire. Capped at 20 messages client-side; reject malformed
    // entries server-side to keep the prompt well-formed.
    const safeHistory = Array.isArray(history)
      ? history
          .filter(
            (m) =>
              m &&
              typeof m === 'object' &&
              (m.role === 'user' || m.role === 'assistant') &&
              typeof m.content === 'string'
          )
          .slice(-20)
      : [];

    if (!message?.trim()) {
      return NextResponse.json({ error: 'message is required' }, { status: 400 });
    }

    zedLog.sessionStart(msgId, message);

    const { apiKey, source: apiKeySource } = resolveZedApiKey();
    if (!apiKey) {
      zedLog.error('CONFIG', 'No usable MiniMax API key configured', {
        hint: 'Set MINIMAX_API_KEY in .env.local (not a placeholder) or data/llm-providers-config.json providers.minimax.MINIMAX_API_KEY',
      });
      return NextResponse.json(
        {
          error:
            'No hay API key de MiniMax configurada. Revisá MINIMAX_API_KEY en .env.local o data/llm-providers-config.json.',
        },
        { status: 500 }
      );
    }
    zedLog.info('CONFIG', 'MiniMax API key resolved', { source: apiKeySource });

    let systemPrompt;
    try {
      systemPrompt = loadSystemPrompt();
    } catch (err) {
      zedLog.error('CONFIG', 'Failed to load system prompt', { error: err.message });
      return NextResponse.json({ error: err.message }, { status: 500 });
    }

    // T-033: prepend the client's history (if any), then append the current
    // user message as the last entry. Each per-turn tool loop iteration
    // still appends assistant + tool-result messages after this point —
    // those stay server-side and never round-trip.
    const conversation = [...safeHistory, { role: 'user', content: message }];
    const registry = buildRegistry();
    const anthropicTools = registry.toAnthropicTools();

    let turn = 0;
    let finalText = '';
    let allToolResults = [];
    let meta = {};

    while (turn < MAX_TURNS) {
      turn++;
      zedLog.info('TURN', `Starting turn ${turn}`, {
        conversationLength: conversation.length,
      });

      // T-031: collect THIS turn's tool results in a fresh array. The bug was
      // re-pushing the cumulative `allToolResults` into `conversation` each
      // turn, which made the prompt grow quadratically (1, 3, 6, 10, 15, …).
      // We still aggregate into `allToolResults` for the final response
      // payload, but the conversation only receives this turn's new entries.
      const turnToolResults = [];

      let data;
      try {
        data = await callMinimax({
          model: MODEL,
          maxTokens: 2048,
          system: systemPrompt,
          messages: conversation,
          apiKey,
          tools: anthropicTools,
        });
      } catch (err) {
        const upstreamStatus = err?.upstream_status;
        zedLog.error('API', 'MiniMax call failed', {
          error: err.message,
          upstream_status: upstreamStatus,
        });
        return NextResponse.json(
          {
            error: err.message,
            ...(upstreamStatus ? { upstream_status: upstreamStatus } : {}),
          },
          { status: 500 }
        );
      }

      if (!data.content || !Array.isArray(data.content)) {
        zedLog.error('API', 'No content in response', {
          data: JSON.stringify(data).slice(0, 300),
        });
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
        // Native Anthropic-style tool calling (preferred — no mangling, parsed inputs)
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
        // Legacy textual TOOL:/PARAM: fallback (for tests + transition)
        rawText = textBlocks.map((b) => b.text).join('\n');
        toolCalls = parseToolCalls(rawText);
      }

      zedLog.info('MODEL', `Raw response text (${rawText.length} chars)`, {
        preview: rawText.slice(0, 300),
        nativeToolUse: hasNativeToolUse,
        toolCallCount: toolCalls.length,
      });

      if (toolCalls.length > 0) {
        zedLog.info('MODEL', `Found ${toolCalls.length} tool call(s)`, {
          mode: hasNativeToolUse ? 'native' : 'textual',
          toolCalls: toolCalls.map((c) => ({ name: c.name, hasId: !!c.id })),
        });

        for (const tc of toolCalls) {
          const name = tc.name;
          let effectiveInput = tc.input || {};
          // T-010a (C1) + T-015: no-params handling (works for both modes)
          if (!effectiveInput || Object.keys(effectiveInput).length === 0) {
            const toolDef = registry.get(name);
            if (toolHasRequiredSchema(toolDef)) {
              const result = { error: 'missing required parameters' };
              zedLog.toolResult(name, result, 0);
              turnToolResults.push({ tool: name, input: effectiveInput || {}, result, id: tc.id });
              continue;
            }
            effectiveInput = {};
          }

          const toolStart = Date.now();
          zedLog.toolCall(name, effectiveInput);

          let result;
          try {
            result = await registry.execute(name, effectiveInput, requestContext);
          } catch (err) {
            result = { error: err.message };
          }

          const duration = Date.now() - toolStart;
          zedLog.toolResult(name, result, duration);
          turnToolResults.push({ tool: name, input: effectiveInput, result, id: tc.id });
        }

        // Feed back to conversation using the right format for the mode.
        // Native: use full content blocks + proper tool_result blocks (with id).
        // Textual (legacy): use the raw text containing TOOL: + "Tool xxx result: json" strings.
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
      } else {
        finalText = rawText;
        if (!finalText.trim() && thinkingBlocks.length > 0) {
          finalText =
            thinkingBlocks.map((b) => b.thinking || b.text || '').join('\n').trim() ||
            '(El modelo está razonando, aún no tiene respuesta final...)';
        }
        break;
      }

      // Check loop exit AFTER processing a turn
      if (turn >= MAX_TURNS) {
        meta.max_turns_reached = true;
        break;
      }
    }

    zedLog.sessionEnd(msgId, finalText, allToolResults.length);

    return NextResponse.json({
      text: finalText,
      tool_results: allToolResults,
      model: MODEL,
      msgId,
      ...(Object.keys(meta).length ? { meta } : {}),
    });
  } catch (error) {
    zedLog.error('FATAL', 'Unhandled exception', {
      error: error.message,
      stack: error.stack,
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
