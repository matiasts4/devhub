const {
  resolveActiveWorkspaceWindowId,
  resolvePanelVisibleInLayout,
  resolveWorkspaceWindowsForRender,
} = require('@/lib/terminal/workspaceWindowRender.js');

// Integration tests below render the full manager; mocks must be declared
// before the component is required (Jest hoists jest.mock calls).
const React = require('react');
const {
  cleanupMountedRoots,
  click,
  flushEffects,
  installDom,
  renderIntoDom,
} = require('@/test-support/domHarness');

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
  default: ({ id, isVisibleInLayout }) => {
    const React = require('react');
    return React.createElement(
      'div',
      {
        'data-testid': `terminal-${id}`,
        'data-visible': String(isVisibleInLayout),
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

jest.mock('../workspace/WorkspaceRightDock', () => ({
  __esModule: true,
  default: () => {
    const React = require('react');
    return React.createElement('div', { 'data-testid': 'workspace-right-dock' });
  },
}));

jest.mock('../workspace/SharedSurfacesProvider', () => ({
  __esModule: true,
  default: ({ children }) => children,
}));

jest.mock('../workspace/RightDockSharedMirror', () => ({
  __esModule: true,
  default: () => {
    const React = require('react');
    return React.createElement('div', { 'data-testid': 'right-dock-shared-mirror' });
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

const PROJECT_ID = 'proj-workspace-window-switch';

function persistWorkspaceState(state) {
  window.localStorage.setItem(`devhub_terminal_state:${PROJECT_ID}`, JSON.stringify(state));
}

function seedTwoWindowWorkspace() {
  persistWorkspaceState({
    workspaces: [
      {
        id: 'ws1',
        name: 'WS',
        columns: [
          {
            id: 'c1',
            panels: [
              { id: 'p1', cwd: '/devhub' },
              { id: 'p2', cwd: '/devhub' },
            ],
          },
        ],
      },
    ],
    activeWsId: 'ws1',
    activePanelIds: { ws1: 'p1' },
    workspaceWindows: {
      ws1: [
        { id: 'v1', name: 'V1', columns: [{ id: 'c1', panels: [{ id: 'p1' }, { id: 'p2' }] }] },
        {
          id: 'v2',
          name: 'V2',
          columns: [{ id: 'c2', panels: [{ id: 'p2' }, { id: 'p3', cwd: '/devhub' }] }],
        },
      ],
    },
    activeWindowIds: { ws1: 'v1' },
  });
}

function seedTwoWorkspaces() {
  persistWorkspaceState({
    workspaces: [
      {
        id: 'ws1',
        name: 'Alpha',
        columns: [{ id: 'c1', panels: [{ id: 'p1' }, { id: 'p2' }] }],
      },
      {
        id: 'ws2',
        name: 'Beta',
        columns: [{ id: 'c3', panels: [{ id: 'p4' }, { id: 'p5' }] }],
      },
    ],
    activeWsId: 'ws1',
    activePanelIds: { ws1: 'p1', ws2: 'p4' },
    workspaceWindows: {
      ws1: [{ id: 'v1', columns: [{ id: 'c1', panels: [{ id: 'p1' }, { id: 'p2' }] }] }],
      ws2: [{ id: 'v2', columns: [{ id: 'c3', panels: [{ id: 'p4' }, { id: 'p5' }] }] }],
    },
    activeWindowIds: { ws1: 'v1', ws2: 'v2' },
  });
}

function workspaceTabByLabel(container, label) {
  const tabs = Array.from(
    container.querySelectorAll('[data-testid="workspace-top-tab-bar"] span.font-semibold')
  );
  return tabs.find((el) => el.textContent?.trim() === label)?.closest('[draggable="true"]') || null;
}

function visibleTerminals(container) {
  return Array.from(container.querySelectorAll('[data-testid^="terminal-"]')).filter(
    (el) => el.getAttribute('data-visible') === 'true'
  );
}

function visibleTerminalsInActiveWindow(container) {
  const activeShell = container.querySelector('[data-testid^="workspace-window-active-"]');
  const scope = activeShell || container;
  return Array.from(scope.querySelectorAll('[data-testid^="terminal-"]')).filter(
    (el) => el.getAttribute('data-visible') === 'true'
  );
}

function terminalById(container, panelId) {
  return container.querySelector(`[data-testid="terminal-${panelId}"]`);
}

describe('resolveWorkspaceWindowsForRender', () => {
  test('returns persisted window snapshots when present', () => {
    const ws = { id: 'ws1', columns: [{ id: 'c1', panels: [{ id: 'p1' }] }] };
    const workspaceWindows = {
      ws1: [
        { id: 'v1', columns: [{ id: 'c1', panels: [{ id: 'p1' }] }] },
        { id: 'v2', columns: [{ id: 'c2', panels: [{ id: 'p2' }] }] },
      ],
    };

    expect(resolveWorkspaceWindowsForRender(ws, workspaceWindows)).toEqual(workspaceWindows.ws1);
  });

  test('falls back to a single default window from live columns', () => {
    const ws = { id: 'ws1', columns: [{ id: 'c1', panels: [{ id: 'p1' }] }] };

    expect(resolveWorkspaceWindowsForRender(ws, {})).toEqual([
      { id: 'ws1-default', columns: ws.columns },
    ]);
  });
});

describe('resolveActiveWorkspaceWindowId', () => {
  test('prefers activeWindowIds entry', () => {
    const workspaceWindows = {
      ws1: [{ id: 'v1' }, { id: 'v2' }],
    };

    expect(resolveActiveWorkspaceWindowId('ws1', workspaceWindows, { ws1: 'v2' })).toBe('v2');
  });

  test('falls back to first window id', () => {
    const workspaceWindows = {
      ws1: [{ id: 'v1' }, { id: 'v2' }],
    };

    expect(resolveActiveWorkspaceWindowId('ws1', workspaceWindows, {})).toBe('v1');
  });
});

describe('TerminalWorkspacesManager workspace window switching', () => {
  jest.setTimeout(20000);

  let dom;
  let originalRequestAnimationFrame;
  let originalCancelAnimationFrame;
  const mountedRoots = [];
  let layoutSettledEvents;
  let eventHandler;

  beforeEach(() => {
    dom = installDom();
    originalRequestAnimationFrame = global.requestAnimationFrame;
    originalCancelAnimationFrame = global.cancelAnimationFrame;
    global.requestAnimationFrame = (callback) => {
      callback();
      return 0;
    };
    global.cancelAnimationFrame = () => {};
    window.localStorage.clear();
    seedTwoWindowWorkspace();
    global.fetch = jest.fn().mockRejectedValue(new Error('network-disabled-in-test'));
    delete globalThis['__DEVHUB_TTY_SESSIONS__'];

    layoutSettledEvents = [];
    eventHandler = (event) => {
      layoutSettledEvents.push(event.detail);
    };
    window.addEventListener('devhub:terminal-layout-settled', eventHandler);
  });

  afterEach(() => {
    window.removeEventListener('devhub:terminal-layout-settled', eventHandler);
    cleanupMountedRoots(mountedRoots);
    global.requestAnimationFrame = originalRequestAnimationFrame;
    global.cancelAnimationFrame = originalCancelAnimationFrame;
    dom.window.close();
    delete global.localStorage;
    delete global.fetch;
    jest.clearAllMocks();
  });

  async function renderManager() {
    const view = await renderIntoDom(
      React.createElement(TerminalWorkspacesManager, {
        cwd: '/devhub',
        isVisible: true,
        projectId: PROJECT_ID,
      }),
      mountedRoots
    );
    await flushEffects();
    return view;
  }

  test('switching windows clears stale focus and shows all destination panels (TWS-S1)', async () => {
    const { container } = await renderManager();

    const focusBtn = container.querySelector('[data-testid="panel-focus-p1"]');
    expect(focusBtn).not.toBeNull();
    await click(focusBtn);
    await flushEffects();

    expect(visibleTerminalsInActiveWindow(container).map((el) => el.getAttribute('data-testid'))).toEqual([
      'terminal-p1',
    ]);

    const switchBtn = container.querySelector('[data-testid="workspace-window-switch-2"]');
    expect(switchBtn).not.toBeNull();
    await click(switchBtn);
    await flushEffects();

    expect(visibleTerminalsInActiveWindow(container).map((el) => el.getAttribute('data-testid'))).toEqual([
      'terminal-p2',
      'terminal-p3',
    ]);

    // Parked window mirrors workspace tab switch: its panels go isVisibleInLayout=false
    // (the false→true toggle on switch-back is what drives viewport recovery).
    const parkedP1 = container.querySelector('[data-testid="workspace-window-parked-v1"]');
    expect(parkedP1?.querySelector('[data-testid="terminal-p1"]')?.getAttribute('data-visible')).toBe(
      'false'
    );
  });

  test('switching to a window that contains the focused panel keeps focus mode (TWS-S2)', async () => {
    const { container } = await renderManager();

    const switchToV2 = container.querySelector('[data-testid="workspace-window-switch-2"]');
    await click(switchToV2);
    await flushEffects();

    const focusP2 = container.querySelector('[data-testid="panel-focus-p2"]');
    expect(focusP2).not.toBeNull();
    await click(focusP2);
    await flushEffects();

    expect(visibleTerminalsInActiveWindow(container).map((el) => el.getAttribute('data-testid'))).toEqual([
      'terminal-p2',
    ]);

    const switchToV1 = container.querySelector('[data-testid="workspace-window-switch-1"]');
    await click(switchToV1);
    await flushEffects();

    expect(visibleTerminalsInActiveWindow(container).map((el) => el.getAttribute('data-testid'))).toEqual([
      'terminal-p2',
    ]);

    const switchBackToV2 = container.querySelector('[data-testid="workspace-window-switch-2"]');
    await click(switchBackToV2);
    await flushEffects();

    expect(visibleTerminalsInActiveWindow(container).map((el) => el.getAttribute('data-testid'))).toEqual([
      'terminal-p2',
    ]);
    expect(terminalById(container, 'p3').getAttribute('data-visible')).toBe('false');
  });

  test('selecting the already-active window does not emit a new workspace-window-switch event (regression)', async () => {
    const { container } = await renderManager();

    const switchEventsAfterMount = layoutSettledEvents.filter(
      (detail) => detail.reason === 'workspace-window-switch'
    ).length;

    const switchToV1 = container.querySelector('[data-testid="workspace-window-switch-1"]');
    expect(switchToV1).not.toBeNull();
    await click(switchToV1);
    await flushEffects();

    const switchEventsAfterClick = layoutSettledEvents.filter(
      (detail) => detail.reason === 'workspace-window-switch'
    ).length;

    expect(switchEventsAfterClick).toBe(switchEventsAfterMount);
  });
});

describe('TerminalWorkspacesManager workspace tab switching', () => {
  let dom;
  let originalRequestAnimationFrame;
  let originalCancelAnimationFrame;
  const mountedRoots = [];
  let layoutSettledEvents;
  let eventHandler;

  beforeEach(() => {
    dom = installDom();
    originalRequestAnimationFrame = global.requestAnimationFrame;
    originalCancelAnimationFrame = global.cancelAnimationFrame;
    global.requestAnimationFrame = (callback) => {
      callback();
      return 0;
    };
    global.cancelAnimationFrame = () => {};
    window.localStorage.clear();
    seedTwoWorkspaces();
    global.fetch = jest.fn().mockRejectedValue(new Error('network-disabled-in-test'));
    delete globalThis['__DEVHUB_TTY_SESSIONS__'];

    layoutSettledEvents = [];
    eventHandler = (event) => {
      layoutSettledEvents.push(event.detail);
    };
    window.addEventListener('devhub:terminal-layout-settled', eventHandler);
  });

  afterEach(() => {
    window.removeEventListener('devhub:terminal-layout-settled', eventHandler);
    cleanupMountedRoots(mountedRoots);
    global.requestAnimationFrame = originalRequestAnimationFrame;
    global.cancelAnimationFrame = originalCancelAnimationFrame;
    dom.window.close();
    delete global.localStorage;
    delete global.fetch;
    jest.clearAllMocks();
  });

  async function renderManager() {
    const view = await renderIntoDom(
      React.createElement(TerminalWorkspacesManager, {
        cwd: '/devhub',
        isVisible: true,
        projectId: PROJECT_ID,
      }),
      mountedRoots
    );
    await flushEffects();
    return view;
  }

  test('switching workspace tabs shows all destination panels without layout-settled bursts', async () => {
    const { container } = await renderManager();

    const betaTab = workspaceTabByLabel(container, 'Beta');
    expect(betaTab).not.toBeNull();
    await click(betaTab);
    await flushEffects();

    expect(
      layoutSettledEvents.filter((detail) => detail.reason === 'workspace-switch')
    ).toHaveLength(0);

    expect(visibleTerminals(container).map((el) => el.getAttribute('data-testid'))).toEqual([
      'terminal-p4',
      'terminal-p5',
    ]);
  });

  test('selecting the already-active workspace tab does not emit a new workspace-switch event', async () => {
    const { container } = await renderManager();

    const eventsAfterMount = layoutSettledEvents.filter(
      (detail) => detail.reason === 'workspace-switch'
    ).length;

    const alphaTab = workspaceTabByLabel(container, 'Alpha');
    expect(alphaTab).not.toBeNull();
    await click(alphaTab);
    await flushEffects();

    const eventsAfterClick = layoutSettledEvents.filter(
      (detail) => detail.reason === 'workspace-switch'
    ).length;

    expect(eventsAfterClick).toBe(eventsAfterMount);
  });
});
