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

  it('seeds suspended for grok panel when generic policy is manual', () => {
    const { suspendedSeed } = seedSuspendedOpenCodePanels({
      snapshotWorkspaces: [
        {
          columns: [{ panels: [{ id: 'g1', initialCommand: 'grok' }] }],
        },
      ],
      agentRunsByPanel: {},
      restorePrefs: { opencode: 'auto', generic: 'manual', swarm: 'auto' },
    });
    expect(suspendedSeed).toEqual({ g1: 'suspended' });
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

  it('skips the whole startup restore queue when restoreOnReboot is disabled', async () => {
    const setPanelRestoreModes = jest.fn();
    const applyPanelRelaunchCommand = jest.fn();
    const markCompleted = jest.fn();
    const fetchMock = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ terminals: [], processes: [], anomalies: { quotaBlocked: false } }),
      })
    );
    global.fetch = fetchMock;
    global.localStorage = {
      getItem: (key) =>
        key === 'devhub_terminal_restore_prefs'
          ? JSON.stringify({ restoreOnReboot: false, opencode: 'auto' })
          : null,
      setItem: jest.fn(),
      removeItem: jest.fn(),
    };

    try {
      const { runStartupRestore } = createWorkspaceRestoreCoordinator({
        storage: {
          getItem: () => null,
          setItem: jest.fn(),
        },
        terminalStateStorageKey: 'devhub_terminal_state_test',
        projectId: 'proj-1',
        snapshotWorkspaces: [
          {
            id: 'ws-1',
            columns: [
              { panels: [{ id: 'p1', initialCommand: 'opencode --session oc-1', cwd: '/tmp' }] },
            ],
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

      await runStartupRestore();

      // Queue dispatch is skipped entirely: no runtime fetch, no relaunch…
      expect(fetchMock).not.toHaveBeenCalled();
      expect(applyPanelRelaunchCommand).not.toHaveBeenCalled();
      // …but the run still completes so remounts do not retry, and the manual
      // revive path (handled outside this coordinator) stays available.
      expect(markCompleted).toHaveBeenCalled();
    } finally {
      delete global.localStorage;
      delete global.fetch;
    }
  });
});
