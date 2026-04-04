import fs from 'fs';
import path from 'path';

const CONFIG_PATH = path.join(process.cwd(), 'data', 'observability-v2-config.json');

let configCache = null;
let configMtime = null;

/**
 * Read the observability v2 configuration with file-mtime caching.
 * Returns a default empty config if the file is missing or unreadable.
 *
 * @returns {{ version: string, flags: Object, opencode: Object, telegram: Object }}
 */
export function getConfig() {
  try {
    const stat = fs.statSync(CONFIG_PATH);
    if (configMtime !== stat.mtimeMs) {
      configCache = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      configMtime = stat.mtimeMs;
    }
    return configCache;
  } catch {
    return { version: '2.0.0', flags: {}, opencode: {}, telegram: {} };
  }
}

/**
 * Read a single feature flag value.
 *
 * @param {string} name - Flag key (e.g. 'telegram_use_opencode')
 * @param {boolean} [defaultValue=false] - Fallback when flag is absent
 * @returns {boolean|*}
 */
export function getFlag(name, defaultValue = false) {
  const config = getConfig();
  return config.flags?.[name] ?? defaultValue;
}
