/**
 * Unit Tests for LockManager
 *
 * Tests all lock operations: acquire, release, extend, expireStale, status, statusByKey
 */

const Database = require('better-sqlite3');
const {
  acquire,
  release,
  extend,
  expireStale,
  status,
  statusByKey,
  forceRelease,
  clearAll,
  ensureLockTable,
  VALID_TYPES,
  DEFAULT_TTL,
} = require('../../lib/test-locks');

function createTestDb() {
  const db = new Database(':memory:');
  ensureLockTable(db);
  return db;
}

describe('LockManager', () => {
  let db;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  describe('acquire', () => {
    test('acquires a lock successfully', async () => {
      const result = await acquire(db, 'session', 'test-1', 'owner-a');
      expect(result.success).toBe(true);
      expect(result.lockId).toMatch(/^lock-/);
      expect(result.expiresAt).toBeDefined();
    });

    test('rejects invalid lock type', async () => {
      const result = await acquire(db, 'invalid', 'test-1', 'owner-a');
      expect(result.success).toBe(false);
      expect(result.reason).toContain('Invalid lock type');
    });

    test('prevents duplicate lock on same key', async () => {
      const r1 = await acquire(db, 'session', 'test-1', 'owner-a');
      expect(r1.success).toBe(true);

      const r2 = await acquire(db, 'session', 'test-1', 'owner-b', { maxRetries: 0 });
      expect(r2.success).toBe(false);
      expect(r2.reason).toContain('LOCK_HELD');
    });

    test('allows different keys of same type', async () => {
      const r1 = await acquire(db, 'session', 'test-1', 'owner-a');
      const r2 = await acquire(db, 'session', 'test-2', 'owner-b');
      expect(r1.success).toBe(true);
      expect(r2.success).toBe(true);
    });

    test('allows same key of different type', async () => {
      const r1 = await acquire(db, 'session', 'test-1', 'owner-a');
      const r2 = await acquire(db, 'endpoint', 'test-1', 'owner-b');
      expect(r1.success).toBe(true);
      expect(r2.success).toBe(true);
    });

    test('uses custom TTL', async () => {
      const result = await acquire(db, 'session', 'test-1', 'owner-a', { ttl: 10 });
      expect(result.success).toBe(true);

      const row = db
        .prepare('SELECT expires_at FROM test_locks WHERE lock_id = ?')
        .get(result.lockId);
      const expiresAt = new Date(row.expires_at);
      const now = new Date();
      const diff = expiresAt - now;
      expect(diff).toBeLessThan(15000); // Should be ~10s
      expect(diff).toBeGreaterThan(5000);
    });

    test('stores metadata', async () => {
      const result = await acquire(db, 'flow', 'test-flow', 'owner-a', {
        metadata: JSON.stringify({ test: 'value' }),
      });
      expect(result.success).toBe(true);

      const row = db
        .prepare('SELECT metadata FROM test_locks WHERE lock_id = ?')
        .get(result.lockId);
      expect(JSON.parse(row.metadata)).toEqual({ test: 'value' });
    });

    test('supports all valid lock types', async () => {
      for (const type of VALID_TYPES) {
        const result = await acquire(db, type, `test-${type}`, 'owner-a');
        expect(result.success).toBe(true);
      }
    });
  });

  describe('release', () => {
    test('releases a lock with correct owner', async () => {
      const acq = await acquire(db, 'session', 'test-1', 'owner-a');
      const result = await release(db, acq.lockId, 'owner-a');
      expect(result.success).toBe(true);

      const row = db.prepare('SELECT * FROM test_locks WHERE lock_id = ?').get(acq.lockId);
      expect(row).toBeUndefined();
    });

    test('rejects release with wrong owner', async () => {
      const acq = await acquire(db, 'session', 'test-1', 'owner-a');
      const result = await release(db, acq.lockId, 'owner-b');
      expect(result.success).toBe(false);
      expect(result.reason).toContain('LOCK_OWNER_MISMATCH');
    });

    test('rejects release of non-existent lock', async () => {
      const result = await release(db, 'non-existent', 'owner-a');
      expect(result.success).toBe(false);
      expect(result.reason).toContain('LOCK_NOT_FOUND');
    });
  });

  describe('extend', () => {
    test('extends lock TTL', async () => {
      const acq = await acquire(db, 'session', 'test-1', 'owner-a', { ttl: 5 });
      const result = await extend(db, acq.lockId, 'owner-a', 30);
      expect(result.success).toBe(true);
      expect(result.expiresAt).toBeDefined();

      const row = db.prepare('SELECT expires_at FROM test_locks WHERE lock_id = ?').get(acq.lockId);
      const expiresAt = new Date(row.expires_at);
      const now = new Date();
      const diff = expiresAt - now;
      expect(diff).toBeGreaterThan(20000); // Should be ~30s
    });

    test('rejects extend with wrong owner', async () => {
      const acq = await acquire(db, 'session', 'test-1', 'owner-a');
      const result = await extend(db, acq.lockId, 'owner-b', 30);
      expect(result.success).toBe(false);
      expect(result.reason).toContain('LOCK_OWNER_MISMATCH');
    });
  });

  describe('expireStale', () => {
    test('removes expired locks', async () => {
      // Create an already-expired lock
      const pastExpiry = new Date(Date.now() - 5000).toISOString();
      db.prepare(
        'INSERT INTO test_locks (lock_id, lock_type, lock_key, owner, expires_at) VALUES (?, ?, ?, ?, ?)'
      ).run('expired-lock', 'session', 'test-expired', 'owner-a', pastExpiry);

      // Create a valid lock
      const acq = await acquire(db, 'session', 'test-valid', 'owner-a', { ttl: 60 });

      const result = await expireStale(db);
      expect(result.expired).toBe(1);

      // Verify expired lock is gone
      const expired = db.prepare('SELECT * FROM test_locks WHERE lock_id = ?').get('expired-lock');
      expect(expired).toBeUndefined();

      // Verify valid lock remains
      const valid = db.prepare('SELECT * FROM test_locks WHERE lock_id = ?').get(acq.lockId);
      expect(valid).toBeDefined();
    });

    test('returns 0 when no stale locks', async () => {
      await acquire(db, 'session', 'test-1', 'owner-a', { ttl: 60 });
      const result = await expireStale(db);
      expect(result.expired).toBe(0);
    });
  });

  describe('status', () => {
    test('returns all locks', async () => {
      await acquire(db, 'session', 'test-1', 'owner-a');
      await acquire(db, 'endpoint', 'test-2', 'owner-b');

      const locks = await status(db);
      expect(locks.length).toBe(2);
    });

    test('filters by type', async () => {
      await acquire(db, 'session', 'test-1', 'owner-a');
      await acquire(db, 'endpoint', 'test-2', 'owner-b');

      const locks = await status(db, { type: 'session' });
      expect(locks.length).toBe(1);
      expect(locks[0].type).toBe('session');
    });

    test('filters by owner', async () => {
      await acquire(db, 'session', 'test-1', 'owner-a');
      await acquire(db, 'session', 'test-2', 'owner-b');

      const locks = await status(db, { owner: 'owner-a' });
      expect(locks.length).toBe(1);
      expect(locks[0].owner).toBe('owner-a');
    });

    test('includes isExpired flag', async () => {
      const acq = await acquire(db, 'session', 'test-1', 'owner-a', { ttl: 60 });
      const locks = await status(db);
      const lock = locks.find((l) => l.lockId === acq.lockId);
      expect(lock.isExpired).toBe(false);
    });
  });

  describe('statusByKey', () => {
    test('returns lock by type and key', async () => {
      await acquire(db, 'session', 'test-1', 'owner-a');
      const result = await statusByKey(db, 'session', 'test-1');
      expect(result.found).toBe(true);
      expect(result.owner).toBe('owner-a');
    });

    test('returns not found for missing lock', async () => {
      const result = await statusByKey(db, 'session', 'non-existent');
      expect(result.found).toBe(false);
    });
  });

  describe('forceRelease', () => {
    test('releases lock without owner check', async () => {
      const acq = await acquire(db, 'session', 'test-1', 'owner-a');
      const result = await forceRelease(db, acq.lockId);
      expect(result.success).toBe(true);
      expect(result.previousOwner).toBe('owner-a');
    });

    test('returns error for non-existent lock', async () => {
      const result = await forceRelease(db, 'non-existent');
      expect(result.success).toBe(false);
      expect(result.reason).toContain('LOCK_NOT_FOUND');
    });
  });

  describe('clearAll', () => {
    test('removes all locks', async () => {
      await acquire(db, 'session', 'test-1', 'owner-a');
      await acquire(db, 'endpoint', 'test-2', 'owner-b');
      await acquire(db, 'flow', 'test-3', 'owner-c');

      const result = await clearAll(db);
      expect(result.cleared).toBe(3);

      const locks = await status(db);
      expect(locks.length).toBe(0);
    });
  });

  describe('concurrent acquisition', () => {
    test('only one owner wins the lock', async () => {
      const results = await Promise.all([
        acquire(db, 'session', 'test-1', 'owner-a', { maxRetries: 0 }),
        acquire(db, 'session', 'test-1', 'owner-b', { maxRetries: 0 }),
        acquire(db, 'session', 'test-1', 'owner-c', { maxRetries: 0 }),
      ]);

      const winners = results.filter((r) => r.success);
      const losers = results.filter((r) => !r.success);
      expect(winners.length).toBe(1);
      expect(losers.length).toBe(2);
    });
  });
});
