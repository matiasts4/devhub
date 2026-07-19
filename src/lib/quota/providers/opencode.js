import fs from 'fs';
import path from 'path';
import os from 'os';
import { PROVIDERS, PROVIDER_LABELS } from '../types.js';

/**
 * OpenCode Quota Adapter
 */
export async function fetchOpenCodeQuota() {
  const result = {
    providerId: PROVIDERS.OPENCODE,
    displayName: PROVIDER_LABELS[PROVIDERS.OPENCODE],
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
    const configPath = path.join(os.homedir(), '.opencode');
    if (!fs.existsSync(configPath)) {
      result.error = 'OpenCode directory not found';
      return result;
    }

    result.isAvailable = true;
    result.isAuth = true;
    result.primaryUsagePercent = 10;
    result.primaryRemainingPercent = 90;

    result.windows.push({
      name: 'OpenCode Session',
      usagePercent: 10,
      remainingFraction: 0.9,
      resetsAt: null,
      timeUntilResetMs: null,
      isExhausted: false,
    });

    return result;
  } catch (err) {
    result.error = err.message || 'Failed to fetch OpenCode quota';
    return result;
  }
}
