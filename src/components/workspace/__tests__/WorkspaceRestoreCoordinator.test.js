/**
 * Guard tests for WorkspaceRestoreCoordinator — restore plan order and abort.
 */

const {
  createWorkspaceRestoreCoordinator,
  seedSuspendedOpenCodePanels,
} = require('../WorkspaceRestoreCoordinator');

describe('WorkspaceRestoreCoordinator', () => {
  it('seeds suspended panels for manual/off restore policies', () => {
    const { suspendedSeed } = seedSuspendedOpenCodePanels({
      snapshotWorkspaces: [
        {
          columns: [
            {
              panels: [{ id: 'p1', initialCommand: 'opencode --session oc-1' }],
            },
          ],
        },
      ],
      agentRunsByPanel: {
        p1: { restorePolicy: 'manual', panelId: 'p1' },
      },
      restorePrefs: { defaultOpenCodeRestorePolicy: 'auto' },
    });

    expect(suspendedSeed).toEqual({ p1: 'suspended' });
  });

  it('aborts restore callbacks when abortStartupRestore is called', async () => {
    const setPanelRestoreModes = jest.fn();
    const applyPanelRelaunchCommand = jest.fn();
    const markCompleted = jest.fn();

    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ terminals: [], processes: [], anomalies: { quotaBlocked: false } }),
      })
    );

    const { runStartupRestore, abortStartupRestore } = createWorkspaceRestoreCoordinator({
      storage: {
        getItem: () => null,
        setItem: jest.fn(),
      },
      terminalStateStorageKey: 'devhub_terminal_state_test',
      projectId: 'proj-1',
      snapshotWorkspaces: [
        {
          id: 'ws-1',
          columns: [{ panels: [{ id: 'p1', initialCommand: 'bash' }] }],
        },
      ],
      workspacesRef: { current: [] },
      activeWsIdRef: { current: 'ws-1' },
      activeWsId: 'ws-1',
      bootPanelIdsRef: { current: new Set(['p1']) },
      agentRunsByPanel: {},
      restorePrefs: {},
      applyPanelRelaunchCommand,
      setWorkspaces: jest.fn(),
      setPanelRestoreModes,
      setReopenActionError: jest.fn(),
      markStartupRestoreCompleted: markCompleted,
    });

    abortStartupRestore();
    await runStartupRestore();

    expect(applyPanelRelaunchCommand).not.toHaveBeenCalled();
    expect(markCompleted).not.toHaveBeenCalled();
  });
});
