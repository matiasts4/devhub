/**
 * Phase 4 terminal-engine-v2: TerminalWorkspacesManager passes the per-panel
 * engine flag through to TerminalTTY and unmounts hidden v2 panels so the
 * live surface can be stashed in the graveyard.
 */

const {
  cleanupMountedRoots,
  flushEffects,
  installDom,
  renderIntoDom,
} = require('@/test-support/domHarness');

const mountedRoots = [];
const renderedTerminalProps = {};

jest.mock('lucide-react', () => {
  const icon = (name) => (props) => {
    const React = require('react');
    return React.createElement('svg', { ...props, 'data-icon': name });
  };
  return new Proxy({}, { get: (_, key) => icon(String(key)) });
});

jest.mock('react-resizable-panels', () => ({
  PanelGroup: ({ children }) => {
    const React = require('react');
    return React.createElement('div', null, children);
  },
  Panel: ({ children }) => {
    const React = require('react');
    return React.createElement('div', null, children);
  },
  PanelResizeHandle: () => {
    const React = require('react');
    return React.createElement('div', null);
  },
}));

jest.mock('@/lib/pizarra/featureFlag', () => ({
  isPizarraSharedViewEnabled: () => false,
}));

// PR5 keep-alive: control the flag per test while keeping the real mount decision.
jest.mock('@/lib/terminal/terminalKeepalivePolicy', () => {
  const actual = jest.requireActual('@/lib/terminal/terminalKeepalivePolicy');
  let enabled = false;
  return {
    ...actual,
    isTerminalKeepaliveEnabled: () => enabled,
    __setKeepaliveEnabledForTests: (value) => {
      enabled = Boolean(value);
    },
  };
});

const keepalivePolicyMock = require('@/lib/terminal/terminalKeepalivePolicy');

jest.mock('../terminal/components/PanelStatusBadge', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: () => React.createElement('span', { 'data-testid': 'mock-panel-status-badge' }),
  };
});

jest.mock('../terminal/components/PanelRendererSelect', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: () => React.createElement('span', { 'data-testid': 'mock-panel-renderer-select' }),
  };
});

jest.mock('../terminal/components/WorkspaceWindowSwitcher', () => {
  return {
    __esModule: true,
    default: () => null,
    MAX_WORKSPACE_WINDOWS: 4,
  };
});

jest.mock('../terminal/SharedTerminalSurface', () => ({
  __esModule: true,
  SharedTerminalSurfaceRegistrar: () => null,
  SharedTerminalSurfacePortal: () => null,
}));

jest.mock('../NotificationCenter', () => ({
  __esModule: true,
  default: () => {
    const React = require('react');
    return React.createElement('div', null, 'notifications');
  },
}));

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
  DropdownMenuTrigger: ({ children }) => children,
}));

jest.mock('@/lib/agentRegistryLive', () => ({
  findAgentWorkspaceAndPanel: () => ({}),
}));

jest.mock('date-fns', () => ({
  formatDistanceToNow: () => 'just now',
}));

jest.mock('../workspace/WorkspaceRightDock', () => ({
  __esModule: true,
  default: () => null,
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

jest.mock('react-markdown', () => ({
  __esModule: true,
  default: ({ children }) => {
    const React = require('react');
    return React.createElement('div', { 'data-testid': 'mock-react-markdown' }, children);
  },
}));

jest.mock('remark-gfm', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('rehype-highlight', () => ({ __esModule: true, default: jest.fn(() => jest.fn()) }));

jest.mock('@monaco-editor/react', () => () => {
  const React = require('react');
  return React.createElement('div', { 'data-testid': 'mock-monaco-editor' });
});

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

jest.mock('../TerminalTTY', () => ({
  __esModule: true,
  default: (props) => {
    const React = require('react');
    renderedTerminalProps[props.id] = props;
    return React.createElement('div', {
      'data-testid': `terminal-${props.id}`,
      'data-engine-v2': String(props.isEngineV2),
    });
  },
}));

const { renderWorkspacePanel } = require('../TerminalWorkspacesManager');

function makePanel(overrides = {}) {
  return {
    id: 'p-test',
    cwd: '/workspace/devhub',
    initialCommand: 'bash',
    swarmRole: null,
    swarmContext: null,
    displayName: 'Test',
    terminalEngineV2: false,
    ...overrides,
  };
}

function makeProps(overrides = {}) {
  return {
    activePanelId: 'p-test',
    activeWsId: 'ws-test',
    isActivePanel: true,
    isVisibleInLayout: true,
    cwd: '/workspace/devhub',
    wsId: 'ws-test',
    setActivePanelIds: () => {},
    onClosePanel: () => {},
    onSplitRight: () => {},
    onSplitDown: () => {},
    onToggleFocus: () => {},
    isFocusedPanel: false,
    requestedRendererMode: 'xterm',
    onResetRendererToXterm: () => {},
    onSetPanelRenderer: () => {},
    onActivatePanel: () => {},
    panelLabel: 'Test',
    panelSemanticMetadata: { source: 'test', primary: 'Test', secondary: null, fullText: '' },
    suspendNativeSurface: false,
    nativeSurfacePolicy: 'live',
    connectionState: 'connected',
    visibleTerminalPanelCount: 1,
    coldMountOrdinal: 0,
    deferLiveSurfaceToPizarra: false,
    pizarraOwnsLiveSurfaces: false,
    swarmDelegatedRoleKeys: null,
    inboxPendingCount: 0,
    onConnectionStateChange: () => {},
    ...overrides,
  };
}

describe('renderWorkspacePanel — v2 graveyard flag and mount logic', () => {
  let dom;

  beforeEach(() => {
    dom = installDom();
    keepalivePolicyMock.__setKeepaliveEnabledForTests(false);
    Object.keys(renderedTerminalProps).forEach((key) => delete renderedTerminalProps[key]);
  });

  afterEach(() => {
    cleanupMountedRoots(mountedRoots);
    dom.window.close();
    jest.clearAllMocks();
  });

  it('passes isEngineV2=true for a v2 panel', async () => {
    const element = renderWorkspacePanel(makePanel({ terminalEngineV2: true }), makeProps());
    const view = await renderIntoDom(element, mountedRoots);
    await flushEffects();

    const terminal = view.container.querySelector('[data-testid="terminal-p-test"]');
    expect(terminal).not.toBeNull();
    expect(terminal.getAttribute('data-engine-v2')).toBe('true');
    expect(renderedTerminalProps['p-test'].isEngineV2).toBe(true);
  });

  it('passes isEngineV2=false for a legacy panel', async () => {
    const element = renderWorkspacePanel(makePanel({ terminalEngineV2: false }), makeProps());
    const view = await renderIntoDom(element, mountedRoots);
    await flushEffects();

    const terminal = view.container.querySelector('[data-testid="terminal-p-test"]');
    expect(terminal).not.toBeNull();
    expect(terminal.getAttribute('data-engine-v2')).toBe('false');
    expect(renderedTerminalProps['p-test'].isEngineV2).toBe(false);
  });

  it('mounts TerminalTTY for a visible v2 panel', async () => {
    const element = renderWorkspacePanel(
      makePanel({ terminalEngineV2: true }),
      makeProps({ isVisibleInLayout: true })
    );
    const view = await renderIntoDom(element, mountedRoots);
    await flushEffects();

    expect(view.container.querySelector('[data-testid="terminal-p-test"]')).not.toBeNull();
    expect(view.container.querySelector('[data-testid="panel-body-v2-stash-p-test"]')).toBeNull();
  });

  it('renders a stash placeholder when v2 is hidden, shell is inactive and keep-alive is off', async () => {
    const element = renderWorkspacePanel(
      makePanel({ terminalEngineV2: true }),
      makeProps({ isVisibleInLayout: false, isWorkspaceShellVisible: false })
    );
    const view = await renderIntoDom(element, mountedRoots);
    await flushEffects();

    expect(view.container.querySelector('[data-testid="terminal-p-test"]')).toBeNull();
    expect(
      view.container.querySelector('[data-testid="panel-body-v2-stash-p-test"]')
    ).not.toBeNull();
  });

  it('keeps a hidden v2 panel mounted when keep-alive is on (workspace tab switch)', async () => {
    keepalivePolicyMock.__setKeepaliveEnabledForTests(true);
    const element = renderWorkspacePanel(
      makePanel({ terminalEngineV2: true }),
      makeProps({ isVisibleInLayout: false, isWorkspaceShellVisible: false })
    );
    const view = await renderIntoDom(element, mountedRoots);
    await flushEffects();

    expect(view.container.querySelector('[data-testid="terminal-p-test"]')).not.toBeNull();
    expect(view.container.querySelector('[data-testid="panel-body-v2-stash-p-test"]')).toBeNull();
  });

  it('keeps TerminalTTY mounted for a parked-window v2 panel when workspace shell is visible', async () => {
    const element = renderWorkspacePanel(
      makePanel({ terminalEngineV2: true }),
      makeProps({ isVisibleInLayout: false, isWorkspaceShellVisible: true })
    );
    const view = await renderIntoDom(element, mountedRoots);
    await flushEffects();

    expect(view.container.querySelector('[data-testid="terminal-p-test"]')).not.toBeNull();
    expect(view.container.querySelector('[data-testid="panel-body-v2-stash-p-test"]')).toBeNull();
  });

  it('keeps a legacy panel mounted even when hidden', async () => {
    const element = renderWorkspacePanel(
      makePanel({ terminalEngineV2: false }),
      makeProps({ isVisibleInLayout: false })
    );
    const view = await renderIntoDom(element, mountedRoots);
    await flushEffects();

    expect(view.container.querySelector('[data-testid="terminal-p-test"]')).not.toBeNull();
    expect(view.container.querySelector('[data-testid="panel-body-v2-stash-p-test"]')).toBeNull();
  });
});
