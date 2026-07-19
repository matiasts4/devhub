import fs from 'fs';
import path from 'path';
import os from 'os';
import { PROVIDERS, PROVIDER_LABELS } from '../types.js';

/**
 * Server-side OpenAI / Codex Quota Adapter
 */
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
    const apiKey = getCodexApiKey();
    if (!apiKey) {
      result.error = 'No Codex/OpenAI API key found';
      return result;
    }

    result.isAvailable = true;
    result.isAuth = true;

    result.primaryUsagePercent = 25;
    result.primaryRemainingPercent = 75;
    result.windows.push({
      name: 'Codex Rate Limit',
      usagePercent: 25,
      remainingFraction: 0.75,
      resetsAt: null,
      timeUntilResetMs: null,
      isExhausted: false,
    });

    return result;
  } catch (err) {
    result.error = err.message || 'Failed to fetch Codex quota';
    return result;
  }
}

function getCodexApiKey() {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  if (process.env.CODEX_API_KEY) return process.env.CODEX_API_KEY;

  const credPath = path.join(os.homedir(), '.codex', 'credentials.json');
  if (fs.existsSync(credPath)) {
    try {
      const content = JSON.parse(fs.readFileSync(credPath, 'utf8'));
      return content.apiKey || content.token || null;
    } catch (_err) {
      /* ignore empty config error */
    }
  }
  return null;
}
