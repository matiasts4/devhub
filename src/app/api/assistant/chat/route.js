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
import {
  terminalTool,
  listTerminalsTool,
  reviewTerminalTool,
  executeInTerminalTool,
  closeTerminalTool,
  closeAllTerminalsTool,
} from '@/lib/asistente/tools/terminal';
import { summarizeTerminalTool } from '@/lib/asistente/tools/summarizeTerminal';
import { browserTool, closeUrlTool } from '@/lib/asistente/tools/browser';
import { fileTool, reviewLogFileTool } from '@/lib/asistente/tools/files';
import { swarmTool } from '@/lib/asistente/tools/swarm';
import { zedLog } from '@/lib/asistente/utils/zed-logger';
import { resolveZedApiKey } from '@/lib/asistente/resolveZedApiKey';
import { MAX_ZED_TERMINAL_PANELS } from '@/lib/terminal/workspaceTerminalLimits';
import { runZedChatLoop, createZedSseStream } from '@/lib/asistente/runZedChatLoop';
import { tryZedFastPath, createZedFastPathSseStream } from '@/lib/asistente/runZedFastPath';

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

export let MAX_TURNS = clamp(parseInt(process.env.ZED_MAX_TURNS, 10) || 10, 1, 20);

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
  zedLog.apiResponse?.(
    duration,
    contentTypes,
    contentTypes.includes('text'),
    contentTypes.includes('thinking'),
    hasToolUse
  );
  return data;
}

function buildRegistry() {
  const registry = new ToolRegistry();
  registry.register(terminalTool);
  registry.register(listTerminalsTool);
  registry.register(reviewTerminalTool);
  registry.register(executeInTerminalTool);
  registry.register(closeTerminalTool);
  registry.register(closeAllTerminalsTool);
  registry.register(summarizeTerminalTool);
  registry.register(browserTool);
  registry.register(closeUrlTool);
  registry.register(fileTool);
  registry.register(reviewLogFileTool);
  registry.register(swarmTool);
  return registry;
}

// T-015: a tool's `parameters` schema may have zero required keys — see toolHasRequiredSchema in runZedChatLoop.

function wantsZedStream(request, body) {
  if (body?.stream === true) return true;
  const accept = request.headers.get('accept') || '';
  return accept.includes('text/event-stream');
}

function appendExecutionIntentHint(systemPrompt, message) {
  if (!message || typeof message !== 'string') return systemPrompt;
  const lower = message.toLowerCase();
  const runVerbs =
    /\b(ejecuta|ejecutar|corre|correr|run|execute|lanza|launch)\b/.test(lower) ||
    /\babre.*\b(y|and|con|with)\b.*\b(ejecut|run|npm|yarn|pnpm|ls|git)\b/.test(lower);
  const newTerminalWithAgent =
    /\b(nueva|nuevo|otra|otro|una\s+terminal)\b/.test(lower) &&
    /\b(opencode|open\s+code|codex|hermes)\b/.test(lower);
  let hint = '';
  if (runVerbs) {
    hint +=
      '\n\n### Turn hint\nThe user asked to run/execute something. Prefer `open_terminal({ command })` for new panels or `execute_in_terminal` for existing ones. Do not describe the action in prose only.';
  }
  if (newTerminalWithAgent) {
    hint +=
      '\n\n### Turn hint\nThe user asked for a NEW terminal with an agent TUI. Use `open_terminal({ program })` — do NOT `execute_in_terminal` into an existing panel unless they named one with "en [nombre]".';
  }
  return hint ? `${systemPrompt}${hint}` : systemPrompt;
}

export async function POST(request) {
  const msgId = Date.now().toString(36);

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'malformed body' }, { status: 400 });
    }
    const { message, context: clientContext = {}, history, source = 'text' } = body;
    const requestContext = {
      ...clientContext,
      source,
      max_terminal_panels: Number(clientContext?.max_terminal_panels) || MAX_ZED_TERMINAL_PANELS,
      terminal_panel_count: Number(clientContext?.terminal_panel_count) || 0,
      workspace_terminals: Array.isArray(clientContext?.workspace_terminals)
        ? clientContext.workspace_terminals
        : [],
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

    const registry = buildRegistry();

    if (body.confirm_tool && typeof body.confirm_tool === 'object') {
      const { tool, input: toolInput } = body.confirm_tool;
      if (typeof tool === 'string' && toolInput && typeof toolInput === 'object') {
        zedLog.orchestration('confirm_tool', { tool, input: toolInput });
        requestContext._zed_user_confirmed_close = tool === 'close_terminal';
        requestContext._zed_user_confirmed_command = tool === 'execute_in_terminal';
        let result;
        try {
          result = await registry.execute(tool, toolInput, requestContext);
        } catch (err) {
          result = { error: err.message };
        }
        const closeOk = tool === 'close_terminal' && result?.success === true && !result?.error;
        const execOk = tool !== 'close_terminal' && !result?.error;
        let text = 'Listo.';
        if (tool === 'close_terminal') {
          text = closeOk ? 'Listo. Terminal cerrada.' : 'No pude cerrar la terminal.';
        } else if (execOk) {
          text = 'Listo. Comando ejecutado.';
        } else {
          text = 'No pude completar la acción.';
        }
        return NextResponse.json({
          text,
          tool_results: [{ tool, input: toolInput, result }],
          model: MODEL,
          msgId,
        });
      }
    }

    zedLog.sessionStart(msgId, message);

    const fastPath = await tryZedFastPath({
      message,
      registry,
      requestContext,
      msgId,
      confirmed: body.confirmed === true,
    });
    if (fastPath.hit) {
      zedLog.sessionEnd(msgId, fastPath.text, fastPath.toolResults.length);
      if (wantsZedStream(request, body)) {
        zedLog.orchestration('fast_path_stream', { msgId, intent: fastPath.intent.intent });
        const stream = createZedFastPathSseStream({
          text: fastPath.text,
          toolResults: fastPath.toolResults,
          intent: fastPath.intent,
          msgId,
          meta: fastPath.body?.meta,
        });
        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
          },
        });
      }
      return NextResponse.json(fastPath.body);
    }

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
      systemPrompt = appendExecutionIntentHint(loadSystemPrompt(), message);
    } catch (err) {
      zedLog.error('CONFIG', 'Failed to load system prompt', { error: err.message });
      return NextResponse.json({ error: err.message }, { status: 500 });
    }

    const conversation = [...safeHistory, { role: 'user', content: message }];
    const anthropicTools = registry.toAnthropicTools();

    const loopParams = {
      systemPrompt,
      conversation,
      registry,
      anthropicTools,
      apiKey,
      requestContext,
      maxTurns: MAX_TURNS,
      callMinimax,
      model: MODEL,
    };

    if (wantsZedStream(request, body)) {
      zedLog.orchestration('stream_start', { msgId });
      const stream = createZedSseStream({ ...loopParams, msgId, model: MODEL });
      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
        },
      });
    }

    let finalText = '';
    let allToolResults = [];
    let meta = {};

    try {
      const loopResult = await runZedChatLoop(loopParams);
      finalText = loopResult.finalText;
      allToolResults = loopResult.allToolResults;
      meta = loopResult.meta;
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
