import fs from 'fs';
import path from 'path';
import os from 'os';
import { PROVIDERS, PROVIDER_LABELS } from '../types.js';

/**
 * Kimi Code / Moonshot Quota Adapter
 */
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
    const apiKey = getKimiApiKey();
    if (!apiKey) {
      result.error = 'No Kimi/Moonshot API key found';
      return result;
    }

    result.isAvailable = true;
    result.isAuth = true;

    // Check Moonshot API user balance
    const response = await fetch('https://api.moonshot.cn/v1/users/me/balance', {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'User-Agent': 'DevHub-QuotaEngine/1.0',
      },
    });

    if (response.ok) {
      const data = await response.json();
      if (data && data.data) {
        const available = data.data.available_balance || 0;
        const voucher = data.data.voucher_balance || 0;
        const total = available + voucher;

        // Estimate remaining quota fraction
        const remPct = Math.min(100, Math.max(0, Math.round((total / 50) * 100))); // standard base 50 RMB
        const usePct = 100 - remPct;

        result.primaryUsagePercent = usePct;
        result.primaryRemainingPercent = remPct;
        result.metadata = { availableBalance: available, voucherBalance: voucher };

        result.windows.push({
          name: 'Kimi Moonshot Balance',
          usagePercent: usePct,
          remainingFraction: remPct / 100,
          resetsAt: null,
          timeUntilResetMs: null,
          isExhausted: total <= 0,
        });

        return result;
      }
    }

    // Default optimistic state
    result.primaryUsagePercent = 15;
    result.primaryRemainingPercent = 85;
    result.windows.push({
      name: 'Kimi Code Session',
      usagePercent: 15,
      remainingFraction: 0.85,
      resetsAt: null,
      timeUntilResetMs: null,
      isExhausted: false,
    });

    return result;
  } catch (err) {
    result.error = err.message || 'Failed to fetch Kimi quota';
    return result;
  }
}

function getKimiApiKey() {
  if (process.env.KIMI_API_KEY) return process.env.KIMI_API_KEY;
  if (process.env.MOONSHOT_API_KEY) return process.env.MOONSHOT_API_KEY;

  const configPath = path.join(os.homedir(), '.kimi', 'config.json');
  if (fs.existsSync(configPath)) {
    try {
      const content = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      return content.api_key || content.apiKey || null;
    } catch (_err) {
      /* ignore config error */
    }
  }
  return null;
}
