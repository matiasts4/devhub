import { NextResponse } from 'next/server';

// Client ID del GitHub Copilot plugin (usado por OpenCode, aider, neovim-copilot, etc.)
const COPILOT_CLIENT_ID = 'Iv1.b507a08c87ecfe98';
const DEVICE_CODE_URL = 'https://github.com/login/device/code';

/**
 * POST /api/settings/llm-providers/copilot/device-flow
 * Inicia el GitHub Device Flow para autenticar con Copilot.
 *
 * Devuelve:
 *   { user_code, verification_uri, device_code, interval, expires_in }
 */
export async function POST() {
  try {
    const res = await fetch(DEVICE_CODE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_id: COPILOT_CLIENT_ID,
        scope: 'read:user',
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: `GitHub respondió ${res.status}: ${text}` },
        { status: 502 },
      );
    }

    const data = await res.json();

    // Validar que vienen los campos esperados
    if (!data.device_code || !data.user_code || !data.verification_uri) {
      return NextResponse.json(
        { error: 'Respuesta inesperada de GitHub Device Flow' },
        { status: 502 },
      );
    }

    return NextResponse.json({
      device_code: data.device_code,
      user_code: data.user_code,
      verification_uri: data.verification_uri,
      interval: data.interval ?? 5,
      expires_in: data.expires_in ?? 900,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
