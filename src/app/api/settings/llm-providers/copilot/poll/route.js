import { NextResponse } from 'next/server';
import { readFile, writeFile } from 'fs/promises';
import path from 'path';
import { clearCopilotTokenCache } from '@/lib/copilot-token';

const COPILOT_CLIENT_ID = 'Iv1.b507a08c87ecfe98';
const ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const COPILOT_INTERNAL_URL = 'https://api.github.com/copilot_internal/v2/token';
const EDITOR_VERSION = 'vscode/1.85.1';
const EDITOR_PLUGIN_VERSION = 'copilot-chat/0.12.2023120701';
const CONFIG_PATH = path.join(process.cwd(), 'data', 'llm-providers-config.json');

/**
 * POST /api/settings/llm-providers/copilot/poll
 * Body: { device_code: string }
 *
 * Hace una ronda de polling al token endpoint de GitHub.
 * Devuelve:
 *   { status: "pending" }                        — usuario aún no autorizó
 *   { status: "success", username: string }      — autenticado correctamente
 *   { status: "expired" }                        — el device_code venció (15 min)
 *   { status: "error", error: string }           — error no recuperable
 */
export async function POST(request) {
  try {
    const { device_code } = await request.json();

    if (!device_code) {
      return NextResponse.json({ error: 'device_code requerido' }, { status: 400 });
    }

    // — Step C: Poll por el OAuth token —
    const tokenRes = await fetch(ACCESS_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_id: COPILOT_CLIENT_ID,
        device_code,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
      signal: AbortSignal.timeout(10000),
    });

    const tokenData = await tokenRes.json().catch(() => ({}));

    // Aún esperando que el usuario autorice
    if (tokenData.error === 'authorization_pending') {
      return NextResponse.json({ status: 'pending' });
    }

    // El device_code venció
    if (tokenData.error === 'expired_token') {
      return NextResponse.json({ status: 'expired' });
    }

    // El usuario denegó el acceso
    if (tokenData.error === 'access_denied') {
      return NextResponse.json({ status: 'error', error: 'Acceso denegado por el usuario' });
    }

    // Otros errores
    if (tokenData.error) {
      return NextResponse.json({
        status: 'error',
        error: tokenData.error_description || tokenData.error,
      });
    }

    const oauthToken = tokenData.access_token;
    if (!oauthToken) {
      return NextResponse.json({ status: 'error', error: 'No se recibió access_token' });
    }

    // — Step D: Verificar que el token puede acceder a Copilot —
    const copilotRes = await fetch(COPILOT_INTERNAL_URL, {
      method: 'GET',
      headers: {
        Authorization: `token ${oauthToken}`,
        'editor-version': EDITOR_VERSION,
        'editor-plugin-version': EDITOR_PLUGIN_VERSION,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!copilotRes.ok) {
      const body = await copilotRes.json().catch(() => ({}));
      return NextResponse.json({
        status: 'error',
        error:
          copilotRes.status === 401 || copilotRes.status === 403
            ? 'Tu cuenta no tiene una suscripción activa a GitHub Copilot'
            : body?.message || `HTTP ${copilotRes.status}`,
      });
    }

    // — Obtener username para mostrarlo en la UI —
    const userRes = await fetch('https://api.github.com/user', {
      headers: { Authorization: `token ${oauthToken}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    }).catch(() => null);

    const userData = userRes?.ok ? await userRes.json().catch(() => ({})) : {};
    const username = userData.login || 'usuario';

    // — Persistir el OAuth token en el config JSON —
    await persistOAuthToken(oauthToken);

    // Limpiar cache de tokens en memoria para forzar re-exchange con el nuevo token
    clearCopilotTokenCache();

    return NextResponse.json({ status: 'success', username });
  } catch (err) {
    return NextResponse.json({ status: 'error', error: err.message });
  }
}

async function persistOAuthToken(oauthToken) {
  let config = {};
  try {
    const raw = await readFile(CONFIG_PATH, 'utf-8');
    config = JSON.parse(raw);
  } catch {
    // Si no existe, crear estructura base
    config = { providers: {}, priorityOrder: ['copilot'], bridgeEnabled: true };
  }

  if (!config.providers) config.providers = {};
  if (!config.providers.copilot) config.providers.copilot = {};

  // Guardar el nuevo token OAuth, quitar el PAT viejo
  config.providers.copilot.COPILOT_OAUTH_TOKEN = oauthToken;
  delete config.providers.copilot.COPILOT_TOKEN;

  // Setear modelo por defecto si no hay uno
  if (!config.providers.copilot.COPILOT_MODEL) {
    config.providers.copilot.COPILOT_MODEL = 'gpt-4o';
  }

  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}
