const { JSDOM } = require('jsdom');
const {
  buildCleanTerminalStatePayload,
  flushTerminalSessionPersistence,
  syncAgentRunsFromWorkspacePanels,
  resolveTerminalStorageKeys,
} = require('../terminalSessionFlush');

describe('terminalSessionFlush', () => {
  let storage;

  beforeEach(() => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'https://devhub.test',
    });
    storage = dom.window.localStorage;
    storage.clear();
  });

  test('resolveTerminalStorageKeys scopes by project', () => {
    expect(resolveTerminalStorageKeys('project-1')).toEqual({
      terminalStateKey: 'devhub_terminal_state:project-1',
      restoreManifestKey: 'devhub_restore_manifest:project-1',
      legacyTerminalStateKey: 'devhub_terminal_state',
    });
  });

  test('syncAgentRunsFromWorkspacePanels copies session id from panel command', () => {
    storage.setItem(
      'devhub_agent_runs',
      JSON.stringify({
        task1: { panelId: 'p1', launchedAt: 1 },
      })
    );

    const workspaces = [
      {
        id: 'ws1',
        columns: [
          {
            id: 'c1',
            panels: [{ id: 'p1', initialCommand: 'opencode --session oc-flush-1' }],
          },
        ],
      },
    ];

    expect(syncAgentRunsFromWorkspacePanels(storage, workspaces)).toBe(true);

    const runs = JSON.parse(storage.getItem('devhub_agent_runs'));
    expect(runs.task1.opencodeSessionId).toBe('oc-flush-1');
  });

  test('flushTerminalSessionPersistence normalizes opencode command for reboot', () => {
    storage.setItem(
      'devhub_agent_runs',
      JSON.stringify({
        task1: {
          panelId: 'p1',
          opencodeSessionId: 'oc-reboot-flush',
          restorePolicy: 'auto',
          launchedAt: 1,
        },
      })
    );

    const workspaces = [
      {
        id: 'ws1',
        columns: [
          {
            id: 'c1',
            panels: [{ id: 'p1', cwd: '/tmp', initialCommand: 'opencode' }],
          },
        ],
      },
    ];

    expect(
      flushTerminalSessionPersistence(storage, {
        workspaces,
        activeWsId: 'ws1',
        activePanelIds: { ws1: 'p1' },
        projectId: 'project-1',
      })
    ).toBe(true);

    const state = JSON.parse(storage.getItem('devhub_terminal_state:project-1'));
    expect(state.workspaces[0].columns[0].panels[0].initialCommand).toBe(
      'opencode --session oc-reboot-flush'
    );

    const manifest = JSON.parse(storage.getItem('devhub_restore_manifest:project-1'));
    expect(manifest.terminalSessions[0].opencodeSessionId).toBe('oc-reboot-flush');
  });

  test('buildCleanTerminalStatePayload strips non-persisted panel fields', () => {
    const payload = buildCleanTerminalStatePayload({
      workspaces: [
        {
          id: 'ws1',
          columns: [
            {
              id: 'c1',
              panels: [{ id: 'p1', cwd: '/x', initialCommand: 'opencode --session a', swarmRole: 'x' }],
            },
          ],
        },
      ],
      activeWsId: 'ws1',
      activePanelIds: { ws1: 'p1' },
    });

    expect(payload.workspaces[0].columns[0].panels[0]).toEqual({
      id: 'p1',
      cwd: '/x',
      initialCommand: 'opencode --session a',
    });
  });
});