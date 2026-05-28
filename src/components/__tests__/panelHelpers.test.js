/**
 * Tests for panelHelpers utility functions.
 * TDD: Written BEFORE production code exists.
 */

const {
  createPanel,
  createColumn,
  createWindow,
  createDefaultWorkspaceState,
  normalizeWorkspaceState,
  normalizeWorkspaceWindows,
  resolveWorkspacePanelId,
  getWorkspaceTabStyle,
} = require('../terminal/utils/panelHelpers');

describe('createPanel', () => {
  test('creates panel with id only', () => {
    const panel = createPanel('p1');
    expect(panel).toEqual({ id: 'p1', initialCommand: null, cwd: null, swarmRole: null });
  });

  test('creates panel with initialCommand and cwd', () => {
    const panel = createPanel('p2', 'npm test', '/some/path');
    expect(panel.initialCommand).toBe('npm test');
    expect(panel.cwd).toBe('/some/path');
  });

  test('extracts swarmRole from metadata', () => {
    const panel = createPanel('p3', null, null, { swarmRole: 'coder' });
    expect(panel.swarmRole).toBe('coder');
  });
});

describe('createColumn', () => {
  test('creates column with single panel', () => {
    const col = createColumn('c1', 'p1');
    expect(col.id).toBe('c1');
    expect(col.panels).toHaveLength(1);
    expect(col.panels[0].id).toBe('p1');
  });

  test('creates column with initialCommand passed to panel', () => {
    const col = createColumn('c1', 'p1', 'ls -la');
    expect(col.panels[0].initialCommand).toBe('ls -la');
  });
});

describe('createWindow', () => {
  test('creates window with defaults', () => {
    const win = createWindow('v1', 'V1', []);
    expect(win).toEqual({ id: 'v1', name: 'V1', columns: [], activePanelId: null });
  });

  test('creates window with activePanelId', () => {
    const win = createWindow('v1', 'V1', [], 'p1');
    expect(win.activePanelId).toBe('p1');
  });
});

describe('createDefaultWorkspaceState', () => {
  test('returns state with one workspace, one column, one panel', () => {
    const state = createDefaultWorkspaceState();
    expect(state.workspaces).toHaveLength(1);
    expect(state.workspaces[0].id).toBe('ws1');
    expect(state.activeWsId).toBe('ws1');
    expect(state.activePanelIds).toEqual({ ws1: 'p1' });
  });
});

describe('normalizeWorkspaceState', () => {
  test('returns default state for empty workspaces', () => {
    const state = normalizeWorkspaceState([], null, {});
    expect(state.workspaces).toHaveLength(1);
    expect(state.workspaces[0].id).toBe('ws1');
  });

  test('returns default state for null workspaces', () => {
    const state = normalizeWorkspaceState(null, null, {});
    expect(state.workspaces).toHaveLength(1);
  });

  test('normalizes workspace with columns and panels', () => {
    const raw = [
      {
        id: 'ws1',
        name: 'My Workspace',
        columns: [{ id: 'c1', panels: [{ id: 'p1', initialCommand: 'npm start' }] }],
      },
    ];
    const state = normalizeWorkspaceState(raw, 'ws1', { ws1: 'p1' });
    expect(state.workspaces[0].name).toBe('My Workspace');
    expect(state.workspaces[0].columns[0].panels[0].initialCommand).toBe('npm start');
    expect(state.activeWsId).toBe('ws1');
  });

  test('generates IDs for missing workspace IDs', () => {
    const raw = [{ columns: [{ panels: [{}] }] }];
    const state = normalizeWorkspaceState(raw, null, {});
    expect(state.workspaces[0].id).toMatch(/^ws\d+$/);
    expect(state.workspaces[0].columns[0].id).toMatch(/^c\d+$/);
    expect(state.workspaces[0].columns[0].panels[0].id).toMatch(/^p\d+$/);
  });
});

describe('normalizeWorkspaceWindows', () => {
  test('creates default window for workspace without existing windows', () => {
    const result = normalizeWorkspaceWindows(
      {},
      {},
      [{ id: 'ws1', columns: [{ panels: [{ id: 'p1' }] }] }],
      { ws1: 'p1' }
    );
    expect(result.workspaceWindows.ws1).toHaveLength(1);
    expect(result.workspaceWindows.ws1[0].id).toMatch(/^v\d+$/);
    expect(result.activeWindowIds.ws1).toBeDefined();
  });

  test('normalizes existing windows', () => {
    const rawWindows = {
      ws1: [{ id: 'v1', name: 'Custom', columns: [{ panels: [{ id: 'p1' }] }] }],
    };
    const workspaces = [{ id: 'ws1', columns: [{ panels: [{ id: 'p1' }] }] }];
    const result = normalizeWorkspaceWindows(rawWindows, { ws1: 'v1' }, workspaces, { ws1: 'p1' });
    expect(result.workspaceWindows.ws1).toHaveLength(1);
    expect(result.workspaceWindows.ws1[0].name).toBe('Custom');
  });
});

describe('resolveWorkspacePanelId', () => {
  test('returns saved panel ID if valid', () => {
    const ws = { columns: [{ panels: [{ id: 'p1' }, { id: 'p2' }] }] };
    expect(resolveWorkspacePanelId(ws, 'p2')).toBe('p2');
  });

  test('returns first panel if saved ID is invalid', () => {
    const ws = { columns: [{ panels: [{ id: 'p1' }, { id: 'p2' }] }] };
    expect(resolveWorkspacePanelId(ws, 'p999')).toBe('p1');
  });

  test('returns null for empty workspace', () => {
    expect(resolveWorkspacePanelId({ columns: [] }, 'p1')).toBeNull();
  });
});

describe('getWorkspaceTabStyle', () => {
  test('returns wide tabs for 4 or fewer workspaces', () => {
    const style = getWorkspaceTabStyle(3);
    expect(style.flex).toBe('1 1 0%');
    expect(style.minWidth).toBe('190px');
  });

  test('returns medium tabs for 5-7 workspaces', () => {
    const style = getWorkspaceTabStyle(6);
    expect(style.flex).toBe('1 1 0%');
    expect(style.minWidth).toBe('158px');
  });

  test('returns narrow tabs for 8+ workspaces', () => {
    const style = getWorkspaceTabStyle(10);
    expect(style.flex).toBe('0 1 138px');
    expect(style.minWidth).toBe('138px');
  });
});
