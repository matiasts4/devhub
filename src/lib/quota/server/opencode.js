import fs from 'fs';
import path from 'path';
import os from 'os';
import { PROVIDERS, PROVIDER_LABELS } from '../types.js';

/**
 * Server-side OpenCode Quota Adapter.
 *
 * OpenCode itself has no subscription quota endpoint — it brokers requests to
 * upstream providers whose quotas are tracked by their own adapters. This
 * adapter therefore detects installation/auth state and reports it honestly
 * instead of fabricating usage numbers.
 *
 * Detection sources:
 * - `~/.config/opencode/opencode.json` → custom configured providers
 *   (`provider` map, e.g. local proxies like headroom).
 * - `~/.local/share/opencode/auth.json` → authenticated providers, with the
 *   credential type per entry: API key (`{type, key}`) or OAuth
 *   (`{type, refresh, access, expires}`).
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
    const home = os.homedir();
    const configCandidates = [
      path.join(home, '.config', 'opencode', 'opencode.json'),
      path.join(home, '.config', 'opencode', 'opencode.jsonc'),
      path.join(home, '.opencode', 'opencode.json'),
    ];
    const authPath = path.join(home, '.local', 'share', 'opencode', 'auth.json');

    const configPath = configCandidates.find((p) => fs.existsSync(p));
    const hasAuth = fs.existsSync(authPath);
    if (!configPath && !hasAuth) {
      result.error = 'OpenCode configuration not found';
      return result;
    }

    result.isAvailable = true;

    let configuredProviders = [];
    if (configPath) {
      try {
        const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        configuredProviders = Object.keys(parsed?.provider || {});
      } catch (_err) {
        // JSONC or unreadable — still counts as installed.
      }
    }

    const authenticatedProviders = [];
    if (hasAuth) {
      try {
        const parsed = JSON.parse(fs.readFileSync(authPath, 'utf8'));
        for (const [id, entry] of Object.entries(parsed || {})) {
          if (!entry || typeof entry !== 'object') continue;
          authenticatedProviders.push({
            id,
            type: entry.access || entry.refresh ? 'oauth' : entry.key ? 'api-key' : 'unknown',
          });
        }
      } catch (_err) {
        // Unreadable auth store — ignore.
      }
    }

    result.isAuth = authenticatedProviders.length > 0;
    result.metadata = {
      configPath: configPath || null,
      configuredProviders,
      authenticatedProviders,
    };
    result.error = authenticatedProviders.length
      ? `OpenCode brokers ${authenticatedProviders.length} authenticated provider(s) — quota is tracked per upstream (Kimi, Codex, Z.ai…)`
      : 'OpenCode has no quota endpoint of its own — quota is tracked per upstream provider (Kimi, Codex, Z.ai…)';

    return result;
  } catch (err) {
    result.error = err.message || 'Failed to fetch OpenCode quota';
    return result;
  }
}
