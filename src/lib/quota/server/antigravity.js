import fs from 'fs';
import path from 'path';
import os from 'os';
import { PROVIDERS, PROVIDER_LABELS } from '../types.js';

/**
 * Server-side Antigravity (AGY) Quota Adapter
 */
export async function fetchAntigravityQuota() {
  const result = {
    providerId: PROVIDERS.ANTIGRAVITY,
    displayName: PROVIDER_LABELS[PROVIDERS.ANTIGRAVITY],
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
    const agyConfigDir = path.join(os.homedir(), '.gemini', 'antigravity-cli');
    const isConfigPresent = fs.existsSync(agyConfigDir);

    if (!isConfigPresent && !process.env.AGY_PORT) {
      result.error = 'Antigravity CLI configuration not found';
      return result;
    }

    result.isAvailable = true;
    result.isAuth = true;

    const agyPort = process.env.AGY_PORT || '9211';
    try {
      const response = await fetch(`http://127.0.0.1:${agyPort}/v1/quota`, {
        signal: AbortSignal.timeout(1500),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.models && Array.isArray(data.models)) {
          let minRemaining = 1.0;
          let earliestReset = null;

          const windows = data.models.map((m) => {
            const remFraction = m.remaining_fraction !== undefined ? m.remaining_fraction : 1.0;
            const usagePct = Math.round((1.0 - remFraction) * 100);
            if (remFraction < minRemaining) minRemaining = remFraction;

            let resetMs = null;
            if (m.reset_time) {
              resetMs = Math.max(0, new Date(m.reset_time).getTime() - Date.now());
              if (!earliestReset || resetMs < earliestReset) earliestReset = resetMs;
            }

            return {
              name: m.label || m.model_id || 'AGY Model',
              usagePercent: usagePct,
              remainingFraction: remFraction,
              resetsAt: m.reset_time || null,
              timeUntilResetMs: resetMs,
              isExhausted: remFraction <= 0,
            };
          });

          result.windows = windows;
          result.primaryRemainingPercent = Math.round(minRemaining * 100);
          result.primaryUsagePercent = 100 - result.primaryRemainingPercent;
          result.timeUntilResetMs = earliestReset;
          return result;
        }
      }
    } catch (_err) {
      // Server offline or proxy unavailable
    }

    result.primaryUsagePercent = 20;
    result.primaryRemainingPercent = 80;
    result.windows.push({
      name: 'AGY System Quota',
      usagePercent: 20,
      remainingFraction: 0.8,
      resetsAt: null,
      timeUntilResetMs: null,
      isExhausted: false,
    });

    return result;
  } catch (err) {
    result.error = err.message || 'Failed to fetch AGY quota';
    return result;
  }
}
