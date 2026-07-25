/**
 * T1.5 / R-PERF-5 — getCachedWrappedBash co-located test.
 *
 * Verifies that the helper exposed from `agentLaunchWrapper.js`
 * (a) writes the static template to the SHA1-keyed cache file on
 * first call, (b) returns identical content from cache on second
 * call, and (c) exports the version constant the launch
 * orchestrator gates on.
 *
 * Co-located with the source at `src/lib/agentLaunchWrapper.wrappedBashCache.test.js`
 * to match the allowlist path.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const { WAPPER_BASH_CACHE_VERSION, getCachedWrappedBash } = require('./agentLaunchWrapper');

function makeTmpCacheDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'devhub-wrapper-cache-colocated-'));
}

describe('agentLaunchWrapper — getCachedWrappedBash (T1.5)', () => {
  test('WAPPER_BASH_CACHE_VERSION is 1', () => {
    expect(WAPPER_BASH_CACHE_VERSION).toBe(1);
  });

  test('first call writes the cache file; second call returns identical content', () => {
    const cacheDir = makeTmpCacheDir();
    const staticParts =
      '#!/usr/bin/env bash\n# static-prelude: bus-helpers, identity, heartbeat, exit-trap\nset -euo pipefail\n';

    const first = getCachedWrappedBash(staticParts, {
      variableBlock: '\nexport ROLE="architect"\n',
      cacheDir,
    });
    expect(first.fromCache).toBe(false);
    expect(fs.existsSync(first.cacheFile)).toBe(true);
    expect(fs.readFileSync(first.cacheFile, 'utf8')).toBe(staticParts);

    const second = getCachedWrappedBash(staticParts, {
      variableBlock: '\nexport ROLE="devops"\n',
      cacheDir,
    });
    expect(second.fromCache).toBe(true);
    expect(second.sha1).toBe(first.sha1);
    expect(second.wrapper.startsWith(staticParts)).toBe(true);
    expect(second.wrapper.endsWith('\nexport ROLE="devops"\n')).toBe(true);
  });

  test('SHA1 mismatch invalidates the cache', () => {
    const cacheDir = makeTmpCacheDir();
    const v1 = 'STATIC-v1';
    const v2 = 'STATIC-v2';

    const a = getCachedWrappedBash(v1, { variableBlock: '', cacheDir });
    expect(a.fromCache).toBe(false);

    const b = getCachedWrappedBash(v2, { variableBlock: '', cacheDir });
    expect(b.fromCache).toBe(false);
    expect(a.sha1).not.toBe(b.sha1);
    // The cache layer prunes stale entries on first-launch, so only
    // the latest cache file remains on disk.
    expect(fs.existsSync(b.cacheFile)).toBe(true);
  });

  test('rejects non-string static parts', () => {
    expect(() => getCachedWrappedBash(null)).toThrow(TypeError);
    expect(() => getCachedWrappedBash(42)).toThrow(TypeError);
  });
});
