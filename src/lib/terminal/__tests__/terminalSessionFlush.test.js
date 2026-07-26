const { JSDOM } = require('jsdom');
const {
  buildAgentProviderResumeCommand,
  buildCleanTerminalStatePayload,
  flushTerminalSessionPersistence,
  normalizeWorkspacesAgentCommands,
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
              panels: [
                { id: 'p1', cwd: '/x', initialCommand: 'opencode --session a', swarmRole: 'x' },
              ],
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

  test('buildAgentProviderResumeCommand builds provider resume forms', () => {
    expect(buildAgentProviderResumeCommand('kimi', 'km-1')).toBe('kimi --session km-1');
    expect(buildAgentProviderResumeCommand('grok', 'gk-1')).toBe('grok --resume gk-1');
    expect(buildAgentProviderResumeCommand('codex', 'cx-1')).toBe('codex resume cx-1');
    expect(buildAgentProviderResumeCommand('qodercli', 'qd-1')).toBe('qodercli --resume qd-1');
    expect(buildAgentProviderResumeCommand('qoder', 'qd-1')).toBe('qodercli --resume qd-1');
    expect(buildAgentProviderResumeCommand('hermes', 'h-1')).toBeNull();
    expect(buildAgentProviderResumeCommand('kimi', '')).toBeNull();
  });

  test('normalizeWorkspacesAgentCommands persists provider resume forms', () => {
    const workspaces = [
      {
        id: 'ws1',
        columns: [
          {
            id: 'c1',
            panels: [
              { id: 'p-kimi', initialCommand: 'kimi' },
              { id: 'p-grok', initialCommand: 'grok --session-id gk-pre-1' },
              { id: 'p-codex', initialCommand: 'codex' },
              { id: 'p-qoder', initialCommand: 'qodercli --session-id qd-pre-1' },
              { id: 'p-shell', initialCommand: 'npm run dev' },
              { id: 'p-empty', initialCommand: '' },
            ],
          },
        ],
      },
    ];
    const agentRunsByPanel = {
      'p-kimi': { panelId: 'p-kimi', agentType: 'kimi', agentSessionId: 'km-9' },
      'p-codex': { panelId: 'p-codex', agentType: 'codex', agentSessionId: 'cx-9' },
      'p-empty': { panelId: 'p-empty', agentType: 'kimi', agentSessionId: 'km-typed-1' },
    };

    const [normalized] = normalizeWorkspacesAgentCommands(workspaces, agentRunsByPanel);
    const panels = normalized.columns[0].panels;

    expect(panels[0].initialCommand).toBe('kimi --session km-9');
    // Pre-assign form is rewritten to resume form (id already exists on disk).
    expect(panels[1].initialCommand).toBe('grok --resume gk-pre-1');
    expect(panels[2].initialCommand).toBe('codex resume cx-9');
    expect(panels[3].initialCommand).toBe('qodercli --resume qd-pre-1');
    // Non-agent commands are never rewritten.
    expect(panels[4].initialCommand).toBe('npm run dev');
    // Empty command + bound run (typed launch) gets the resume form.
    expect(panels[5].initialCommand).toBe('kimi --session km-typed-1');
  });

  test('normalizeWorkspacesAgentCommands is idempotent and strips recovery tags', () => {
    const workspaces = [
      {
        id: 'ws1',
        columns: [
          {
            id: 'c1',
            panels: [{ id: 'p1', initialCommand: 'kimi --session km-1 #recovery-3' }],
          },
        ],
      },
    ];

    const [once] = normalizeWorkspacesAgentCommands(workspaces, {});
    expect(once.columns[0].panels[0].initialCommand).toBe('kimi --session km-1');

    const [twice] = normalizeWorkspacesAgentCommands([once], {});
    expect(twice.columns[0].panels[0].initialCommand).toBe('kimi --session km-1');
  });

  test('syncAgentRunsFromWorkspacePanels copies provider ids from panel commands', () => {
    storage.setItem(
      'devhub_agent_runs',
      JSON.stringify({
        taskGrok: { panelId: 'p1', launchedAt: 1 },
        taskQoder: { panelId: 'p2', launchedAt: 1 },
      })
    );

    const workspaces = [
      {
        id: 'ws1',
        columns: [
          {
            id: 'c1',
            panels: [
              { id: 'p1', initialCommand: 'grok --session-id gk-sync-1' },
              { id: 'p2', initialCommand: 'qodercli --resume qd-sync-1' },
            ],
          },
        ],
      },
    ];

    expect(syncAgentRunsFromWorkspacePanels(storage, workspaces)).toBe(true);

    const runs = JSON.parse(storage.getItem('devhub_agent_runs'));
    expect(runs.taskGrok.agentSessionId).toBe('gk-sync-1');
    expect(runs.taskGrok.agentType).toBe('grok');
    expect(runs.taskQoder.agentSessionId).toBe('qd-sync-1');
    expect(runs.taskQoder.agentType).toBe('qodercli');
  });

  test('flushTerminalSessionPersistence persists grok pre-assign command in resume form', () => {
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
            panels: [{ id: 'p1', cwd: '/tmp', initialCommand: 'grok --session-id gk-flush-1' }],
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
      'grok --resume gk-flush-1'
    );

    const runs = JSON.parse(storage.getItem('devhub_agent_runs'));
    expect(runs.task1.agentSessionId).toBe('gk-flush-1');
    expect(runs.task1.agentType).toBe('grok');
  });
});
