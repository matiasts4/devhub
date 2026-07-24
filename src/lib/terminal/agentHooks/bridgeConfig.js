/**
 * bridgeConfig — discovery file for out-of-process hook bridges.
 *
 * Antigravity hooks run in the agent's own environment (terminal, CLI, or
 * IDE) which does NOT inherit the per-session DEVHUB_HOOK_URL /
 * DEVHUB_HOOK_TOKEN env vars injected at PTY spawn. Instead, DevHub servers
 * maintain a well-known discovery file that bridges read at invocation time:
 *
 *   ~/.devhub/hook-bridge.json  →  { "url": "...", "token": "...", "updatedAt": ... }
 *
 * The file is written at server startup via writeHookBridgeConfig() and read
 * by scripts/agent-hooks/antigravity-bridge.mjs (Node stdlib only).
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

/** Override for tests or multi-instance setups. */
export const HOOK_BRIDGE_CONFIG_PATH_ENV = 'DEVHUB_HOOK_BRIDGE_CONFIG';

export function resolveHookBridgeConfigPath(homeDir = os.homedir()) {
  const override = process.env[HOOK_BRIDGE_CONFIG_PATH_ENV];
  if (override) return override;
  return path.join(homeDir, '.devhub', 'hook-bridge.json');
}

/**
 * Write (or refresh) the hook bridge discovery file.
 * Creates the parent directory when missing. Atomic-ish: writes to a temp
 * file then renames so a concurrent bridge reader never sees partial JSON.
 *
 * @param {{ url: string, token: string }} config
 * @param {string} [homeDir] — override home for tests
 * @returns {string} path written
 */
export function writeHookBridgeConfig({ url, token } = {}, homeDir) {
  if (!url || typeof url !== 'string') {
    throw new Error('writeHookBridgeConfig: url is required');
  }
  if (!token || typeof token !== 'string') {
    throw new Error('writeHookBridgeConfig: token is required');
  }

  const configPath = resolveHookBridgeConfigPath(homeDir);
  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const body = JSON.stringify({ url, token, updatedAt: Date.now() }, null, 2) + '\n';
  const tmpPath = `${configPath}.tmp-${process.pid}`;
  fs.writeFileSync(tmpPath, body, { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tmpPath, configPath);
  return configPath;
}

/**
 * Read the hook bridge discovery file. Returns null when missing/corrupt —
 * callers (bridges) must FAIL-OPEN.
 *
 * @param {string} [homeDir] — override home for tests
 * @returns {{ url: string, token: string, updatedAt?: number } | null}
 */
export function readHookBridgeConfig(homeDir) {
  const configPath = resolveHookBridgeConfigPath(homeDir);
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.url !== 'string' || typeof parsed.token !== 'string') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
