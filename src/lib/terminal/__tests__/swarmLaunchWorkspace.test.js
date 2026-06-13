import {
  createWorkspaceForSwarmLaunchRequestsFn,
  groupSwarmLaunchRequestsIntoColumns,
  prepareSwarmLaunchRequests,
  resolveSwarmPanelStandbyFlag,
  resolveWorkspaceWindowAfterPanelClose,
} from '../swarmLaunchWorkspace';

describe('swarmLaunchWorkspace', () => {
  test('resolveSwarmPanelStandbyFlag is true for standby SDD workers only', () => {
    expect(
      resolveSwarmPanelStandbyFlag({ roleKey: 'sdd_worker_1', bootstrapMode: 'standby' })
    ).toBe(true);
    expect(resolveSwarmPanelStandbyFlag({ roleKey: 'zed', bootstrapMode: 'standby' })).toBe(false);
    expect(
      resolveSwarmPanelStandbyFlag({ roleKey: 'sdd_worker_1', bootstrapMode: 'engram_first' })
    ).toBe(false);
  });

  test('prepareSwarmLaunchRequests filters invalid requests and adds swarmRole', () => {
    const prepared = prepareSwarmLaunchRequests([
      { taskId: 'launch-1:zed', command: 'opencode --agent zed', roleKey: 'zed' },
      { taskId: '', command: 'opencode --agent zed' },
    ]);

    expect(prepared).toHaveLength(1);
    expect(prepared[0].commandToRun).toContain('opencode --agent zed');
    expect(prepared[0].swarmRole?.roleKey).toBe('zed');
  });

  test('groupSwarmLaunchRequestsIntoColumns places director in third column for 3+ roles', () => {
    const launchRequests = prepareSwarmLaunchRequests([
      { taskId: 'launch-1:zed', command: 'opencode --agent zed', roleKey: 'zed' },
      { taskId: 'launch-1:w1', command: 'opencode --agent worker', roleKey: 'sdd_worker_1' },
      { taskId: 'launch-1:w2', command: 'opencode --agent worker', roleKey: 'sdd_worker_2' },
    ]);

    const grouped = groupSwarmLaunchRequestsIntoColumns(launchRequests);
    expect(grouped).toHaveLength(3);
    expect(grouped[2][0].swarmRole?.roleKey).toBe('zed');
  });

  test('createWorkspaceForSwarmLaunchRequestsFn calls onMarkPanelsClosing before closing sessions', () => {
    const marked = [];
    const closed = [];
    const fn = createWorkspaceForSwarmLaunchRequestsFn({
      cwd: '/tmp',
      wsCounterRef: { current: 0 },
      colCounterRef: { current: 0 },
      panelCounterRef: { current: 0 },
      getAllPanelIds: (columns) =>
        columns.flatMap((col) => (col.panels || []).map((panel) => panel.id)),
      buildPanel: (request, panelId) => ({
        id: panelId,
        initialCommand: request.commandToRun,
        cwd: '/tmp',
      }),
      setWorkspaces: jest.fn(),
      setActiveWsId: jest.fn(),
      setActivePanelIds: jest.fn(),
      setTerminalRendererPreferences: jest.fn(),
      applyRendererPreference: (acc) => acc,
      persistAgentRunMetadata: jest.fn(),
      onMarkPanelsClosing: (ids) => marked.push(...ids),
      getPreviousSwarmPanelIds: () => ['p-old-1', 'p-old-2'],
      closePreviousSessions: (ids) => closed.push(...ids),
    });

    fn([
      {
        taskId: 'launch-1:zed',
        command: 'opencode --agent zed',
        roleKey: 'zed',
        launchId: 'launch-1',
      },
    ]);

    expect(marked).toEqual(['p-old-1', 'p-old-2']);
    expect(closed).toEqual(['p-old-1', 'p-old-2']);
  });

  test('resolveWorkspaceWindowAfterPanelClose removes empty window when another window remains', () => {
    const windows = [
      {
        id: 'v1',
        name: 'V1',
        columns: [{ id: 'c1', panels: [{ id: 'p1' }] }],
        activePanelId: 'p1',
      },
      {
        id: 'v2',
        name: 'V2',
        columns: [{ id: 'c2', panels: [{ id: 'p2' }] }],
        activePanelId: 'p2',
      },
    ];

    const result = resolveWorkspaceWindowAfterPanelClose({
      windows,
      activeWindowId: 'v2',
      remainingPanelIds: [],
    });

    expect(result.action).toBe('remove');
    expect(result.windows).toHaveLength(1);
    expect(result.windows[0].id).toBe('v1');
    expect(result.activeWindowId).toBe('v1');
    expect(result.nextPanelId).toBe('p1');
    expect(result.removedWindowId).toBe('v2');
  });

  test('resolveWorkspaceWindowAfterPanelClose keeps the last window even when empty', () => {
    const windows = [
      {
        id: 'v1',
        name: 'V1',
        columns: [{ id: 'c1', panels: [{ id: 'p1' }] }],
        activePanelId: 'p1',
      },
    ];

    const result = resolveWorkspaceWindowAfterPanelClose({
      windows,
      activeWindowId: 'v1',
      remainingPanelIds: [],
    });

    expect(result.action).toBe('keep');
    expect(result.windows).toHaveLength(1);
  });

  test('resolveWorkspaceWindowAfterPanelClose keeps window when panels remain', () => {
    const windows = [
      {
        id: 'v1',
        name: 'V1',
        columns: [{ id: 'c1', panels: [{ id: 'p1' }, { id: 'p2' }] }],
        activePanelId: 'p1',
      },
      {
        id: 'v2',
        name: 'V2',
        columns: [{ id: 'c2', panels: [{ id: 'p3' }] }],
        activePanelId: 'p3',
      },
    ];

    const result = resolveWorkspaceWindowAfterPanelClose({
      windows,
      activeWindowId: 'v1',
      remainingPanelIds: ['p2'],
    });

    expect(result.action).toBe('keep');
    expect(result.windows).toHaveLength(2);
  });
});
