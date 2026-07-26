const React = require('react');
const {
  cleanupMountedRoots,
  click,
  flushEffects,
  installDom,
  renderIntoDom,
} = require('@/test-support/domHarness');
const {
  createResumableCatalogError,
  createResumableSession,
} = require('@/test-support/resumableSessionFixtures');

const mockCatalogState = {
  status: 'empty',
  sessions: [],
  error: null,
  isLoading: false,
  refresh: jest.fn(),
  retry: jest.fn(),
};

jest.mock('framer-motion', () => {
  const React = require('react');
  const mockEl =
    (tag) =>
    ({ children, ...props }) =>
      React.createElement(tag, props, children);
  return {
    motion: {
      div: mockEl('div'),
      span: mockEl('span'),
      aside: mockEl('aside'),
      li: mockEl('li'),
    },
    AnimatePresence: ({ children }) => children,
    useReducedMotion: () => false,
    useMotionValue: (v) => ({ get: () => v, set: () => {} }),
    useTransform: (v, _from, _to) => v,
  };
});

jest.mock('lucide-react', () => {
  const icon = (name) => (props) => {
    const React = require('react');
    return React.createElement('svg', { ...props, 'data-icon': name });
  };
  return new Proxy({}, { get: (_, key) => icon(String(key)) });
});

jest.mock('react-resizable-panels', () => ({
  PanelGroup: ({ children, ...props }) => {
    const React = require('react');
    return React.createElement('div', props, children);
  },
  Panel: ({ children, defaultSize, ...props }) => {
    const React = require('react');
    return React.createElement('div', { ...props, 'data-panel-size': defaultSize }, children);
  },
  PanelResizeHandle: (props) => {
    const React = require('react');
    return React.createElement('div', props);
  },
}));

jest.mock('../TerminalTTY', () => ({
  __esModule: true,
  default: ({ id, initialCommand, requestedRendererMode = 'xterm' }) => {
    const React = require('react');
    return React.createElement(
      'div',
      {
        'data-testid': `terminal-${id}`,
        'data-command': initialCommand || '',
        'data-renderer': requestedRendererMode,
      },
      id
    );
  },
}));

jest.mock('../NotificationCenter', () => ({
  __esModule: true,
  default: () => {
    const React = require('react');
    return React.createElement('div', null, 'notifications');
  },
}));

jest.mock('@/lib/docopsPrompts', () => ({
  enforceDocOpsGateOnLaunchCommand: (value) => value,
}));

jest.mock('@/lib/db/localClient', () => ({
  createClient: () => ({
    from: () => ({
      insert: jest.fn().mockResolvedValue({}),
      update() {
        return this;
      },
      eq: jest.fn().mockResolvedValue({}),
    }),
  }),
}));

jest.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children, onOpenChange }) => {
    const React = require('react');
    return React.createElement('div', { 'data-open-handler': Boolean(onOpenChange) }, children);
  },
  DropdownMenuContent: ({ children }) => {
    const React = require('react');
    return React.createElement('div', { 'data-testid': 'dropdown-content' }, children);
  },
  DropdownMenuItem: ({ children, onSelect, ...props }) => {
    const React = require('react');
    return React.createElement('button', { type: 'button', onClick: onSelect, ...props }, children);
  },
  DropdownMenuLabel: ({ children }) => {
    const React = require('react');
    return React.createElement('div', null, children);
  },
  DropdownMenuSeparator: () => {
    const React = require('react');
    return React.createElement('hr');
  },
  DropdownMenuTrigger: ({ children }) => {
    const React = require('react');
    return React.createElement(React.Fragment, null, children);
  },
}));

jest.mock('@/lib/agentRegistryLive', () => ({
  findAgentWorkspaceAndPanel: () => ({}),
}));

jest.mock('date-fns', () => ({
  formatDistanceToNow: () => 'just now',
}));

jest.mock(
  '../workspace/FileExplorerEditorPane',
  () => ({
    __esModule: true,
    default: () => {
      const React = require('react');
      return React.createElement('div', { 'data-testid': 'shared-editor-pane' });
    },
  }),
  { virtual: true }
);

jest.mock(
  '../workspace/WorkspaceBridgePane',
  () => ({
    __esModule: true,
    default: () => {
      const React = require('react');
      return React.createElement('div', { 'data-testid': 'shared-bridge-pane' });
    },
  }),
  { virtual: true }
);

jest.mock('@/hooks/useResumableSessionCatalog', () => ({
  __esModule: true,
  default: () => mockCatalogState,
}));

// Mock OperatorActionsDispatchContext — provider is normally in App.js
jest.mock('@/lib/operator/OperatorActionsDispatchContext', () => ({
  OperatorActionsDispatchProvider: ({ children }) => children,
  useOperatorActionsDispatch: () => ({
    dispatchAction: jest.fn(),
    cards: [],
    confirmCard: jest.fn(),
    cancelCard: jest.fn(),
  }),
}));

const TerminalWorkspacesManager = require('../TerminalWorkspacesManager').default;

const mountedRoots = [];

function getRenderedTerminalNodes(container) {
  return Array.from(container.querySelectorAll('[data-testid^="terminal-p"]'));
}

function renderManager(props = {}) {
  return renderIntoDom(
    React.createElement(TerminalWorkspacesManager, {
      cwd: '/workspace/devhub',
      isVisible: true,
      projectId: 'project-1',
      ...props,
    }),
    mountedRoots
  );
}

describe('TerminalWorkspacesManager reopen menu', () => {
  let dom;

  beforeEach(() => {
    dom = installDom();
    window.localStorage.clear();
    global.fetch = jest.fn().mockRejectedValue(new Error('network-disabled-in-test'));
    mockCatalogState.status = 'empty';
    mockCatalogState.sessions = [];
    mockCatalogState.error = null;
    mockCatalogState.isLoading = false;
    mockCatalogState.refresh = jest.fn();
    mockCatalogState.retry = jest.fn();
  });

  afterEach(() => {
    cleanupMountedRoots(mountedRoots);

    dom.window.close();
    delete global.localStorage;
    delete global.fetch;
    jest.clearAllMocks();
  });

  test('shows loading state without indefinite spinner text when catalog is loading', async () => {
    mockCatalogState.status = 'loading';
    mockCatalogState.isLoading = true;

    const view = await renderManager();

    expect(view.container.textContent).toContain('Loading recent sessions...');
    expect(view.container.textContent).not.toContain('No recent sessions found.');
  });

  test('shows empty state when no durable sessions are available', async () => {
    const view = await renderManager();

    expect(view.container.textContent).toContain('No recent sessions found.');
  });

  test('shows deterministic error state with retry action', async () => {
    mockCatalogState.status = 'error';
    mockCatalogState.error = createResumableCatalogError();

    const view = await renderManager();
    expect(view.container.textContent).toContain('OpenCode session listing timed out.');

    await click(
      Array.from(view.container.querySelectorAll('button')).find((button) =>
        button.textContent.includes('Retry')
      )
    );

    expect(mockCatalogState.refresh).toHaveBeenCalledTimes(1);
  });

  test('renders the same resumable sessions in topbar reopen dropdown', async () => {
    mockCatalogState.status = 'success';
    mockCatalogState.sessions = [
      createResumableSession({ sessionId: 'oc-1', title: 'Daily sync' }),
    ];

    const view = await renderManager();

    expect(view.container.textContent).toContain('Daily sync');
  });

  test('reopens an OpenCode session in exactly one new panel and records the run', async () => {
    mockCatalogState.status = 'success';
    mockCatalogState.sessions = [
      createResumableSession({ sessionId: 'oc-99', title: 'Recovered session' }),
    ];

    const view = await renderManager();

    const beforePanels = getRenderedTerminalNodes(view.container);
    const beforeIds = beforePanels.map((node) => node.textContent);
    await click(
      Array.from(view.container.querySelectorAll('button')).find((button) =>
        button.textContent.includes('Recovered session')
      )
    );
    const afterPanels = getRenderedTerminalNodes(view.container);

    expect(afterPanels.length).toBe(beforePanels.length + 1);

    const runs = JSON.parse(window.localStorage.getItem('devhub_agent_runs') || '{}');
    expect(runs['oc-reopen-oc-99']).toEqual(
      expect.objectContaining({
        selectedAgent: 'opencode',
        launchOrigin: 'reopen-session',
        opencodeSessionId: 'oc-99',
      })
    );

    const resumedPanel = afterPanels.find((node) => !beforeIds.includes(node.textContent));
    expect(resumedPanel).not.toBeUndefined();
  });

  test('keeps topbar Reopen dropdown in sync through timeout retry recovery', async () => {
    mockCatalogState.status = 'error';
    mockCatalogState.error = createResumableCatalogError();

    const view = await renderManager();

    expect(view.container.textContent).toContain('OpenCode session listing timed out.');

    mockCatalogState.status = 'success';
    mockCatalogState.error = null;
    mockCatalogState.sessions = [
      createResumableSession({ sessionId: 'oc-22', title: 'Recovered after retry' }),
    ];

    await click(
      Array.from(view.container.querySelectorAll('button')).find((button) =>
        button.textContent.includes('Retry')
      )
    );
    await view.rerender(
      React.createElement(TerminalWorkspacesManager, {
        cwd: '/workspace/devhub',
        isVisible: true,
        projectId: 'project-1',
      })
    );

    expect(mockCatalogState.refresh).toHaveBeenCalledTimes(1);
    expect(view.container.textContent).toContain('Recovered after retry');
    expect(view.container.textContent).not.toContain('OpenCode session listing timed out.');
  });

  test('shows deterministic failure instead of leaving a blank substitute panel when reopen exits immediately', async () => {
    mockCatalogState.status = 'success';
    mockCatalogState.sessions = [
      createResumableSession({ sessionId: 'oc-expired', title: 'Expired session' }),
    ];

    const view = await renderManager();

    const beforePanels = getRenderedTerminalNodes(view.container);
    expect(beforePanels).toHaveLength(1);
    const beforeIds = beforePanels.map((node) => node.textContent);

    await click(
      Array.from(view.container.querySelectorAll('button')).find((button) =>
        button.textContent.includes('Expired session')
      )
    );

    const afterPanels = getRenderedTerminalNodes(view.container);
    expect(afterPanels).toHaveLength(2);

    const newPanelId = afterPanels
      .map((node) => node.textContent)
      .find((id) => !beforeIds.includes(id));
    expect(newPanelId).not.toBeUndefined();

    window.dispatchEvent(
      new window.CustomEvent('devhub:terminal-exit', {
        detail: {
          id: newPanelId,
          initialCommand: 'opencode --session oc-expired',
        },
      })
    );
    await flushEffects();

    expect(view.container.textContent).toContain('Session is no longer available to resume.');
    expect(getRenderedTerminalNodes(view.container)).toHaveLength(1);

    const runs = JSON.parse(window.localStorage.getItem('devhub_agent_runs') || '{}');
    expect(runs['oc-reopen-oc-expired']).toBeUndefined();
  });

  test('does not apply OpenCode session detect to unrelated grok panels', async () => {
    window.localStorage.setItem(
      'devhub_terminal_state',
      JSON.stringify({
        workspaces: [
          {
            id: 'ws1',
            name: 'Workspace 1',
            columns: [
              {
                id: 'c1',
                panels: [{ id: 'p1', cwd: '/workspace/devhub', initialCommand: 'grok' }],
              },
            ],
          },
        ],
        activeWsId: 'ws1',
        activePanelIds: { ws1: 'p1' },
      })
    );

    const view = await renderManager();

    window.dispatchEvent(
      new window.CustomEvent('devhub:opencode-session-detected', {
        detail: { panelId: 'p1', sessionId: 'ses_closed_ws' },
      })
    );
    await flushEffects();

    const grokTerminal = view.container.querySelector('[data-testid="terminal-p1"]');
    expect(grokTerminal?.getAttribute('data-command')).toBe('grok');
  });

  test('restores persisted OpenCode session command after reboot-style reload', async () => {
    window.localStorage.setItem(
      'devhub_terminal_state',
      JSON.stringify({
        workspaces: [
          {
            id: 'ws1',
            name: 'Workspace 1',
            columns: [
              {
                id: 'c1',
                panels: [
                  {
                    id: 'p1',
                    cwd: '/workspace/devhub',
                    initialCommand: 'opencode --session oc-reboot-1',
                  },
                ],
              },
            ],
          },
        ],
        activeWsId: 'ws1',
        activePanelIds: { ws1: 'p1' },
      })
    );

    const view = await renderManager();
    const restoredTerminal = view.container.querySelector('[data-testid="terminal-p1"]');

    expect(restoredTerminal?.getAttribute('data-command')).toBe('opencode --session oc-reboot-1');
  });

  test('dispatches one relaunch event from startup restore plan when runtime has no live terminal', async () => {
    window.localStorage.setItem(
      'devhub_terminal_state',
      JSON.stringify({
        workspaces: [
          {
            id: 'ws1',
            name: 'Workspace 1',
            columns: [
              {
                id: 'c1',
                panels: [
                  {
                    id: 'p1',
                    cwd: '/workspace/devhub',
                    initialCommand: 'opencode --session oc-startup-1',
                  },
                ],
              },
            ],
          },
        ],
        activeWsId: 'ws1',
        activePanelIds: { ws1: 'p1' },
      })
    );

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ terminals: [], processes: [], anomalies: {} }),
    });

    const relaunchEvents = [];
    window.addEventListener('devhub:relaunch-panel', (event) => {
      relaunchEvents.push(event.detail);
    });

    await renderManager();
    await flushEffects();
    await new Promise((resolve) => setTimeout(resolve, 800));
    await flushEffects();

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/swarm/runtime-diagnostics',
      expect.objectContaining({ cache: 'no-store' })
    );
    expect(relaunchEvents.length).toBeGreaterThanOrEqual(1);
    expect(relaunchEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          panelId: 'p1',
          command: expect.stringContaining('opencode --session oc-startup-1'),
        }),
      ])
    );
  });

  test('migrates legacy Ghostty renderer preference to xterm on reload', async () => {
    window.localStorage.setItem(
      'devhub_terminal_state',
      JSON.stringify({
        workspaces: [
          {
            id: 'ws1',
            name: 'Workspace 1',
            columns: [
              {
                id: 'c1',
                panels: [
                  {
                    id: 'p1',
                    cwd: '/workspace/devhub',
                    initialCommand: 'opencode --session oc-render-1',
                  },
                ],
              },
            ],
          },
        ],
        activeWsId: 'ws1',
        activePanelIds: { ws1: 'p1' },
      })
    );
    window.localStorage.setItem(
      'devhub_terminal_renderer_preferences:project-1',
      JSON.stringify({
        version: 1,
        workspaces: {
          ws1: {
            defaultMode: 'xterm',
            panels: {
              p1: 'ghostty-experimental',
            },
          },
        },
      })
    );

    const view = await renderManager();
    const restoredTerminal = view.container.querySelector('[data-testid="terminal-p1"]');

    expect(restoredTerminal?.getAttribute('data-renderer')).toBe('xterm');
  });

  test('keeps restored OpenCode command persisted after process exit instead of removing the panel', async () => {
    window.localStorage.setItem(
      'devhub_terminal_state',
      JSON.stringify({
        workspaces: [
          {
            id: 'ws1',
            name: 'Workspace 1',
            columns: [
              {
                id: 'c1',
                panels: [
                  {
                    id: 'p1',
                    cwd: '/workspace/devhub',
                    initialCommand: 'opencode --session oc-reboot-1',
                  },
                ],
              },
            ],
          },
        ],
        activeWsId: 'ws1',
        activePanelIds: { ws1: 'p1' },
      })
    );

    const view = await renderManager();

    window.dispatchEvent(
      new window.CustomEvent('devhub:terminal-exit', {
        detail: {
          id: 'p1',
          initialCommand: 'opencode --session oc-reboot-1',
        },
      })
    );
    await flushEffects();

    const restoredTerminal = view.container.querySelector('[data-testid="terminal-p1"]');
    expect(restoredTerminal).not.toBeNull();
    expect(restoredTerminal?.getAttribute('data-command')).toBe('opencode --session oc-reboot-1');
    expect(view.container.textContent).not.toContain('Session is no longer available to resume.');
  });

  test('does not advertise Hermes as reboot-safe resumable history when catalog has no durable sessions', async () => {
    window.localStorage.setItem(
      'devhub_terminal_state',
      JSON.stringify({
        workspaces: [
          {
            id: 'ws1',
            name: 'Workspace 1',
            columns: [
              {
                id: 'c1',
                panels: [
                  {
                    id: 'p1',
                    cwd: '/workspace/devhub',
                    initialCommand: 'hermes',
                  },
                ],
              },
            ],
          },
        ],
        activeWsId: 'ws1',
        activePanelIds: { ws1: 'p1' },
      })
    );

    const view = await renderManager();
    const restoredTerminal = view.container.querySelector('[data-testid="terminal-p1"]');

    expect(restoredTerminal?.getAttribute('data-command')).toBe('hermes');
    expect(view.container.textContent).toContain('No recent sessions found.');
    expect(view.container.textContent).not.toContain('Hermes');
    expect(view.container.querySelector('[data-testid="agent-room-history-item"]')).toBeNull();
  });

  test('posts canonical binding reconciliation when a swarm launch panel detects a verified OpenCode session', async () => {
    const originalSetTimeout = window.setTimeout;
    window.setTimeout = (cb, _delay) => {
      return originalSetTimeout(cb, 0);
    };

    try {
      global.fetch = jest.fn(async (url) => {
        if (url === '/api/swarm/runtime-diagnostics') {
          return { ok: true, json: async () => ({ terminals: [], processes: [], anomalies: {} }) };
        }
        if (String(url).includes('/api/agenthub/operations/health')) {
          return { ok: true, json: async () => ({}) };
        }
        if (url === '/api/agenthub/sessions/launch-session-1/binding') {
          return {
            ok: true,
            json: async () => ({ status: 'reconciled', reason: 'binding_reconciled' }),
          };
        }
        throw new Error(`Unexpected fetch URL: ${url}`);
      });

      await renderManager();
      window.dispatchEvent(
        new window.CustomEvent('devhub:run-agent', {
          detail: {
            taskId: 'launch-1:coder',
            command: 'opencode --agent sdd-orchestrator',
            selectedAgent: 'opencode',
            launchOrigin: 'swarm-control-launch',
            roleKey: 'coder',
            roleLabel: 'Coder',
            roleAbbrev: 'COD',
            taskTitle: 'Launch · Coder',
            promptSummary: 'Coder · Launch',
            isSwarmRole: true,
            workspaceId: 'ws-canon-1',
            runId: 'run-canon-1',
            sessionId: 'launch-session-1',
            workspacePath: '/workspace/devhub/.devhub/worktrees/launch-1/coder',
          },
        })
      );
      await flushEffects();
      await flushEffects();

      const runs = JSON.parse(window.localStorage.getItem('devhub_agent_runs') || '{}');
      const panelId = runs['launch-1:coder']?.panelId;
      expect(runs['launch-1:coder']).toEqual(
        expect.objectContaining({
          workspaceId: 'ws-canon-1',
          runId: 'run-canon-1',
          sessionId: 'launch-session-1',
        })
      );

      window.dispatchEvent(
        new window.CustomEvent('devhub:opencode-session-detected', {
          detail: { panelId, sessionId: 'oc-real-1' },
        })
      );
      await flushEffects();

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/agenthub/sessions/launch-session-1/binding',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workspace_id: 'ws-canon-1',
            run_id: 'run-canon-1',
            opencode_session_id: 'oc-real-1',
          }),
        })
      );
    } finally {
      window.setTimeout = originalSetTimeout;
    }
  });
});
