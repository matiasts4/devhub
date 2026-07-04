/**
 * Guard tests for useWorkspaceLayoutState reducer.
 */

const { workspaceLayoutReducer, LAYOUT_ACTION } = require('../useWorkspaceLayoutState');

const baseState = {
  workspaces: [
    { id: 'ws-1', columns: [{ panels: [{ id: 'p1' }] }] },
    { id: 'ws-2', columns: [{ panels: [{ id: 'p2' }] }] },
  ],
  activeWsId: 'ws-1',
  activePanelIds: { 'ws-1': 'p1', 'ws-2': 'p2' },
  focusedPanelByWorkspace: {},
};

describe('useWorkspaceLayoutState', () => {
  it('SELECT_WORKSPACE updates activeWsId', () => {
    const next = workspaceLayoutReducer(baseState, {
      type: LAYOUT_ACTION.SELECT_WORKSPACE,
      wsId: 'ws-2',
    });
    expect(next.activeWsId).toBe('ws-2');
  });

  it('SET_FOCUSED_PANEL sets and clears focus', () => {
    const focused = workspaceLayoutReducer(baseState, {
      type: LAYOUT_ACTION.SET_FOCUSED_PANEL,
      wsId: 'ws-1',
      panelId: 'p1',
    });
    expect(focused.focusedPanelByWorkspace).toEqual({ 'ws-1': 'p1' });

    const cleared = workspaceLayoutReducer(focused, {
      type: LAYOUT_ACTION.SET_FOCUSED_PANEL,
      wsId: 'ws-1',
      panelId: null,
    });
    expect(cleared.focusedPanelByWorkspace).toEqual({});
  });

  it('REMOVE_WORKSPACE drops workspace and reassigns activeWsId', () => {
    const next = workspaceLayoutReducer(baseState, {
      type: LAYOUT_ACTION.REMOVE_WORKSPACE,
      wsId: 'ws-1',
    });
    expect(next.workspaces.map((ws) => ws.id)).toEqual(['ws-2']);
    expect(next.activeWsId).toBe('ws-2');
    expect(next.activePanelIds['ws-1']).toBeUndefined();
  });

  it('SET_WORKSPACES supports functional updater', () => {
    const next = workspaceLayoutReducer(baseState, {
      type: LAYOUT_ACTION.SET_WORKSPACES,
      updater: (prev) => prev.map((ws) => (ws.id === 'ws-1' ? { ...ws, name: 'Renamed' } : ws)),
    });
    expect(next.workspaces[0].name).toBe('Renamed');
  });

  it('ADD_WORKSPACE appends and optionally selects', () => {
    const next = workspaceLayoutReducer(baseState, {
      type: LAYOUT_ACTION.ADD_WORKSPACE,
      workspace: { id: 'ws-3', columns: [] },
      select: true,
    });
    expect(next.workspaces).toHaveLength(3);
    expect(next.activeWsId).toBe('ws-3');
  });
});
