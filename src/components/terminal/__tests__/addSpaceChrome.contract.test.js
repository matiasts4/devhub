/**
 * Option D: Add creates a new space; convert (setPanelKind) replaces only that panel.
 * Chrome: + menu only — no name-adjacent kind switcher, no single-space AÑADIR strip.
 */
const fs = require('fs');
const path = require('path');
const {
  createPanel,
  setPanelKindInWorkspaceTree,
  normalizePanelKind,
} = require('../models/workspaceStateModel');

describe('add-space chrome contracts', () => {
  test('setPanelKind keeps panel id and only changes kind', () => {
    const workspaces = [
      {
        id: 'ws1',
        columns: [
          {
            id: 'c1',
            panels: [createPanel('p1'), createPanel('p2')],
          },
        ],
      },
    ];
    const next = setPanelKindInWorkspaceTree({
      workspaces,
      workspaceWindows: {},
      workspaceId: 'ws1',
      panelId: 'p1',
      kind: 'browser',
    });
    expect(next.workspaces[0].columns[0].panels[0]).toEqual(
      expect.objectContaining({ id: 'p1', kind: 'browser' })
    );
    expect(next.workspaces[0].columns[0].panels[1].kind).toBe('terminal');
  });

  test('normalizePanelKind defaults unknown to terminal', () => {
    expect(normalizePanelKind('browser')).toBe('browser');
    expect(normalizePanelKind('files')).toBe('files');
    expect(normalizePanelKind('nope')).toBe('terminal');
  });

  test('panel chrome keeps convert in + menu, not beside the agent name', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/renderWorkspacePanel.jsx'),
      'utf8'
    );
    expect(source).toContain('panel-convert-space-');
    expect(source).not.toContain('panel-kind-select-');
    expect(source).not.toContain('PanelKindSwitcher');
    // Space components show the panel name alone (not "Files Avery").
    expect(source).toMatch(/primary:\s*panelLabel/);
  });

  test('single-space workspace has no AÑADIR starter strip', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/WorkspaceTerminalSurface.jsx'),
      'utf8'
    );
    expect(source).not.toContain('workspace-single-space-starter');
    expect(source).toContain('workspace-starter-chips');
  });
});

describe('spawnFirstTerminalPanelColumns kind', () => {
  const { spawnFirstTerminalPanelColumns, createPanel } = require('../utils/panelHelpers');

  test('empty-workspace spawn can create a browser panel when factory supports kind', () => {
    let panelCounter = 0;
    let colCounter = 0;
    const createPanelWithKind = (id, initialCommand, cwd, metadata) => ({
      ...createPanel(id, initialCommand, cwd, metadata),
      kind: metadata?.kind || 'terminal',
    });
    // panelHelpers createPanel has no kind — factory supplies it
    const spawned = spawnFirstTerminalPanelColumns({
      createPanel: (id, cmd, cwd, meta) => createPanelWithKind(id, cmd, cwd, meta),
      allocateColumnId: () => `c${++colCounter}`,
      allocatePanelId: () => `p${++panelCounter}`,
      kind: 'browser',
    });
    expect(spawned.panelId).toBe('p1');
    expect(spawned.columns[0].panels[0].kind).toBe('browser');
  });
});
