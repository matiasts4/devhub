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

async function callMinimax({ model, maxTokens, system, messages, apiKey }) {
  const body = {
    model,
    max_tokens: maxTokens,
    ...(system ? { system } : {}),
    messages,
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
  zedLog.info('API', `MiniMax response (${duration}ms)`, {
    contentTypes: data.content?.map((b) => b.type) || [],
  });
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
    const { message, context = {} } = body;

    if (!message?.trim()) {
      return NextResponse.json({ error: 'message is required' }, { status: 400 });
    }

    zedLog.sessionStart(msgId, message);

    const apiKey = process.env.MINIMAX_API_KEY || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      zedLog.error('CONFIG', 'No API key configured');
      return NextResponse.json({ error: 'No API key configured' }, { status: 500 });
    }

    let systemPrompt;
    try {
      systemPrompt = loadSystemPrompt();
    } catch (err) {
      zedLog.error('CONFIG', 'Failed to load system prompt', { error: err.message });
      return NextResponse.json({ error: err.message }, { status: 500 });
    }

    const conversation = [{ role: 'user', content: message }];
    let turn = 0;
    let finalText = '';
    let allToolResults = [];
    let meta = {};

    while (turn < MAX_TURNS) {
      turn++;
      zedLog.info('TURN', `Starting turn ${turn}`, {
        conversationLength: conversation.length,
      });

      let data;
      try {
        data = await callMinimax({
          model: MODEL,
          maxTokens: 2048,
          system: systemPrompt,
          messages: conversation,
          apiKey,
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

      const textBlocks = data.content.filter((b) => b.type === 'text');
      const thinkingBlocks = data.content.filter((b) => b.type === 'thinking');
      const rawText = textBlocks.map((b) => b.text).join('\n');

      zedLog.info('MODEL', `Raw response text (${rawText.length} chars)`, {
        preview: rawText.slice(0, 300),
      });

      const toolCalls = parseToolCalls(rawText);

      if (toolCalls.length > 0) {
        zedLog.info('MODEL', `Found ${toolCalls.length} tool call(s) in text`, {
          toolCalls,
        });

        for (const { name, input } of toolCalls) {
          // T-010a (C1) + T-015: if the model emitted a TOOL: with no PARAM:
          // lines, skip dispatch and surface the canonical "missing required
          // parameters" error as the tool result — BUT only when the tool
          // actually requires at least one parameter. Tools like
          // `list_terminals` and `get_swarm_status` legitimately accept zero
          // params and must be called with `{}`. See toolHasRequiredSchema.
          // Spec asistente-chat §5.1/§5.2.
          let effectiveInput = input;
          if (!effectiveInput || Object.keys(effectiveInput).length === 0) {
            const toolDef = buildRegistry().get(name);
            if (toolHasRequiredSchema(toolDef)) {
              const result = { error: 'missing required parameters' };
              zedLog.toolResult(name, result, 0);
              allToolResults.push({ tool: name, input: effectiveInput || {}, result });
              continue;
            }
            // No required params — dispatch with empty input.
            effectiveInput = {};
          }

          const toolStart = Date.now();
          zedLog.toolCall(name, effectiveInput);

          let result;
          try {
            result = await buildRegistry().execute(name, effectiveInput, context);
          } catch (err) {
            result = { error: err.message };
          }

          const duration = Date.now() - toolStart;
          zedLog.toolResult(name, result, duration);
          allToolResults.push({ tool: name, input: effectiveInput, result });
        }

        conversation.push({ role: 'assistant', content: rawText });

        // Push each tool result as a structured assistant-visible message
        // (parsed object, not stringified JSON) so the next model turn can
        // see the data directly.
        for (const r of allToolResults) {
          conversation.push({
            role: 'user',
            content: `Tool ${r.tool} result: ${JSON.stringify(r.result)}`,
          });
        }
      } else {
        finalText = rawText;
        if (!finalText.trim() && thinkingBlocks.length > 0) {
          finalText = '(El modelo está razonando, aún no tiene respuesta final...)';
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
