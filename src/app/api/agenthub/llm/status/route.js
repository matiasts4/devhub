import { NextResponse } from 'next/server';
import {
  getLlmProviderConfig,
  listLlmProviderKeys,
  listLlmProviderNames,
} from '@/lib/llmProviderConfig';

export const runtime = 'nodejs';

/**
 * Minimum required fields per provider family. A provider is "ready" iff it
 * has `enabled !== false` AND every field in this table for its family is
 * present and non-empty.
 *
 * Locked by `openspec/changes/planning-launch-hardening/tasks.md` §3.2
 * ("minimum required fields per provider") and the design §Decision 3
 * ("mirrors opencode/status shape").
 *
 * @type {Record<string, string[]>}
 */
const REQUIRED_FIELDS_BY_PROVIDER = Object.freeze({
  // Anthropic-compatible / minimax family — needs the base URL + model name.
  minimax: ['ANTHROPIC_BASE_URL', 'MINIMAX_MODEL'],
  // OpenRouter needs the model id.
  openrouter: ['OPENROUTER_MODEL'],
  // GitHub Copilot needs the OAuth token + model name.
  copilot: ['COPILOT_MODEL', 'COPILOT_OAUTH_TOKEN'],
  // OpenCode provider — only needs the model name (the runtime is local).
  opencode: ['OPENCODE_MODEL'],
});

/**
 * Determine the human-readable reason a provider is not ready.
 *
 * Pure function — exported so it can be unit-tested in isolation.
 *
 * @param {string} providerKey
 * @param {Record<string, string>} providerConfig
 * @returns {string|null} null if the provider IS ready, else a Spanish reason
 */
export function explainWhyNotReady(providerKey, providerConfig) {
  if (!providerConfig) {
    return `Proveedor ${providerKey} no está configurado.`;
  }
  if (providerConfig.enabled === false) {
    return `Proveedor ${providerKey} está deshabilitado.`;
  }
  const required = REQUIRED_FIELDS_BY_PROVIDER[providerKey] || [];
  for (const field of required) {
    const value = providerConfig[field];
    if (value === undefined || value === null || String(value).trim() === '') {
      return `Proveedor ${providerKey} falta campo ${field}.`;
    }
  }
  return null;
}

/**
 * GET /api/agenthub/llm/status
 *
 * Returns whether the local DevHub install has at least one enabled and
 * well-formed LLM provider configured. Used by the preflight gate in
 * `validatePlanningLaunch` to short-circuit planning launches when no model
 * is available.
 *
 * Response shape (200): `{ ready: boolean, provider: string|null, reason: string|null }`
 *   - `ready`    — true iff at least one provider is enabled and has the
 *                  minimum required fields for its family
 *   - `provider` — the human-readable name of the first ready provider, or
 *                  null when none is ready
 *   - `reason`   — Spanish string explaining the failure, or null when ready
 *
 * The response NEVER contains an API key, OAuth token, or any other secret
 * value: only the provider's short name (e.g. "minimax") is exposed.
 */
export async function GET() {
  try {
    const keys = await listLlmProviderKeys();
    const names = await listLlmProviderNames();

    if (!Array.isArray(keys) || keys.length === 0) {
      return NextResponse.json(
        {
          ready: false,
          provider: null,
          reason: 'No hay proveedor LLM habilitado. Configurá uno en Ajustes → LLM.',
        },
        { status: 200 }
      );
    }

    let firstSpecificReason = null;
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      const name = names[i] || key;
      const config = await getLlmProviderConfig(key);
      const why = explainWhyNotReady(key, config);
      if (why === null) {
        return NextResponse.json({ ready: true, provider: name, reason: null }, { status: 200 });
      }
      if (firstSpecificReason === null) {
        firstSpecificReason = why;
      }
    }

    // No provider was ready. Surface the most informative reason we found:
    // a per-provider diagnostic ("Proveedor X falta campo Y" / "está
    // deshabilitado") wins over the generic "no provider" stub. This gives
    // the preflight banner enough context to point at a concrete fix.
    const reason =
      firstSpecificReason || 'No hay proveedor LLM habilitado. Configurá uno en Ajustes → LLM.';

    return NextResponse.json({ ready: false, provider: null, reason }, { status: 200 });
  } catch (err) {
    console.error('[llm/status/route] Error:', err.message);
    return NextResponse.json(
      {
        ready: false,
        provider: null,
        reason: 'No se pudo leer la configuración de proveedores LLM.',
      },
      { status: 200 }
    );
  }
}
