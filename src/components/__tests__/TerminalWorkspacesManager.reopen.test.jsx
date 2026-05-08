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

jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }) => {
      const React = require('react');
      return React.createElement('div', props, children);
    },
  },
}));

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
  default: ({ id, initialCommand }) => {
    const React = require('react');
    return React.createElement(
      'div',
      {
        'data-testid': `terminal-${id}`,
        'data-command': initialCommand || '',
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

jest.mock('../AgentRoomSidebar', () => ({
  __esModule: true,
  default: ({ resumableSessions = [], resumableStatus = 'empty', resumableError = null }) => {
    const React = require('react');
    return React.createElement(
      'div',
      {
        'data-testid': 'agent-room-sidebar-stub',
        'data-status': resumableStatus,
        'data-count': String(resumableSessions.length),
        'data-error': resumableError?.message || '',
      },
      resumableSessions.map((session) =>
        React.createElement(
          'span',
          { key: `${session.provider}:${session.sessionId}`, 'data-testid': 'agent-room-history-item' },
          session.title
        )
      )
    );
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

jest.mock('../workspace/FileExplorerEditorPane', () => ({
  __esModule: true,
  default: () => {
    const React = require('react');
    return React.createElement('div', { 'data-testid': 'shared-editor-pane' });
  },
}), { virtual: true });

jest.mock('../workspace/WorkspaceBridgePane', () => ({
  __esModule: true,
  default: () => {
    const React = require('react');
    return React.createElement('div', { 'data-testid': 'shared-bridge-pane' });
  },
}), { virtual: true });

jest.mock('@/hooks/useResumableSessionCatalog', () => ({
  __esModule: true,
  default: () => mockCatalogState,
}));

const TerminalWorkspacesManager = require('../TerminalWorkspacesManager').default;

const mountedRoots = [];

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

    expect(mockCatalogState.retry).toHaveBeenCalledTimes(1);
  });

  test('renders the same resumable sessions in topbar and Agent Room history', async () => {
    mockCatalogState.status = 'success';
    mockCatalogState.sessions = [createResumableSession({ sessionId: 'oc-1', title: 'Daily sync' })];

    const view = await renderManager();
    const historyStub = view.container.querySelector('[data-testid="agent-room-sidebar-stub"]');

    expect(view.container.textContent).toContain('Daily sync');
    expect(historyStub?.getAttribute('data-status')).toBe('success');
    expect(historyStub?.getAttribute('data-count')).toBe('1');
    expect(view.container.querySelector('[data-testid="agent-room-history-item"]')?.textContent).toBe(
      'Daily sync'
    );
  });

  test('reopens an OpenCode session in exactly one new panel and records the run', async () => {
    mockCatalogState.status = 'success';
    mockCatalogState.sessions = [createResumableSession({ sessionId: 'oc-99', title: 'Recovered session' })];

    const view = await renderManager();

    const beforePanels = view.container.querySelectorAll('[data-testid^="terminal-"]').length;
    await click(
      Array.from(view.container.querySelectorAll('button')).find((button) =>
        button.textContent.includes('Recovered session')
      )
    );
    const afterPanels = view.container.querySelectorAll('[data-testid^="terminal-"]').length;

    expect(afterPanels).toBe(beforePanels + 1);

    const runs = JSON.parse(window.localStorage.getItem('devhub_agent_runs') || '{}');
    expect(runs['oc-reopen-oc-99']).toEqual(
      expect.objectContaining({
        selectedAgent: 'opencode',
        launchOrigin: 'reopen-session',
        opencodeSessionId: 'oc-99',
      })
    );

    const resumedPanel = Array.from(view.container.querySelectorAll('[data-testid^="terminal-"]')).find(
      (node) => node.textContent === 'p2'
    );
    expect(resumedPanel).not.toBeUndefined();
  });

  test('keeps topbar Reopen and Agent Room history in sync through timeout retry recovery', async () => {
    mockCatalogState.status = 'error';
    mockCatalogState.error = createResumableCatalogError();

    const view = await renderManager();
    const historyStubBefore = view.container.querySelector('[data-testid="agent-room-sidebar-stub"]');

    expect(view.container.textContent).toContain('OpenCode session listing timed out.');
    expect(historyStubBefore?.getAttribute('data-status')).toBe('error');
    expect(historyStubBefore?.getAttribute('data-error')).toBe('OpenCode session listing timed out.');

    mockCatalogState.status = 'success';
    mockCatalogState.error = null;
    mockCatalogState.sessions = [createResumableSession({ sessionId: 'oc-22', title: 'Recovered after retry' })];

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

    const historyStubAfter = view.container.querySelector('[data-testid="agent-room-sidebar-stub"]');
    expect(mockCatalogState.retry).toHaveBeenCalledTimes(1);
    expect(view.container.textContent).toContain('Recovered after retry');
    expect(view.container.textContent).not.toContain('OpenCode session listing timed out.');
    expect(historyStubAfter?.getAttribute('data-status')).toBe('success');
    expect(historyStubAfter?.getAttribute('data-count')).toBe('1');
    expect(view.container.querySelector('[data-testid="agent-room-history-item"]')?.textContent).toBe(
      'Recovered after retry'
    );
  });

  test('shows deterministic failure instead of leaving a blank substitute panel when reopen exits immediately', async () => {
    mockCatalogState.status = 'success';
    mockCatalogState.sessions = [createResumableSession({ sessionId: 'oc-expired', title: 'Expired session' })];

    const view = await renderManager();

    const beforePanels = view.container.querySelectorAll('[data-testid^="terminal-"]');
    expect(beforePanels).toHaveLength(1);

    await click(
      Array.from(view.container.querySelectorAll('button')).find((button) =>
        button.textContent.includes('Expired session')
      )
    );

    expect(view.container.querySelectorAll('[data-testid^="terminal-"]')).toHaveLength(2);

    window.dispatchEvent(
      new window.CustomEvent('devhub:terminal-exit', {
        detail: {
          id: 'p2',
          initialCommand: 'opencode --session oc-expired',
        },
      })
    );
    await flushEffects();

    expect(view.container.textContent).toContain('Session is no longer available to resume.');
    expect(view.container.querySelectorAll('[data-testid^="terminal-"]')).toHaveLength(1);

    const runs = JSON.parse(window.localStorage.getItem('devhub_agent_runs') || '{}');
    expect(runs['oc-reopen-oc-expired']).toBeUndefined();
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
});
