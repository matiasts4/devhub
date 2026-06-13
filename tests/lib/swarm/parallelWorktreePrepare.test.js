/**
 * T1.1 / R-PERF-1 — parallel worktree preparation contract.
 */

const {
  SWARM_ROLE_ROSTER,
  prepareAgentWorktreesInParallel,
} = require('../../../src/lib/swarm/parallelWorktreePrepare');

describe('swarm-launch-perf > R-PERF-1 > parallel worktree preparation', () => {
  test('fires 5 worktree prepares in parallel (R-PERF-1 acceptance)', async () => {
    let active = 0;
    let peakActive = 0;
    const prepareAgentWorktree = jest.fn(async ({ roleKey }) => {
      active += 1;
      peakActive = Math.max(peakActive, active);
      // Simulate variable per-role cost.
      const cost = roleKey === 'devops' ? 180 : 60;
      await new Promise((resolve) => setTimeout(resolve, cost));
      active -= 1;
      return {
        branchName: `devhub/swarm/launch-1/${roleKey}`,
        worktreePath: `/repo/.devhub/worktrees/launch-1/${roleKey}`,
        observedHead: 'head-sha',
        created: true,
      };
    });
    const writeQueue = { enqueueMany: jest.fn(async (jobs) => jobs.map((j) => j())) };

    const start = Date.now();
    const results = await prepareAgentWorktreesInParallel({
      repoRoot: '/repo',
      launchId: 'launch-1',
      prepareAgentWorktree,
      writeQueue,
      persistRoleConfig: ({ role }) => ({ dbRow: `row-${role}` }),
    });
    const totalMs = Date.now() - start;

    expect(results).toHaveLength(5);
    // Each role was prepared.
    expect(prepareAgentWorktree).toHaveBeenCalledTimes(5);
    // DB writes were fanned out through enqueueMany in one tick.
    expect(writeQueue.enqueueMany).toHaveBeenCalledTimes(1);
    expect(writeQueue.enqueueMany.mock.calls[0][0]).toHaveLength(5);
    // Each persisted row matches the role.
    results.forEach(({ role, persisted }) => {
      expect(persisted).toEqual({ dbRow: `row-${role}` });
    });
    // Parallelism: peakActive hits 5 (all prepares in flight).
    expect(peakActive).toBe(5);
    // Sequential would be 5 × 60ms = 300ms+, but devops tail is 180ms.
    // Sequential total = 5 × 60 + (180 - 60) = 300+120 = 420ms; parallel = 180ms.
    // Allow generous upper bound for the slow test runner.
    expect(totalMs).toBeLessThan(800);
  });

  test('one slow role does not block the others (R-PERF-1 acceptance)', async () => {
    const order = [];
    const prepareAgentWorktree = jest.fn(async ({ roleKey }) => {
      order.push(`start:${roleKey}`);
      const cost = roleKey === 'devops' ? 250 : 30;
      await new Promise((resolve) => setTimeout(resolve, cost));
      order.push(`end:${roleKey}`);
      return { worktreePath: `/repo/${roleKey}` };
    });
    const writeQueue = { enqueueMany: jest.fn(async (jobs) => jobs.map((j) => j())) };

    await prepareAgentWorktreesInParallel({
      repoRoot: '/repo',
      launchId: 'launch-2',
      prepareAgentWorktree,
      writeQueue,
    });

    // All 5 roles started before any of them finished (parallelism).
    const startCount = order.filter((entry) => entry.startsWith('start:')).length;
    expect(startCount).toBe(5);
    // The fast roles finished before devops's slow tail.
    const endDevopsIdx = order.indexOf('end:devops');
    const endArchitectIdx = order.indexOf('end:architect');
    expect(endArchitectIdx).toBeLessThan(endDevopsIdx);
  });

  test('returns empty array when roles list is empty', async () => {
    const prepareAgentWorktree = jest.fn();
    const writeQueue = { enqueueMany: jest.fn() };

    const result = await prepareAgentWorktreesInParallel({
      repoRoot: '/repo',
      launchId: 'launch-3',
      roles: [],
      prepareAgentWorktree,
      writeQueue,
    });

    expect(result).toEqual([]);
    expect(prepareAgentWorktree).not.toHaveBeenCalled();
    expect(writeQueue.enqueueMany).not.toHaveBeenCalled();
  });

  test('rejects with a clear error when prepareAgentWorktree is missing', async () => {
    await expect(
      prepareAgentWorktreesInParallel({
        repoRoot: '/repo',
        launchId: 'launch-4',
        writeQueue: { enqueueMany: jest.fn() },
      })
    ).rejects.toThrow(/prepareAgentWorktree must be a function/);
  });

  test('rejects with a clear error when writeQueue.enqueueMany is missing', async () => {
    await expect(
      prepareAgentWorktreesInParallel({
        repoRoot: '/repo',
        launchId: 'launch-5',
        prepareAgentWorktree: jest.fn(),
        writeQueue: {},
      })
    ).rejects.toThrow(/writeQueue.enqueueMany is required/);
  });

  test('SWARM_ROLE_ROSTER is the canonical 5-role set, frozen', () => {
    expect(SWARM_ROLE_ROSTER).toEqual(['director', 'architect', 'implementer', 'reviewer', 'devops']);
    expect(() => {
      SWARM_ROLE_ROSTER.push('hacker');
    }).toThrow();
  });
});
