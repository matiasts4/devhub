/**
 * TestHarness — Base test harness with lock integration for AgentHub tests.
 *
 * Enforces the pattern: acquire → execute → verify → release
 *
 * Usage:
 *   const harness = new TestHarness({ dbPath: ':memory:', lockOwner: 'test-1' });
 *   await harness.setupDb();
 *   const lockIds = await harness.acquireLocks([{ type: 'session', key: 'test-1' }]);
 *   try {
 *     harness.query('INSERT INTO ...');
 *     const ok = await harness.verifyDb('tasks', { where: { id: 'x' }, expected: { status: 'done' } });
 *   } finally {
 *     await harness.releaseLocks(lockIds);
 *     await harness.teardownDb();
 *   }
 */

const Database = require('better-sqlite3');
const { acquire, release, expireStale } = require('../../lib/test-locks');
const { applyTestSchema } = require('../../lib/test-schema');

class TestHarness {
  /**
   * @param {object} options
   * @param {string} options.dbPath - Path to SQLite DB (':memory:' for isolation)
   * @param {string} options.lockOwner - Owner identifier for lock operations
   */
  constructor({ dbPath = ':memory:', lockOwner = 'test-harness' } = {}) {
    this.dbPath = dbPath;
    this.lockOwner = lockOwner;
    this.db = null;
    this._activeLocks = [];
  }

  /**
   * Create a fresh database with the full schema applied.
   * @returns {import('better-sqlite3').Database}
   */
  setupDb() {
    if (this.dbPath === ':memory:') {
      this.db = new Database(':memory:');
    } else {
      this.db = new Database(this.dbPath);
    }
    this.db.pragma('foreign_keys = ON');
    applyTestSchema(this.db);
    return this.db;
  }

  /**
   * Close the database connection.
   */
  teardownDb() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    this._activeLocks = [];
  }

  /**
   * Acquire multiple locks.
   *
   * @param {Array<{type: string, key: string}>} locks - Array of lock specs
   * @returns {Promise<string[]>} Array of lock IDs
   */
  async acquireLocks(locks) {
    const lockIds = [];
    for (const { type, key } of locks) {
      const result = await acquire(this.db, type, key, this.lockOwner);
      if (!result.success) {
        // Release any locks we already acquired before throwing
        if (lockIds.length > 0) {
          await this.releaseLocks(lockIds);
        }
        throw new Error(`Failed to acquire lock ${type}:${key}: ${result.reason}`);
      }
      lockIds.push(result.lockId);
    }
    this._activeLocks.push(...lockIds);
    return lockIds;
  }

  /**
   * Release multiple locks.
   *
   * @param {string[]} lockIds - Array of lock IDs to release
   * @returns {Promise<Array<{success: boolean, reason?: string}>>}
   */
  async releaseLocks(lockIds) {
    const results = [];
    for (const lockId of lockIds) {
      const result = await release(this.db, lockId, this.lockOwner);
      results.push(result);
    }
    this._activeLocks = this._activeLocks.filter((id) => !lockIds.includes(id));
    return results;
  }

  /**
   * Expire all stale locks.
   * @returns {Promise<{expired: number}>}
   */
  async cleanupStale() {
    return expireStale(this.db);
  }

  /**
   * Execute a SQL query on the database.
   *
   * @param {string} sql
   * @param {any[]} [params]
   * @returns {import('better-sqlite3').Statement.RunResult | object | object[]}
   */
  query(sql, params = []) {
    const stmt = this.db.prepare(sql);
    if (sql.trim().toUpperCase().startsWith('SELECT')) {
      if (sql.toUpperCase().includes('LIMIT 1') || sql.includes('COUNT(')) {
        return stmt.get(...params);
      }
      return stmt.all(...params);
    }
    return stmt.run(...params);
  }

  /**
   * Execute a prepared statement with all() for SELECT queries.
   *
   * @param {string} sql
   * @param {any[]} [params]
   * @returns {object[]}
   */
  queryAll(sql, params = []) {
    return this.db.prepare(sql).all(...params);
  }

  /**
   * Execute a prepared statement with get() for single-row SELECT queries.
   *
   * @param {string} sql
   * @param {any[]} [params]
   * @returns {object|undefined}
   */
  queryOne(sql, params = []) {
    return this.db.prepare(sql).get(...params);
  }

  /**
   * Verify database state matches expected values.
   *
   * @param {string} table - Table name
   * @param {object} conditions - WHERE conditions as key-value pairs
   * @param {object} expected - Expected column values
   * @returns {{ pass: boolean, actual: object|null, expected: object }}
   */
  verifyDb(table, conditions, expected) {
    const whereClauses = Object.keys(conditions)
      .map((k) => `${k} = ?`)
      .join(' AND ');
    const values = Object.values(conditions);
    const row = this.db
      .prepare(`SELECT * FROM ${table} WHERE ${whereClauses} LIMIT 1`)
      .get(...values);

    if (!row) {
      return { pass: false, actual: null, expected, message: `No row found in ${table}` };
    }

    const mismatches = {};
    for (const [key, expVal] of Object.entries(expected)) {
      const actualVal = row[key];
      if (actualVal !== expVal) {
        mismatches[key] = { expected: expVal, actual: actualVal };
      }
    }

    if (Object.keys(mismatches).length > 0) {
      return { pass: false, actual: row, expected, mismatches };
    }

    return { pass: true, actual: row, expected };
  }

  /**
   * Run a function within the acquire → execute → verify → release pattern.
   * Automatically acquires locks, runs the action, and releases locks.
   *
   * @param {Array<{type: string, key: string}>} locks - Locks to acquire
   * @param {Function} action - Async function to execute (receives harness instance)
   * @param {Function} [verifyFn] - Optional verification function (receives harness instance)
   * @returns {Promise<{result: any, verification?: any}>}
   */
  async runWithLocks(locks, action, verifyFn = null) {
    let lockIds = [];
    try {
      lockIds = await this.acquireLocks(locks);
      const result = await action(this);
      let verification = null;
      if (verifyFn) {
        verification = await verifyFn(this);
      }
      return { result, verification };
    } finally {
      if (lockIds.length > 0) {
        await this.releaseLocks(lockIds);
      }
    }
  }

  /**
   * Get the underlying database instance.
   * @returns {import('better-sqlite3').Database}
   */
  getDb() {
    return this.db;
  }
}

module.exports = { TestHarness };
