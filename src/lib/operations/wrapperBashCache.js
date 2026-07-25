/**
 * T1.5 / R-PERF-5 — Cached wrapper bash.
 *
 * The WIP `buildAgentLaunchWrapper` in `src/lib/agentLaunchWrapper.js`
 * assembles a 6-10KB bash per launch role. R-PERF-5 caches the
 * static portion of the wrapper at `__dirname/.cache/wrapper-bash-v1.bash`
 * keyed by SHA1 of the static template. The per-launch variable block
 * (≤ 1KB) is appended at build time.
 *
 * This module is the additive cache layer. It does not edit the
 * WIP `buildAgentLaunchWrapper` source; it composes a cached static
 * prefix on top of the per-launch variable block.
 *
 * Cache key: SHA1 of the static template bytes.
 * Cache path: `<__dirname>/.cache/wrapper-bash-v1.<sha1>.bash`.
 * GC: stale `.bash` files in `.cache/wrapper-bash-v1.*` are pruned
 * on first-launch detection (the one with no cache file at all).
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/* global __dirname -- provided by the CJS/bundler runtime (jest, Next, webpack) */

const CACHE_DIR_NAME = '.cache';
const CACHE_FILE_PREFIX = 'wrapper-bash-v1';
const CACHE_FILE_SUFFIX = '.bash';
const CACHE_VERSION = 'v1';

/**
 * Compute the SHA1 cache key for a static template string.
 * @param {string} staticTemplate
 * @returns {string} 40-character hex SHA1
 */
export function computeWrapperCacheKey(staticTemplate) {
  return crypto
    .createHash('sha1')
    .update(String(staticTemplate || ''), 'utf8')
    .digest('hex');
}

/**
 * Resolve the cache file path for a given SHA1 key.
 * @param {string} cacheDir - absolute path to the .cache directory
 * @param {string} sha1
 * @returns {string}
 */
export function resolveCacheFilePath(cacheDir, sha1) {
  return path.join(cacheDir, `${CACHE_FILE_PREFIX}.${sha1}${CACHE_FILE_SUFFIX}`);
}

/**
 * GC stale cache files in the cache directory. Stale = any file
 * matching `${CACHE_FILE_PREFIX}.*${CACHE_FILE_SUFFIX}` whose SHA1
 * does not match `currentSha1`. Returns the number of files removed.
 *
 * @param {string} cacheDir
 * @param {string} currentSha1
 * @param {{ fsImpl?: typeof fs }} [options]
 * @returns {number}
 */
export function pruneStaleWrapperCache(cacheDir, currentSha1, { fsImpl = fs } = {}) {
  if (!cacheDir) return 0;
  let entries = [];
  try {
    entries = fsImpl.readdirSync(cacheDir);
  } catch (err) {
    if (err && err.code === 'ENOENT') return 0;
    throw err;
  }
  let removed = 0;
  for (const entry of entries) {
    if (!entry.startsWith(`${CACHE_FILE_PREFIX}.`)) continue;
    if (!entry.endsWith(CACHE_FILE_SUFFIX)) continue;
    if (entry === `${CACHE_FILE_PREFIX}.${currentSha1}${CACHE_FILE_SUFFIX}`) continue;
    try {
      fsImpl.unlinkSync(path.join(cacheDir, entry));
      removed += 1;
    } catch {
      // Best-effort GC.
    }
  }
  return removed;
}

/**
 * Read a cached static template from disk. Returns null on miss
 * (ENOENT). Throws on other I/O errors.
 *
 * @param {string} cacheDir
 * @param {string} sha1
 * @param {{ fsImpl?: typeof fs }} [options]
 * @returns {string|null}
 */
export function readCachedStaticTemplate(cacheDir, sha1, { fsImpl = fs } = {}) {
  const filePath = resolveCacheFilePath(cacheDir, sha1);
  try {
    return fsImpl.readFileSync(filePath, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') return null;
    throw err;
  }
}

/**
 * Write a static template to the cache directory. The directory
 * is created if missing. Returns the absolute path of the file
 * written.
 *
 * @param {string} cacheDir
 * @param {string} sha1
 * @param {string} staticTemplate
 * @param {{ fsImpl?: typeof fs }} [options]
 * @returns {string}
 */
export function writeCachedStaticTemplate(cacheDir, sha1, staticTemplate, { fsImpl = fs } = {}) {
  fsImpl.mkdirSync(cacheDir, { recursive: true });
  const filePath = resolveCacheFilePath(cacheDir, sha1);
  fsImpl.writeFileSync(filePath, staticTemplate, 'utf8');
  return filePath;
}

/**
 * Build a wrapper bash with a SHA1-keyed disk cache for the static
 * portion. First call writes to disk; subsequent calls hit the cache
 * and only concatenate the per-launch variable block.
 *
 * @param {object} params
 * @param {string} params.staticTemplate - the static portion of the wrapper
 * @param {string} params.variableBlock - the per-launch variable block
 * @param {string} [params.cacheDir] - absolute path to the cache directory
 * @param {{ fsImpl?: typeof fs }} [params.options]
 * @returns {{ wrapper: string, fromCache: boolean, cacheFile: string, sha1: string, prunedCount: number }}
 */
export function buildWrapperWithCache({
  staticTemplate,
  variableBlock,
  cacheDir = path.join(__dirname, CACHE_DIR_NAME),
  options = {},
}) {
  const sha1 = computeWrapperCacheKey(staticTemplate);
  const existing = readCachedStaticTemplate(cacheDir, sha1, options);
  let prunedCount = 0;
  let cached;
  if (existing == null) {
    writeCachedStaticTemplate(cacheDir, sha1, staticTemplate, options);
    cached = staticTemplate;
    prunedCount = pruneStaleWrapperCache(cacheDir, sha1, options);
  } else {
    cached = existing;
  }
  const wrapper = `${cached}${variableBlock || ''}`;
  return {
    wrapper,
    fromCache: existing != null,
    cacheFile: resolveCacheFilePath(cacheDir, sha1),
    sha1,
    prunedCount,
  };
}

export const __testing = {
  CACHE_DIR_NAME,
  CACHE_FILE_PREFIX,
  CACHE_FILE_SUFFIX,
  CACHE_VERSION,
};

export default {
  computeWrapperCacheKey,
  resolveCacheFilePath,
  pruneStaleWrapperCache,
  readCachedStaticTemplate,
  writeCachedStaticTemplate,
  buildWrapperWithCache,
};
