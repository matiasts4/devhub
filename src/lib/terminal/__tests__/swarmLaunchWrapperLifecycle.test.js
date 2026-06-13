const {
  buildSwarmLaunchWrapperDispatchKey,
  clearSwarmLaunchWrapperDispatchForLaunch,
  hydrateSwarmLaunchWrapperFlags,
  isSwarmLaunchWrapperCommand,
  isSwarmLaunchWrapperDispatched,
  markSwarmLaunchWrapperDispatched,
} = require('../swarmLaunchWrapperLifecycle.js');

describe('swarmLaunchWrapperLifecycle', () => {
  function mockStorage() {
    const map = new Map();
    return {
      getItem: (key) => map.get(key) ?? null,
      setItem: (key, value) => map.set(key, value),
    };
  }

  test('detects materialized bash launch wrapper commands', () => {
    expect(isSwarmLaunchWrapperCommand('bash /tmp/devhub-launch-launch-1-sdd_worker_1.sh')).toBe(
      true
    );
    expect(isSwarmLaunchWrapperCommand('opencode --agent gentle-orchestrator')).toBe(false);
  });

  test('persists dispatch by launchId:roleKey across storage reads', () => {
    const storage = mockStorage();
    markSwarmLaunchWrapperDispatched(
      { launchId: 'launch-9', roleKey: 'sdd_worker_1', panelId: 'p1001' },
      storage
    );
    expect(
      isSwarmLaunchWrapperDispatched({ launchId: 'launch-9', roleKey: 'sdd_worker_1' }, storage)
    ).toBe(true);
    expect(buildSwarmLaunchWrapperDispatchKey('launch-9', 'sdd_worker_1')).toBe(
      'launch-9:sdd_worker_1'
    );
  });

  test('clearSwarmLaunchWrapperDispatchForLaunch removes only matching launch keys', () => {
    const storage = mockStorage();
    markSwarmLaunchWrapperDispatched({ launchId: 'launch-9', roleKey: 'zed' }, storage);
    markSwarmLaunchWrapperDispatched({ launchId: 'launch-9', roleKey: 'sdd_worker_1' }, storage);
    markSwarmLaunchWrapperDispatched({ launchId: 'launch-10', roleKey: 'zed' }, storage);

    clearSwarmLaunchWrapperDispatchForLaunch('launch-9', storage);

    expect(isSwarmLaunchWrapperDispatched({ launchId: 'launch-9', roleKey: 'zed' }, storage)).toBe(
      false
    );
    expect(isSwarmLaunchWrapperDispatched({ launchId: 'launch-10', roleKey: 'zed' }, storage)).toBe(
      true
    );
  });

  test('hydrateSwarmLaunchWrapperFlags clears needsLaunchWrapper when already dispatched', () => {
    const storage = mockStorage();
    markSwarmLaunchWrapperDispatched({ launchId: 'launch-9', roleKey: 'zed' }, storage);
    const workspaces = [
      {
        id: 'ws1',
        columns: [
          {
            id: 'c1',
            panels: [
              {
                id: 'p1',
                swarmContext: {
                  launchId: 'launch-9',
                  roleKey: 'zed',
                  needsLaunchWrapper: true,
                  isSwarmRole: true,
                },
              },
            ],
          },
        ],
      },
    ];
    const hydrated = hydrateSwarmLaunchWrapperFlags(workspaces, storage);
    expect(hydrated[0].columns[0].panels[0].swarmContext.needsLaunchWrapper).toBe(false);
  });
});
