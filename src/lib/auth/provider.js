'use strict';

/**
 * AuthProvider port + factory.
 *
 * Defines the hexagonal port for authentication. Application code depends
 * ONLY on the port surface exported here, never on a vendor SDK.
 *
 * The factory `getAuthProvider()` reads `DEVHUB_AUTH_PROVIDER` (one of
 * `local | supabase | fake`) and returns the corresponding adapter.
 * Swapping vendors is an env flip + a new adapter file in `providers/`,
 * with zero app-code changes (REQ-AUTH-2, REQ-AUTH-3).
 *
 * Refs: REQ-AUTH-1, REQ-AUTH-2, REQ-AUTH-3, REQ-AUTH-4.
 */

const { ConfigError } = require('./errors.js');

const ALLOWED_KINDS = new Set(['local', 'supabase', 'fake']);

/**
 * @typedef {('owner'|'admin'|'member'|'viewer')} WorkspaceRole
 *
 * @typedef {Object} WorkspaceMembership
 * @property {string} workspaceId
 * @property {WorkspaceRole} role
 *
 * @typedef {Object} Session
 * @property {{ id: string, email: string }} user
 * @property {WorkspaceMembership[]} workspaceMemberships
 *
 * @typedef {Object} AuthProvider
 * @property {(input: { email: string }) => Promise<{ ok: true, status: string, delivery?: string } | { ok: false, error: { code: string, message: string } }>} signInWithMagicLink
 * @property {(input: { email: string }) => Promise<{ ok: true, status: string, delivery?: string } | { ok: false, error: { code: string, message: string } }>} signUpWithMagicLink
 * @property {() => Promise<{ ok: true } | { ok: false, error: { code: string, message: string } }>} signOut
 * @property {() => Promise<Session | null>} getSession
 * @property {(token: string) => Promise<Session>} verifyToken
 * @property {() => Promise<string | null>} getAccessToken
 * @property {(cb: (s: Session | null) => void) => () => void} onAuthStateChange
 */

let cachedProvider = null;
let cachedKind = null;

/**
 * Resolve the env-supplied auth provider kind, validating it. Throws
 * ConfigError for unknown / empty values.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {'local'|'supabase'|'fake'}
 */
function resolveAuthProviderKind(env = process.env) {
  const raw = (env.DEVHUB_AUTH_PROVIDER || '').toLowerCase().trim();
  if (raw === '') return 'local'; // default
  if (!ALLOWED_KINDS.has(raw)) {
    throw new ConfigError(`unknown DEVHUB_AUTH_PROVIDER '${raw}' (allowed: local, supabase, fake)`);
  }
  if (raw === 'fake' && env.NODE_ENV === 'production') {
    throw new ConfigError("'fake' adapter is only allowed in test environment");
  }
  return raw;
}

/**
 * Load (and cache) the adapter for the given kind. Lazy-loaded so the
 * supabase SDK is only required when the cloud adapter is selected.
 *
 * @param {'local'|'supabase'|'fake'} kind
 * @returns {AuthProvider}
 */
function loadAdapter(kind) {
  if (kind === 'local') {
    return require('./providers/local.js').createLocalAuthProvider();
  }
  if (kind === 'supabase') {
    return require('./providers/supabase.js').createSupabaseAuthProvider();
  }
  if (kind === 'fake') {
    return require('./providers/fake.js').createFakeAuthProvider();
  }
  throw new ConfigError(`unknown auth provider kind: ${kind}`);
}

/**
 * Get the auth provider for the current process. Cached for the lifetime
 * of the process; tests call `resetAuthProviderForTests()` to clear the
 * cache between cases.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {AuthProvider}
 */
function getAuthProvider(env = process.env) {
  const kind = resolveAuthProviderKind(env);
  if (cachedProvider && cachedKind === kind) return cachedProvider;
  cachedKind = kind;
  cachedProvider = loadAdapter(kind);
  return cachedProvider;
}

/**
 * Reset the cached provider. Test-only helper. Not exported in app code.
 */
function resetAuthProviderForTests() {
  cachedProvider = null;
  cachedKind = null;
}

module.exports = {
  getAuthProvider,
  resolveAuthProviderKind,
  resetAuthProviderForTests,
  ALLOWED_KINDS,
};
