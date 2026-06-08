/**
 * bootstrapLock.js — shared file-based mutex for swarm bootstrap phases.
 *
 * T2.4 / R-BUF-4 — lock dedup across preflight + launch paths.
 *
 * The preflight scripts (`scripts/verify-swarm-launch.mjs`,
 * `scripts/collect-swarm-launch-evidence.mjs`) and the launch paths in
 * `src/lib/agentLaunchWrapper.js` previously created the lock file
 * `/tmp/devhub-bootstrap-${missionId}-${role}.lock` ad-hoc, with
 * inconsistent semantics (just a PID string, no atomicity guarantee,
 * no TTL). This module centralizes the lock contract so the preflight
 * and launch paths can adopt the same primitive in future batches.
 *
 * Contract:
 *   - Lock path: `/tmp/devhub-bootstrap-${missionId}-${role}.lock`
 *   - Lock content: JSON `{ pid, acquiredAt, expiresAt }` so stale
 *     locks can be detected by age even if the holder PID is still
 *     alive (a long-running agent that crashed and respawned can leave
 *     a stale lock; the TTL guards against that).
 *   - Atomicity: `fs.openSync(path, 'wx')` fails if the file already
 *     exists, giving us a single-syscall atomic create.
 *   - TTL: locks older than `ttlMs` (default 30s) are treated as
 *     not-held and can be overwritten.
 *   - Concurrency: safe to call from multiple processes; the OS-level
 *     `O_CREAT|O_EXCL` guarantees exactly one winner.
 *
 * This module is ADDITIVE — it does not replace the existing
 * `createInjectionLock` / `detectLegacyBootstrapLock` helpers in
 * `src/lib/agentLaunchWrapper.js`. Those helpers manage a different
 * lock file (`devhub-injection-*.lock`) with state-machine semantics
 * (pending → injecting → injected) that this module does not need.
 * The two are intentionally separate.
 */

import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_LOCK_DIR = '/tmp';
const LOCK_PREFIX = 'devhub-bootstrap';

export const BOOTSTRAP_LOCK_TTL_MS_DEFAULT = 30000;

function buildLockPath(missionId, role, lockDir = DEFAULT_LOCK_DIR) {
  return path.join(
    lockDir,
    `${LOCK_PREFIX}-${missionId || 'unknown'}-${role || 'agent'}.lock`
  );
}

function _pidIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function _readLockMetadata(lockPath) {
  if (!fs.existsSync(lockPath)) return null;
  let raw;
  try {
    raw = fs.readFileSync(lockPath, 'utf8');
  } catch {
    return null;
  }
  // New-format lock: JSON with pid/acquiredAt/expiresAt
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {
    /* fall through to legacy format */
  }
  // Legacy format: a bare PID string (or anything non-JSON).
  // Treat it as a held lock owned by the parsed integer pid (if any).
  const pid = parseInt(String(raw).trim(), 10);
  return Number.isFinite(pid) ? { pid, legacy: true } : null;
}

/**
 * T2.4 — try to acquire a bootstrap lock for the given mission/role.
 *
 * Returns:
 *   - `{ acquired: true, lockPath, holder: { pid, acquiredAt, expiresAt } }`
 *     on success.
 *   - `{ acquired: false, lockPath, holder, ageMs }` if the lock is held
 *     by another process AND the holder is not stale.
 *   - `{ acquired: true, lockPath, holder, recovered: true }` if the
 *     existing lock was stale (older than `ttlMs`) and was overwritten.
 *
 * @param {object} params
 * @param {string} params.missionId
 * @param {string} params.role
 * @param {number} [params.ttlMs=30000] - lock TTL in ms
 * @param {string} [params.lockDir='/tmp'] - directory to place the lock
 * @returns {{ acquired: boolean, lockPath: string, holder?: object, ageMs?: number, recovered?: boolean }}
 */
export function tryAcquireLock({ missionId, role, ttlMs = BOOTSTRAP_LOCK_TTL_MS_DEFAULT, lockDir = DEFAULT_LOCK_DIR } = {}) {
  if (!missionId || !role) {
    throw new Error('tryAcquireLock: missionId and role are required');
  }
  const lockPath = buildLockPath(missionId, role, lockDir);
  const now = Date.now();
  const expiresAt = now + Math.max(0, ttlMs);
  const payload = {
    pid: process.pid,
    acquiredAt: new Date(now).toISOString(),
    expiresAt: new Date(expiresAt).toISOString(),
  };

  // Try the atomic create. `wx` = O_CREAT|O_EXCL — fails if exists.
  let fd;
  try {
    fd = fs.openSync(lockPath, 'wx');
  } catch (error) {
    if (error && error.code === 'EEXIST') {
      // Lock exists — check whether it is stale.
      const prior = _readLockMetadata(lockPath);
      if (prior && prior.acquiredAt) {
        const ageMs = now - Date.parse(prior.acquiredAt);
        if (Number.isFinite(ageMs) && ageMs > ttlMs) {
          // Stale: overwrite. Best-effort unlink first in case another
          // process raced us between openSync-fail and the overwrite.
          try {
            fs.unlinkSync(lockPath);
          } catch {
            /* raced — another process took it; treat as not-held */
          }
          try {
            fd = fs.openSync(lockPath, 'wx');
            fs.writeSync(fd, JSON.stringify(payload, null, 2));
            fs.closeSync(fd);
            return {
              acquired: true,
              lockPath,
              holder: payload,
              recovered: true,
            };
          } catch {
            return {
              acquired: false,
              lockPath,
              holder: prior,
              ageMs,
            };
          }
        }
        return {
          acquired: false,
          lockPath,
          holder: prior,
          ageMs: Number.isFinite(ageMs) ? ageMs : 0,
        };
      }
      // Lock file exists but is unreadable / corrupt — treat as held
      // to avoid races; caller can releaseLock() to clear it.
      return {
        acquired: false,
        lockPath,
        holder: null,
        ageMs: 0,
      };
    }
    // Any other error: surface as "not acquired".
    return { acquired: false, lockPath, holder: null, ageMs: 0 };
  }

  // Won the race. Write the metadata and close the fd.
  try {
    fs.writeSync(fd, JSON.stringify(payload, null, 2));
  } finally {
    try {
      fs.closeSync(fd);
    } catch {
      /* ignore */
    }
  }
  return { acquired: true, lockPath, holder: payload };
}

/**
 * T2.4 — release a bootstrap lock previously acquired by
 * `tryAcquireLock`. Best-effort: silently no-ops if the lock does
 * not exist (so it's safe to call from cleanup paths that may run
 * before the lock is created).
 *
 * @param {object} params
 * @param {string} params.missionId
 * @param {string} params.role
 * @param {string} [params.lockDir='/tmp']
 * @returns {{ released: boolean, lockPath: string }}
 */
export function releaseLock({ missionId, role, lockDir = DEFAULT_LOCK_DIR } = {}) {
  if (!missionId || !role) {
    throw new Error('releaseLock: missionId and role are required');
  }
  const lockPath = buildLockPath(missionId, role, lockDir);
  if (!fs.existsSync(lockPath)) {
    return { released: false, lockPath };
  }
  // Only release if the lock holder is US — never delete another
  // process's lock (the OS-level atomicity guarantees a stolen lock
  // would already be impossible, but be explicit for robustness).
  const prior = _readLockMetadata(lockPath);
  if (prior && Number.isInteger(prior.pid) && prior.pid !== process.pid) {
    return { released: false, lockPath };
  }
  try {
    fs.unlinkSync(lockPath);
    return { released: true, lockPath };
  } catch {
    return { released: false, lockPath };
  }
}

/**
 * T2.4 — check whether a bootstrap lock is currently held (and not
 * stale). Returns true iff the lock file exists AND was created
 * within the last `ttlMs`.
 *
 * @param {object} params
 * @param {string} params.missionId
 * @param {string} params.role
 * @param {number} [params.ttlMs=30000]
 * @param {string} [params.lockDir='/tmp']
 * @returns {boolean}
 */
export function isLockHeld({ missionId, role, ttlMs = BOOTSTRAP_LOCK_TTL_MS_DEFAULT, lockDir = DEFAULT_LOCK_DIR } = {}) {
  if (!missionId || !role) {
    throw new Error('isLockHeld: missionId and role are required');
  }
  const lockPath = buildLockPath(missionId, role, lockDir);
  if (!fs.existsSync(lockPath)) return false;
  const prior = _readLockMetadata(lockPath);
  if (!prior || !prior.acquiredAt) {
    // Corrupt / legacy lock with no acquire timestamp — treat as held
    // (refuse to make a judgment call about staleness).
    return true;
  }
  const ageMs = Date.now() - Date.parse(prior.acquiredAt);
  return Number.isFinite(ageMs) ? ageMs <= ttlMs : true;
}
