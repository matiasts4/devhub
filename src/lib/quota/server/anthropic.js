import fs from 'fs';
import path from 'path';
import os from 'os';
import { PROVIDERS, PROVIDER_LABELS } from '../types.js';

/**
 * Server-side Anthropic / Claude Code Quota Adapter
 */
export async function fetchAnthropicQuota() {
  const result = {
    providerId: PROVIDERS.CLAUDE,
    displayName: PROVIDER_LABELS[PROVIDERS.CLAUDE],
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
    const token = getClaudeToken();
    if (!token) {
      result.error = 'No Claude authentication token found';
      return result;
    }

    result.isAvailable = true;
    result.isAuth = true;

    const response = await fetch('https://api.anthropic.com/api/oauth/usage', {
      headers: {
        Authorization: `Bearer ${token}`,
        'anthropic-version': '2023-06-01',
        'User-Agent': 'DevHub-QuotaEngine/1.0',
      },
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        result.isAuth = false;
        result.error = 'Authentication invalid or expired';
        return result;
      }
      result.error = `HTTP ${response.status}: ${response.statusText}`;
      return result;
    }

    const data = await response.json();

    const windows = [];
    let maxUsage = 0;
    let earliestResetMs = null;
    let primaryResetAt = null;

    const windowMap = {
      five_hour: '5-Hour Limit',
      seven_day: 'Weekly All-Model',
      seven_day_sonnet: 'Weekly Sonnet',
      monthly_limit: 'Monthly Limit',
      extra_usage: 'Extra Usage',
    };

    for (const [key, label] of Object.entries(windowMap)) {
      const entry = data[key];
      if (!entry || entry.utilization === undefined || entry.is_enabled === false) {
        continue;
      }

      const usagePct = Math.min(100, Math.max(0, entry.utilization * 100));
      const remainingPct = 100 - usagePct;
      let resetMs = null;

      if (entry.resets_at) {
        const resetDate = new Date(entry.resets_at);
        resetMs = Math.max(0, resetDate.getTime() - Date.now());
        if (earliestResetMs === null || resetMs < earliestResetMs) {
          earliestResetMs = resetMs;
          primaryResetAt = entry.resets_at;
        }
      }

      if (usagePct > maxUsage) {
        maxUsage = usagePct;
      }

      windows.push({
        name: label,
        usagePercent: Math.round(usagePct * 10) / 10,
        remainingFraction: Math.round(remainingPct) / 100,
        resetsAt: entry.resets_at || null,
        timeUntilResetMs: resetMs,
        isExhausted: usagePct >= 100,
      });
    }

    result.windows = windows;
    result.primaryUsagePercent = Math.round(maxUsage * 10) / 10;
    result.primaryRemainingPercent = Math.round((100 - maxUsage) * 10) / 10;
    result.primaryResetAt = primaryResetAt;
    result.timeUntilResetMs = earliestResetMs;

    return result;
  } catch (err) {
    result.error = err.message || 'Failed to fetch Claude quota';
    return result;
  }
}

function getClaudeToken() {
  if (process.env.CLAUDE_CODE_TOKEN) return process.env.CLAUDE_CODE_TOKEN;
  if (process.env.ANTHROPIC_OAUTH_TOKEN) return process.env.ANTHROPIC_OAUTH_TOKEN;

  const home = os.homedir();

  // Claude Code persists its OAuth session in ~/.claude/.credentials.json
  const credentialsPath = path.join(home, '.claude', '.credentials.json');
  try {
    if (fs.existsSync(credentialsPath)) {
      const parsed = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
      const oauth = parsed?.claudeAiOauth;
      if (oauth?.accessToken) return oauth.accessToken;
    }
  } catch (_err) {
    // Fall through to legacy token files
  }

  const tokenPaths = [
    path.join(home, '.claude', '.token'),
    path.join(home, '.config', 'claude', '.token'),
  ];

  for (const p of tokenPaths) {
    try {
      if (fs.existsSync(p)) {
        const content = fs.readFileSync(p, 'utf8').trim();
        if (!content) continue;
        if (content.startsWith('{')) {
          const parsed = JSON.parse(content);
          if (parsed.oauth_token) return parsed.oauth_token;
          if (parsed.accessToken) return parsed.accessToken;
          if (parsed.session_token) return parsed.session_token;
        } else {
          return content;
        }
      }
    } catch (_err) {
      // Continue searching
    }
  }

  return null;
}
