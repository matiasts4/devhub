import {
  buildTerminalSurfacesFromWindows,
  countPanelsInColumns,
  resolveWindowColumnsForReconcile,
} from '../workspaceSurfaceReconcile';

describe('workspaceSurfaceReconcile', () => {
  test('countPanelsInColumns totals panels across columns', () => {
    const columns = [{ panels: [{ id: 'p1' }, { id: 'p2' }] }, { panels: [{ id: 'p3' }] }];
    expect(countPanelsInColumns(columns)).toBe(3);
  });

  test('resolveWindowColumnsForReconcile prefers live columns for active window', () => {
    const live = [{ panels: [{ id: 'p1' }, { id: 'p2' }] }];
    const win = [{ panels: [{ id: 'p1' }] }];
    expect(
      resolveWindowColumnsForReconcile({
        windowColumns: win,
        liveColumns: live,
        isActiveWindow: true,
      })
    ).toBe(live);
  });

  test('buildTerminalSurfacesFromWindows uses live columns for active window', () => {
    const windows = [
      {
        id: 'v1',
        columns: [{ panels: [{ id: 'p1' }] }],
      },
    ];
    const liveColumns = [
      {
        panels: [
          { id: 'p1', initialCommand: 'bash' },
          { id: 'p2', cwd: '/tmp' },
        ],
      },
    ];

    const { terminals, activePanelIds } = buildTerminalSurfacesFromWindows({
      workspaceId: 'ws1',
      windows,
      activeWindowId: 'v1',
      liveColumns,
      resolveRequestedRenderer: () => 'xterm-webgl',
      terminalRendererPreferences: {},
    });

    expect(activePanelIds).toEqual(new Set(['p1', 'p2']));
    expect(terminals).toHaveLength(2);
    expect(terminals.map((t) => t.panelId).sort()).toEqual(['p1', 'p2']);
    expect(terminals[0].pizarra.viewId).toBe('v1');
    expect(terminals[1].pizarra.viewId).toBe('v1');
  });

  test('buildTerminalSurfacesFromWindows keeps inactive window snapshot', () => {
    const windows = [
      { id: 'v1', columns: [{ panels: [{ id: 'p1' }] }] },
      { id: 'v2', columns: [{ panels: [{ id: 'p9' }] }] },
    ];
    const liveColumns = [{ panels: [{ id: 'p1' }, { id: 'p2' }] }];

    const { terminals } = buildTerminalSurfacesFromWindows({
      workspaceId: 'ws1',
      windows,
      activeWindowId: 'v1',
      liveColumns,
      resolveRequestedRenderer: () => 'xterm-webgl',
    });

    expect(terminals.map((t) => t.panelId).sort()).toEqual(['p1', 'p2', 'p9']);
    expect(terminals.find((t) => t.panelId === 'p9')?.pizarra.viewId).toBe('v2');
  });

  test('active live columns win over a duplicate in a stale inactive snapshot', () => {
    const windows = [
      { id: 'v1', columns: [{ panels: [{ id: 'p1' }] }] },
      { id: 'v2', columns: [{ panels: [{ id: 'p1' }, { id: 'p9' }] }] },
    ];
    const liveColumns = [{ panels: [{ id: 'p1' }, { id: 'p2' }] }];

    const { terminals } = buildTerminalSurfacesFromWindows({
      workspaceId: 'ws1',
      windows,
      activeWindowId: 'v1',
      liveColumns,
      resolveRequestedRenderer: () => 'xterm-webgl',
    });

    expect(terminals.map((terminal) => terminal.panelId).sort()).toEqual(['p1', 'p2', 'p9']);
    expect(terminals.find((terminal) => terminal.panelId === 'p1')?.pizarra.viewId).toBe('v1');
  });
});
