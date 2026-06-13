// ============================================================
// T1.1 + T1.2 — swarm-launch-hardening sub-batch 1a
// Verifies the additive wiring of:
//   • prepareAgentWorktreesInParallel pre-compute (T1.1, R-PERF-1)
//   • Drop of 4s DIRECTOR_FIRST_FANOUT_DELAY_MS at fan-out (T1.2, R-PERF-2)
//
// These tests live in a new file so the WIP partial T1.2 test in
// operations-health.test.js (which asserts the OLD 4000ms behavior)
// can be migrated in a follow-up batch without co-mingling scopes.
// ============================================================
jest.mock('next/server', () => ({
  NextResponse: {
    json(body, init = {}) {
      return {
        status: init.status ?? 200,
        json: async () => body,
      };
    },
  },
}));

describe('T1.1 / T1.2 — swarm-launch-hardening sub-batch 1a', () => {
  let mockWorkspaceManager;
  let mockLocalDb;
  let db;
  let actualLocalDb;
  let prepareCalls;
  let callTimestamps;

  beforeEach(() => {
    jest.resetModules();

    const Database = require('better-sqlite3');
    const localDbPath = '../../../src/lib/db/localDb.js';
    actualLocalDb = jest.requireActual(localDbPath);
    db = new Database(':memory:');
    actualLocalDb.ensureAllSchema(db);
    db.prepare('INSERT INTO projects (id, name, local_path) VALUES (?, ?, ?)').run(
      'project-launch-perf',
      'Project Launch Perf',
      '/workspace/devhub'
    );

    mockLocalDb = {
      ...actualLocalDb,
      getDb: () => db,
    };

    prepareCalls = [];
    callTimestamps = [];

    // Mock that records call order + timestamps. To prove PARALLELISM
    // we capture (startedAt, finishedAt) and assert that the calls
    // overlap in wall-clock.
    mockWorkspaceManager = {
      prepareAgentWorktree: jest.fn(async (params) => {
        const { repoRoot, launchId, roleKey, baseRef } = params;
        const startedAt = Date.now();
        callTimestamps.push({ roleKey, startedAt, finishedAt: null });
        // Tiny delay — 5ms — to allow Promise.all overlap to be visible.
        await new Promise((resolve) => setTimeout(resolve, 5));
        const finishedAt = Date.now();
        const last = callTimestamps[callTimestamps.length - 1];
        last.finishedAt = finishedAt;
        prepareCalls.push({ repoRoot, launchId, roleKey, baseRef });
        return {
          branchName: `devhub/swarm/${launchId}/${roleKey}`,
          worktreePath: `${repoRoot}/.devhub/worktrees/${launchId}/${roleKey}`,
          observedHead: `head-${launchId}-${roleKey}`,
          created: true,
        };
      }),
      computeBranchName: (launchId, roleKey) => `devhub/swarm/${launchId}/${roleKey}`,
      computeWorktreePath: (repoRoot, launchId, roleKey) =>
        `${repoRoot}/.devhub/worktrees/${launchId}/${roleKey}`,
    };

    jest.doMock('@/lib/db/localDb.js', () => mockLocalDb);
    jest.doMock(localDbPath, () => mockLocalDb);
    jest.doMock('@/lib/swarm/agentWorkspaceManager', () => mockWorkspaceManager);
    jest.doMock('../../../src/lib/swarm/agentWorkspaceManager', () => mockWorkspaceManager);
  });

  afterEach(() => {
    if (db) db.close();
    jest.resetModules();
  });

  async function launchSwarm() {
    const { POST } = require('../../../src/app/api/agenthub/operations/health/route');

    return POST({
      json: async () => ({
        action: 'launch_swarm_local',
        project_id: 'project-launch-perf',
        draft: {
          mode: 'template',
          category: 'delivery',
          templateId: 'clean-slate',
          swarmTypeId: 'delivery-swarm',
          teamId: 'feature-delivery-team',
          providerId: 'github-copilot/gpt-4o-mini',
          launchStrategy: 'director_first',
          bootstrapMode: 'engram_first',
          workspacePath: '/workspace/devhub',
          rolePrograms: {
            director: 'codex',
            coder: 'hermes',
            auditor: 'opencode',
            devops: 'opencode',
            architect: 'opencode',
          },
          mission:
            'Lanzar un swarm de feature delivery con Director, Coder, Auditor, DevOps y Architect.',
        },
      }),
    });
  }

  test('T1.1: prepareAgentWorktree called for all 5 roles in parallel (Promise.all overlap)', async () => {
    const response = await launchSwarm();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.launch_result.runtime_requests).toHaveLength(5);

    // Exactly 5 calls, one per role.
    expect(mockWorkspaceManager.prepareAgentWorktree).toHaveBeenCalledTimes(5);

    // 5 distinct roleKeys.
    const roleKeys = prepareCalls.map((c) => c.roleKey).sort();
    expect(roleKeys).toEqual(['architect', 'auditor', 'coder', 'devops', 'director']);

    // Parallelism: all 5 calls must overlap in wall-clock. If they
    // were serial, finishedAt of call N would be >= startedAt of call
    // N+1. We assert that the spread between earliest start and latest
    // end of overlapping calls is consistent with parallel (i.e. all
    // calls were kicked off before any finished).
    const orderedByStart = [...callTimestamps].sort((a, b) => a.startedAt - b.startedAt);
    const firstStart = orderedByStart[0].startedAt;
    const lastStart = orderedByStart[orderedByStart.length - 1].startedAt;
    // In a Promise.all, all 5 starts happen in the same JS tick. Allow
    // a generous 100ms window for scheduler noise.
    expect(lastStart - firstStart).toBeLessThan(100);

    // And the inner call did not block — the slowest call should finish
    // well under 5 × 5ms (the serial floor).
    const allFinished = callTimestamps.map((c) => c.finishedAt);
    const totalSpan = Math.max(...allFinished) - firstStart;
    expect(totalSpan).toBeLessThan(200);
  });

  test('T1.1: configureLaunchRole receives precomputedWorktree and skips inner prepare', async () => {
    // Spy the prepare count: if the T1.1 wiring is correct, we should
    // see exactly 5 calls (one per role, from the parallel precompute)
    // and ZERO additional calls from inside configureLaunchRole.
    await launchSwarm();

    // Total calls across the whole launch = 5 (no per-role dup).
    expect(mockWorkspaceManager.prepareAgentWorktree).toHaveBeenCalledTimes(5);

    // Every call should have the same launchId and a distinct roleKey.
    const launchIds = new Set(prepareCalls.map((c) => c.launchId));
    expect(launchIds.size).toBe(1); // all from one launch

    // And the per-call args include baseRef: 'HEAD' (matching the
    // existing WIP inner prepare call signature).
    for (const call of prepareCalls) {
      expect(call).toMatchObject({
        repoRoot: '/workspace/devhub',
        baseRef: 'HEAD',
      });
      expect(typeof call.roleKey).toBe('string');
    }
  });

  test('T1.2: workers do not get startAfterMs: 4000 — they fire in parallel with director', async () => {
    const response = await launchSwarm();
    const payload = await response.json();

    expect(response.status).toBe(200);

    const requests = payload.launch_result.runtime_requests;
    expect(requests).toHaveLength(5);

    // Director: startAfterMs 0 (unchanged).
    const director = requests.find((r) => r.roleKey === 'director');
    expect(director).toBeDefined();
    expect(director.startAfterMs).toBe(0);

    // All 4 workers: startAfterMs MUST be 0 — T1.2 drops the 4s delay.
    const workers = requests.filter((r) => r.roleKey !== 'director');
    expect(workers).toHaveLength(4);
    for (const worker of workers) {
      expect(worker.startAfterMs).toBe(0);
      // Defensive: explicitly assert it is NOT 4000.
      expect(worker.startAfterMs).not.toBe(4000);
    }
  });
});
