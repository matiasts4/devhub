/**
 * GitHub Copilot Token Manager
 * Gestiona el ciclo de vida del copilot_token efímero (30 min TTL)
 * Mismo mecanismo que usa OpenCode / VS Code Copilot extension
 */

const COPILOT_INTERNAL_URL = 'https://api.github.com/copilot_internal/v2/token';
const EDITOR_VERSION = 'vscode/1.85.1';
const EDITOR_PLUGIN_VERSION = 'copilot-chat/0.12.2023120701';
const USER_AGENT = 'GithubCopilot/1.138.0';

// Cache en memoria — un singleton por proceso
let cached = {
  token: null,
  expiresAt: 0, // timestamp en ms
};

/**
 * Obtiene un copilot_token válido, refrescando automáticamente si está por vencer.
 * @param {string} oauthToken — el gho_... obtenido por Device Flow
 * @returns {Promise<string>} el copilot_token para usar en api.githubcopilot.com
 */
export async function getCopilotToken(oauthToken) {
  if (!oauthToken) throw new Error('COPILOT_OAUTH_TOKEN no configurado');

  const now = Date.now();
  // Refrescar si vence en menos de 5 minutos
  if (cached.token && cached.expiresAt - now > 5 * 60 * 1000) {
    return cached.token;
  }

  const token = await exchangeToken(oauthToken);
  return token;
}

/**
 * Intercambia el OAuth token por un copilot_token efímero.
 * Equivalente al step D del Device Flow.
 */
async function exchangeToken(oauthToken) {
  const res = await fetch(COPILOT_INTERNAL_URL, {
    method: 'GET',
    headers: {
      Authorization: `token ${oauthToken}`,
      'editor-version': EDITOR_VERSION,
      'editor-plugin-version': EDITOR_PLUGIN_VERSION,
      'user-agent': USER_AGENT,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = body?.message || `HTTP ${res.status}`;
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `Token OAuth inválido o sin acceso a Copilot. ¿Tenés una suscripción activa? (${msg})`,
      );
    }
    throw new Error(`Error obteniendo copilot_token: ${msg}`);
  }

  const data = await res.json();

  if (!data.token) {
    throw new Error('Respuesta inválida de copilot_internal: no hay token');
  }

  // El token viene como "tid=...;exp=1234567890;..."
  // Parseamos el campo exp para saber cuándo vence
  const expMatch = data.token.match(/exp=(\d+)/);
  const expiresAt = expMatch ? parseInt(expMatch[1]) * 1000 : Date.now() + 25 * 60 * 1000;

  cached = { token: data.token, expiresAt };
  return data.token;
}

/**
 * Invalida el cache (útil al desloguearse o cambiar token)
 */
export function clearCopilotTokenCache() {
  cached = { token: null, expiresAt: 0 };
}

/**
 * Verifica si el OAuth token puede obtener un copilot_token válido.
 * @returns {{ valid: boolean, error?: string }}
 */
export async function validateCopilotOAuth(oauthToken) {
  try {
    await exchangeToken(oauthToken);
    return { valid: true };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}
