const React = require('react');
const {
  cleanupMountedRoots,
  installDom,
  renderIntoDom,
} = require('@/test-support/domHarness');

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
  PanelGroup: ({ children, direction, ...props }) => {
    const React = require('react');
    return React.createElement('div', { ...props, 'data-panel-group-direction': direction }, children);
  },
  Panel: ({ children, ...props }) => {
    const React = require('react');
    return React.createElement('div', props, children);
  },
  PanelResizeHandle: (props) => {
    const React = require('react');
    return React.createElement('div', props);
  },
}));

jest.mock('../TerminalTTY', () => ({
  __esModule: true,
  default: ({ id }) => {
    const React = require('react');
    return React.createElement('div', { 'data-testid': `terminal-${id}` }, id);
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
  default: () => {
    const React = require('react');
    return React.createElement('div', null, 'agent room');
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
  DropdownMenu: ({ children }) => {
    const React = require('react');
    return React.createElement('div', null, children);
  },
  DropdownMenuContent: ({ children }) => {
    const React = require('react');
    return React.createElement('div', null, children);
  },
  DropdownMenuItem: ({ children, onSelect }) => {
    const React = require('react');
    return React.createElement('button', { type: 'button', onClick: onSelect }, children);
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

jest.mock('../workspace/WorkspaceRightDock', () => ({
  __esModule: true,
  default: () => {
    const React = require('react');
    return React.createElement('div', { 'data-testid': 'workspace-right-dock' });
  },
}));

jest.mock('@/hooks/useResumableSessionCatalog', () => ({
  __esModule: true,
  default: () => ({
    status: 'empty',
    sessions: [],
    error: null,
    isLoading: false,
    refresh: jest.fn(),
    retry: jest.fn(),
  }),
}));

const TerminalWorkspacesManager = require('../TerminalWorkspacesManager').default;

const mountedRoots = [];

function renderManager() {
  return renderIntoDom(
    React.createElement(TerminalWorkspacesManager, {
      cwd: '/workspace/devhub',
      isVisible: true,
      projectId: 'proj-1',
    }),
    mountedRoots
  );
}

function persistWorkspaceState(state) {
  window.localStorage.setItem('devhub_terminal_state', JSON.stringify(state));
}

describe('TerminalWorkspacesManager split layout', () => {
  let dom;

  beforeEach(() => {
    dom = installDom();
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanupMountedRoots(mountedRoots);
    dom.window.close();
    delete global.localStorage;
    jest.clearAllMocks();
  });

  test('renders horizontal splits as side-by-side workspace columns', async () => {
    persistWorkspaceState({
      workspaces: [
        {
          id: 'ws1',
          name: 'Workspace 1',
          columns: [
            { id: 'c1', panels: [{ id: 'p1', cwd: '/workspace/devhub', initialCommand: 'opencode' }] },
            { id: 'c2', panels: [{ id: 'p2', cwd: '/workspace/devhub', initialCommand: 'opencode --session ses_split' }] },
          ],
        },
      ],
      activeWsId: 'ws1',
      activePanelIds: { ws1: 'p2' },
    });

    const view = await renderManager();

    const columnGroup = view.container.querySelector('[data-testid="workspace-columns-ws1"]');
    expect(columnGroup).not.toBeNull();
    expect(columnGroup?.getAttribute('data-layout-direction')).toBe('horizontal');

    const columns = view.container.querySelectorAll('[data-testid^="workspace-column-"]');
    expect(columns).toHaveLength(2);
    expect(columns[0].querySelector('[data-testid="terminal-p1"]')).not.toBeNull();
    expect(columns[1].querySelector('[data-testid="terminal-p2"]')).not.toBeNull();
  });

  test('renders vertical splits as stacked panels inside the same column', async () => {
    persistWorkspaceState({
      workspaces: [
        {
          id: 'ws1',
          name: 'Workspace 1',
          columns: [
            {
              id: 'c1',
              panels: [
                { id: 'p1', cwd: '/workspace/devhub', initialCommand: 'opencode' },
                { id: 'p2', cwd: '/workspace/devhub', initialCommand: 'opencode --session ses_vertical' },
              ],
            },
          ],
        },
      ],
      activeWsId: 'ws1',
      activePanelIds: { ws1: 'p2' },
    });

    const view = await renderManager();

    const columns = view.container.querySelectorAll('[data-testid="workspace-column-c1"]');
    expect(columns).toHaveLength(2);

    const panelStack = view.container.querySelector('[data-testid="workspace-column-panels-c1"]');
    expect(panelStack).not.toBeNull();
    expect(panelStack?.getAttribute('data-layout-direction')).toBe('vertical');

    const panelSlots = view.container.querySelectorAll('[data-testid^="panel-slot-"]');
    expect(panelSlots).toHaveLength(2);
    expect(panelSlots[0].querySelector('[data-testid="terminal-p1"]')).not.toBeNull();
    expect(panelSlots[1].querySelector('[data-testid="terminal-p2"]')).not.toBeNull();
  });
});
