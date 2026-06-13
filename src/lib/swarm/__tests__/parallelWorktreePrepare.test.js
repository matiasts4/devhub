/**
 * T1.1 / R-PERF-1 — parallel worktree preparation contract.
 *
 * Co-located companion to the comprehensive tests at
 * `tests/lib/swarm/parallelWorktreePrepare.test.js`. Asserts the
 * two integration-critical contracts:
 *   1. The 5 role worktree prepares run in parallel (peakActive === 5).
 *   2. The DB-write phase goes through `writeQueue.enqueueMany` in
 *      a single tick (not per-role serial calls).
 *
 * Co-located with the source under `src/lib/swarm/__tests__/`.
 */

const {
  SWARM_ROLE_ROSTER,
  prepareAgentWorktreesInParallel,
} = require('../parallelWorktreePrepare');

describe('parallelWorktreePrepare — fan-out contract (T1.1)', () => {
  test('5 worktree prepares run in parallel (peakActive === 5)', async () => {
    let active = 0;
    let peakActive = 0;
    const prepareAgentWorktree = jest.fn(async ({ roleKey }) => {
      active += 1;
      peakActive = Math.max(peakActive, active);
      await new Promise((resolve) => setTimeout(resolve, 40));
      active -= 1;
      return { worktreePath: `/repo/${roleKey}` };
    });
    const writeQueue = { enqueueMany: jest.fn(async (jobs) => jobs.map((j) => j())) };

    await prepareAgentWorktreesInParallel({
      repoRoot: '/repo',
      launchId: 'launch-co-located-1',
      prepareAgentWorktree,
      writeQueue,
    });

    expect(peakActive).toBe(5);
    expect(prepareAgentWorktree).toHaveBeenCalledTimes(5);
  });

  test('DB writes go through writeQueue.enqueueMany in a single tick', async () => {
    const prepareAgentWorktree = jest.fn(async ({ roleKey }) => ({
      worktreePath: `/repo/${roleKey}`,
    }));
    const enqueueManyMock = jest.fn(async (jobs) => jobs.map((j) => j()));
    const writeQueue = { enqueueMany: enqueueManyMock };
    const persistRoleConfig = jest.fn(({ role }) => ({ row: role }));

    await prepareAgentWorktreesInParallel({
      repoRoot: '/repo',
      launchId: 'launch-co-located-2',
      prepareAgentWorktree,
      writeQueue,
      persistRoleConfig,
    });

    // Single enqueueMany call (one tick, all 5 jobs fanned out together).
    expect(enqueueManyMock).toHaveBeenCalledTimes(1);
    // The single call received exactly 5 jobs.
    expect(enqueueManyMock.mock.calls[0][0]).toHaveLength(5);
    // Each job is a function.
    for (const job of enqueueManyMock.mock.calls[0][0]) {
      expect(typeof job).toBe('function');
    }
  });

  test('SWARM_ROLE_ROSTER matches the canonical 5-role set', () => {
    expect(SWARM_ROLE_ROSTER).toEqual([
      'director',
      'architect',
      'implementer',
      'reviewer',
      'devops',
    ]);
  });
});
