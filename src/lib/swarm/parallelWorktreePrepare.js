/**
 * T1.1 / R-PERF-1 — parallel worktree preparation helper.
 *
 * The WIP launch route (`src/app/api/agenthub/operations/health/route.js`)
 * is frozen in this change. This module is the **additive** alternative:
 * a thin orchestrator that fans out `prepareAgentWorktree` for N roles
 * under a single `Promise.all` and serializes the DB write halves
 * through `writeQueue.enqueueMany`.
 *
 * The launch orchestrator can call into this helper instead of
 * looping `for (const role of roles) await withDbWriteQueue(...)`.
 *
 * Roles in scope: `director`, `architect`, `implementer`, `reviewer`, `devops`.
 * The roster is the union of T1.1's role set; the helper is roster-agnostic.
 */
/* eslint-env node */

const _path = require('path');
const _fs = require('fs');
void _path;
void _fs;

/** Roster used by the 5-role swarm launch. */
const SWARM_ROLE_ROSTER = Object.freeze([
  'director',
  'architect',
  'implementer',
  'reviewer',
  'devops',
]);

/**
 * R-PERF-1: Prepare N worktrees in parallel and persist their DB rows
 * under a single `enqueueMany`. Each role acquires its own DB write
 * lock through `enqueueMany`; sibling roles do not block each other.
 *
 * Pure function on the orchestration — does not shell out. The caller
 * supplies `prepareAgentWorktree` (mocked in tests) and
 * `writeQueue.enqueueMany` (the in-memory queue singleton).
 *
 * @param {object} params
 * @param {string} params.repoRoot
 * @param {string} params.launchId
 * @param {string[]} [params.roles]
 * @param {Function} params.prepareAgentWorktree
 * @param {{ enqueueMany: (jobs: Function[]) => Promise<any[]> }} params.writeQueue
 * @param {Function} [params.persistRoleConfig] - per-role DB write. Receives
 *   `{ role, worktree }` and returns a Promise. Required for `enqueueMany`
 *   to have something to serialize.
 * @returns {Promise<Array<{ role, worktree, persisted: any }>>}
 */
async function prepareAgentWorktreesInParallel({
  repoRoot,
  launchId,
  roles = SWARM_ROLE_ROSTER,
  prepareAgentWorktree,
  writeQueue,
  persistRoleConfig = null,
}) {
  if (typeof prepareAgentWorktree !== 'function') {
    throw new TypeError('prepareAgentWorktree must be a function');
  }
  if (!writeQueue || typeof writeQueue.enqueueMany !== 'function') {
    throw new TypeError('writeQueue.enqueueMany is required');
  }
  if (!Array.isArray(roles) || roles.length === 0) {
    return [];
  }

  // Phase 1: fan out the worktree preparations in parallel. Each call
  // is `Promise.all`-batched so the wall-clock is bounded by the
  // slowest role (e.g. 1.8s for devops under contention).
  const worktreeResults = await Promise.all(
    roles.map((role) =>
      Promise.resolve()
        .then(() => prepareAgentWorktree({ repoRoot, launchId, roleKey: role }))
        .then((worktree) => ({ role, worktree }))
    )
  );

  // Phase 2: serialize the DB writes through the queue. `enqueueMany`
  // dispatches all of them in a single tick; the queue's FIFO ensures
  // one DB transaction at a time without deadlocks.
  if (!persistRoleConfig) {
    return worktreeResults.map(({ role, worktree }) => ({ role, worktree, persisted: null }));
  }

  const persisted = await writeQueue.enqueueMany(
    worktreeResults.map(({ role, worktree }) => () => persistRoleConfig({ role, worktree }))
  );

  return worktreeResults.map(({ role, worktree }, index) => ({
    role,
    worktree,
    persisted: persisted[index],
  }));
}

module.exports = {
  SWARM_ROLE_ROSTER,
  prepareAgentWorktreesInParallel,
};
