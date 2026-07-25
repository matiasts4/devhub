import { PROVIDERS, PROVIDER_LABELS } from '../types.js';

/**
 * Server-side Z.ai (GLM Coding Plan) Quota Adapter.
 *
 * Polls the documented quota endpoint with the user's API key:
 *
 *   GET ${ZAI_BASE_URL || https://api.z.ai/api}/monitor/usage/quota/limit
 *   Authorization: <ZAI_API_KEY>   (raw key, no Bearer prefix)
 *
 * Response wrapper: { code, msg, success, data: { limits: [...] } }
 * Each limit: { type: 'TIME_LIMIT' | 'TOKENS_LIMIT', usage, currentValue,
 *               remaining, percentage, nextResetTime (epoch ms), usageDetails }.
 */
export async function fetchZaiQuota() {
  const result = {
    providerId: PROVIDERS.ZAI,
    displayName: PROVIDER_LABELS[PROVIDERS.ZAI],
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
    const apiKey = process.env.ZAI_API_KEY || process.env.ZHIPU_API_KEY || null;
    if (!apiKey) {
      result.error = 'No Z.ai API key found (set ZAI_API_KEY)';
      return result;
    }

    result.isAvailable = true;
    result.isAuth = true;

    const baseUrl = (process.env.ZAI_BASE_URL || 'https://api.z.ai/api').replace(/\/+$/, '');
    const response = await fetch(`${baseUrl}/monitor/usage/quota/limit`, {
      headers: {
        Authorization: apiKey,
        Accept: 'application/json',
        'User-Agent': 'DevHub-QuotaEngine/1.0',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        result.isAuth = false;
        result.error = 'Z.ai API key invalid or expired';
        return result;
      }
      result.error = `Z.ai quota endpoint HTTP ${response.status}`;
      return result;
    }

    const wrapper = await response.json();

    // Z.ai reports API errors as HTTP 200 with an error code in the body.
    if (wrapper?.code === 401) {
      result.isAuth = false;
      result.error = 'Z.ai API key invalid or expired';
      return result;
    }
    if (wrapper && wrapper.success === false) {
      result.error = `Z.ai API error: code=${wrapper.code} ${wrapper.msg || ''}`.trim();
      return result;
    }

    return applyZaiQuotaPayload(result, wrapper?.data || wrapper);
  } catch (err) {
    result.error = err.message || 'Failed to fetch Z.ai quota';
    return result;
  }
}

/**
 * Maps the raw Z.ai quota payload onto ProviderQuotaStatus.
 * Exported for unit testing.
 */
export function applyZaiQuotaPayload(result, data) {
  const windows = [];
  let maxUsage = 0;
  let earliestResetMs = null;
  let primaryResetAt = null;

  for (const limit of data?.limits || []) {
    const used = Number(limit.currentValue ?? limit.usage ?? 0);
    const remaining = Number(limit.remaining ?? 0);
    const total = used + remaining;

    let usagePct;
    if (total > 0) {
      usagePct = Math.min(100, Math.max(0, (used / total) * 100));
    } else if (typeof limit.percentage === 'number') {
      usagePct = Math.min(100, Math.max(0, limit.percentage));
    } else {
      continue;
    }

    let resetAt = null;
    let resetMs = null;
    if (limit.nextResetTime) {
      resetAt = new Date(Number(limit.nextResetTime)).toISOString();
      resetMs = Math.max(0, Number(limit.nextResetTime) - Date.now());
      if (earliestResetMs === null || resetMs < earliestResetMs) {
        earliestResetMs = resetMs;
        primaryResetAt = resetAt;
      }
    }

    if (usagePct > maxUsage) maxUsage = usagePct;

    windows.push({
      name:
        limit.type === 'TIME_LIMIT'
          ? 'Z.ai Time Limit'
          : limit.type === 'TOKENS_LIMIT'
            ? 'Z.ai Token Limit'
            : `Z.ai ${limit.type || 'Limit'}`,
      usagePercent: Math.round(usagePct * 10) / 10,
      remainingFraction: Math.round((100 - usagePct) * 10) / 1000,
      resetsAt: resetAt,
      timeUntilResetMs: resetMs,
      isExhausted: usagePct >= 100,
    });
  }

  result.windows = windows;
  result.primaryUsagePercent = Math.round(maxUsage * 10) / 10;
  result.primaryRemainingPercent = Math.round((100 - maxUsage) * 10) / 10;
  result.primaryResetAt = primaryResetAt;
  result.timeUntilResetMs = earliestResetMs;

  if (windows.length === 0) {
    result.error = 'Z.ai quota response contained no limits';
  }

  return result;
}
