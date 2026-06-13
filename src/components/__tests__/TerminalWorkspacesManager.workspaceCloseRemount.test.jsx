/**
 * Regression: closing one workspace must not remount surviving workspace shells.
 * Index-based React keys caused TerminalTTY remount → grok/opencode re-injected.
 */

const React = require('react');
const {
  cleanupMountedRoots,
  click,
  flushEffects,
  installDom,
  renderIntoDom,
} = require('@/test-support/domHarness');

const mountedRoots = [];
const panelMountGenerations = {};

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
  default: ({ id, initialCommand }) => {
    const React = require('react');
    const [mountGeneration] = React.useState(() => {
      panelMountGenerations[id] = (panelMountGenerations[id] || 0) + 1;
      return panelMountGenerations[id];
    });
    return React.createElement('div', {
      'data-testid': `terminal-${id}`,
      'data-command': initialCommand || '',
      'data-mount-generation': String(mountGeneration),
    });
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
  default: () => ({
    status: 'empty',
    sessions: [],
    error: null,
    isLoading: false,
    refresh: jest.fn(),
    retry: jest.fn(),
  }),
}));

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

const PROJECT_ID = 'proj-workspace-close-remount';

function seedThreeWorkspaceState() {
  window.localStorage.setItem(
    `devhub_terminal_state:${PROJECT_ID}`,
    JSON.stringify({
      workspaces: [
        {
          id: 'ws1',
          name: 'One',
          columns: [
            { id: 'c1', panels: [{ id: 'p1', cwd: '/workspace/devhub', initialCommand: 'bash' }] },
          ],
        },
        {
          id: 'ws2',
          name: 'Grok',
          columns: [
            {
              id: 'c2',
              panels: [{ id: 'p2', cwd: '/workspace/devhub', initialCommand: 'grok' }],
            },
          ],
        },
        {
          id: 'ws3',
          name: 'Three',
          columns: [
            { id: 'c3', panels: [{ id: 'p3', cwd: '/workspace/devhub', initialCommand: 'bash' }] },
          ],
        },
      ],
      activeWsId: 'ws1',
      activePanelIds: { ws1: 'p1', ws2: 'p2', ws3: 'p3' },
    })
  );
}

describe('workspace close keeps surviving terminal panels mounted', () => {
  let dom;

  beforeEach(() => {
    dom = installDom();
    Object.keys(panelMountGenerations).forEach((key) => delete panelMountGenerations[key]);
    window.localStorage.clear();
    seedThreeWorkspaceState();
    global.fetch = jest.fn().mockRejectedValue(new Error('network-disabled-in-test'));
    delete globalThis['__DEVHUB_TTY_SESSIONS__'];
  });

  afterEach(() => {
    cleanupMountedRoots(mountedRoots);
    dom.window.close();
    delete global.localStorage;
    delete global.fetch;
    jest.clearAllMocks();
  });

  test('closing the first workspace does not remount grok panel in ws2', async () => {
    const view = await renderIntoDom(
      React.createElement(TerminalWorkspacesManager, {
        cwd: '/workspace/devhub',
        isVisible: true,
        projectId: PROJECT_ID,
      }),
      mountedRoots
    );

    await flushEffects();

    const grokTerminalBefore = view.container.querySelector('[data-testid="terminal-p2"]');
    expect(grokTerminalBefore).not.toBeNull();
    expect(grokTerminalBefore.getAttribute('data-mount-generation')).toBe('1');

    const closeWs1 = view.container.querySelector('[data-testid="workspace-close-ws1"]');
    expect(closeWs1).not.toBeNull();
    await click(closeWs1);
    await flushEffects();

    const grokTerminalAfter = view.container.querySelector('[data-testid="terminal-p2"]');
    expect(grokTerminalAfter).not.toBeNull();
    expect(grokTerminalAfter.getAttribute('data-mount-generation')).toBe('1');
    expect(panelMountGenerations.p2).toBe(1);
  });
});
