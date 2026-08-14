// Asistente ZED chat route. The textual `TOOL:` / `PARAM:` protocol is parsed
// by `parseToolCalls` (extracted in T-001), the system prompt lives at
// `docs/prompts/asistente/zed-system-prompt.md` and is loaded once at module
// init (D7), and the tool loop is bounded by `MAX_TURNS` (D6).
//
// Provider/model are resolved per-request by `resolveZedLlmConfig()`:
// defaults to Grok (xai, OpenAI-compatible) when XAI_API_KEY is configured,
// else falls back to MiniMax. `ZED_LLM_PROVIDER=minimax` forces MiniMax.
//
// Critical MiniMax model id: `minimax-coding-plan/MiniMax-M3` (the older
// M2.7 identifier returns 401 from `https://api.minimax.io/anthropic/v1/messages`).

import fs from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { getZedRegistry } from '@/lib/asistente/buildZedRegistry';
import { createZedPerf } from '@/lib/asistente/zedPerf';
import { zedLog } from '@/lib/asistente/utils/zed-logger';
import { searchZedMemoriesServer, saveZedMemoryServer } from '@/lib/asistente/zedEngramServer';
import { detectMaliciousPrompt } from '@/lib/asistente/zedSecurityPolicy';
import { resolveZedLlmConfig } from '@/lib/asistente/resolveZedApiKey';
import { MAX_ZED_TERMINAL_PANELS } from '@/lib/terminal/workspaceTerminalLimits';
import { runZedChatLoop, createZedSseStream } from '@/lib/asistente/runZedChatLoop';
import { tryZedFastPath, createZedFastPathSseStream } from '@/lib/asistente/runZedFastPath';
import { callMinimax } from '@/lib/asistente/minimaxClient';
import { callGrok, BASE_URL as GROK_BASE_URL } from '@/lib/asistente/grokClient';
import { checkZedRateLimit } from '@/lib/asistente/zedRateLimit';
import { fitHistoryWithinBudget, resolveMaxTokens } from '@/lib/asistente/zedContextBudget';
import { recordZedServerMetric } from '@/lib/asistente/zedServerMetrics';
import { recordZedTelemetryEvent } from '@/lib/asistente/zedTelemetry';

function recordZedTelemetry(payload) {
  // Avoid opening a durable DB connection in unit/integration tests that
  // change cwd to a temp directory; telemetry is covered by dedicated tests.
  if (process.env.NODE_ENV === 'test') return;
  try {
    recordZedTelemetryEvent(payload);
  } catch (err) {
    // Telemetry is best-effort; never fail a user request because of it.
    zedLog.info('TELEMETRY', 'Failed to record telemetry', { error: err.message });
  }
}
import { getCurrentUser } from '@/lib/auth/apiAuth';

/** @deprecated Prefer GROK_BASE_URL / provider-specific base URLs */
export const BASE_URL = GROK_BASE_URL;
// Legacy export: the MiniMax fallback model id. The actual per-request model
// is resolved by resolveZedLlmConfig() (may be Grok's model instead).
export const MODEL = 'minimax-coding-plan/MiniMax-M3';

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
  const reviewOutput =
    /\b(qu[eé]\s+respondi[oó]|qu[eé]\s+dijo|resum[ií]|resume|summarize|revisa\s+(el\s+)?output|qu[eé]\s+pasa\s+en)\b/.test(
      lower
    );
  let hint = '';
  if (runVerbs) {
    hint +=
      '\n\n### Turn hint\nThe user asked to run/execute something. Prefer `open_terminal({ command })` for new panels or `execute_in_terminal` for existing ones. Do not describe the action in prose only.';
  }
  if (newTerminalWithAgent) {
    hint +=
      '\n\n### Turn hint\nThe user asked for a NEW terminal with an agent TUI. Use `open_terminal({ program })` — do NOT `execute_in_terminal` into an existing panel unless they named one with "en [nombre]".';
  }
  if (reviewOutput) {
    hint +=
      '\n\n### Turn hint\nThe user asked what a terminal/agent said. Call `summarize_terminal` (or `review_terminal_output`) with the panel `name` from the open-terminals snapshot — answer from `tail`/`digest`, do not invent output.';
  }
  return hint ? `${systemPrompt}${hint}` : systemPrompt;
}

/** Inject client terminal snapshot so the LLM can resolve names without an extra list turn. */
export function appendWorkspaceTerminalsHint(systemPrompt, terminals) {
  if (!Array.isArray(terminals) || terminals.length === 0) {
    return `${systemPrompt}\n\n### Open workspace terminals\nNone reported by the client. Call \`list_terminals\` if you need current state.`;
  }
  const lines = terminals
    .map((t) => {
      if (!t || typeof t !== 'object') return null;
      const name = t.displayName || t.terminalId || '?';
      const id = t.terminalId ? ` id=${t.terminalId}` : '';
      const program = t.program ? ` program=${t.program}` : '';
      return `- ${name}${id}${program}`;
    })
    .filter(Boolean)
    .join('\n');
  return `${systemPrompt}\n\n### Open workspace terminals (client snapshot)\n${lines}\nPrefer these display names with \`close_terminal\` / \`execute_in_terminal\` / \`summarize_terminal\`. Call \`list_terminals\` if the snapshot may be stale.`;
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
    let user = null;
    try {
      user = await getCurrentUser();
    } catch (err) {
      zedLog.info('AUTH', 'getCurrentUser failed', { error: err.message });
    }

    const requireAuth = process.env.ZED_REQUIRE_AUTH === 'true';
    if (requireAuth && !user) {
      return NextResponse.json(
        { error: 'Authentication required', code: 'AUTH_REQUIRED' },
        { status: 401 }
      );
    }

    const userId = user?.id || 'anonymous';

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'malformed body' }, { status: 400 });
    }
    const { message, context: clientContext = {}, history, source = 'text' } = body;
    const requestContext = {
      ...clientContext,
      source,
      user_id: userId,
      email: user?.email || null,
      authenticated: Boolean(user),
      project_id: clientContext?.project_id || process.env.DEVHUB_PROJECT_ID || null,
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
      recordZedTelemetry({
        eventType: 'zed.security.blocked_prompt',
        userId,
        messageId: msgId,
        payload: { reason: securityCheck.reason, messageLength: message.length },
      });
      return NextResponse.json(
        { error: 'Prompt rejected for security reasons', reason: securityCheck.reason },
        { status: 400 }
      );
    }

    const perf = createZedPerf(msgId);
    const registry = getZedRegistry();
    perf.mark('registry_build');

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

    const rateLimit = await checkZedRateLimit(userId);
    perf.mark('rate_limit');
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'rate limit exceeded', retry_after_ms: rateLimit.resetMs },
        { status: 429 }
      );
    }

    zedLog.sessionStart(msgId, message);

    const fastPath = await tryZedFastPath({
      message,
      registry,
      requestContext,
      msgId,
      confirmed: body.confirmed === true,
    });
    perf.mark('fast_path');
    if (fastPath.hit) {
      recordZedServerMetric({
        type: 'fast_path_hit',
        durationMs: fastPath.body?.meta?.duration_ms || 0,
      });
      recordZedTelemetry({
        eventType: 'zed.fast_path_hit',
        userId,
        messageId: msgId,
        payload: {
          intent: fastPath.intent?.intent,
          durationMs: fastPath.body?.meta?.duration_ms || 0,
          toolCount: fastPath.toolResults.length,
        },
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
        perf.flush();
        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
          },
        });
      }
      persistInteraction(fastPath.body?.text, fastPath.toolResults);
      perf.flush();
      return NextResponse.json(fastPath.body);
    }

    recordZedServerMetric({ type: 'fast_path_miss' });
    recordZedTelemetry({
      eventType: 'zed.fast_path_miss',
      userId,
      messageId: msgId,
      payload: { intent: fastPath.intent?.intent },
    });

    const [memorySearch, llmConfig] = await Promise.all([
      searchZedMemoriesServer({ query: message }),
      resolveZedLlmConfig(),
    ]);
    requestContext.memories = memorySearch.memories || [];
    perf.mark('memory_and_config');

    const {
      apiKey,
      source: apiKeySource,
      provider: llmProvider,
      model: llmModel,
      baseUrl: llmBaseUrl,
    } = llmConfig;
    if (!apiKey) {
      zedLog.error('CONFIG', 'No usable LLM API key configured', {
        hint: 'Set XAI_API_KEY, KIMI_CODE_API_KEY, or MINIMAX_API_KEY in .env.local, login SuperGrok OAuth, or configure data/llm-providers-config.json.',
      });
      return NextResponse.json(
        {
          error:
            'No hay credenciales de LLM. Revisá Ajustes > Zed > Modelo: Grok (API key o suscripción SuperGrok), Kimi Code o MiniMax.',
        },
        { status: 500 }
      );
    }
    zedLog.info('CONFIG', 'Zed LLM config resolved', {
      provider: llmProvider,
      model: llmModel,
      source: apiKeySource,
      baseUrl: llmBaseUrl,
    });
    const callLlm =
      llmProvider === 'minimax'
        ? callMinimax
        : (params) => callGrok({ ...params, baseUrl: llmBaseUrl || GROK_BASE_URL });

    let systemPrompt;
    try {
      systemPrompt = appendExecutionIntentHint(loadSystemPrompt(), message);
      systemPrompt = appendWorkspaceTerminalsHint(systemPrompt, requestContext.workspace_terminals);
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
    perf.mark('prompt_and_budget');

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
      callMinimax: callLlm,
      model: llmModel,
      maxTokens,
      provider: llmProvider,
      baseUrl: llmBaseUrl,
    };

    if (wantsZedStream(request, body)) {
      zedLog.orchestration('stream_start', { msgId });
      const stream = createZedSseStream({ ...loopParams, msgId, model: llmModel });
      perf.flush();
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
      recordZedTelemetry({
        eventType: 'zed.llm_error',
        userId,
        messageId: msgId,
        payload: { upstream_status: err?.upstream_status ?? null, message: err.message },
      });
      const upstreamStatus = err?.upstream_status;
      zedLog.error('API', `${llmProvider} call failed`, {
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

    const llmDurationMs = Date.now() - llmStart;
    recordZedServerMetric({
      type: 'llm_call',
      durationMs: llmDurationMs,
      estimatedTokensIn: budget.estimatedInputTokens,
      estimatedTokensOut: Math.ceil((finalText || '').length / 4),
    });
    recordZedTelemetry({
      eventType: 'zed.llm_call',
      userId,
      messageId: msgId,
      payload: {
        durationMs: llmDurationMs,
        estimatedTokensIn: budget.estimatedInputTokens,
        estimatedTokensOut: Math.ceil((finalText || '').length / 4),
        toolCount: allToolResults.length,
        model: llmModel,
      },
    });

    zedLog.sessionEnd(msgId, finalText, allToolResults.length);

    perf.mark('llm_loop');
    persistInteraction(finalText, allToolResults);
    perf.flush();
    return NextResponse.json({
      text: finalText,
      tool_results: allToolResults,
      model: llmModel,
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
