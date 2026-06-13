/**
 * featureFlag.js — runtime feature flags for pizarra-shared-view-state.
 *
 * Phase 7 of pizarra-shared-view-state. The new behavior
 * (SharedSurfacesProvider, bidirectional SharedSurfaceRegistry,
 * mode transition, browser tabs) is gated behind
 * `NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE`.
 *
 * Convention (per the design §9.1 and the existing pizarra /
 * commandBar / terminal patterns):
 *   - The env var is read once at module scope and cached.
 *   - In dev (NODE_ENV !== 'production'), the flag defaults to ON
 *     so dogfood catches regressions early.
 *   - In production, the flag defaults to OFF so the new code
 *     paths are opt-in until the rollout completes.
 *   - Callers MUST go through `isPizarraSharedViewEnabled()`
 *     rather than reading the env var directly.
 *
 * Migration + flag semantics (design §9.1 + spec):
 *   - OFF: providers/portals/registry mount no-op fallback;
 *     behavior identical to pre-change. No localStorage writes.
 *   - ON: full new behavior; first mount with legacy data
 *     triggers a one-shot migration (`.bak` write → new key →
 *     legacy key purge).
 *
 * The flag value is intentionally string-typed to match Next.js
 * convention. The reader accepts the following truthy spellings
 * (case-insensitive): '1', 'true', 'yes', 'on'. Anything else
 * is treated as false.
 *
 * ── Rollout stages (pizarra-motion-polish P-MP-10) ─────────────────────
 *
 * The flag is rolled out in three stages. The env var is read once
 * at module scope; runtime mutations of the env do NOT take effect
 * without a process restart.
 *
 *   Stage  | Default       | Override             | Owner
 *   -------|---------------|----------------------|---------------------
 *   dev:   | ON            | NEXT_PUBLIC_PIZARRA_ | local devs / CI
 *          | (NODE_ENV !== |   SHARED_VIEW_STATE  |
 *          |  'production')| = 0 / false / off    |
 *   staging:| explicit ON  | NEXT_PUBLIC_PIZARRA_ | pre-prod QA env
 *          | required      |   SHARED_VIEW_STATE  |
 *          |               | = 1 / true / on      |
 *   prod:  | OFF           | NEXT_PUBLIC_PIZARRA_ | production rollout
 *          | (NODE_ENV === |   SHARED_VIEW_STATE  | — gated on Agente 1
 *          |  'production')| = 1 / true / on (after|   (terminales) being
 *          |               |   Agente 1 sign-off) |   stable
 *
 * Why the asymmetry: in dev we want the new code paths to run by
 * default so regressions surface during dogfood. In staging the
 * env var must be set explicitly (no fallback) so a missed env
 * config in the staging deploy blocks the rollout rather than
 * silently shipping a new code path. In production the default
 * is OFF and an explicit opt-in is required — the rollout
 * happens after Agente 1 (terminales) stabilizes the noise
 * filter that pizarra-shared-view-state depends on.
 *
 * See docs/delegation/00-shared-context.md for the dependency
 * table that ties this flag to the terminal noise filter
 * rollout.
 */

const FLAG_ENV = 'NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE';

const TRUTHY = new Set(['1', 'true', 'yes', 'on']);

function readFlagFromEnv(env) {
  if (!env) return null;
  const raw = env[FLAG_ENV];
  if (typeof raw !== 'string') return null;
  return TRUTHY.has(raw.trim().toLowerCase());
}

function defaultForEnv(env) {
  // Dev defaults ON, production defaults OFF.
  if (env && env.NODE_ENV === 'production') return false;
  return true;
}

let cached = null;

function resolve() {
  if (cached !== null) return cached;
  // `process` is available in both Node and the browser bundle
  // (Next.js inlines NEXT_PUBLIC_* at build time). Use a try/catch
  // so this module is safe to import in non-Node test environments.
  let env = null;
  try {
    env = typeof process !== 'undefined' ? process.env : null;
  } catch {
    env = null;
  }
  const explicit = readFlagFromEnv(env);
  cached = explicit != null ? explicit : defaultForEnv(env);
  return cached;
}

/**
 * isPizarraSharedViewEnabled — returns true when the new
 * shared-view-state behavior is active.
 */
export function isPizarraSharedViewEnabled() {
  return resolve();
}

/**
 * getRolloutStage — maps the current process to a rollout stage
 * (see `openspec/changes/terminal-pizarra-stability/specs/phase-b-rollout.md`).
 *
 *   dev     — NODE_ENV !== 'production'
 *   staging — NODE_ENV === 'production' && getFlagSource() === 'env-explicit'
 *   prod    — NODE_ENV === 'production' && getFlagSource() === 'env-default-prod'
 */
export function getRolloutStage() {
  let env = null;
  try {
    env = typeof process !== 'undefined' ? process.env : null;
  } catch {
    env = null;
  }
  if (!env || env.NODE_ENV !== 'production') {
    return 'dev';
  }
  return getFlagSource() === 'env-explicit' ? 'staging' : 'prod';
}

/**
 * getFlagSource — for tests + diagnostics. Returns one of
 *   - 'env-explicit' (the env var was set)
 *   - 'env-default-dev' (env var unset, dev default applied)
 *   - 'env-default-prod' (env var unset, prod default applied)
 */
export function getFlagSource() {
  let env = null;
  try {
    env = typeof process !== 'undefined' ? process.env : null;
  } catch {
    env = null;
  }
  if (readFlagFromEnv(env) != null) return 'env-explicit';
  if (env && env.NODE_ENV === 'production') return 'env-default-prod';
  return 'env-default-dev';
}

/**
 * _resetFlagForTests — clears the cached value. Only used by
 * the test suite when it needs to verify the OFF/ON branches.
 */
export function _resetFlagForTests() {
  cached = null;
}

export default isPizarraSharedViewEnabled;
