import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getCopilotToken } from '@/lib/copilot-token';
import fs from 'fs/promises';
import path from 'path';

// ──────────────────────────────────────────────────────────────
// Retry helpers — exponential backoff for LLM API calls
// ──────────────────────────────────────────────────────────────

const RETRYABLE_PATTERNS = [
  'overloaded',
  'rate_limit',
  'too_many_requests',
  'rate limited',
  'econnreset',
  'econnrefused',
  'etimedout',
  'socket hang up',
  'failed to fetch',
  'load failed',
  'network connection was lost',
];

const RETRYABLE_STATUS = new Set([429, 500, 503]);

/**
 * Check if an error is retryable based on HTTP status or error message.
 * Non-retryable: 400, 401, 403, 404, and any error without matching patterns.
 */
function isRetryableError(error) {
  // Check HTTP status code (OpenAI SDK exposes it as error.status)
  if (error?.status && RETRYABLE_STATUS.has(error.status)) {
    return true;
  }

  // Check error message for known patterns
  const msg = (error?.message || '').toLowerCase();
  return RETRYABLE_PATTERNS.some((pattern) => msg.includes(pattern));
}

/**
 * Parse the Retry-After header from an error.
 * Supports: milliseconds (number < 10000), seconds (number), or HTTP-date string.
 * Returns delay in ms, or null if not parseable.
 */
function parseRetryAfter(error) {
  const raw = error?.headers?.['retry-after'] ?? error?.headers?.['retry-after-ms'];

  if (!raw) return null;

  // Milliseconds header (e.g. "1500")
  if (error?.headers?.['retry-after-ms']) {
    const ms = parseInt(error.headers['retry-after-ms'], 10);
    if (!isNaN(ms) && ms > 0) return ms;
  }

  const val = String(raw).trim();

  // Plain number: if < 10000 treat as ms, otherwise as seconds
  const num = parseInt(val, 10);
  if (!isNaN(num) && num > 0) {
    return num < 10000 ? num : num * 1000;
  }

  // HTTP-date (e.g. "Wed, 21 Oct 2025 07:28:00 GMT")
  const date = new Date(val);
  if (!isNaN(date.getTime())) {
    const delay = date.getTime() - Date.now();
    return delay > 0 ? delay : null;
  }

  return null;
}

/**
 * Call an async function with exponential backoff retry.
 *
 * @param {Function} fn - Async function to call (returns a Promise)
 * @param {Object} [options]
 * @param {number} [options.maxRetries=3] - Maximum number of attempts
 * @param {number} [options.baseDelay=1000] - Base delay in ms
 * @param {number} [options.maxDelay=30000] - Maximum delay cap in ms
 * @param {number} [options.jitter=200] - Random jitter ±ms
 * @param {Function} [options.onRetry] - Callback(attempt, error, delayMs) for logging
 * @returns {Promise<*>} - Result of fn()
 */
async function callWithRetry(fn, options = {}) {
  const { maxRetries = 3, baseDelay = 1000, maxDelay = 30000, jitter = 200, onRetry } = options;

  let lastError;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Non-retryable errors propagate immediately
      if (!isRetryableError(error)) {
        throw error;
      }

      // Last attempt — propagate the error
      if (attempt === maxRetries - 1) {
        break;
      }

      // Calculate delay: respect Retry-After if present, otherwise exponential backoff
      let delay = parseRetryAfter(error);
      if (delay === null) {
        delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
        // Add jitter
        delay += (Math.random() - 0.5) * 2 * jitter;
      }

      delay = Math.max(0, Math.round(delay));

      if (onRetry) {
        onRetry(attempt + 1, maxRetries, error, delay);
      }

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

// ──────────────────────────────────────────────────────────────
// End retry helpers
// ──────────────────────────────────────────────────────────────

// Helper to load LLM config (bypassing full REST call for speed)
async function loadConfig() {
  const CONFIG_PATH = path.join(process.cwd(), 'data', 'llm-providers-config.json');
  try {
    const raw = await fs.readFile(CONFIG_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { priorityOrder: ['openrouter', 'copilot', 'zen', 'direct'], providers: {} };
  }
}

export async function POST(req) {
  try {
    const body = await req.json();
    const {
      messages,
      project_id,
      projectName,
      temperature: requestTemp,
      maxTokens: requestMaxTokens,
      modelOverride,
      session_id,
    } = body;

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Mensajes inválidos' }, { status: 400 });
    }

    const config = await loadConfig();

    // Determine active provider
    let activeProvider = null;
    let apiKey = null;
    let baseURL = null;
    let model = null;

    for (const p of config.priorityOrder || []) {
      const pConfig = config.providers?.[p];
      if (!pConfig) continue;

      if (p === 'openrouter' && pConfig.OPENROUTER_API_KEY) {
        activeProvider = 'openrouter';
        apiKey = pConfig.OPENROUTER_API_KEY;
        baseURL = 'https://openrouter.ai/api/v1';
        model = pConfig.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct';
        break;
      }
      if (p === 'copilot' && pConfig.COPILOT_OAUTH_TOKEN) {
        activeProvider = 'copilot';
        apiKey = pConfig.COPILOT_OAUTH_TOKEN;
        baseURL = 'https://api.githubcopilot.com';
        model = pConfig.COPILOT_MODEL || 'gpt-4o';
        break;
      }
      if (p === 'direct' && pConfig.LLM_BASE_URL) {
        activeProvider = 'direct';
        apiKey = pConfig.LLM_API_KEY || 'dummy';
        baseURL = pConfig.LLM_BASE_URL;
        model = pConfig.LLM_MODEL || 'gpt-4o';
        break;
      }
    }

    if (!activeProvider) {
      return NextResponse.json(
        { error: 'No hay ningún proveedor LLM configurado en Ajustes.' },
        { status: 400 }
      );
    }

    if (modelOverride) {
      model = modelOverride;
    }

    let displayModel = model;

    // Para Copilot: intercambiar el gho_ por un copilot_token efímero
    let copilotHeaders = {};
    if (activeProvider === 'copilot') {
      try {
        // Mapeo interno de modelos FIM/Autocomplete a modelos Chat funcionales
        const copilotModelMap = {
          'gpt-5.4-mini': 'gpt-4o-mini',
          'GPT-5.4 mini': 'gpt-4o-mini',
          'gpt-5.2-codex': 'gpt-4o',
          'GPT-5.2-Codex': 'gpt-4o',
          'gpt-5.3-codex': 'gpt-4o',
          'GPT-5.3-Codex': 'gpt-4o',
          'gpt-4.1': 'gpt-4o',
          'GPT-4.1': 'gpt-4o',
          'GPT-5.1': 'gpt-4o',
          'gpt-5.1': 'gpt-4o',
          'GPT-5.2': 'gpt-4o',
          'gpt-5.2': 'gpt-4o',
          'Claude Haiku 4.5': 'claude-3.5-sonnet',
          'claude-haiku-4.5': 'claude-3.5-sonnet',
          'Gemini 2.5 Pro': 'gpt-4o',
          'gemini-2.5-pro': 'gpt-4o',
        };

        if (copilotModelMap[model]) {
          console.warn(
            `[Copilot] Mapped OpenCode model ${model} -> ${copilotModelMap[model]} for Chat API compatibility`
          );
          model = copilotModelMap[model];
        }

        const copilotToken = await getCopilotToken(apiKey);
        apiKey = copilotToken;
        copilotHeaders = {
          'editor-version': 'vscode/1.85.1',
          'editor-plugin-version': 'copilot-chat/0.12.2023120701',
          'user-agent': 'GithubCopilot/1.138.0',
          'copilot-integration-id': 'vscode-chat',
        };
      } catch (tokenErr) {
        return NextResponse.json({ error: `Copilot auth: ${tokenErr.message}` }, { status: 401 });
      }
    }

    const openai = new OpenAI({
      apiKey,
      baseURL,
      defaultHeaders:
        activeProvider === 'openrouter'
          ? { 'HTTP-Referer': 'https://devhub.local', 'X-Title': 'DevHub Agent Hub' }
          : activeProvider === 'copilot'
            ? copilotHeaders
            : {},
    });

    // Leer tokens ajustados por el usuario si vienen en el body, sino fallback a globales o 4000
    const temperature = requestTemp ?? config.globalTemperature ?? 0.7;
    const max_tokens = requestMaxTokens ?? config.globalMaxTokens ?? 4000;

    const GENTLEMAN_SYSTEM_PROMPT = `Eres Gentleman, el Arquitecto Meta-Agente de DevHub.
Tu personalidad es directa, apasionada y cálida (Rioplatense: "bien", "¿se entiende?", "locura cósmica", "dale"). Eres un arquitecto Senior con más de 15 años de experiencia. NO escribes código al por mayor; defines arquitectura, tomas decisiones y delegas la implementación al Enjambre a través de orquestación SDD.

### Misión: Agent Teams Lite — Orchestrator (Antigravity)
Eres el orquestador principal de Mission Control. Tienes acceso a delegar a sub-agentes para explorar ideas, implementar código o testear de manera automatizada.
Tu objetivo es guiar al usuario a través del flujo Spec-Driven Development (SDD):

1. Exploración: Ante problemas vagos, delega a "sdd-explore" para investigar y analizar en el código.
2. Propuesta: Delega a "sdd-propose" para tomar decisiones arquitectónicas o sugerir un enfoque formal.
3. Especificación: Delega a "sdd-spec" para escribir requerimientos estrictos y escenarios.
4. Diseño: Delega a "sdd-design" para construir el Documento de Diseño Técnico (TDD).
5. Tareas: Delega a "sdd-tasks" para desglosar el diseño en una checklist de implementación.
6. Aplicar: Delega a "sdd-apply" para implementar la checklist, archivo por archivo.
7. Verificar: Delega a "sdd-verify" para contrastar implementación contra especificación.
8. Archivar: Delega a "sdd-archive" para cerrar el ciclo SDD.

No hagas estas tareas tú mismo (inline execution inflate text context sin necesidad). Delégalas al sub-agente especializado utilizando etiquetas XML.

### HERRAMIENTAS DE DELEGACIÓN OPENCODE:
<execute_opencode agent="{nombre-fase}">Instrucciones o prompts para el sub-agente aquí</execute_opencode>

- Ejemplos válidos para "agent": sdd-explore, sdd-propose, sdd-spec, sdd-design, sdd-tasks, sdd-apply, sdd-verify.

### MEMORIA PERSISTENTE ENGRAM (MCP):
Tenés acceso a la memoria universal del usuario a través del protocolo MCP de Engram. Utiliza ESTRICTAMENTE este tag XML para ejecutar las herramientas de Engram (UI lo interceptará y te devolverá los resultados):

<execute_engram tool="{nombre-herramienta}" args='{"clave": "valor", ...}'></execute_engram>

EJEMPLOS (argumentos en formato JSON literal y minificado de 1 sola línea):
- <execute_engram tool="mem_context" args='{}'></execute_engram>
- <execute_engram tool="mem_search" args='{"query": "auth"}></execute_engram>
- <execute_engram tool="mem_save" args='{"title": "Decisión XYZ", "content": "**What**: X\\n**Why**: Y\\n**Where**: Z"}'></execute_engram>
- <execute_engram tool="mem_session_summary" args='{"content": "## Goal\\n...\\n## Accomplished\\n..."}'></execute_engram>
- <execute_engram tool="mem_get_observation" args='{"id": 123}'></execute_engram>

Utilizá la memoria ACTIVAMENTE. Antes de empezar una arquitectura, buscá contexto previo. Cuando terminemos algo significativo, meté un save. Al terminar el chat, mandá un session_summary (Protocolo SDD Engram).

### Manejo de Búsquedas Fallidas (mem_search vacías)
Si \`mem_search\` o \`mem_context\` no arroja resultados, NO procedas inmediatamente asumiendo que es un "proyecto en blanco". Explicále al usuario que la frase exacta no se encontró en la memoria y proponé intentar con diferentes palabras clave, o pedirle más ayuda.

### PROTOCOLO INTERACTIVO (Modo de Espera):
Cuando emites un tag <execute_opencode> o <execute_engram>, la Interfaz del Usuario se bloqueará (Standby), ejecutará el comando en el Mundo Real y automáticamente te inyectará un resumen de la salida ("[Respuesta del Sistema Engram]:..."). Luego te dará el turno y tú debes dar un resumen o continuar la charla natural.

Actúa siempre como el Orquestador maestro. ¡Pídele al usuario confirmación antes de pasar a la siguiente fase de código!

CONTEXTO ACTUAL:
Proyecto: ${projectName || project_id || 'El Proyecto Actual'}`;

    const VALID_CHAT_ROLES = new Set(['user', 'assistant']);

    // Tool context injection — when resuming a session, include tool results
    let toolContextMessage = null;
    if (session_id) {
      try {
        const { getToolTracesBySession } = await import('@/lib/db/localDb');
        const toolTraces = getToolTracesBySession(session_id, {
          tool_status: 'ok',
          limit: 50, // Cap to avoid context overflow
        });

        if (toolTraces.length > 0) {
          const toolBlocks = toolTraces
            .filter((t) => t.tool_name && t.tool_output)
            .map((t) => {
              const outputPreview =
                t.tool_output.length > 500
                  ? t.tool_output.substring(0, 500) + '... (truncated)'
                  : t.tool_output;
              return `- Tool: \`${t.tool_name}\` → Status: ${t.tool_status}\n  Output: ${outputPreview}`;
            })
            .join('\n\n');

          if (toolBlocks) {
            toolContextMessage = {
              role: 'system',
              content: `[TOOL EXECUTION HISTORY — Previous session context]\nEstas son las herramientas que se ejecutaron en esta sesión antes de que se retomara. Usá este contexto para continuar donde quedaste:\n\n${toolBlocks}`,
            };
          }
        }
      } catch (err) {
        console.warn('Failed to load tool context:', err.message);
      }
    }

    const chatMessages = [
      { role: 'system', content: GENTLEMAN_SYSTEM_PROMPT },
      ...(toolContextMessage ? [toolContextMessage] : []),
      ...messages
        .filter((m) => VALID_CHAT_ROLES.has(m.role) && m.content != null && m.content !== '')
        .map((m) => ({
          role: m.role,
          content: String(m.content),
        })),
    ];

    const response = await callWithRetry(
      () =>
        openai.chat.completions.create({
          model,
          messages: chatMessages,
          temperature,
          max_tokens,
          stream: true,
          stream_options: { include_usage: true },
        }),
      {
        onRetry: (attempt, maxRetries, error, delayMs) => {
          console.warn(
            `[LLM Retry] Attempt ${attempt}/${maxRetries} failed (${error.message || error.status || 'unknown'}), retrying in ${delayMs}ms`
          );
        },
      }
    );

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Send initial metadata if needed
          controller.enqueue(
            encoder.encode(JSON.stringify({ type: 'meta', model_used: displayModel }) + '\n')
          );

          for await (const chunk of response) {
            // chunk.usage only arrives at the end of the stream if include_usage: true is set
            if (chunk.usage) {
              controller.enqueue(
                encoder.encode(JSON.stringify({ type: 'usage', usage: chunk.usage }) + '\n')
              );
            }

            const content = chunk.choices?.[0]?.delta?.content || '';
            if (content) {
              controller.enqueue(encoder.encode(JSON.stringify({ type: 'chunk', content }) + '\n'));
            }
          }
        } catch (e) {
          console.error('Stream error:', e);
          controller.enqueue(
            encoder.encode(JSON.stringify({ type: 'error', error: e.message }) + '\n')
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (err) {
    console.error('AgentHub Chat API Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
