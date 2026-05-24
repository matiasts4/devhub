import {
  RESTORE_ACTION,
  buildRestoreManifestFromWorkspaceState,
  buildStartupRestorePlan,
} from './startupRestoreCoordinator';

function createRuntimeSnapshot(overrides = {}) {
  return {
    terminals: [],
    processes: [],
    anomalies: {
      quotaBlocked: false,
    },
    ...overrides,
  };
}

describe('startupRestoreCoordinator', () => {
  it('builds restore manifest from workspace panels and extracts opencode session id', () => {
    const manifest = buildRestoreManifestFromWorkspaceState({
      projectId: 'project-1',
      activeWorkspaceId: 'ws-1',
      workspaces: [
        {
          id: 'ws-1',
          name: 'Workspace 1',
          columns: [
            {
              id: 'c-1',
              panels: [
                {
                  id: 'p-1',
                  cwd: '/tmp/demo',
                  initialCommand: 'opencode --session oc-1',
                },
              ],
            },
          ],
        },
      ],
    });

    expect(manifest.activeProjectId).toBe('project-1');
    expect(manifest.activeWorkspaceId).toBe('ws-1');
    expect(manifest.terminalSessions).toEqual([
      expect.objectContaining({
        terminalId: 'p-1',
        workspaceId: 'ws-1',
        opencodeSessionId: 'oc-1',
      }),
    ]);
  });

  it('plans reattach for alive terminals without sockets', () => {
    const plan = buildStartupRestorePlan({
      manifest: {
        terminalSessions: [
          {
            terminalId: 'term-1',
            panelId: 'p-1',
            opencodeSessionId: 'oc-1',
          },
        ],
      },
      runtimeSnapshot: createRuntimeSnapshot({
        terminals: [
          {
            terminalId: 'term-1',
            alive: true,
            socketCount: 0,
            status: 'reattachable',
          },
        ],
      }),
    });

    expect(plan.actions).toEqual([
      expect.objectContaining({
        action: RESTORE_ACTION.REATTACH_LIVE_TERMINAL,
        terminalId: 'term-1',
        panelId: 'p-1',
      }),
    ]);
  });

  it('plans resume for opencode sessions when terminal is not live', () => {
    const plan = buildStartupRestorePlan({
      manifest: {
        terminalSessions: [
          {
            terminalId: 'term-2',
            panelId: 'p-2',
            opencodeSessionId: 'oc-2',
          },
        ],
      },
      runtimeSnapshot: createRuntimeSnapshot(),
    });

    expect(plan.actions).toEqual([
      expect.objectContaining({
        action: RESTORE_ACTION.RESUME_OPENCODE_SESSION,
        opencodeSessionId: 'oc-2',
      }),
    ]);
  });

  it('plans quota-blocked action when global anomaly is active', () => {
    const plan = buildStartupRestorePlan({
      manifest: {
        terminalSessions: [
          {
            terminalId: 'term-3',
            panelId: 'p-3',
            opencodeSessionId: 'oc-3',
          },
        ],
      },
      runtimeSnapshot: createRuntimeSnapshot({
        anomalies: {
          quotaBlocked: true,
        },
      }),
    });

    expect(plan.actions).toEqual([
      expect.objectContaining({
        action: RESTORE_ACTION.QUOTA_BLOCKED,
        terminalId: 'term-3',
      }),
    ]);
  });

  it('keeps plan idempotent by deduping repeated manifest records', () => {
    const plan = buildStartupRestorePlan({
      manifest: {
        terminalSessions: [
          {
            terminalId: 'term-4',
            panelId: 'p-4',
            opencodeSessionId: 'oc-4',
          },
          {
            terminalId: 'term-4',
            panelId: 'p-4',
            opencodeSessionId: 'oc-4',
          },
        ],
      },
      runtimeSnapshot: createRuntimeSnapshot(),
    });

    expect(plan.actions).toHaveLength(1);
    expect(plan.actions[0]).toEqual(
      expect.objectContaining({
        action: RESTORE_ACTION.RESUME_OPENCODE_SESSION,
        terminalId: 'term-4',
      })
    );
  });
});
