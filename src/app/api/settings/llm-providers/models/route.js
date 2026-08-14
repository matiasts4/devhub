import { NextResponse } from 'next/server';
import { getCopilotToken } from '@/lib/copilot-token';
import {
  listXaiChatModels,
  resolveXaiOAuthAccessToken,
  isXaiOAuthMode,
} from '@/lib/xai-oauth';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

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
      // Copilot usa su propio endpoint y requiere token exchange
      return {
        baseUrl: 'https://api.githubcopilot.com',
        apiKey: config.COPILOT_OAUTH_TOKEN,
        modelsPath: '/models',
        isCopilot: true,
        headers: {
          'editor-version': 'vscode/1.85.1',
          'editor-plugin-version': 'copilot-chat/0.12.2023120701',
          'user-agent': 'GithubCopilot/1.138.0',
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
    case 'opencode': {
      return {
        isOpenCode: true,
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
    case 'minimax': {
      return {
        isMinimax: true,
      };
    }
    case 'kimi_code': {
      return {
        baseUrl: 'https://api.kimi.com/coding/v1',
        apiKey: config.KIMI_CODE_API_KEY,
        headers: {},
      };
    }
    case 'xai': {
      return {
        isXai: true,
        xaiConfig: config,
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

    if (reqConfig.isOpenCode) {
      try {
        const { stdout } = await execAsync('opencode models');
        const models = stdout
          .split('\n')
          .map((m) => m.trim())
          .filter((m) => m.length > 0);
        return NextResponse.json({
          models: [...new Set(models)].sort((a, b) => a.localeCompare(b)),
        });
      } catch (err) {
        return NextResponse.json({ models: [], error: `Error al obtener modelos: ${err.message}` });
      }
    }

    if (reqConfig.isMinimax) {
      // Static manifest — no HTTP call needed (D-6)
      return NextResponse.json({
        models: ['minimax-coding-plan/MiniMax-M2.7', 'minimax-coding-plan/MiniMax-M3'],
      });
    }

    if (reqConfig.isXai) {
      const cfg = reqConfig.xaiConfig || {};
      let accessToken = (cfg.XAI_API_KEY || '').trim();
      let authSource = accessToken ? 'api_key' : null;
      if ((!accessToken || isXaiOAuthMode(cfg)) && (cfg.XAI_OAUTH_REFRESH_TOKEN || cfg.XAI_OAUTH_ACCESS_TOKEN)) {
        try {
          const oauth = await resolveXaiOAuthAccessToken(cfg);
          if (oauth.accessToken) {
            accessToken = oauth.accessToken;
            authSource = 'oauth';
          }
        } catch {
          // Keep API key if OAuth refresh fails.
        }
      }
      const { models, sources, errors } = await listXaiChatModels({ accessToken });
      return NextResponse.json({
        models,
        sources,
        authSource,
        warnings: errors,
        ...(models.length ? {} : { error: errors[0] || 'No se pudieron obtener modelos de xAI' }),
      });
    }

    const baseUrl = normalizeBaseUrl(reqConfig.baseUrl);
    if (!baseUrl) {
      return NextResponse.json(
        { error: 'Base URL no configurada para este proveedor', models: [] },
        { status: 400 }
      );
    }

    // Para Copilot: intercambiar el gho_ por copilot_token
    let effectiveApiKey = reqConfig.apiKey;
    if (reqConfig.isCopilot) {
      if (!effectiveApiKey) {
        return NextResponse.json(
          { models: [], error: 'No configurado. Autenticáte con GitHub Copilot en Ajustes.' },
          { status: 200 }
        );
      }
      try {
        effectiveApiKey = await getCopilotToken(effectiveApiKey);
      } catch (err) {
        return NextResponse.json({ models: [], error: err.message }, { status: 200 });
      }
    }

    const headers = {
      'Content-Type': 'application/json',
      ...reqConfig.headers,
    };

    if (effectiveApiKey) {
      headers.Authorization = `Bearer ${effectiveApiKey}`;
    }

    const modelsPath = reqConfig.modelsPath || '/models';
    const response = await fetch(`${baseUrl}${modelsPath}`, {
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
    let models = extractModels(payload);

    if (reqConfig.isCopilot) {
      const openCodeModels = [
        'Claude Haiku 4.5',
        'Gemini 2.5 Pro',
        'Gemini 3 Flash (Preview)',
        'Gemini 3.1 Pro (Preview)',
        'GPT-4.1',
        'GPT-4o',
        'GPT-5 mini',
        'GPT-5.1',
        'GPT-5.2',
        'GPT-5.2-Codex',
        'GPT-5.3-Codex',
        'GPT-5.4 mini',
        'Grok Code Fast 1',
        'Raptor mini (Preview)',
      ];
      models = [...new Set([...models, ...openCodeModels])];
    }

    return NextResponse.json({
      models: [...new Set(models)].sort((a, b) => a.localeCompare(b)),
    });
  } catch (err) {
    return NextResponse.json({ models: [], error: err.message }, { status: 200 });
  }
}
