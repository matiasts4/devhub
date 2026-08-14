/**
 * normalizeWorkspaceWindows (live model) — reboot-restore merge.
 *
 * Regression: provider session binds update `workspaces` only, so the
 * persisted workspaceWindows copy goes stale with initialCommand: null.
 * Hydration adopts the active window's columns as the workspace columns;
 * without the merge the stale null wiped the resume command and the startup
 * restore plan came out "terminated/no-runtime-evidence".
 */
const { normalizeWorkspaceWindows } = require('../workspaceStateModel');

describe('normalizeWorkspaceWindows — reboot-restore command merge', () => {
  test('keeps the workspace panel resume command when the persisted window copy is stale', () => {
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
                  swarmRole: null,
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
    const activePanelIds = { ws1: 'p1' };

    const result = normalizeWorkspaceWindows(rawWindows, { ws1: 'v3' }, workspaces, activePanelIds);

    // Workspace tree (hydrated from the fresher persisted state) keeps the command.
    expect(workspaces[0].columns[0].panels[0].initialCommand).toBe(cmd);
    // The adopted window copy is merged too, so both trees agree from boot.
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

  test('window panels without a workspace mirror keep their own fields', () => {
    const rawWindows = {
      ws1: [
        {
          id: 'v1',
          columns: [
            { id: 'c1', panels: [{ id: 'p1', initialCommand: 'codex resume --last', cwd: '/tmp' }] },
          ],
          activePanelId: 'p1',
        },
      ],
    };
    const workspaces = [{ id: 'ws1', columns: [{ id: 'c1', panels: [{ id: 'p9' }] }] }];

    normalizeWorkspaceWindows(rawWindows, { ws1: 'v1' }, workspaces, { ws1: 'p1' });

    expect(workspaces[0].columns[0].panels[0].initialCommand).toBe('codex resume --last');
    expect(workspaces[0].columns[0].panels[0].cwd).toBe('/tmp');
  });
});
