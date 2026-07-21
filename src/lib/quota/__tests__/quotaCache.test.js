import fs from 'fs';
import os from 'os';
import path from 'path';

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'quota-cache-test-'));
const CACHE_FILE = path.join(TMP_DIR, 'quota-cache.json');

process.env.QUOTA_CACHE_FILE = CACHE_FILE;

// Imported after env setup on purpose.
import {
  quotaCacheTtlMs,
  readCachedQuota,
  writeCachedQuota,
  _resetQuotaCacheForTests,
} from '../server/quotaCache.js';

function fakeStatus(id) {
  return {
    providerId: id,
    displayName: id,
    isAvailable: true,
    isAuth: true,
    primaryUsagePercent: 10,
    primaryRemainingPercent: 90,
    primaryResetAt: null,
    timeUntilResetMs: null,
    windows: [],
    metadata: {},
    lastUpdatedMs: Date.now(),
    error: null,
  };
}

describe('server quotaCache (TTL + disk persistence)', () => {
  beforeEach(() => {
    _resetQuotaCacheForTests();
    if (fs.existsSync(CACHE_FILE)) fs.unlinkSync(CACHE_FILE);
    delete process.env.QUOTA_CACHE_TTL_MS;
  });

  afterAll(() => {
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
  });

  test('returns null when nothing is cached', () => {
    expect(readCachedQuota('kimi')).toBeNull();
  });

  test('serves entries within the TTL marked as servedFromCache', () => {
    writeCachedQuota('kimi', fakeStatus('kimi'));
    const cached = readCachedQuota('kimi');
    expect(cached).not.toBeNull();
    expect(cached.servedFromCache).toBe(true);
    expect(cached.stale).toBe(false);
    expect(cached.primaryRemainingPercent).toBe(90);
  });

  test('expires entries past the TTL but allows stale fallback', async () => {
    process.env.QUOTA_CACHE_TTL_MS = '5';
    writeCachedQuota('kimi', fakeStatus('kimi'));
    await new Promise((r) => setTimeout(r, 15));

    expect(readCachedQuota('kimi')).toBeNull();

    const stale = readCachedQuota('kimi', { allowStale: true });
    expect(stale).not.toBeNull();
    expect(stale.stale).toBe(true);
  });

  test('honors QUOTA_CACHE_TTL_MS override', () => {
    process.env.QUOTA_CACHE_TTL_MS = '120000';
    expect(quotaCacheTtlMs()).toBe(120000);
  });

  test('persists to disk and re-hydrates in a fresh process state', async () => {
    writeCachedQuota('codex', fakeStatus('codex'));
    // Wait for the debounced disk write.
    await new Promise((r) => setTimeout(r, 700));
    expect(fs.existsSync(CACHE_FILE)).toBe(true);

    _resetQuotaCacheForTests(); // simulate process restart (memory lost)
    const hydrated = readCachedQuota('codex');
    expect(hydrated).not.toBeNull();
    expect(hydrated.providerId).toBe('codex');
    expect(hydrated.servedFromCache).toBe(true);
  });

  test('survives a corrupted cache file', () => {
    fs.writeFileSync(CACHE_FILE, '{not json');
    _resetQuotaCacheForTests();
    expect(readCachedQuota('kimi')).toBeNull();
  });
});
