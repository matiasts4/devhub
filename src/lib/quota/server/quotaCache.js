import fs from 'fs';
import path from 'path';

/**
 * Server-side quota cache with TTL + disk persistence.
 *
 * Motivation: without it, every client poll (45 s) and every app restart
 * re-runs every provider adapter against live vendor endpoints (and the AGY
 * probe spawns PowerShell + netstat). The cache:
 *
 * - serves entries younger than TTL (default 60 s, env `QUOTA_CACHE_TTL_MS`);
 * - persists snapshots to `data/quota-cache.json` (env `QUOTA_CACHE_FILE`)
 *   so restarts within the TTL window don't re-hit vendor APIs at all;
 * - is bypassed with `?force=1` (manual refresh from the popover).
 */

const DEFAULT_TTL_MS = 60_000;

function cacheFilePath() {
  return process.env.QUOTA_CACHE_FILE || path.join(process.cwd(), 'data', 'quota-cache.json');
}

export function quotaCacheTtlMs() {
  const ttl = Number(process.env.QUOTA_CACHE_TTL_MS);
  return Number.isFinite(ttl) && ttl > 0 ? ttl : DEFAULT_TTL_MS;
}

/** In-memory mirror, hydrated lazily from disk once per process. */
let memoryCache = null;
let writeTimer = null;

function loadCache() {
  if (memoryCache) return memoryCache;
  memoryCache = {};
  try {
    const file = cacheFilePath();
    if (fs.existsSync(file)) {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (parsed && typeof parsed === 'object') {
        for (const [id, entry] of Object.entries(parsed)) {
          if (entry && typeof entry.fetchedAtMs === 'number' && entry.status) {
            memoryCache[id] = entry;
          }
        }
      }
    }
  } catch (_err) {
    // Corrupted or unreadable cache — start empty.
  }
  return memoryCache;
}

function schedulePersist() {
  if (writeTimer) return;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    try {
      const file = cacheFilePath();
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(memoryCache));
    } catch (_err) {
      // Non-fatal: the in-memory cache still works for this process.
    }
  }, 500);
  if (typeof writeTimer.unref === 'function') writeTimer.unref();
}

/**
 * Returns the cached status for a provider if it is younger than the TTL,
 * otherwise null. With `allowStale`, returns the entry regardless of age
 * (used as a fallback when a live fetch fails). Entries served from cache
 * carry `servedFromCache: true` and their original `lastUpdatedMs`.
 */
export function readCachedQuota(providerId, { allowStale = false } = {}) {
  const entry = loadCache()[providerId];
  if (!entry) return null;
  if (!allowStale && Date.now() - entry.fetchedAtMs >= quotaCacheTtlMs()) return null;
  const stale = Date.now() - entry.fetchedAtMs >= quotaCacheTtlMs();
  return { ...entry.status, servedFromCache: true, stale };
}

/** Stores a freshly fetched status (memory + debounced disk write). */
export function writeCachedQuota(providerId, status) {
  if (!status || status.providerId !== providerId) return;
  loadCache()[providerId] = { fetchedAtMs: Date.now(), status };
  schedulePersist();
}

/** Test hook: resets the in-memory mirror (next read re-hydrates from disk). */
export function _resetQuotaCacheForTests() {
  memoryCache = null;
  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
}
