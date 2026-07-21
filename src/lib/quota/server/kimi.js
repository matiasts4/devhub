import fs from 'fs';
import path from 'path';
import os from 'os';
import { PROVIDERS, PROVIDER_LABELS } from '../types.js';

/**
 * Server-side Kimi Code Quota Adapter.
 *
 * Mirrors the official Kimi Code CLI `/usage` implementation:
 * - OAuth credentials live in `~/.kimi-code/credentials/kimi-code.json`
 *   (legacy: `~/.kimi/credentials/kimi-code.json`).
 * - Short-lived access tokens are refreshed against
 *   `POST https://auth.kimi.com/api/oauth/token` (device-flow client).
 * - Usage data comes from `GET ${KIMI_CODE_BASE_URL || https://api.kimi.com/coding/v1}/usages`.
 *
 * The payload exposes the weekly quota (`usage`), rolling rate-limit
 * windows (`limits[]`, e.g. the 5-hour window) and the Extra Usage
 * ("booster") wallet. When no OAuth credentials exist but a Moonshot
 * API key is configured, we fall back to the open-platform balance.
 */

const KIMI_CODE_CLIENT_ID = '17e5f671-d194-4dfb-9706-5516cb48c098';
const TOKEN_REFRESH_SKEW_MS = 60_000;
const FIXED_POINT_CENTS = 1e6;

function kimiCodeBaseUrl() {
  return (process.env.KIMI_CODE_BASE_URL || 'https://api.kimi.com/coding/v1').replace(/\/+$/, '');
}

function oauthHost() {
  return (process.env.KIMI_CODE_OAUTH_HOST || process.env.KIMI_OAUTH_HOST || 'https://auth.kimi.com').replace(/\/+$/, '');
}

export async function fetchKimiQuota() {
  const result = {
    providerId: PROVIDERS.KIMI,
    displayName: PROVIDER_LABELS[PROVIDERS.KIMI],
    isAvailable: false,
    isAuth: false,
    primaryUsagePercent: 0,
    primaryRemainingPercent: 100,
    primaryResetAt: null,
    timeUntilResetMs: null,
    windows: [],
    metadata: {},
    lastUpdatedMs: Date.now(),
    error: null,
  };

  try {
    const cred = loadKimiCredentials();
    if (!cred) {
      return fetchMoonshotBalanceFallback(result);
    }

    result.isAvailable = true;

    const accessToken = await ensureFreshToken(cred);
    if (!accessToken) {
      result.error = 'Kimi OAuth token expired and refresh failed — run `kimi` and /login again';
      return result;
    }

    result.isAuth = true;

    const response = await fetch(`${kimiCodeBaseUrl()}/usages`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        'User-Agent': 'DevHub-QuotaEngine/1.0',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        result.isAuth = false;
        result.error = 'Kimi authentication invalid or expired — /login in the Kimi CLI';
        return result;
      }
      result.error = `Kimi usage endpoint HTTP ${response.status}`;
      return result;
    }

    const payload = await response.json();
    return applyKimiUsagePayload(result, payload);
  } catch (err) {
    result.error = err.message || 'Failed to fetch Kimi quota';
    return result;
  }
}

/**
 * Maps the raw `/usages` payload onto ProviderQuotaStatus.
 * Exported for unit testing.
 */
export function applyKimiUsagePayload(result, payload) {
  const windows = [];
  let maxUsage = 0;
  let earliestResetMs = null;
  let primaryResetAt = null;

  const pushRow = (raw, label) => {
    const limit = toInt(raw?.limit);
    const used = toInt(raw?.used);
    const remaining = toInt(raw?.remaining);
    if (limit === null && used === null && remaining === null) return;

    let usagePct = 0;
    if (limit && limit > 0) {
      const effectiveUsed = used !== null ? used : remaining !== null ? limit - remaining : 0;
      usagePct = Math.min(100, Math.max(0, (effectiveUsed / limit) * 100));
    }

    const resetAt = raw?.resetTime || raw?.reset_at || raw?.resetAt || raw?.reset_time || null;
    let resetMs = null;
    if (resetAt) {
      resetMs = Math.max(0, Date.parse(resetAt) - Date.now());
      if (Number.isFinite(resetMs) && (earliestResetMs === null || resetMs < earliestResetMs)) {
        earliestResetMs = resetMs;
        primaryResetAt = resetAt;
      }
    }

    if (usagePct > maxUsage) maxUsage = usagePct;

    windows.push({
      name: label,
      usagePercent: Math.round(usagePct * 10) / 10,
      remainingFraction: Math.round((100 - usagePct) * 10) / 1000,
      resetsAt: resetAt,
      timeUntilResetMs: Number.isFinite(resetMs) ? resetMs : null,
      isExhausted: usagePct >= 100,
    });
  };

  pushRow(payload?.usage, 'Weekly limit');

  if (Array.isArray(payload?.limits)) {
    payload.limits.forEach((item, idx) => {
      const detail = item?.detail && typeof item.detail === 'object' ? item.detail : item;
      pushRow(detail, kimiLimitLabel(item, detail, idx));
    });
  }

  const booster = parseBoosterWallet(payload?.boosterWallet);

  result.windows = windows;
  result.primaryUsagePercent = Math.round(maxUsage * 10) / 10;
  result.primaryRemainingPercent = Math.round((100 - maxUsage) * 10) / 10;
  result.primaryResetAt = primaryResetAt;
  result.timeUntilResetMs = earliestResetMs;

  const membership = payload?.user?.membership?.level || null;
  result.metadata = {
    membership: membership ? formatKimiLevel(membership) : null,
    membershipLevel: membership || null,
    region: payload?.user?.region?.replace(/^REGION_/, '') || null,
    authMethod: payload?.authentication?.method?.replace(/^METHOD_/, '') || 'ACCESS_TOKEN',
    parallelLimit: toInt(payload?.parallel?.limit),
    extraUsage: booster,
  };

  return result;
}

/** LEVEL_INTERMEDIATE → "Intermediate" (Kimi Code plan tier from the API). */
function formatKimiLevel(level) {
  const clean = String(level).replace(/^LEVEL_/, '').toLowerCase();
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

function kimiLimitLabel(item, detail, idx) {
  for (const key of ['name', 'title', 'scope']) {
    const v = item?.[key] ?? detail?.[key];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  const duration = toInt(item?.window?.duration ?? item?.duration ?? detail?.duration);
  const timeUnit = String(item?.window?.timeUnit ?? item?.timeUnit ?? detail?.timeUnit ?? '');
  if (duration !== null) {
    if (timeUnit.includes('MINUTE')) {
      if (duration >= 60 && duration % 60 === 0) return `${duration / 60}h limit`;
      return `${duration}m limit`;
    }
    if (timeUnit.includes('HOUR')) return `${duration}h limit`;
    if (timeUnit.includes('DAY')) return `${duration}d limit`;
    return `${duration}s limit`;
  }
  return `Limit #${idx + 1}`;
}

function parseBoosterWallet(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const balance = raw.balance;
  if (!balance || balance.type !== 'BOOSTER') return null;
  const total = toInt(balance.amount);
  if (total === null || total <= 0) return null;
  const left = toInt(balance.amountLeft);
  const cents = (v) => Math.round(v / FIXED_POINT_CENTS);
  return {
    totalCents: cents(total),
    balanceCents: left !== null ? cents(left) : 0,
    currency: raw.monthlyChargeLimit?.currency || raw.monthlyUsed?.currency || 'USD',
    monthlyChargeLimitEnabled: raw.monthlyChargeLimitEnabled === true,
    monthlyChargeLimitCents: raw.monthlyChargeLimit?.priceInCents ?? 0,
    monthlyUsedCents: raw.monthlyUsed?.priceInCents ?? 0,
  };
}

function toInt(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.trunc(value) : null;
  if (typeof value === 'string') {
    const n = Number(value);
    return Number.isFinite(n) ? Math.trunc(n) : null;
  }
  return null;
}

/**
 * Reads Kimi Code OAuth credentials. Prefers the newest non-legacy home
 * (`~/.kimi-code`) but supports the pre-migration `~/.kimi` layout.
 */
function loadKimiCredentials() {
  const home = process.env.KIMI_CODE_HOME || path.join(os.homedir(), '.kimi-code');
  const candidates = [
    path.join(home, 'credentials', 'kimi-code.json'),
    path.join(os.homedir(), '.kimi', 'credentials', 'kimi-code.json'),
  ];

  let best = null;
  for (const filePath of candidates) {
    try {
      if (!fs.existsSync(filePath)) continue;
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (!parsed || typeof parsed.access_token !== 'string') continue;
      const expiresAtMs = Number(parsed.expires_at) * 1000; // CLI stores epoch seconds
      if (!best || (Number.isFinite(expiresAtMs) && expiresAtMs > best.expiresAtMs)) {
        best = { filePath, data: parsed, expiresAtMs };
      }
    } catch (_err) {
      // try next candidate
    }
  }
  return best;
}

/**
 * Returns a valid access token, refreshing (and persisting) it when it is
 * expired or about to expire — same contract as the official CLI.
 */
async function ensureFreshToken(cred) {
  const { filePath, data, expiresAtMs } = cred;
  if (Number.isFinite(expiresAtMs) && Date.now() < expiresAtMs - TOKEN_REFRESH_SKEW_MS) {
    return data.access_token;
  }
  if (typeof data.refresh_token !== 'string' || !data.refresh_token) {
    // Token expired and nothing to refresh with — may still work briefly.
    return Number.isFinite(expiresAtMs) && Date.now() < expiresAtMs ? data.access_token : null;
  }

  const response = await fetch(`${oauthHost()}/api/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      client_id: KIMI_CODE_CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: data.refresh_token,
    }),
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) return null;

  const tokens = await response.json();
  if (typeof tokens.access_token !== 'string') return null;

  const updated = {
    ...data,
    access_token: tokens.access_token,
    refresh_token: typeof tokens.refresh_token === 'string' ? tokens.refresh_token : data.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + (Number(tokens.expires_in) || 3600),
    expires_in: Number(tokens.expires_in) || data.expires_in,
    scope: tokens.scope ?? data.scope,
    token_type: tokens.token_type ?? data.token_type,
  };

  try {
    fs.writeFileSync(filePath, JSON.stringify(updated, null, 2));
  } catch (_err) {
    // Non-fatal: the fresh token is still usable for this fetch.
  }

  return tokens.access_token;
}

/**
 * Fallback for users who only have a Moonshot open-platform API key
 * (no Kimi Code subscription): reports pay-as-you-go balance instead.
 */
async function fetchMoonshotBalanceFallback(result) {
  const apiKey = process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY || null;
  if (!apiKey) {
    result.error = 'No Kimi Code credentials found (~/.kimi-code/credentials)';
    return result;
  }

  result.isAvailable = true;

  try {
    const response = await fetch('https://api.moonshot.cn/v1/users/me/balance', {
      headers: { Authorization: `Bearer ${apiKey}`, 'User-Agent': 'DevHub-QuotaEngine/1.0' },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      result.error = `Moonshot balance endpoint HTTP ${response.status}`;
      return result;
    }

    const data = await response.json();
    const available = data?.data?.available_balance ?? 0;
    const voucher = data?.data?.voucher_balance ?? 0;
    const total = available + voucher;

    result.isAuth = true;
    result.primaryUsagePercent = 0;
    result.primaryRemainingPercent = total > 0 ? 100 : 0;
    result.metadata = { availableBalance: available, voucherBalance: voucher, mode: 'api-key' };
    result.windows.push({
      name: 'Moonshot Balance (API key)',
      usagePercent: total > 0 ? 0 : 100,
      remainingFraction: total > 0 ? 1 : 0,
      resetsAt: null,
      timeUntilResetMs: null,
      isExhausted: total <= 0,
    });
    return result;
  } catch (err) {
    result.error = err.message || 'Failed to fetch Moonshot balance';
    return result;
  }
}
