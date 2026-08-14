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
  resolveWorkspaceGridShape,
  buildWorkspaceColumnsForTerminalCount,
} = require('../terminal/utils/panelHelpers');

describe('createPanel', () => {
  test('creates panel with id only', () => {
    const panel = createPanel('p1');
    expect(panel).toEqual({
      id: 'p1',
      initialCommand: null,
      cwd: null,
      swarmRole: null,
      displayName: null,
    });
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

  // WSN-2 / WSN-S4: workspace_label override takes precedence over workspace.name
  test('uses workspace_label from override before workspace.name', () => {
    const raw = [
      {
        id: 'ws1',
        name: 'My Workspace',
        columns: [{ panels: [{ id: 'p1' }] }],
      },
    ];
    const state = normalizeWorkspaceState(raw, 'ws1', { ws1: 'p1' }, { ws1: 'swarm-director' });
    expect(state.workspaces[0].name).toBe('swarm-director');
    expect(state.workspaces[0].workspace_label).toBe('swarm-director');
  });

  test('uses stored workspace_label field when no override provided', () => {
    const raw = [
      {
        id: 'ws2',
        name: 'Raw Name',
        workspace_label: 'swarm-coder',
        columns: [{ panels: [{ id: 'p2' }] }],
      },
    ];
    const state = normalizeWorkspaceState(raw, 'ws2', { ws2: 'p2' });
    expect(state.workspaces[0].name).toBe('swarm-coder');
    expect(state.workspaces[0].workspace_label).toBe('swarm-coder');
  });

  test('falls back to workspace.name when no workspace_label available', () => {
    const raw = [
      {
        id: 'ws3',
        name: 'Clean Workspace',
        columns: [{ panels: [{ id: 'p3' }] }],
      },
    ];
    const state = normalizeWorkspaceState(raw, 'ws3', { ws3: 'p3' });
    expect(state.workspaces[0].name).toBe('Clean Workspace');
    expect(state.workspaces[0].workspace_label).toBeNull();
  });

  test('override function receives workspace and index', () => {
    const raw = [
      { id: 'ws-a', name: 'Alpha', columns: [{ panels: [{ id: 'p1' }] }] },
      { id: 'ws-b', name: 'Beta', columns: [{ panels: [{ id: 'p2' }] }] },
    ];
    const state = normalizeWorkspaceState(raw, 'ws-a', { 'ws-a': 'p1' }, (ws, _idx) => {
      if (ws.swarmRole) return `override-${ws.swarmRole}`;
      return null;
    });
    // First workspace (no swarmRole) falls back to name
    expect(state.workspaces[0].name).toBe('Alpha');
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

  test('keeps the workspace panel resume command when the persisted window copy is stale', () => {
    // Regression: provider session binds update workspaces only, so the window
    // copy persists initialCommand: null. Hydration must not let the stale
    // window columns wipe the command (broke reboot restore: plan came out
    // "terminated/no-runtime-evidence").
    const cmd = 'kimi --session session_abc';
    const rawWindows = {
      ws1: [
        {
          id: 'v3',
          name: 'V1',
          columns: [
            {
              id: 'c1',
              panels: [
                {
                  id: 'p1',
                  kind: 'terminal',
                  initialCommand: null,
                  cwd: null,
                  displayName: 'Alex',
                },
              ],
            },
          ],
          activePanelId: 'p1',
        },
      ],
    };
    const workspaces = [
      { id: 'ws1', columns: [{ id: 'c1', panels: [{ id: 'p1', cwd: null, initialCommand: cmd }] }] },
    ];
    const result = normalizeWorkspaceWindows(rawWindows, { ws1: 'v3' }, workspaces, { ws1: 'p1' });

    expect(workspaces[0].columns[0].panels[0].initialCommand).toBe(cmd);
    const winPanel = result.workspaceWindows.ws1[0].columns[0].panels[0];
    expect(winPanel.initialCommand).toBe(cmd);
    // Window-only fields survive the merge.
    expect(winPanel.displayName).toBe('Alex');
    expect(winPanel.kind).toBe('terminal');
  });

  test('window panel command wins when the workspace mirror has none', () => {
    const rawWindows = {
      ws1: [
        {
          id: 'v1',
          columns: [{ id: 'c1', panels: [{ id: 'p1', initialCommand: 'grok --continue' }] }],
          activePanelId: 'p1',
        },
      ],
    };
    const workspaces = [
      { id: 'ws1', columns: [{ id: 'c1', panels: [{ id: 'p1', initialCommand: null }] }] },
    ];
    normalizeWorkspaceWindows(rawWindows, { ws1: 'v1' }, workspaces, { ws1: 'p1' });
    expect(workspaces[0].columns[0].panels[0].initialCommand).toBe('grok --continue');
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

describe('resolveWorkspaceGridShape', () => {
  test('maps common terminal counts to side-by-side or grid layouts', () => {
    expect(resolveWorkspaceGridShape(2)).toEqual({ columns: 2, rows: 1 });
    expect(resolveWorkspaceGridShape(3)).toEqual({ columns: 3, rows: 1 });
    expect(resolveWorkspaceGridShape(4)).toEqual({ columns: 2, rows: 2 });
    expect(resolveWorkspaceGridShape(6)).toEqual({ columns: 3, rows: 2 });
  });
});

describe('buildWorkspaceColumnsForTerminalCount', () => {
  function buildLayout(count) {
    let panelCounter = 0;
    let columnCounter = 0;
    return buildWorkspaceColumnsForTerminalCount({
      terminalCount: count,
      createPanel: (id, initialCommand, cwd) => createPanel(id, initialCommand, cwd),
      allocateColumnId: () => `c${++columnCounter}`,
      allocatePanelId: () => `p${++panelCounter}`,
      initialCommand: 'opencode',
      panelCwd: '/workspace/devhub',
    });
  }

  test('places two terminals in separate horizontal columns', () => {
    const { columns, firstPanelId } = buildLayout(2);
    expect(firstPanelId).toBe('p1');
    expect(columns).toHaveLength(2);
    expect(columns[0].panels).toHaveLength(1);
    expect(columns[1].panels).toHaveLength(1);
    expect(columns[0].panels[0].id).toBe('p1');
    expect(columns[1].panels[0].id).toBe('p2');
  });

  test('places three terminals in one horizontal row', () => {
    const { columns } = buildLayout(3);
    expect(columns).toHaveLength(3);
    expect(columns.map((column) => column.panels[0].id)).toEqual(['p1', 'p2', 'p3']);
  });

  test('places four terminals in a 2x2 grid', () => {
    const { columns } = buildLayout(4);
    expect(columns).toHaveLength(2);
    expect(columns[0].panels.map((panel) => panel.id)).toEqual(['p1', 'p3']);
    expect(columns[1].panels.map((panel) => panel.id)).toEqual(['p2', 'p4']);
  });

  test('places five terminals in swarm-style 2+2+1 columns', () => {
    const { columns } = buildLayout(5);
    expect(columns).toHaveLength(3);
    expect(columns[0].panels.map((panel) => panel.id)).toEqual(['p1', 'p3']);
    expect(columns[1].panels.map((panel) => panel.id)).toEqual(['p2', 'p4']);
    expect(columns[2].panels.map((panel) => panel.id)).toEqual(['p5']);
  });

  test('places six terminals in a 3x2 grid', () => {
    const { columns } = buildLayout(6);
    expect(columns).toHaveLength(3);
    expect(columns[0].panels.map((panel) => panel.id)).toEqual(['p1', 'p4']);
    expect(columns[1].panels.map((panel) => panel.id)).toEqual(['p2', 'p5']);
    expect(columns[2].panels.map((panel) => panel.id)).toEqual(['p3', 'p6']);
  });
});
