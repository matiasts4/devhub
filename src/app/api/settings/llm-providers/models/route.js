import { NextResponse } from 'next/server';

function normalizeBaseUrl(url) {
  if (!url) return null;
  return String(url).replace(/\/+$/, '');
}

function extractModels(payload) {
  if (!payload) return [];

  const arr = Array.isArray(payload)
    ? payload
    : Array.isArray(payload.data)
      ? payload.data
      : Array.isArray(payload.models)
        ? payload.models
        : [];

  return arr
    .map((m) => (typeof m === 'string' ? m : m?.id || m?.name || null))
    .filter((v) => typeof v === 'string' && v.trim().length > 0)
    .map((v) => v.trim());
}

function getProviderRequest(provider, config = {}) {
  switch (provider) {
    case 'copilot': {
      return {
        baseUrl: 'https://api.githubcopilot.com',
        apiKey: config.COPILOT_TOKEN,
        headers: {
          'Editor-Version': 'DevHub/1.0.0',
        },
      };
    }
    case 'openrouter': {
      return {
        baseUrl: 'https://openrouter.ai/api/v1',
        apiKey: config.OPENROUTER_API_KEY,
        headers: {},
      };
    }
    case 'zen': {
      return {
        baseUrl: config.ZEN_BASE_URL || 'https://zen.opencode.ai/v1',
        apiKey: config.ZEN_API_KEY,
        headers: {},
      };
    }
    case 'direct': {
      return {
        baseUrl: config.LLM_BASE_URL,
        apiKey: config.LLM_API_KEY,
        headers: {},
      };
    }
    default:
      return null;
  }
}

export async function POST(request) {
  try {
    const { provider, config } = await request.json();

    if (!provider) {
      return NextResponse.json({ error: 'Proveedor requerido' }, { status: 400 });
    }

    const reqConfig = getProviderRequest(provider, config || {});
    if (!reqConfig) {
      return NextResponse.json({ error: 'Proveedor desconocido' }, { status: 400 });
    }

    const baseUrl = normalizeBaseUrl(reqConfig.baseUrl);
    if (!baseUrl) {
      return NextResponse.json(
        { error: 'Base URL no configurada para este proveedor', models: [] },
        { status: 400 }
      );
    }

    const headers = {
      'Content-Type': 'application/json',
      ...reqConfig.headers,
    };

    if (reqConfig.apiKey) {
      headers.Authorization = `Bearer ${reqConfig.apiKey}`;
    }

    const response = await fetch(`${baseUrl}/models`, {
      method: 'GET',
      headers,
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      const msg = payload?.error?.message || payload?.message || `HTTP ${response.status}`;
      return NextResponse.json({ models: [], error: msg }, { status: 200 });
    }

    const payload = await response.json().catch(() => ({}));
    const models = extractModels(payload);

    return NextResponse.json({
      models: [...new Set(models)].sort((a, b) => a.localeCompare(b)),
    });
  } catch (err) {
    return NextResponse.json({ models: [], error: err.message }, { status: 200 });
  }
}
