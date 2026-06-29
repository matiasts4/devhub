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
import { buildZedRegistry } from '@/lib/asistente/buildZedRegistry';
import { zedLog } from '@/lib/asistente/utils/zed-logger';
import { searchZedMemoriesServer, saveZedMemoryServer } from '@/lib/asistente/zedEngramServer';
import { detectMaliciousPrompt, createRateLimiter } from '@/lib/asistente/zedSecurityPolicy';
import { resolveZedApiKey } from '@/lib/asistente/resolveZedApiKey';
import { MAX_ZED_TERMINAL_PANELS } from '@/lib/terminal/workspaceTerminalLimits';
import { runZedChatLoop, createZedSseStream } from '@/lib/asistente/runZedChatLoop';
import { tryZedFastPath, createZedFastPathSseStream } from '@/lib/asistente/runZedFastPath';
import { callMinimax, BASE_URL } from '@/lib/asistente/minimaxClient';
import { fitHistoryWithinBudget, resolveMaxTokens } from '@/lib/asistente/zedContextBudget';
import { recordZedServerMetric } from '@/lib/asistente/zedServerMetrics';

export { BASE_URL };
export const MODEL = 'minimax-coding-plan/MiniMax-M3';

const chatRateLimiter = createRateLimiter({ maxCalls: 120, windowMs: 60000 });

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

// T-015: a tool's `parameters` schema may have zero required keys — see toolHasRequiredSchema in runZedChatLoop.

function wantsZedStream(request, body) {
  if (body?.stream === true) return true;
  const accept =
    typeof request?.headers?.get === 'function' ? request.headers.get('accept') || '' : '';
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

function appendMemoriesHint(systemPrompt, memories) {
  if (!Array.isArray(memories) || memories.length === 0) return systemPrompt;
  const lines = memories
    .map((m, i) => {
      if (typeof m === 'string') return `${i + 1}. ${m}`;
      const text = m.content || m.title || m.text || JSON.stringify(m);
      return `${i + 1}. ${text}`;
    })
    .join('\n');
  return `${systemPrompt}\n\n### Relevant memories\n${lines}\nUse these memories to personalize the response when relevant.`;
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

    const securityCheck = detectMaliciousPrompt(message);
    if (securityCheck.blocked) {
      zedLog.security?.('blocked_prompt', { message, reason: securityCheck.reason });
      return NextResponse.json(
        { error: 'Prompt rejected for security reasons', reason: securityCheck.reason },
        { status: 400 }
      );
    }

    const registry = buildZedRegistry();

    const memorySearch = await searchZedMemoriesServer({ query: message });
    requestContext.memories = memorySearch.memories || [];

    const persistInteraction = (finalText, turnToolResults = []) => {
      const hasValue = turnToolResults.length > 0 || finalText?.length > 20;
      if (!hasValue) return;
      saveZedMemoryServer({
        title: `Interacción Zed: ${message.slice(0, 60)}`,
        type: 'interaction',
        content: `Usuario: ${message}\nRespuesta: ${finalText || ''}\nHerramientas: ${JSON.stringify(turnToolResults)}`,
      }).catch(() => {});
    };

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
        persistInteraction(text, [{ tool, input: toolInput, result }]);
        return NextResponse.json({
          text,
          tool_results: [{ tool, input: toolInput, result }],
          model: MODEL,
          msgId,
        });
      }
    }

    if (!chatRateLimiter.canProceed()) {
      return NextResponse.json({ error: 'rate limit exceeded' }, { status: 429 });
    }
    chatRateLimiter.record();

    zedLog.sessionStart(msgId, message);

    const fastPath = await tryZedFastPath({
      message,
      registry,
      requestContext,
      msgId,
      confirmed: body.confirmed === true,
    });
    if (fastPath.hit) {
      recordZedServerMetric({
        type: 'fast_path_hit',
        durationMs: fastPath.body?.meta?.duration_ms || 0,
      });
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
      persistInteraction(fastPath.body?.text, fastPath.toolResults);
      return NextResponse.json(fastPath.body);
    }

    recordZedServerMetric({ type: 'fast_path_miss' });

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
      systemPrompt = appendMemoriesHint(systemPrompt, requestContext.memories);
    } catch (err) {
      zedLog.error('CONFIG', 'Failed to load system prompt', { error: err.message });
      return NextResponse.json({ error: err.message }, { status: 500 });
    }

    const budget = fitHistoryWithinBudget(systemPrompt, safeHistory);
    if (budget.droppedCount > 0) {
      zedLog.orchestration('context_budget_trim', {
        dropped: budget.droppedCount,
        estimatedInputTokens: budget.estimatedInputTokens,
      });
    }

    const conversation = [...budget.history, { role: 'user', content: message }];
    const anthropicTools = registry.toAnthropicTools();
    const maxTokens = resolveMaxTokens(message);

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
      maxTokens,
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

    const llmStart = Date.now();
    try {
      const loopResult = await runZedChatLoop(loopParams);
      finalText = loopResult.finalText;
      allToolResults = loopResult.allToolResults;
      meta = loopResult.meta;
    } catch (err) {
      recordZedServerMetric({ type: 'llm_error' });
      const upstreamStatus = err?.upstream_status;
      zedLog.error('API', 'MiniMax call failed', {
        error: err.message,
        upstream_status: upstreamStatus,
        stack: err.stack,
      });
      return NextResponse.json(
        {
          error: err.message,
          ...(upstreamStatus ? { upstream_status: upstreamStatus } : {}),
        },
        { status: 500 }
      );
    }

    recordZedServerMetric({
      type: 'llm_call',
      durationMs: Date.now() - llmStart,
      estimatedTokensIn: budget.estimatedInputTokens,
      estimatedTokensOut: Math.ceil((finalText || '').length / 4),
    });

    zedLog.sessionEnd(msgId, finalText, allToolResults.length);

    persistInteraction(finalText, allToolResults);
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
