import {
  collectSwarmLaunchIdsForWorkspace,
  collectSwarmTerminateHints,
  requestTerminateSwarmLaunch,
} from '../swarmWorkspaceLifecycle';

describe('swarmWorkspaceLifecycle', () => {
  const storage = {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('collectSwarmLaunchIdsForWorkspace reads panel swarmContext and agent runs', () => {
    storage.getItem.mockReturnValue(
      JSON.stringify({
        'launch-9:sdd_worker_1': {
          panelId: 'p-worker',
          launchOrigin: 'swarm-control-launch',
          launchId: 'launch-9',
        },
      })
    );

    const workspace = {
      columns: [
        {
          panels: [{ id: 'p-zed', swarmContext: { launchId: 'launch-9' } }, { id: 'p-worker' }],
        },
      ],
    };

    expect(collectSwarmLaunchIdsForWorkspace(workspace, storage)).toEqual(['launch-9']);
  });

  test('requestTerminateSwarmLaunch sends force_orphan_cleanup', async () => {
    storage.getItem.mockReturnValue('{}');
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ terminate_result: { launchId: 'launch-x', terminated: true } }),
    });

    await requestTerminateSwarmLaunch({
      projectId: 'project-1',
      launchId: 'launch-x',
      storage,
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith('/api/agenthub/operations/health', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'terminate_swarm_local',
        project_id: 'project-1',
        launch_id: 'launch-x',
        panel_ids: [],
        opencode_session_ids: [],
        force_orphan_cleanup: true,
      }),
    });
  });

  test('collectSwarmTerminateHints scopes to one workspace when provided', () => {
    storage.getItem.mockReturnValue(
      JSON.stringify({
        'launch-1:director': { panelId: 'p1', launchId: 'launch-1' },
        'launch-1:worker': { panelId: 'p2', launchId: 'launch-1' },
      })
    );

    const wsA = { columns: [{ panels: [{ id: 'p1' }] }] };
    const hints = collectSwarmTerminateHints(storage, 'launch-1', [wsA], wsA);
    expect(hints.panel_ids).toEqual(['p1']);
  });
});
