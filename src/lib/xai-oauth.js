/**
 * xAI SuperGrok / X Premium+ OAuth (device-code + refresh).
 *
 * Same public client_id and scopes OpenCode uses for subscription auth —
 * no XAI_API_KEY required. Tokens are stored in data/llm-providers-config.json
 * under providers.xai.
 *
 * Discovery: https://auth.x.ai/.well-known/openid-configuration
 * Device verification UI: https://accounts.x.ai/oauth2/device (also x.ai/device)
 */

export const XAI_OAUTH_ISSUER = 'https://auth.x.ai';
export const XAI_OAUTH_CLIENT_ID = 'b1a00492-073a-47ea-816f-4c329264a828';
export const XAI_OAUTH_SCOPE = 'openid profile email offline_access grok-cli:access api:access';
export const XAI_DEVICE_CODE_URL = `${XAI_OAUTH_ISSUER}/oauth2/device/code`;
export const XAI_TOKEN_URL = `${XAI_OAUTH_ISSUER}/oauth2/token`;
export const XAI_USERINFO_URL = `${XAI_OAUTH_ISSUER}/oauth2/userinfo`;
export const XAI_API_BASE = 'https://api.x.ai/v1';
/** SuperGrok / Grok Build CLI catalog (subscription surface). */
export const XAI_CLI_MODELS_URL = 'https://cli-chat-proxy.grok.com/v1/models';

/**
 * Models always offered for SuperGrok OAuth even if a catalog endpoint lags.
 * Composer 2.5 lives mainly on the CLI catalog; grok-4.5 is on both API + CLI.
 */
export const XAI_SUBSCRIPTION_PINNED_MODELS = [
  'grok-4.5',
  'grok-composer-2.5-fast',
  'grok-build-0.1',
  'grok-4.3',
  'grok-4.20-0309-non-reasoning',
  'grok-4.20-0309-reasoning',
  'grok-4.20-multi-agent-0309',
];

/** Models that are not useful for Zed chat (image/video generation). */
const NON_CHAT_MODEL_RE = /imagine|image|video|tts|voice|embedding|whisper/i;

/** Refresh a few minutes before expiry to avoid mid-request 401s. */
const REFRESH_SKEW_MS = 2 * 60 * 1000;

/** @type {{ access: string|null, expiresAt: number }} */
let cached = { access: null, expiresAt: 0 };

/**
 * Start RFC 8628 device authorization.
 * @returns {Promise<{ device_code: string, user_code: string, verification_uri: string, verification_uri_complete?: string, interval: number, expires_in: number }>}
 */
export async function startXaiDeviceFlow() {
  const res = await fetch(XAI_DEVICE_CODE_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: XAI_OAUTH_CLIENT_ID,
      scope: XAI_OAUTH_SCOPE,
    }).toString(),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`xAI device code failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  if (!data.device_code || !data.user_code || !data.verification_uri) {
    throw new Error('xAI device code response missing required fields');
  }

  return {
    device_code: data.device_code,
    user_code: data.user_code,
    verification_uri: data.verification_uri,
    verification_uri_complete: data.verification_uri_complete || null,
    interval: data.interval ?? 5,
    expires_in: data.expires_in ?? 1800,
  };
}

/**
 * One poll round for the device-code grant.
 * @param {string} deviceCode
 * @returns {Promise<
 *   | { status: 'pending' }
 *   | { status: 'slow_down', interval?: number }
 *   | { status: 'expired' }
 *   | { status: 'denied', error: string }
 *   | { status: 'error', error: string }
 *   | { status: 'success', access_token: string, refresh_token: string, expires_at: number, token_type?: string }
 * >}
 */
export async function pollXaiDeviceFlow(deviceCode) {
  if (!deviceCode) {
    return { status: 'error', error: 'device_code requerido' };
  }

  const res = await fetch(XAI_TOKEN_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      device_code: deviceCode,
      client_id: XAI_OAUTH_CLIENT_ID,
    }).toString(),
    signal: AbortSignal.timeout(15000),
  });

  const data = await res.json().catch(() => ({}));

  if (data.error === 'authorization_pending') {
    return { status: 'pending' };
  }
  if (data.error === 'slow_down') {
    return { status: 'slow_down', interval: data.interval };
  }
  if (data.error === 'expired_token') {
    return { status: 'expired' };
  }
  if (data.error === 'access_denied') {
    return { status: 'denied', error: 'Acceso denegado en la suscripción de xAI' };
  }
  if (data.error) {
    return {
      status: 'error',
      error: data.error_description || data.error,
    };
  }

  if (!data.access_token) {
    return { status: 'error', error: 'No se recibió access_token de xAI' };
  }

  const expiresInSec = Number(data.expires_in) || 3600;
  return {
    status: 'success',
    access_token: data.access_token,
    refresh_token: data.refresh_token || '',
    expires_at: Date.now() + expiresInSec * 1000,
    token_type: data.token_type || 'Bearer',
  };
}

/**
 * Refresh an access token with the stored refresh_token.
 * @param {string} refreshToken
 * @returns {Promise<{ access_token: string, refresh_token: string, expires_at: number }>}
 */
export async function refreshXaiAccessToken(refreshToken) {
  if (!refreshToken) {
    throw new Error('xAI OAuth: falta refresh_token — volvé a iniciar sesión SuperGrok');
  }

  const res = await fetch(XAI_TOKEN_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: XAI_OAUTH_CLIENT_ID,
    }).toString(),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`xAI token refresh failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  if (!data.access_token) {
    throw new Error('xAI token refresh did not return access_token');
  }

  const expiresInSec = Number(data.expires_in) || 3600;
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token || refreshToken,
    expires_at: Date.now() + expiresInSec * 1000,
  };
}

/**
 * Best-effort username/email for the settings UI.
 * @param {string} accessToken
 * @returns {Promise<string>}
 */
export async function fetchXaiUsername(accessToken) {
  try {
    const res = await fetch(XAI_USERINFO_URL, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return 'SuperGrok';
    const data = await res.json();
    return data.email || data.name || data.preferred_username || data.sub || 'SuperGrok';
  } catch {
    return 'SuperGrok';
  }
}

/**
 * Validate OAuth credentials can talk to the chat API (or at least refresh).
 * @param {{ accessToken?: string, refreshToken?: string }} tokens
 * @returns {Promise<{ valid: boolean, error?: string }>}
 */
export async function validateXaiOAuth({ accessToken, refreshToken } = {}) {
  try {
    let token = accessToken;
    if ((!token || token.length < 16) && refreshToken) {
      const refreshed = await refreshXaiAccessToken(refreshToken);
      token = refreshed.access_token;
    }
    if (!token) {
      return {
        valid: false,
        error: 'No hay sesión SuperGrok. Iniciá sesión desde Ajustes > Modelo de Zed.',
      };
    }

    const res = await fetch(`${XAI_API_BASE}/models`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(12000),
    });

    if (res.ok) return { valid: true };
    if (res.status === 401 || res.status === 403) {
      // Try one refresh if we only had a stale access token.
      if (refreshToken && accessToken) {
        try {
          const refreshed = await refreshXaiAccessToken(refreshToken);
          const retry = await fetch(`${XAI_API_BASE}/models`, {
            headers: {
              Authorization: `Bearer ${refreshed.access_token}`,
              Accept: 'application/json',
            },
            signal: AbortSignal.timeout(12000),
          });
          if (retry.ok) return { valid: true };
        } catch (err) {
          return { valid: false, error: err.message };
        }
      }
      return {
        valid: false,
        error:
          'Sesión SuperGrok inválida o sin acceso a la API. ¿Tenés SuperGrok / X Premium+ activo?',
      };
    }

    const body = await res.json().catch(() => ({}));
    return {
      valid: false,
      error: body?.error?.message || `HTTP ${res.status}`,
    };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

/**
 * Resolve a usable Bearer access token from an xai provider config row.
 * Refreshes and returns updated tokens when the access token is near expiry.
 *
 * @param {object|null|undefined} xaiConfig providers.xai row
 * @returns {Promise<{
 *   accessToken: string|null,
 *   source: 'xai-oauth'|'xai-oauth-refresh'|null,
 *   updated?: { access_token: string, refresh_token: string, expires_at: number }
 * }>}
 */
export async function resolveXaiOAuthAccessToken(xaiConfig) {
  if (!xaiConfig || xaiConfig.enabled === false) {
    return { accessToken: null, source: null };
  }

  const access =
    typeof xaiConfig.XAI_OAUTH_ACCESS_TOKEN === 'string'
      ? xaiConfig.XAI_OAUTH_ACCESS_TOKEN.trim()
      : '';
  const refresh =
    typeof xaiConfig.XAI_OAUTH_REFRESH_TOKEN === 'string'
      ? xaiConfig.XAI_OAUTH_REFRESH_TOKEN.trim()
      : '';
  const expiresAt = Number(xaiConfig.XAI_OAUTH_EXPIRES_AT) || 0;

  if (!access && !refresh) {
    return { accessToken: null, source: null };
  }

  const now = Date.now();
  if (access && expiresAt - now > REFRESH_SKEW_MS) {
    if (cached.access === access && cached.expiresAt === expiresAt) {
      return { accessToken: access, source: 'xai-oauth' };
    }
    cached = { access, expiresAt };
    return { accessToken: access, source: 'xai-oauth' };
  }

  // In-memory cache still valid (e.g. refreshed earlier this process).
  if (cached.access && cached.expiresAt - now > REFRESH_SKEW_MS) {
    return { accessToken: cached.access, source: 'xai-oauth' };
  }

  if (!refresh) {
    // Stale access token without refresh — try it anyway.
    return access
      ? { accessToken: access, source: 'xai-oauth' }
      : { accessToken: null, source: null };
  }

  try {
    const refreshed = await refreshXaiAccessToken(refresh);
    cached = { access: refreshed.access_token, expiresAt: refreshed.expires_at };
    return {
      accessToken: refreshed.access_token,
      source: 'xai-oauth-refresh',
      updated: refreshed,
    };
  } catch (err) {
    // Refresh revoked/expired — keep using a still-valid access token if present.
    if (access && expiresAt > now) {
      return { accessToken: access, source: 'xai-oauth' };
    }
    if (access) {
      // Last resort: expired access may still work briefly; caller will surface 401 if not.
      return { accessToken: access, source: 'xai-oauth' };
    }
    throw err;
  }
}

export function clearXaiOAuthCache() {
  cached = { access: null, expiresAt: 0 };
}

/**
 * Whether the xai provider row is configured for subscription OAuth.
 * @param {object|null|undefined} xaiConfig
 */
export function isXaiOAuthMode(xaiConfig) {
  if (!xaiConfig) return false;
  const mode =
    typeof xaiConfig.XAI_AUTH_MODE === 'string' ? xaiConfig.XAI_AUTH_MODE.trim().toLowerCase() : '';
  if (mode === 'oauth' || mode === 'subscription' || mode === 'supergrok') return true;
  if (mode === 'api_key' || mode === 'api' || mode === 'key') return false;
  // Implicit: tokens present and no explicit api_key mode.
  return Boolean(
    (xaiConfig.XAI_OAUTH_REFRESH_TOKEN && String(xaiConfig.XAI_OAUTH_REFRESH_TOKEN).trim()) ||
    (xaiConfig.XAI_OAUTH_ACCESS_TOKEN && String(xaiConfig.XAI_OAUTH_ACCESS_TOKEN).trim())
  );
}

/**
 * Extract model ids from OpenAI-style or CLI-style list payloads.
 * @param {unknown} payload
 * @returns {string[]}
 */
function extractModelIds(payload) {
  if (!payload || typeof payload !== 'object') return [];
  const arr = Array.isArray(payload)
    ? payload
    : Array.isArray(payload.data)
      ? payload.data
      : Array.isArray(payload.models)
        ? payload.models
        : [];
  return arr
    .map((m) => {
      if (typeof m === 'string') return m;
      return m?.id || m?.model || m?.name || null;
    })
    .filter((v) => typeof v === 'string' && v.trim())
    .map((v) => v.trim());
}

/**
 * @param {string} url
 * @param {string} accessToken
 * @returns {Promise<string[]>}
 */
async function fetchModelIdsFromUrl(url, accessToken) {
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${url} → HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}`);
  }
  const payload = await res.json().catch(() => ({}));
  return extractModelIds(payload);
}

/**
 * Live model catalog for Zed/xAI.
 *
 * Sources (merged):
 * 1. `GET https://api.x.ai/v1/models` — API catalog (grok-4.5, grok-build-0.1, 4.3, …)
 * 2. `GET https://cli-chat-proxy.grok.com/v1/models` — SuperGrok/Grok Build surface
 *    (grok-4.5, grok-composer-2.5-fast) — same place native Grok/OpenCode subscription sees Composer
 * 3. Pinned subscription chat models as a safety net when either endpoint lags
 *
 * Image/video models are filtered out (not used by Zed chat).
 *
 * @param {object} [opts]
 * @param {string} [opts.accessToken] Bearer token (API key or OAuth access)
 * @param {boolean} [opts.includeSubscriptionCatalog=true] also hit CLI proxy
 * @param {boolean} [opts.pinSubscriptionModels=true]
 * @returns {Promise<{ models: string[], sources: string[], errors: string[] }>}
 */
export async function listXaiChatModels({
  accessToken,
  includeSubscriptionCatalog = true,
  pinSubscriptionModels = true,
} = {}) {
  if (!accessToken) {
    return {
      models: pinSubscriptionModels ? [...XAI_SUBSCRIPTION_PINNED_MODELS] : [],
      sources: pinSubscriptionModels ? ['pinned'] : [],
      errors: ['No access token for xAI model list'],
    };
  }

  const sources = [];
  const errors = [];
  const ids = new Set();

  const jobs = [{ name: 'api.x.ai/v1/models', url: `${XAI_API_BASE}/models`, always: true }];
  if (includeSubscriptionCatalog) {
    jobs.push({
      name: 'cli-chat-proxy.grok.com',
      url: XAI_CLI_MODELS_URL,
      always: false,
    });
  }

  await Promise.all(
    jobs.map(async (job) => {
      try {
        const list = await fetchModelIdsFromUrl(job.url, accessToken);
        for (const id of list) {
          if (!NON_CHAT_MODEL_RE.test(id)) ids.add(id);
        }
        sources.push(job.name);
      } catch (err) {
        errors.push(`${job.name}: ${err.message}`);
      }
    })
  );

  if (pinSubscriptionModels) {
    for (const id of XAI_SUBSCRIPTION_PINNED_MODELS) ids.add(id);
    if (!sources.includes('pinned')) sources.push('pinned');
  }

  // Prefer newer / coding models near the top, then alpha sort the rest.
  const priority = new Map(XAI_SUBSCRIPTION_PINNED_MODELS.map((id, i) => [id, i]));
  const models = [...ids].sort((a, b) => {
    const pa = priority.has(a) ? priority.get(a) : 1000;
    const pb = priority.has(b) ? priority.get(b) : 1000;
    if (pa !== pb) return pa - pb;
    return a.localeCompare(b);
  });

  return { models, sources, errors };
}
