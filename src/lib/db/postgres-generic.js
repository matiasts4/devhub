'use strict';

/**
 * Postgres-generic DB driver.
 *
 * Implements the same query surface (`prepare` / `exec` / `transaction` /
 * `all` / `get` / `run`) as `localClient.js`, but uses `pg` (node-postgres)
 * against a vanilla Postgres / Neon / RDS instance. No Supabase dep at
 * runtime. REQ-PGD-1, REQ-PGD-2, REQ-PGD-3.
 *
 * Placeholder translation: `?` → `$1, $2, ...`. The same `?` is bound
 * to the same `$N` when reused.
 */

const { Pool } = require('pg');
const { ConfigError } = require('../auth/errors.js');

/**
 * Translate `?` placeholders to `$1, $2, ...`. Preserves literal `?`
 * inside single-quoted strings and double-quoted identifiers.
 *
 * @param {string} sql
 * @returns {string}
 */
function translatePlaceholders(sql) {
  let out = '';
  let i = 0;
  let paramIndex = 0;
  while (i < sql.length) {
    const ch = sql[i];
    if (ch === "'") {
      // Single-quoted string literal — copy through to the next unescaped quote.
      out += ch;
      i += 1;
      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] !== "'") {
          out += ch;
          i += 1;
          break;
        }
        if (sql[i] === "'" && sql[i + 1] === "'") {
          // Escaped quote — copy both.
          out += "''";
          i += 2;
          continue;
        }
        out += sql[i];
        i += 1;
      }
      continue;
    }
    if (ch === '"') {
      // Double-quoted identifier — copy through.
      out += ch;
      i += 1;
      while (i < sql.length && sql[i] !== '"') {
        out += sql[i];
        i += 1;
      }
      if (i < sql.length) {
        out += sql[i];
        i += 1;
      }
      continue;
    }
    if (ch === '?') {
      paramIndex += 1;
      out += `$${paramIndex}`;
      i += 1;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/**
 * @param {string} text
 * @param {any[]} params
 * @returns {Promise<{ rows: any[] }>}
 */
async function defaultQuery(text, params) {
  return { rows: [] };
}

/**
 * Create a postgres-generic driver instance.
 *
 * @param {object} options
 * @param {string} [options.url]       - Postgres connection URL.
 * @param {number} [options.poolSize] - Max pool size (default 10).
 * @param {boolean} [options.ssl]     - Use SSL (default false).
 * @param {object} [options.pool]     - Inject a pre-built `pg.Pool` (test-only).
 * @param {Function} [options.query]  - Inject a query function (test-only).
 * @returns {object} a driver with the standard surface.
 */
function createPostgresGenericDriver(options = {}) {
  if (!options.url && !options.pool) {
    throw new ConfigError(
      'createPostgresGenericDriver: requires either options.url or options.pool'
    );
  }

  let pool = options.pool;
  if (!pool) {
    const poolOptions = {
      connectionString: options.url,
      max: options.poolSize || 10,
    };
    if (options.ssl) {
      poolOptions.ssl = { rejectUnauthorized: false };
    }
    pool = new Pool(poolOptions);
  }

  const queryFn = options.query || ((text, params) => pool.query(text, params));

  return {
    kind: 'postgres-generic',
    _pool: pool,
    _query: queryFn,
    _translatePlaceholders: translatePlaceholders,

    /**
     * Prepare a statement. Returns an object with `.all`, `.get`, `.run`
     * (mirrors `better-sqlite3`'s shape, so call sites can switch
     * drivers with minimal churn).
     */
    prepare(sql) {
      const translated = translatePlaceholders(sql);

      const execOnce = async (params = []) => {
        return queryFn(translated, params);
      };

      return {
        sql,
        translated,
        async all(...params) {
          const r = await execOnce(params);
          return r.rows || [];
        },
        async get(...params) {
          const r = await execOnce(params);
          return r.rows && r.rows[0] ? r.rows[0] : null;
        },
        async run(...params) {
          const r = await execOnce(params);
          return { changes: r.rowCount != null ? r.rowCount : 0, lastInsertRowid: null };
        },
      };
    },

    /**
     * Execute a SQL string with no parameter substitution.
     */
    async exec(sql) {
      const translated = translatePlaceholders(sql);
      await queryFn(translated, []);
    },

    /**
     * Run `fn(client)` inside a transaction. The wrapped client forwards
     * `.query` to the pool with BEGIN / COMMIT / ROLLBACK wrapping.
     */
    async transaction(fn) {
      const client = await pool.connect();
      let committed = false;
      try {
        await client.query('BEGIN');
        const wrappedClient = {
          query: (text, params) => client.query(translatePlaceholders(text), params),
        };
        const result = await fn(wrappedClient);
        await client.query('COMMIT');
        committed = true;
        return result;
      } catch (err) {
        if (!committed) {
          try {
            await client.query('ROLLBACK');
          } catch {
            /* ignore */
          }
        }
        throw err;
      } finally {
        client.release();
      }
    },

    async all(sql, params = []) {
      const r = await queryFn(translatePlaceholders(sql), params);
      return r.rows || [];
    },

    async get(sql, params = []) {
      const r = await queryFn(translatePlaceholders(sql), params);
      return r.rows && r.rows[0] ? r.rows[0] : null;
    },

    async run(sql, params = []) {
      const r = await queryFn(translatePlaceholders(sql), params);
      return { changes: r.rowCount != null ? r.rowCount : 0, lastInsertRowid: null };
    },

    async close() {
      await pool.end();
    },
  };
}

module.exports = {
  createPostgresGenericDriver,
  translatePlaceholders,
};
