import fs from 'fs';
import path from 'path';
import os from 'os';
import { PROVIDERS, PROVIDER_LABELS } from '../types.js';

/**
 * Server-side OpenAI Codex Quota Adapter.
 *
 * Reads the OAuth session written by `codex login` (`~/.codex/auth.json`)
 * and queries the ChatGPT backend usage endpoint — the same mechanism the
 * Codex CLI uses for its own rate-limit display:
 *
 *   GET https://chatgpt.com/backend-api/wham/usage
 *   Authorization: Bearer <tokens.access_token>
 *   ChatGPT-Account-Id: <tokens.account_id>   (when present)
 *
 * Response: { plan_type, rate_limit: { primary_window, secondary_window },
 *             code_review_rate_limit, credits: { balance } }
 * Each window: { used_percent, reset_at (unix seconds), limit_window_seconds }.
 */

const CODEX_USAGE_URL = 'https://chatgpt.com/backend-api/wham/usage';
const CODEX_USAGE_URL_ALT = 'https://chatgpt.com/api/codex/usage';
const FIVE_HOUR_SECONDS = 5 * 60 * 60;
const SEVEN_DAY_SECONDS = 7 * 24 * 60 * 60;

export async function fetchCodexQuota() {
  const result = {
    providerId: PROVIDERS.CODEX,
    displayName: PROVIDER_LABELS[PROVIDERS.CODEX],
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
    const creds = loadCodexCredentials();
    if (!creds) {
      result.error = 'No Codex OAuth session found (~/.codex/auth.json) — run `codex login`';
      return result;
    }

    result.isAvailable = true;
    result.isAuth = true;

    const payload = await fetchCodexUsage(creds);
    if (payload.error) {
      if (payload.status === 401 || payload.status === 403) result.isAuth = false;
      result.error = payload.error;
      return result;
    }

    return applyCodexUsagePayload(result, payload);
  } catch (err) {
    result.error = err.message || 'Failed to fetch Codex quota';
    return result;
  }
}

async function fetchCodexUsage(creds) {
  const headers = {
    Authorization: `Bearer ${creds.accessToken}`,
    Accept: 'application/json',
    'User-Agent': 'DevHub-QuotaEngine/1.0',
  };
  if (creds.accountId) headers['ChatGPT-Account-Id'] = creds.accountId;

  for (const url of [CODEX_USAGE_URL, CODEX_USAGE_URL_ALT]) {
    try {
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
      if (response.status === 404) continue; // try the alternate path
      if (!response.ok)
        return { error: `Codex usage endpoint HTTP ${response.status}`, status: response.status };
      return await response.json();
    } catch (err) {
      return { error: err.message || 'Codex usage request failed' };
    }
  }
  return { error: 'Codex usage endpoint not found (404 on both paths)' };
}

/**
 * Maps the raw wham/usage payload onto ProviderQuotaStatus.
 * Exported for unit testing.
 */
export function applyCodexUsagePayload(result, payload) {
  const windows = [];
  let maxUsage = 0;
  let earliestResetMs = null;
  let primaryResetAt = null;

  const pushWindow = (name, window) => {
    if (!window || typeof window.used_percent !== 'number') return;
    const usagePct = Math.min(100, Math.max(0, window.used_percent));

    let resetAt = null;
    let resetMs = null;
    if (window.reset_at > 0) {
      resetAt = new Date(window.reset_at * 1000).toISOString();
      resetMs = Math.max(0, window.reset_at * 1000 - Date.now());
      if (earliestResetMs === null || resetMs < earliestResetMs) {
        earliestResetMs = resetMs;
        primaryResetAt = resetAt;
      }
    }

    if (usagePct > maxUsage) maxUsage = usagePct;

    windows.push({
      name,
      usagePercent: Math.round(usagePct * 10) / 10,
      remainingFraction: Math.round((100 - usagePct) * 10) / 1000,
      resetsAt: resetAt,
      timeUntilResetMs: resetMs,
      isExhausted: usagePct >= 100,
    });
  };

  const primary = payload?.rate_limit?.primary_window || null;
  const secondary = payload?.rate_limit?.secondary_window || null;

  if (primary) {
    pushWindow(codexPrimaryWindowName(payload?.plan_type, primary, secondary), primary);
  }
  if (secondary) {
    pushWindow('Weekly All-Model', secondary);
  }
  if (payload?.code_review_rate_limit?.primary_window) {
    pushWindow('Review Requests', payload.code_review_rate_limit.primary_window);
  }

  result.windows = windows;
  result.primaryUsagePercent = Math.round(maxUsage * 10) / 10;
  result.primaryRemainingPercent = Math.round((100 - maxUsage) * 10) / 10;
  result.primaryResetAt = primaryResetAt;
  result.timeUntilResetMs = earliestResetMs;
  result.metadata = {
    planType: payload?.plan_type || null,
    creditsBalance: parseCreditsBalance(payload?.credits?.balance),
  };

  if (windows.length === 0) {
    result.error = 'Codex usage response contained no rate-limit windows';
  }

  return result;
}

function codexPrimaryWindowName(planType, primary, secondary) {
  // Paid plans expose 5h (primary) + weekly (secondary); free plans only weekly.
  if (secondary) return '5-Hour Limit';
  if (String(planType || '').toLowerCase() === 'free') return 'Weekly All-Model';
  if (primary.limit_window_seconds >= SEVEN_DAY_SECONDS) return 'Weekly All-Model';
  if (primary.limit_window_seconds > 0 && primary.limit_window_seconds <= FIVE_HOUR_SECONDS) {
    return '5-Hour Limit';
  }
  return '5-Hour Limit';
}

function parseCreditsBalance(raw) {
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string') {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function loadCodexCredentials() {
  if (process.env.CODEX_TOKEN) {
    return {
      accessToken: process.env.CODEX_TOKEN,
      accountId: process.env.CODEX_ACCOUNT_ID || null,
    };
  }

  const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  const authPath = path.join(codexHome, 'auth.json');
  if (!fs.existsSync(authPath)) return null;

  try {
    const parsed = JSON.parse(fs.readFileSync(authPath, 'utf8'));
    const accessToken = parsed?.tokens?.access_token || parsed?.access_token || null;
    if (!accessToken) return null;
    return {
      accessToken,
      accountId: parsed?.tokens?.account_id || parsed?.account_id || null,
    };
  } catch (_err) {
    return null;
  }
}
