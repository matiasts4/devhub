/**
 * panelHelpers — displayName round-trip tests.
 * TDD: written BEFORE production code (T5 RED).
 *
 * The `displayName` field is the 5th field on every panel object:
 *   { id, initialCommand, cwd, swarmRole, displayName }
 *
 * Default value is `null` — pool assignment happens at the call site
 * (TerminalWorkspacesManager.jsx) so the factory stays pure.
 */

const {
  createPanel,
  createColumn,
  createDefaultWorkspaceState,
  normalizeWorkspaceState,
  buildWorkspaceColumnsForTerminalCount,
} = require('../panelHelpers');

describe('createPanel / normalizeWorkspaceState — displayName round-trip', () => {
  test('createPanel includes displayName=null by default', () => {
    const panel = createPanel('p1');
    expect(panel).toEqual({
      id: 'p1',
      initialCommand: null,
      cwd: null,
      swarmRole: null,
      displayName: null,
    });
  });

  test('createPanel reads displayName from metadata when supplied', () => {
    const panel = createPanel('p1', null, null, { displayName: 'Chase' });
    expect(panel.displayName).toBe('Chase');
  });

  test('normalizeWorkspaceState preserves displayName across re-serialization', () => {
    const raw = [
      {
        id: 'ws1',
        name: 'Workspace 1',
        columns: [
          {
            id: 'c1',
            panels: [
              { id: 'p1', initialCommand: 'opencode', displayName: 'Chase' },
              { id: 'p2', displayName: 'Nate' },
            ],
          },
        ],
      },
    ];
    const state = normalizeWorkspaceState(raw, 'ws1', { ws1: 'p1' });
    expect(state.workspaces[0].columns[0].panels[0].displayName).toBe('Chase');
    expect(state.workspaces[0].columns[0].panels[1].displayName).toBe('Nate');
  });

  test('normalizeWorkspaceState defaults displayName to null when missing on raw input', () => {
    const raw = [
      {
        id: 'ws1',
        name: 'Workspace 1',
        columns: [{ id: 'c1', panels: [{ id: 'p1' }] }],
      },
    ];
    const state = normalizeWorkspaceState(raw, 'ws1', { ws1: 'p1' });
    expect(state.workspaces[0].columns[0].panels[0].displayName).toBeNull();
  });

  test('createDefaultWorkspaceState panels carry displayName=null', () => {
    const state = createDefaultWorkspaceState();
    expect(state.workspaces[0].columns[0].panels[0].displayName).toBeNull();
  });

  test('buildWorkspaceColumnsForTerminalCount propagates displayName when createPanel wrapper supplies it', () => {
    let counter = 0;
    const result = buildWorkspaceColumnsForTerminalCount({
      terminalCount: 2,
      createPanel: (id, initialCommand, cwd) =>
        createPanel(id, initialCommand, cwd, { displayName: `custom-${id}` }),
      allocateColumnId: () => `c${++counter}`,
      allocatePanelId: () => `p${++counter}`,
    });
    const allPanels = result.columns.flatMap((col) => col.panels);
    expect(allPanels).toHaveLength(2);
    expect(allPanels[0].displayName).toBe('custom-p1');
    expect(allPanels[1].displayName).toBe('custom-p2');
  });
});

describe('resolveSplitCreatedPanelProps', () => {
  const { resolveSplitCreatedPanelProps } = require('../panelHelpers');

  test('user split inherits cwd but never launch commands from source panel', () => {
    expect(
      resolveSplitCreatedPanelProps({
        sourcePanel: {
          id: 'p1',
          cwd: '/workspace/devhub',
          initialCommand: 'opencode --session ses_abc',
        },
        workspaceCwd: '/fallback',
      })
    ).toEqual({
      initialCommand: null,
      panelCwd: '/workspace/devhub',
    });
  });

  test('programmatic split keeps explicit launch command and cwd', () => {
    expect(
      resolveSplitCreatedPanelProps({
        sourcePanel: {
          id: 'p1',
          cwd: '/workspace/devhub',
          initialCommand: 'opencode --session ses_abc',
        },
        workspaceCwd: '/fallback',
        explicitInitialCommand: 'opencode --agent zed',
        explicitPanelCwd: '/tmp/zed',
      })
    ).toEqual({
      initialCommand: 'opencode --agent zed',
      panelCwd: '/tmp/zed',
    });
  });
});
