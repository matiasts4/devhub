const {
  buildRestoreManifestFromWorkspaceState,
  buildStartupRestorePlan,
  RESTORE_ACTION,
} = require('../startupRestoreCoordinator');

describe('startupRestoreCoordinator — workspace restore preferences', () => {
  test('applies global manual preference when per-session policy is absent', () => {
    const manifest = buildRestoreManifestFromWorkspaceState({
      workspaces: [
        {
          id: 'ws1',
          columns: [
            {
              id: 'c1',
              panels: [
                {
                  id: 'p1',
                  initialCommand: 'opencode --session oc-1',
                  cwd: '/tmp',
                },
              ],
            },
          ],
        },
      ],
      restorePreferences: { opencode: 'manual', generic: 'auto', swarm: 'auto' },
    });

    expect(manifest.terminalSessions[0].restorePolicy).toBe('manual');

    const plan = buildStartupRestorePlan({
      manifest,
      runtimeSnapshot: { terminals: [], processes: [], anomalies: {} },
    });

    expect(plan.actions).toHaveLength(1);
    expect(plan.actions[0].action).toBe(RESTORE_ACTION.TERMINATED);
    expect(plan.actions[0].reason).toBe('restore-policy-manual');
  });

  test('global off skips opencode session entirely', () => {
    const manifest = buildRestoreManifestFromWorkspaceState({
      workspaces: [
        {
          id: 'ws1',
          columns: [
            {
              id: 'c1',
              panels: [{ id: 'p1', initialCommand: 'opencode --session oc-off', cwd: '/tmp' }],
            },
          ],
        },
      ],
      restorePreferences: { opencode: 'off', generic: 'auto', swarm: 'auto' },
    });

    const plan = buildStartupRestorePlan({
      manifest,
      runtimeSnapshot: { terminals: [], processes: [], anomalies: {} },
    });

    expect(plan.actions).toHaveLength(0);
  });
});
