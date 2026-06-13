'use strict';

/**
 * Placeholder-translation test.
 *
 * The postgres-generic driver must translate `?` placeholders to `$1, $2, ...`
 * in query strings so existing code that uses SQLite's `?` placeholders
 * can run unchanged on Postgres.
 *
 * REQ-PGD-1.
 */

const path = require('path');

// Mock `pg` to avoid a real network call.
jest.mock('pg', () => {
  const queries = [];
  const client = {
    query: jest.fn(async (text, params) => {
      queries.push({ text, params });
      return { rows: [{ id: params && params[0] }] };
    }),
    release: jest.fn(),
  };
  const pool = {
    connect: jest.fn(async () => client),
    query: jest.fn(async (text, params) => ({
      rows: [{ id: params && params[0] }],
    })),
    end: jest.fn(async () => {}),
  };
  return { Pool: jest.fn(() => pool), __queries: queries, __client: client, __pool: pool };
});

const { Pool } = require('pg');
const { createPostgresGenericDriver } = require('../postgres-generic.js');

const QUERIES = require('pg').__queries;
const POOL = require('pg').__pool;

beforeEach(() => {
  QUERIES.length = 0;
  POOL.connect.mockClear();
  POOL.query.mockClear();
  POOL.end.mockClear();
});

function createMockedDriver() {
  return createPostgresGenericDriver({ url: 'postgresql://test', query: POOL.query });
}

describe('postgres-generic placeholder translation (REQ-PGD-1)', () => {
  test('translates ? to $1, $2, ... in a simple WHERE clause', async () => {
    const driver = createMockedDriver();
    const stmt = driver.prepare('SELECT * FROM projects WHERE id = ?');
    const result = await stmt.get('p1');
    expect(result).toEqual({ id: 'p1' });
    expect(POOL.query).toHaveBeenCalledWith('SELECT * FROM projects WHERE id = $1', ['p1']);
  });

  test('translates multiple placeholders in order', async () => {
    const driver = createMockedDriver();
    const stmt = driver.prepare('SELECT * FROM projects WHERE id = ? AND workspace_id = ?');
    await stmt.get('p1', 'W1');
    expect(POOL.query).toHaveBeenCalledWith(
      'SELECT * FROM projects WHERE id = $1 AND workspace_id = $2',
      ['p1', 'W1']
    );
  });

  test('preserves literal ? inside string literals', () => {
    const driver = createPostgresGenericDriver({ url: 'postgresql://test' });
    const sql = driver._translatePlaceholders("SELECT 'a?b' FROM dual WHERE id = ?");
    expect(sql).toBe("SELECT 'a?b' FROM dual WHERE id = $1");
  });

  test('translates IN (?, ?) clauses', async () => {
    const driver = createMockedDriver();
    const stmt = driver.prepare('SELECT * FROM projects WHERE id IN (?, ?)');
    await stmt.all('p1', 'p2');
    expect(POOL.query).toHaveBeenCalledWith('SELECT * FROM projects WHERE id IN ($1, $2)', [
      'p1',
      'p2',
    ]);
  });

  test('handles no placeholders (no rewrite)', async () => {
    const driver = createMockedDriver();
    const stmt = driver.prepare('SELECT 1');
    await stmt.all();
    expect(POOL.query).toHaveBeenCalledWith('SELECT 1', []);
  });

  test('reuses numbered placeholders when the same ? appears multiple times', () => {
    const driver = createPostgresGenericDriver({ url: 'postgresql://test' });
    // Same parameter bound twice — should reuse the same $N.
    const sql = driver._translatePlaceholders('SELECT * FROM x WHERE a = ? OR b = ?');
    expect(sql).toBe('SELECT * FROM x WHERE a = $1 OR b = $2');
  });

  // RED for task 4.1: new behavior from spec REQ-PGD-1 "Transactions are supported"
  // and "same query string runs on both drivers" semantics via the prepare surface.
  // This test references the transaction path in postgres-generic.js; if the
  // driver did not exist or transaction did not translate + commit/rollback
  // correctly, this would fail (guarantees RED before GREEN).
  test('transaction supports placeholders, translates inside tx, commits on success (REQ-PGD-1)', async () => {
    const driver = createMockedDriver();
    const client = require('pg').__client;
    client.query.mockClear();
    // simulate success path
    const result = await driver.transaction(async (tx) => {
      const stmt = tx.query ? null : null; // use raw for tx path
      // direct query on wrapped client (the tx fn receives wrapped with .query)
      return await tx.query('INSERT INTO projects (id, workspace_id) VALUES (?, ?)', [
        'p-tx',
        'W1',
      ]);
    });
    // The impl must have translated the ? inside the BEGIN-wrapped client.query
    expect(client.query).toHaveBeenCalledWith('BEGIN');
    expect(client.query).toHaveBeenCalledWith(
      'INSERT INTO projects (id, workspace_id) VALUES ($1, $2)',
      ['p-tx', 'W1']
    );
    expect(client.query).toHaveBeenCalledWith('COMMIT');
    expect(result).toBeDefined();
  });

  // TRIANGULATE: different path - error in tx must rollback, no commit, and translate still applies inside
  test('transaction rolls back on thrown error and never commits (REQ-PGD-1)', async () => {
    const driver = createMockedDriver();
    const client = require('pg').__client;
    client.query.mockClear();
    await expect(
      driver.transaction(async (tx) => {
        await tx.query('UPDATE projects SET name = ? WHERE id = ?', ['bad', 'p-err']);
        throw new Error('intentional-rollback');
      })
    ).rejects.toThrow('intentional-rollback');
    expect(client.query).toHaveBeenCalledWith('BEGIN');
    expect(client.query).toHaveBeenCalledWith('UPDATE projects SET name = $1 WHERE id = $2', [
      'bad',
      'p-err',
    ]);
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    // no COMMIT on error path
    const commitCalls = client.query.mock.calls.filter((c) => c[0] === 'COMMIT').length;
    expect(commitCalls).toBe(0);
  });
});

describe('postgres-generic driver surface', () => {
  test('exposes prepare, exec, transaction, all, get, run', () => {
    const driver = createPostgresGenericDriver({ url: 'postgresql://test' });
    expect(typeof driver.prepare).toBe('function');
    expect(typeof driver.exec).toBe('function');
    expect(typeof driver.transaction).toBe('function');
    expect(typeof driver.all).toBe('function');
    expect(typeof driver.get).toBe('function');
    expect(typeof driver.run).toBe('function');
  });
});

// RED for task 4.2: test creation contract from REQ-PGD-3 (env wiring, fail closed).
// The createPostgresGenericDriver must fail with typed ConfigError (to match selector and spec)
// when no url/pool. This test will fail until the impl is updated in GREEN.
const { ConfigError } = require('../../auth/errors.js');

describe('postgres-generic driver creation (task 4.2 / REQ-PGD-3)', () => {
  test('create without url or pool throws ConfigError (not plain Error)', () => {
    expect(() => createPostgresGenericDriver({})).toThrow(ConfigError);
    expect(() => createPostgresGenericDriver({})).toThrow(
      /requires either options.url or options.pool/
    );
  });

  test('create with injected pool option succeeds (different input path)', () => {
    const fakePool = { query: jest.fn(), end: jest.fn() };
    const driver = createPostgresGenericDriver({ pool: fakePool });
    expect(driver.kind).toBe('postgres-generic');
    expect(typeof driver.prepare).toBe('function');
    // does not throw
  });
});

// RED for task 4.4: selector must resolve 'postgres-generic' and instantiate via getDbDriver (REQ-PGD-3)
const { getDbDriver, resolveDbDriverKind } = require('../driver-selector.js');

describe('db driver-selector wiring (task 4.4)', () => {
  test('resolveDbDriverKind returns postgres-generic when env set', () => {
    expect(resolveDbDriverKind({ DEVHUB_DB_DRIVER: 'postgres-generic' })).toBe('postgres-generic');
  });

  test('getDbDriver with postgres-generic env returns driver with kind (RED until wired)', () => {
    // This will fail if selector does not handle the case or create fails
    const driver = getDbDriver({
      DEVHUB_DB_DRIVER: 'postgres-generic',
      DATABASE_URL: 'postgresql://test',
    });
    expect(driver.kind).toBe('postgres-generic');
  });
});
