/**
 * Space-component panel.kind — slot geometry stays; occupant changes.
 */
const {
  createPanel,
  normalizePanelKind,
  normalizeWorkspaceState,
  setPanelKindInWorkspaceTree,
  resolveWorkspaceVisibleTerminalPanelCount,
  resolveWorkspaceAllWindowsPanelCount,
  DEFAULT_PANEL_KIND,
} = require('../workspaceStateModel');

describe('panel.kind space components', () => {
  test('createPanel defaults kind to terminal', () => {
    const panel = createPanel('p1');
    expect(panel.kind).toBe(DEFAULT_PANEL_KIND);
    expect(normalizePanelKind(undefined)).toBe('terminal');
    expect(normalizePanelKind('browser')).toBe('browser');
    expect(normalizePanelKind('files')).toBe('files');
    expect(normalizePanelKind('nope')).toBe('terminal');
  });

  test('createPanel accepts kind from metadata', () => {
    expect(createPanel('p1', null, null, { kind: 'browser' }).kind).toBe('browser');
    expect(createPanel('p2', null, null, { kind: 'files' }).kind).toBe('files');
  });

  test('normalizeWorkspaceState defaults missing kind to terminal and preserves kinds', () => {
    const raw = [
      {
        id: 'ws1',
        name: 'Workspace 1',
        columns: [
          {
            id: 'c1',
            panels: [
              { id: 'p1', initialCommand: 'opencode' },
              { id: 'p2', kind: 'browser' },
              { id: 'p3', kind: 'files' },
            ],
          },
        ],
      },
    ];
    const state = normalizeWorkspaceState(raw, 'ws1', { ws1: 'p1' });
    const panels = state.workspaces[0].columns[0].panels;
    expect(panels[0].kind).toBe('terminal');
    expect(panels[1].kind).toBe('browser');
    expect(panels[2].kind).toBe('files');
  });

  test('setPanelKindInWorkspaceTree keeps panel id and updates windows', () => {
    const workspaces = [
      {
        id: 'ws1',
        columns: [{ id: 'c1', panels: [createPanel('p1'), createPanel('p2')] }],
      },
    ];
    const workspaceWindows = {
      ws1: [
        {
          id: 'v1',
          name: 'V1',
          columns: [{ id: 'c1', panels: [createPanel('p1'), createPanel('p2')] }],
          activePanelId: 'p1',
        },
      ],
    };

    const next = setPanelKindInWorkspaceTree({
      workspaces,
      workspaceWindows,
      workspaceId: 'ws1',
      panelId: 'p2',
      kind: 'browser',
    });

    expect(next.workspaces[0].columns[0].panels[1]).toEqual(
      expect.objectContaining({ id: 'p2', kind: 'browser' })
    );
    expect(next.workspaceWindows.ws1[0].columns[0].panels[1]).toEqual(
      expect.objectContaining({ id: 'p2', kind: 'browser' })
    );
    // Sibling slot unchanged
    expect(next.workspaces[0].columns[0].panels[0].kind).toBe('terminal');
  });

  test('terminal panel count ignores browser/files spaces', () => {
    const columns = [
      {
        id: 'c1',
        panels: [
          createPanel('p1'),
          createPanel('p2', null, null, { kind: 'browser' }),
          createPanel('p3', null, null, { kind: 'files' }),
        ],
      },
    ];
    expect(resolveWorkspaceVisibleTerminalPanelCount(columns)).toBe(1);
  });

  test('all-windows panel count keeps browser/files spaces for layout empty-state', () => {
    const ws = {
      id: 'ws1',
      columns: [
        {
          id: 'c1',
          panels: [createPanel('p1', null, null, { kind: 'browser' })],
        },
      ],
    };
    expect(resolveWorkspaceAllWindowsPanelCount(ws, {})).toBe(1);
    expect(resolveWorkspaceAllWindowsPanelCount(ws, { ws1: [] })).toBe(1);
  });
});
