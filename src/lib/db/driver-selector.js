'use strict';

/**
 * DB driver selector.
 *
 * Resolves the active driver based on `DEVHUB_DB_DRIVER`:
 *   - `sqlite`            → `localClient` (default; local-dev mode)
 *   - `supabase`          → Supabase client (existing; CAP-3 path)
 *   - `postgres-generic`  → `pg`-backed driver (REQ-PGD-3)
 *
 * Fails closed on unknown values.
 */

const { ConfigError } = require('../auth/errors.js');

const ALLOWED = new Set(['sqlite', 'supabase', 'postgres-generic']);

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {'sqlite'|'supabase'|'postgres-generic'}
 */
function resolveDbDriverKind(env = process.env) {
  const raw = (env.DEVHUB_DB_DRIVER || 'sqlite').toLowerCase().trim();
  if (!ALLOWED.has(raw)) {
    throw new ConfigError(
      `unknown DEVHUB_DB_DRIVER '${raw}' (allowed: sqlite, supabase, postgres-generic)`
    );
  }
  return raw;
}

/**
 * Get a driver instance. Cached for the lifetime of the process.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {object}
 */
function getDbDriver(env = process.env) {
  const kind = resolveDbDriverKind(env);
  if (kind === 'sqlite') {
    return require('./localClient.js');
  }
  if (kind === 'supabase') {
    // The Supabase client is built lazily inside devhub-mcp/server.js
    // and other entry points; we return a marker that callers can
    // detect.
    return { kind: 'supabase' };
  }
  if (kind === 'postgres-generic') {
    const { createPostgresGenericDriver } = require('./postgres-generic.js');
    const url = env.DATABASE_URL;
    if (!url) {
      throw new ConfigError('DEVHUB_DB_DRIVER=postgres-generic requires DATABASE_URL');
    }
    return createPostgresGenericDriver({ url, ssl: env.DATABASE_SSL === 'true' });
  }
  throw new ConfigError(`unreachable: ${kind}`);
}

module.exports = {
  getDbDriver,
  resolveDbDriverKind,
  ALLOWED,
};
