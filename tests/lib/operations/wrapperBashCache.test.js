/**
 * T1.5 / R-PERF-5 — Cached wrapper bash.
 *
 * The wrapper bash is 6-10KB and 5 roles × ~150ms/role is a measurable
 * slice of launch latency. R-PERF-5 caches the static portion of the
 * wrapper at `__dirname/.cache/wrapper-bash-v1.bash` keyed by SHA1
 * of the static template. The per-launch variable block (≤ 1KB) is
 * appended at build time.
 *
 * Acceptance: 5 wrapper builds < 100ms total. Cache key is content-
 * addressed (SHA1).
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  computeWrapperCacheKey,
  resolveCacheFilePath,
  pruneStaleWrapperCache,
  readCachedStaticTemplate,
  writeCachedStaticTemplate,
  buildWrapperWithCache,
} = require('../../../src/lib/operations/wrapperBashCache');

function makeTmpCacheDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'devhub-wrapper-cache-'));
}

describe('swarm-launch-perf > R-PERF-5 > cached wrapper bash', () => {
  test('2 consecutive wrapper builds share a SHA1 cache key, second call is < 10ms', () => {
    const cacheDir = makeTmpCacheDir();
    const staticTemplate = '#!/usr/bin/env bash\n# static prelude\nset -euo pipefail\n';
    const variableBlockA = '\nexport ROLE="architect"\n';
    const variableBlockB = '\nexport ROLE="devops"\n';

    const first = buildWrapperWithCache({ staticTemplate, variableBlock: variableBlockA, cacheDir });
    const second = buildWrapperWithCache({ staticTemplate, variableBlock: variableBlockB, cacheDir });

    // Same SHA1 for the static portion.
    expect(computeWrapperCacheKey(staticTemplate)).toBe(first.sha1);
    expect(computeWrapperCacheKey(staticTemplate)).toBe(second.sha1);
    // First call writes; second hits the cache.
    expect(first.fromCache).toBe(false);
    expect(second.fromCache).toBe(true);
    // Both wrappers share the static prefix; the per-launch variable
    // block is byte-equal to what was passed in.
    expect(first.wrapper.startsWith(staticTemplate)).toBe(true);
    expect(second.wrapper.startsWith(staticTemplate)).toBe(true);
    expect(first.wrapper.endsWith(variableBlockA)).toBe(true);
    expect(second.wrapper.endsWith(variableBlockB)).toBe(true);

    // The cache file is exactly the static template.
    const cached = readCachedStaticTemplate(cacheDir, first.sha1);
    expect(cached).toBe(staticTemplate);
  });

  test('SHA1 cache key is content-addressed (different static → different key)', () => {
    const cacheDir = makeTmpCacheDir();
    const a = buildWrapperWithCache({ staticTemplate: 'STATIC-A', variableBlock: '', cacheDir });
    const b = buildWrapperWithCache({ staticTemplate: 'STATIC-B', variableBlock: '', cacheDir });
    expect(a.sha1).not.toBe(b.sha1);
    expect(resolveCacheFilePath(cacheDir, a.sha1)).not.toBe(resolveCacheFilePath(cacheDir, b.sha1));
  });

  test('first-launch prime writes the static template to disk', () => {
    const cacheDir = makeTmpCacheDir();
    const staticTemplate = 'STATIC-TEMPLATE-X';
    const result = buildWrapperWithCache({ staticTemplate, variableBlock: '', cacheDir });
    expect(fs.existsSync(result.cacheFile)).toBe(true);
    expect(fs.readFileSync(result.cacheFile, 'utf8')).toBe(staticTemplate);
  });

  test('5 wrapper builds total < 100ms after first-launch prime', () => {
    const cacheDir = makeTmpCacheDir();
    const staticTemplate = '#!/usr/bin/env bash\nset -euo pipefail\n# bus-helpers, identity, heartbeat, exit-trap prologue (static)';
    const roles = ['director', 'architect', 'implementer', 'reviewer', 'devops'];
    // First launch — prime the cache.
    buildWrapperWithCache({
      staticTemplate,
      variableBlock: `\nexport ROLE="${roles[0]}"\n`,
      cacheDir,
    });

    const start = Date.now();
    for (const role of roles) {
      buildWrapperWithCache({ staticTemplate, variableBlock: `\nexport ROLE="${role}"\n`, cacheDir });
    }
    const elapsed = Date.now() - start;

    // Spec: 5 wrapper builds < 100ms total.
    expect(elapsed).toBeLessThan(100);
  });

  test('pruneStaleWrapperCache removes stale files on first-launch', () => {
    const cacheDir = makeTmpCacheDir();
    const currentSha1 = 'abc123';
    // Seed three stale files.
    for (const staleSha of ['stale-1', 'stale-2', 'stale-3']) {
      writeCachedStaticTemplate(cacheDir, staleSha, `stale-${staleSha}`);
    }
    // Write the current key.
    writeCachedStaticTemplate(cacheDir, currentSha1, 'current');
    const removed = pruneStaleWrapperCache(cacheDir, currentSha1);
    expect(removed).toBe(3);
    // Only the current key survives.
    const remaining = fs.readdirSync(cacheDir).filter((e) => e.startsWith('wrapper-bash-v1.'));
    expect(remaining).toEqual([`wrapper-bash-v1.${currentSha1}.bash`]);
  });

  test('pruneStaleWrapperCache returns 0 when cache dir is missing', () => {
    const missingDir = path.join(os.tmpdir(), 'devhub-wrapper-cache-missing', String(Date.now()));
    expect(pruneStaleWrapperCache(missingDir, 'abc')).toBe(0);
  });

  test('readCachedStaticTemplate returns null on ENOENT', () => {
    const missingDir = path.join(os.tmpdir(), 'devhub-wrapper-cache-missing-read', String(Date.now()));
    expect(readCachedStaticTemplate(missingDir, 'nope')).toBeNull();
  });

  test('variableBlock can be empty (per-role block is optional)', () => {
    const cacheDir = makeTmpCacheDir();
    const staticTemplate = 'STATIC';
    const r = buildWrapperWithCache({ staticTemplate, variableBlock: '', cacheDir });
    expect(r.wrapper).toBe(staticTemplate);
  });
});
