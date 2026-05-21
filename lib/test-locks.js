/**
 * LockManager — SQLite-based distributed locks for AgentHub test isolation.
 *
 * Provides mutex-style locking with TTL, retry backoff, and owner enforcement.
 * Works with both file-based and :memory: SQLite databases.
 *
 * Usage:
 *   const { acquire, release, extend, expireStale, status, statusByKey } = require('./lib/test-locks');
 *   const result = await acquire('session', 'test-1', 'worker-a');
 *   // ... do work ...
 *   await release(result.lockId, 'worker-a');
 */

const Database = require('better-sqlite3');

const VALID_TYPES = ['session', 'endpoint', 'resource', 'flow'];
const DEFAULT_TTL = parseInt(process.env.LOCK_TTL_SECONDS || '60', 10);
const MAX_RETRIES = 5;
const BASE_DELAY_MS = 100;
const MAX_DELAY_MS = 5000;

/**
 * Generate a random jitter between -50% and +50% of the given delay.
 */
function jitter(delay) {
  return delay * (0.5 + Math.random());
}

/**
 * Sleep for the given number of milliseconds.
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generate a unique lock ID.
 */
function generateLockId() {
  return `lock-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Ensure the test_locks table exists on the given database.
 * Idempotent — safe to call multiple times.
 */
function ensureLockTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS test_locks (
      lock_id TEXT PRIMARY KEY,
      lock_type TEXT NOT NULL CHECK(lock_type IN ('session', 'endpoint', 'resource', 'flow')),
      lock_key TEXT NOT NULL,
      owner TEXT NOT NULL,
      acquired_at TEXT DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL,
      metadata TEXT,
      UNIQUE(lock_type, lock_key)
    );
    CREATE INDEX IF NOT EXISTS idx_test_locks_expires ON test_locks(expires_at);
    CREATE INDEX IF NOT EXISTS idx_test_locks_type_key ON test_locks(lock_type, lock_key);
    CREATE INDEX IF NOT EXISTS idx_test_locks_owner ON test_locks(owner);
  `);
}

/**
 * Calculate expiry timestamp (ISO string) from now + seconds.
 */
function expiryFromNow(seconds) {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

/**
 * Acquire a lock with retry and exponential backoff.
 *
 * @param {import('better-sqlite3').Database} db - SQLite database instance
 * @param {string} type - Lock type: 'session' | 'endpoint' | 'resource' | 'flow'
 * @param {string} key - Lock key (unique within type)
 * @param {string} owner - Owner identifier (e.g. worker name, test ID)
 * @param {object} [options]
 * @param {number} [options.ttl] - Time-to-live in seconds (default: LOCK_TTL_SECONDS env or 60)
 * @param {number} [options.maxRetries] - Max retry attempts (default: 5)
 * @param {string} [options.metadata] - JSON metadata string
 * @returns {Promise<{success: boolean, lockId?: string, expiresAt?: string, reason?: string}>}
 */
async function acquire(db, type, key, owner, options = {}) {
  if (!VALID_TYPES.includes(type)) {
    return {
      success: false,
      reason: `Invalid lock type: ${type}. Must be one of: ${VALID_TYPES.join(', ')}`,
    };
  }

  ensureLockTable(db);

  const ttl = options.ttl || DEFAULT_TTL;
  const maxRetries = options.maxRetries ?? MAX_RETRIES;
  const expiresAt = expiryFromNow(ttl);
  const lockId = generateLockId();
  const metadata = options.metadata || null;

  const stmt = db.prepare(`
    INSERT INTO test_locks (lock_id, lock_type, lock_key, owner, expires_at, metadata)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      db.transaction(() => {
        // Check if lock already exists and is not expired
        const existing = db
          .prepare(
            `
          SELECT lock_id, owner, expires_at FROM test_locks
          WHERE lock_type = ? AND lock_key = ?
        `
          )
          .get(type, key);

        if (existing) {
          const isExpired = new Date(existing.expires_at) <= new Date();
          if (!isExpired) {
            throw new Error(
              `LOCK_HELD: Lock ${type}:${key} is held by ${existing.owner} (expires ${existing.expires_at})`
            );
          }
          // Lock is expired — delete it and acquire
          db.prepare('DELETE FROM test_locks WHERE lock_type = ? AND lock_key = ?').run(type, key);
        }

        stmt.run(lockId, type, key, owner, expiresAt, metadata);
      })();

      return { success: true, lockId, expiresAt };
    } catch (err) {
      if (err.message.startsWith('LOCK_HELD:')) {
        if (attempt === maxRetries) {
          return { success: false, reason: err.message };
        }
        // Exponential backoff with jitter
        const delay = Math.min(BASE_DELAY_MS * Math.pow(2, attempt), MAX_DELAY_MS);
        await sleep(jitter(delay));
        continue;
      }
      // Re-throw unexpected errors
      throw err;
    }
  }

  return {
    success: false,
    reason: `Lock ${type}:${key} could not be acquired after ${maxRetries + 1} attempts`,
  };
}

/**
 * Release a lock. Owner must match.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} lockId
 * @param {string} owner
 * @returns {Promise<{success: boolean, reason?: string}>}
 */
async function release(db, lockId, owner) {
  ensureLockTable(db);

  const result = db
    .prepare(
      `
    DELETE FROM test_locks WHERE lock_id = ? AND owner = ?
  `
    )
    .run(lockId, owner);

  if (result.changes === 0) {
    // Check if lock exists with different owner
    const existing = db.prepare('SELECT owner FROM test_locks WHERE lock_id = ?').get(lockId);
    if (existing) {
      return {
        success: false,
        reason: `LOCK_OWNER_MISMATCH: Lock ${lockId} is owned by ${existing.owner}, not ${owner}`,
      };
    }
    return { success: false, reason: `LOCK_NOT_FOUND: Lock ${lockId} does not exist` };
  }

  return { success: true };
}

/**
 * Extend a lock's TTL.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} lockId
 * @param {string} owner
 * @param {number} [extraSeconds] - Additional seconds (default: DEFAULT_TTL)
 * @returns {Promise<{success: boolean, expiresAt?: string, reason?: string}>}
 */
async function extend(db, lockId, owner, extraSeconds) {
  ensureLockTable(db);

  const seconds = extraSeconds || DEFAULT_TTL;
  const newExpires = expiryFromNow(seconds);

  const result = db
    .prepare(
      `
    UPDATE test_locks SET expires_at = ? WHERE lock_id = ? AND owner = ?
  `
    )
    .run(newExpires, lockId, owner);

  if (result.changes === 0) {
    const existing = db.prepare('SELECT owner FROM test_locks WHERE lock_id = ?').get(lockId);
    if (existing) {
      return {
        success: false,
        reason: `LOCK_OWNER_MISMATCH: Lock ${lockId} is owned by ${existing.owner}, not ${owner}`,
      };
    }
    return { success: false, reason: `LOCK_NOT_FOUND: Lock ${lockId} does not exist` };
  }

  return { success: true, expiresAt: newExpires };
}

/**
 * Expire all stale (expired) locks.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {Promise<{expired: number}>}
 */
async function expireStale(db) {
  ensureLockTable(db);

  const now = new Date().toISOString();
  const result = db
    .prepare(
      `
    DELETE FROM test_locks WHERE expires_at <= ?
  `
    )
    .run(now);

  return { expired: result.changes };
}

/**
 * Get status of all locks.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {object} [options]
 * @param {string} [options.type] - Filter by lock type
 * @param {string} [options.owner] - Filter by owner
 * @returns {Promise<Array<{lockId: string, type: string, key: string, owner: string, acquiredAt: string, expiresAt: string, isExpired: boolean, metadata: string|null}>>}
 */
async function status(db, options = {}) {
  ensureLockTable(db);

  let query = `SELECT lock_id, lock_type, lock_key, owner, acquired_at, expires_at, metadata FROM test_locks WHERE 1=1`;
  const params = [];

  if (options.type) {
    query += ` AND lock_type = ?`;
    params.push(options.type);
  }
  if (options.owner) {
    query += ` AND owner = ?`;
    params.push(options.owner);
  }

  query += ` ORDER BY acquired_at DESC`;

  const rows = db.prepare(query).all(...params);
  const now = new Date();

  return rows.map((row) => ({
    lockId: row.lock_id,
    type: row.lock_type,
    key: row.lock_key,
    owner: row.owner,
    acquiredAt: row.acquired_at,
    expiresAt: row.expires_at,
    isExpired: new Date(row.expires_at) <= now,
    metadata: row.metadata,
  }));
}

/**
 * Get status of a specific lock by type and key.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} type
 * @param {string} key
 * @returns {Promise<{found: boolean, lockId?: string, owner?: string, expiresAt?: string, isExpired?: boolean, reason?: string}>}
 */
async function statusByKey(db, type, key) {
  ensureLockTable(db);

  const row = db
    .prepare(
      `
    SELECT lock_id, lock_type, lock_key, owner, acquired_at, expires_at, metadata
    FROM test_locks WHERE lock_type = ? AND lock_key = ?
  `
    )
    .get(type, key);

  if (!row) {
    return { found: false, reason: `No lock found for ${type}:${key}` };
  }

  return {
    found: true,
    lockId: row.lock_id,
    owner: row.owner,
    expiresAt: row.expires_at,
    isExpired: new Date(row.expires_at) <= new Date(),
    metadata: row.metadata,
  };
}

/**
 * Force-release a lock by ID (admin override — no owner check).
 * Use with caution, primarily for CLI/debugging.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} lockId
 * @returns {Promise<{success: boolean, previousOwner?: string, reason?: string}>}
 */
async function forceRelease(db, lockId) {
  ensureLockTable(db);

  const existing = db.prepare('SELECT owner FROM test_locks WHERE lock_id = ?').get(lockId);
  if (!existing) {
    return { success: false, reason: `LOCK_NOT_FOUND: Lock ${lockId} does not exist` };
  }

  db.prepare('DELETE FROM test_locks WHERE lock_id = ?').run(lockId);
  return { success: true, previousOwner: existing.owner };
}

/**
 * Clear all locks (admin override).
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {Promise<{cleared: number}>}
 */
async function clearAll(db) {
  ensureLockTable(db);

  const result = db.prepare('DELETE FROM test_locks').run();
  return { cleared: result.changes };
}

module.exports = {
  acquire,
  release,
  extend,
  expireStale,
  status,
  statusByKey,
  forceRelease,
  clearAll,
  ensureLockTable,
  // Constants (useful for tests)
  VALID_TYPES,
  DEFAULT_TTL,
  MAX_RETRIES,
  BASE_DELAY_MS,
  MAX_DELAY_MS,
};
