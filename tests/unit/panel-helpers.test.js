// Tests for panelHelpers.js — pure utility functions for workspace/panel/window creation.
// Strict TDD: RED → GREEN → TRIANGULATE

import {
  createPanel,
  createColumn,
  createWindow,
  createDefaultWorkspaceState,
  normalizeWorkspaceState,
  normalizeWorkspaceWindows,
  resolveWorkspacePanelId,
  getWorkspaceTabStyle,
  spawnFirstTerminalPanelColumns,
} from '../../src/components/terminal/utils/panelHelpers';

describe('panelHelpers', () => {
  describe('createPanel', () => {
    it('creates a panel with id only', () => {
      const panel = createPanel('p1');
      expect(panel).toEqual({
        id: 'p1',
        initialCommand: null,
        cwd: null,
        swarmRole: null,
      });
    });

    it('creates a panel with all arguments', () => {
      const panel = createPanel('p2', 'npm test', '/home/project', { swarmRole: 'coder' });
      expect(panel).toEqual({
        id: 'p2',
        initialCommand: 'npm test',
        cwd: '/home/project',
        swarmRole: 'coder',
      });
    });
  });

  describe('createColumn', () => {
    it('creates a column with one panel', () => {
      const col = createColumn('c1', 'p1');
      expect(col).toEqual({
        id: 'c1',
        panels: [{ id: 'p1', initialCommand: null, cwd: null, swarmRole: null }],
      });
    });

    it('creates a column with command and cwd', () => {
      const col = createColumn('c2', 'p2', 'opencode', '/workspace');
      expect(col.panels[0].initialCommand).toBe('opencode');
      expect(col.panels[0].cwd).toBe('/workspace');
    });
  });

  describe('createWindow', () => {
    it('creates a window with required fields', () => {
      const win = createWindow('v1', 'V1', []);
      expect(win).toEqual({
        id: 'v1',
        name: 'V1',
        columns: [],
        activePanelId: null,
      });
    });

    it('creates a window with activePanelId', () => {
      const win = createWindow('v2', 'V2', [], 'p1');
      expect(win.activePanelId).toBe('p1');
    });
  });

  describe('createDefaultWorkspaceState', () => {
    it('returns a state with one workspace, one column, one panel', () => {
      const state = createDefaultWorkspaceState();
      expect(state.workspaces).toHaveLength(1);
      expect(state.workspaces[0].id).toBe('ws1');
      expect(state.activeWsId).toBe('ws1');
      expect(state.activePanelIds).toEqual({ ws1: 'p1' });
    });
  });

  describe('normalizeWorkspaceState', () => {
    it('returns default state for empty workspaces', () => {
      const result = normalizeWorkspaceState([], null, null);
      expect(result.workspaces).toHaveLength(1);
      expect(result.activeWsId).toBe('ws1');
    });

    it('returns default state for null workspaces', () => {
      const result = normalizeWorkspaceState(null, null, null);
      expect(result.workspaces).toHaveLength(1);
    });

    it('normalizes a single workspace', () => {
      const raw = [
        {
          id: 'ws1',
          name: 'My Workspace',
          columns: [{ id: 'c1', panels: [{ id: 'p1' }] }],
        },
      ];
      const result = normalizeWorkspaceState(raw, 'ws1', { ws1: 'p1' });
      expect(result.workspaces).toHaveLength(1);
      expect(result.workspaces[0].name).toBe('My Workspace');
      expect(result.activeWsId).toBe('ws1');
    });

    it('generates IDs for workspaces without IDs', () => {
      const raw = [{ columns: [{ panels: [{}] }] }];
      const result = normalizeWorkspaceState(raw, null, null);
      expect(result.workspaces[0].id).toMatch(/^ws\d+$/);
      expect(result.workspaces[0].columns[0].id).toMatch(/^c\d+$/);
      expect(result.workspaces[0].columns[0].panels[0].id).toMatch(/^p\d+$/);
    });

    it('provides default name for unnamed workspaces', () => {
      const raw = [{ columns: [{ panels: [{}] }] }];
      const result = normalizeWorkspaceState(raw, null, null);
      expect(result.workspaces[0].name).toBe('Workspace 1');
    });
  });

  describe('normalizeWorkspaceWindows', () => {
    it('creates default windows when none exist', () => {
      const workspaces = [{ id: 'ws1', columns: [{ panels: [{ id: 'p1' }] }] }];
      const result = normalizeWorkspaceWindows({}, {}, workspaces, { ws1: 'p1' });
      expect(result.workspaceWindows.ws1).toHaveLength(1);
      expect(result.activeWindowIds.ws1).toMatch(/^v\d+$/);
    });

    it('normalizes existing windows', () => {
      const workspaces = [{ id: 'ws1', columns: [{ panels: [{ id: 'p1' }] }] }];
      const rawWindows = {
        ws1: [{ id: 'v1', name: 'Custom', columns: [{ panels: [{ id: 'p1' }] }] }],
      };
      const result = normalizeWorkspaceWindows(rawWindows, { ws1: 'v1' }, workspaces, { ws1: 'p1' });
      expect(result.workspaceWindows.ws1).toHaveLength(1);
      expect(result.activeWindowIds.ws1).toBe('v1');
    });
  });

  describe('spawnFirstTerminalPanelColumns', () => {
    it('creates one column with one panel when workspace is empty', () => {
      let colN = 0;
      let panelN = 0;
      const result = spawnFirstTerminalPanelColumns({
        allocateColumnId: () => `c${++colN}`,
        allocatePanelId: () => `p${++panelN}`,
      });
      expect(result.panelId).toBe('p1');
      expect(result.columns).toHaveLength(1);
      expect(result.columns[0].panels).toHaveLength(1);
      expect(result.columns[0].panels[0].id).toBe('p1');
    });
  });

  describe('resolveWorkspacePanelId', () => {
    it('returns saved panel ID when valid', () => {
      const workspace = { columns: [{ panels: [{ id: 'p1' }, { id: 'p2' }] }] };
      expect(resolveWorkspacePanelId(workspace, 'p2')).toBe('p2');
    });

    it('returns first panel when saved ID is invalid', () => {
      const workspace = { columns: [{ panels: [{ id: 'p1' }, { id: 'p2' }] }] };
      expect(resolveWorkspacePanelId(workspace, 'p99')).toBe('p1');
    });

    it('returns null for empty workspace', () => {
      expect(resolveWorkspacePanelId({}, 'p1')).toBeNull();
      expect(resolveWorkspacePanelId(null, 'p1')).toBeNull();
    });
  });

  describe('getWorkspaceTabStyle', () => {
    it('returns wider tabs for 4 or fewer workspaces', () => {
      const style = getWorkspaceTabStyle(3);
      expect(style.maxWidth).toBe('260px');
      expect(style.minWidth).toBe('190px');
    });

    it('returns medium tabs for 5-7 workspaces', () => {
      const style = getWorkspaceTabStyle(6);
      expect(style.maxWidth).toBe('220px');
      expect(style.minWidth).toBe('158px');
    });

    it('returns narrow tabs for 8+ workspaces', () => {
      const style = getWorkspaceTabStyle(10);
      expect(style.maxWidth).toBe('180px');
      expect(style.minWidth).toBe('138px');
    });
  });
});
