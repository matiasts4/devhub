const React = require('react');
const { cleanupMountedRoots, installDom, renderIntoDom } = require('@/test-support/domHarness');

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
    return React.createElement(
      'div',
      { ...props, 'data-panel-group-direction': direction },
      children
    );
  },
  Panel: ({ children, ...props }) => {
    const React = require('react');
    return React.createElement('div', props, children);
  },
  PanelResizeHandle: ({
    onDragging,
    onMouseDown,
    onMouseUp,
    onPointerDown,
    onPointerUp,
    ...props
  }) => {
    const React = require('react');
    return React.createElement('div', {
      ...props,
      onMouseDown: (event) => {
        onDragging?.(true);
        onMouseDown?.(event);
      },
      onMouseUp: (event) => {
        onDragging?.(false);
        onMouseUp?.(event);
      },
      onPointerDown: (event) => {
        onDragging?.(true);
        onPointerDown?.(event);
      },
      onPointerUp: (event) => {
        onDragging?.(false);
        onPointerUp?.(event);
      },
    });
  },
}));

jest.mock('../TerminalTTY', () => ({
  __esModule: true,
  default: ({
    id,
    isActivePanel,
    isVisibleInLayout,
    suspendNativeSurface,
    requestedRendererMode,
    onResetRendererToXterm,
    onActivatePanel,
  }) => {
    const React = require('react');
    React.useEffect(() => {
      const mockWindow = globalThis.window;
      if (!onActivatePanel || !mockWindow) return undefined;

      const handleNativeRuntimeEvent = (event) => {
        const detail = event.detail || {};
        if (detail.type !== 'panel-activated' || detail.panelId !== id) return;
        onActivatePanel(id);
      };

      mockWindow.addEventListener('devhub:terminal-native-vte-event', handleNativeRuntimeEvent);
      return () => {
        mockWindow.removeEventListener(
          'devhub:terminal-native-vte-event',
          handleNativeRuntimeEvent
        );
      };
    }, [id, onActivatePanel]);

    return React.createElement('div', { 'data-testid': `terminal-${id}` }, [
      React.createElement('span', { key: 'id' }, id),
      React.createElement(
        'span',
        { key: 'active', 'data-testid': `terminal-active-${id}` },
        isActivePanel ? 'active' : 'inactive'
      ),
      React.createElement(
        'span',
        { key: 'visible', 'data-testid': `terminal-visible-${id}` },
        isVisibleInLayout ? 'visible' : 'hidden'
      ),
      React.createElement(
        'span',
        { key: 'suspend', 'data-testid': `terminal-suspend-${id}` },
        suspendNativeSurface ? 'suspended' : 'live'
      ),
      React.createElement(
        'span',
        { key: 'renderer', 'data-testid': `terminal-renderer-${id}` },
        requestedRendererMode || 'xterm'
      ),
      onActivatePanel
        ? React.createElement(
            'button',
            {
              key: 'activate',
              type: 'button',
              'data-testid': `terminal-activate-${id}`,
              onMouseDown: onActivatePanel,
            },
            'activate'
          )
        : null,
      onResetRendererToXterm
        ? React.createElement(
            'button',
            {
              key: 'reset',
              type: 'button',
              'data-testid': `terminal-renderer-reset-${id}`,
              onClick: onResetRendererToXterm,
            },
            'reset'
          )
        : null,
    ]);
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
    const DropdownMenuContext =
      global.__DEVHUB_TEST_DROPDOWN_MENU_CONTEXT__ ||
      (global.__DEVHUB_TEST_DROPDOWN_MENU_CONTEXT__ = React.createContext(null));
    const [open, setOpen] = React.useState(false);
    const setOpenWithCallback = (nextOpen) => {
      setOpen(nextOpen);
      onOpenChange?.(nextOpen);
    };
    return React.createElement(
      DropdownMenuContext.Provider,
      { value: { open, setOpen: setOpenWithCallback } },
      React.createElement('div', null, children)
    );
  },
  DropdownMenuContent: ({ children }) => {
    const React = require('react');
    const context = React.useContext(global.__DEVHUB_TEST_DROPDOWN_MENU_CONTEXT__);
    if (!context?.open) return null;
    return React.createElement('div', null, children);
  },
  DropdownMenuItem: ({ children, onSelect }) => {
    const React = require('react');
    const context = React.useContext(global.__DEVHUB_TEST_DROPDOWN_MENU_CONTEXT__);
    return React.createElement(
      'button',
      {
        type: 'button',
        onClick: () => {
          onSelect?.();
          context?.setOpen(false);
        },
      },
      children
    );
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
    const context = React.useContext(global.__DEVHUB_TEST_DROPDOWN_MENU_CONTEXT__);
    return React.cloneElement(React.Children.only(children), {
      onClick: (event) => {
        children.props.onClick?.(event);
        context?.setOpen(!context.open);
      },
    });
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

function persistAgentRuns(runs) {
  window.localStorage.setItem('devhub_agent_runs', JSON.stringify(runs));
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
            {
              id: 'c1',
              panels: [{ id: 'p1', cwd: '/workspace/devhub', initialCommand: 'opencode' }],
            },
            {
              id: 'c2',
              panels: [
                {
                  id: 'p2',
                  cwd: '/workspace/devhub',
                  initialCommand: 'opencode --session ses_split',
                },
              ],
            },
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

    const handle = view.container.querySelector(
      '[data-testid="split-column-resize-handle-ws1-c1"]'
    );
    expect(handle).not.toBeNull();
    expect(handle?.className).toEqual(expect.stringContaining('w-3'));
    expect(handle?.className).toEqual(expect.stringContaining('bg-[#0f1724]'));
    expect(handle?.className).toEqual(expect.stringContaining('border-l'));
    expect(handle?.className).toEqual(expect.stringContaining('border-r'));
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
                {
                  id: 'p2',
                  cwd: '/workspace/devhub',
                  initialCommand: 'opencode --session ses_vertical',
                },
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

    const handle = view.container.querySelector(
      '[data-testid="workspace-row-resize-handle-c1-p1"]'
    );
    expect(handle).not.toBeNull();
    expect(handle?.className).toEqual(expect.stringContaining('h-3'));
    expect(handle?.className).toEqual(expect.stringContaining('bg-[#0f1724]'));
    expect(handle?.className).toEqual(expect.stringContaining('border-t'));
    expect(handle?.className).toEqual(expect.stringContaining('border-b'));
  });

  test('keeps two visible split native panels mounted at the same time while focus stays panel-scoped', async () => {
    persistWorkspaceState({
      workspaces: [
        {
          id: 'ws1',
          name: 'Workspace 1',
          columns: [
            {
              id: 'c1',
              panels: [{ id: 'p1', cwd: '/workspace/devhub', initialCommand: 'opencode' }],
            },
            {
              id: 'c2',
              panels: [
                {
                  id: 'p2',
                  cwd: '/workspace/devhub',
                  initialCommand: 'opencode --session ses_split',
                },
              ],
            },
          ],
        },
      ],
      activeWsId: 'ws1',
      activePanelIds: { ws1: 'p2' },
    });

    const view = await renderManager();

    expect(view.container.querySelector('[data-testid="terminal-visible-p1"]')?.textContent).toBe(
      'visible'
    );
    expect(view.container.querySelector('[data-testid="terminal-visible-p2"]')?.textContent).toBe(
      'visible'
    );
    expect(view.container.querySelector('[data-testid="terminal-active-p1"]')?.textContent).toBe(
      'inactive'
    );
    expect(view.container.querySelector('[data-testid="terminal-active-p2"]')?.textContent).toBe(
      'active'
    );
  });

  test('renders minimal semantic metadata derived from the initial command', async () => {
    persistWorkspaceState({
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
                  initialCommand: 'opencode --agent sdd-explore',
                },
              ],
            },
          ],
        },
      ],
      activeWsId: 'ws1',
      activePanelIds: { ws1: 'p1' },
    });

    const view = await renderManager();

    const semanticHeader = view.container.querySelector('[data-testid="panel-semantic-header-p1"]');
    expect(semanticHeader).not.toBeNull();
    expect(semanticHeader?.getAttribute('data-panel-metadata-source')).toBe('command');
    expect(semanticHeader?.textContent).toBe('OpenCode · sdd-explore');
    expect(
      view.container.querySelector('[data-testid="panel-semantic-primary-p1"]')?.textContent
    ).toBe('OpenCode');
    expect(
      view.container.querySelector('[data-testid="panel-semantic-secondary-p1"]')?.textContent
    ).toBe('sdd-explore');
  });

  test('prefers devhub agent run metadata over the initial command for the semantic header', async () => {
    persistWorkspaceState({
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
                  initialCommand: 'opencode --agent sdd-apply',
                },
              ],
            },
          ],
        },
      ],
      activeWsId: 'ws1',
      activePanelIds: { ws1: 'p1' },
    });
    persistAgentRuns({
      'task-1': {
        panelId: 'p1',
        selectedAgent: 'gemini',
        taskTitle: 'revisión',
        promptSummary: 'revisión terminal multi-panel',
        launchedAt: 123,
      },
    });

    const view = await renderManager();

    const semanticHeader = view.container.querySelector('[data-testid="panel-semantic-header-p1"]');
    expect(semanticHeader).not.toBeNull();
    expect(semanticHeader?.getAttribute('data-panel-metadata-source')).toBe('agent-run');
    expect(semanticHeader?.textContent).toBe('gemini · revisión');
    expect(semanticHeader?.textContent).not.toContain('sdd-apply');
  });

  test('wires reset and per-panel close intent while keeping the visible sibling mounted', async () => {
    persistWorkspaceState({
      workspaces: [
        {
          id: 'ws1',
          name: 'Workspace 1',
          columns: [
            {
              id: 'c1',
              panels: [{ id: 'p1', cwd: '/workspace/devhub', initialCommand: 'opencode' }],
            },
            {
              id: 'c2',
              panels: [
                {
                  id: 'p2',
                  cwd: '/workspace/devhub',
                  initialCommand: 'opencode --session ses_split',
                },
              ],
            },
          ],
        },
      ],
      activeWsId: 'ws1',
      activePanelIds: { ws1: 'p2' },
    });

    const view = await renderManager();

    view.container
      .querySelector('[data-testid="terminal-renderer-reset-p1"]')
      ?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await Promise.resolve();

    expect(view.container.querySelector('[data-testid="terminal-renderer-p1"]')?.textContent).toBe(
      'xterm'
    );
    expect(view.container.querySelector('[data-testid="terminal-visible-p2"]')?.textContent).toBe(
      'visible'
    );

    view.container
      .querySelector('[data-testid="panel-slot-p1"] button[aria-label="Cerrar terminal"]')
      ?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await Promise.resolve();

    expect(view.container.querySelector('[data-testid="terminal-p1"]')).not.toBeNull();
    expect(view.container.querySelector('[data-testid="terminal-p2"]')).not.toBeNull();
  });

  test('renders floating per-panel chrome outside the terminal render body so native content does not cover controls', async () => {
    persistWorkspaceState({
      workspaces: [
        {
          id: 'ws1',
          name: 'Workspace 1',
          columns: [
            {
              id: 'c1',
              panels: [{ id: 'p1', cwd: '/workspace/devhub', initialCommand: 'opencode' }],
            },
            {
              id: 'c2',
              panels: [
                {
                  id: 'p2',
                  cwd: '/workspace/devhub',
                  initialCommand: 'opencode --session ses_split',
                },
              ],
            },
          ],
        },
      ],
      activeWsId: 'ws1',
      activePanelIds: { ws1: 'p1' },
    });

    const view = await renderManager();

    const panelHeader = view.container.querySelector('[data-testid="panel-header-p1"]');
    const panelBody = view.container.querySelector('[data-testid="panel-body-p1"]');
    const panelSlot = view.container.querySelector('[data-testid="panel-slot-p1"]');
    const panelSafeZone = view.container.querySelector('[data-testid="panel-safe-zone-p1"]');
    const panelChromeOverlay = view.container.querySelector(
      '[data-testid="panel-chrome-overlay-p1"]'
    );
    const panelSemanticHeader = view.container.querySelector(
      '[data-testid="panel-semantic-header-p1"]'
    );
    const panelActions = view.container.querySelector('[data-testid="panel-header-actions-p1"]');
    const splitRightButton = view.container.querySelector('[data-testid="panel-split-right-p1"]');
    const splitDownButton = view.container.querySelector('[data-testid="panel-split-down-p1"]');
    const closeButton = view.container.querySelector('[data-testid="panel-close-p1"]');

    expect(panelHeader).toBeNull();
    expect(panelSlot).not.toBeNull();
    expect(panelBody).not.toBeNull();
    expect(panelSafeZone).not.toBeNull();
    expect(panelSafeZone?.getAttribute('data-native-safe-zone')).toBe('floating-chrome');
    expect(panelSafeZone?.getAttribute('data-safe-zone-min-top')).toBe('34');
    expect(panelSemanticHeader).not.toBeNull();
    expect(panelSafeZone?.contains(panelSemanticHeader)).toBe(true);
    expect(panelChromeOverlay).not.toBeNull();
    expect(panelChromeOverlay?.getAttribute('aria-label')).toBe('Panel P1 controls');
    expect(panelChromeOverlay?.getAttribute('data-floating-placement')).toBe('inside-top-right');
    expect(panelActions).not.toBeNull();
    expect(panelActions?.getAttribute('title')).toBe('Panel P1 actions');
    expect(panelChromeOverlay?.className).not.toEqual(expect.stringContaining('-translate-y-1/2'));
    expect(panelChromeOverlay?.className).not.toEqual(expect.stringContaining('top-0'));
    expect(panelSafeZone?.contains(panelChromeOverlay)).toBe(true);
    expect(panelBody?.contains(panelChromeOverlay)).toBe(false);
    expect(panelBody?.contains(panelSemanticHeader)).toBe(false);
    expect(panelBody?.querySelector('[data-testid="terminal-p1"]')).not.toBeNull();
    expect(panelChromeOverlay?.querySelector('[data-testid="panel-split-right-p1"]')).toBe(
      splitRightButton
    );
    expect(panelChromeOverlay?.querySelector('[data-testid="panel-split-down-p1"]')).toBe(
      splitDownButton
    );
    expect(panelChromeOverlay?.querySelector('[data-testid="panel-close-p1"]')).toBe(closeButton);
    expect(splitRightButton?.getAttribute('data-size')).toBe('comfortable');
    expect(splitDownButton?.getAttribute('data-size')).toBe('comfortable');
    expect(closeButton?.getAttribute('data-size')).toBe('comfortable');
    expect(panelBody?.querySelector('[data-testid="panel-split-right-p1"]')).toBeNull();
    expect(panelBody?.querySelector('[data-testid="panel-close-p1"]')).toBeNull();
  });

  test('keeps the native-safe floating header while hiding the upper V1/V2 chrome', async () => {
    persistWorkspaceState({
      workspaces: [
        {
          id: 'ws1',
          name: 'Workspace 1',
          columns: [
            {
              id: 'c1',
              panels: [{ id: 'p1', cwd: '/workspace/devhub', initialCommand: 'opencode' }],
            },
          ],
        },
      ],
      activeWsId: 'ws1',
      activePanelIds: { ws1: 'p1' },
    });

    const view = await renderManager();

    const workspaceTopBar = view.container.querySelector('[data-testid="workspace-top-tab-bar"]');
    const subtabsBar = view.container.querySelector('[data-testid="panel-subtabs-bar"]');
    const workspaceShell = view.container.querySelector('[data-testid="workspace-shell-ws1"]');
    const panelSafeZone = view.container.querySelector('[data-testid="panel-safe-zone-p1"]');

    expect(workspaceTopBar).not.toBeNull();
    expect(workspaceTopBar?.className).toContain('min-h-[44px]');
    expect(workspaceTopBar?.className).not.toContain('min-h-[52px]');
    expect(subtabsBar).not.toBeNull();
    expect(subtabsBar?.className).toContain('hidden');
    expect(subtabsBar?.getAttribute('aria-hidden')).toBe('true');
    expect(subtabsBar?.className).toContain('h-10');
    expect(subtabsBar?.className).not.toContain('h-11');
    expect(workspaceShell).not.toBeNull();
    expect(workspaceShell?.className).toContain('p-1.5');
    expect(workspaceShell?.className).not.toContain('p-2');
    expect(panelSafeZone?.getAttribute('data-native-safe-zone')).toBe('floating-chrome');
    expect(panelSafeZone?.getAttribute('data-safe-zone-min-top')).toBe('34');
  });

  test('keeps per-panel split controls working from the floating overlay chrome', async () => {
    persistWorkspaceState({
      workspaces: [
        {
          id: 'ws1',
          name: 'Workspace 1',
          columns: [
            {
              id: 'c1',
              panels: [{ id: 'p1', cwd: '/workspace/devhub', initialCommand: 'opencode' }],
            },
            {
              id: 'c2',
              panels: [
                {
                  id: 'p2',
                  cwd: '/workspace/devhub',
                  initialCommand: 'opencode --session ses_split',
                },
              ],
            },
          ],
        },
      ],
      activeWsId: 'ws1',
      activePanelIds: { ws1: 'p2' },
    });

    const view = await renderManager();

    view.container
      .querySelector('[data-testid="panel-split-right-p1"]')
      ?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await Promise.resolve();

    const columns = Array.from(
      view.container.querySelectorAll('[data-testid^="workspace-column-"]')
    );
    expect(columns).toHaveLength(3);
    expect(columns[0].querySelector('[data-testid="terminal-p1"]')).not.toBeNull();
    expect(columns[1].querySelector('[data-testid="terminal-p3"]')).not.toBeNull();
    expect(columns[2].querySelector('[data-testid="terminal-p2"]')).not.toBeNull();
  });

  test('uses the clicked terminal as the split source for global split controls', async () => {
    persistWorkspaceState({
      workspaces: [
        {
          id: 'ws1',
          name: 'Workspace 1',
          columns: [
            {
              id: 'c1',
              panels: [{ id: 'p1', cwd: '/workspace/devhub', initialCommand: 'opencode' }],
            },
            {
              id: 'c2',
              panels: [
                {
                  id: 'p2',
                  cwd: '/workspace/devhub',
                  initialCommand: 'opencode --session ses_split',
                },
              ],
            },
          ],
        },
      ],
      activeWsId: 'ws1',
      activePanelIds: { ws1: 'p2' },
    });

    const view = await renderManager();

    view.container
      .querySelector('[data-testid="terminal-activate-p1"]')
      ?.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
    await Promise.resolve();

    expect(view.container.querySelector('[data-testid="terminal-active-p1"]')?.textContent).toBe(
      'active'
    );
    expect(view.container.querySelector('[data-testid="terminal-active-p2"]')?.textContent).toBe(
      'inactive'
    );

    view.container
      .querySelector('[data-testid="panel-subtabs-split-right"]')
      ?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await Promise.resolve();

    const columns = Array.from(
      view.container.querySelectorAll('[data-testid^="workspace-column-"]')
    );
    expect(columns).toHaveLength(3);
    expect(columns[0].querySelector('[data-testid="terminal-p1"]')).not.toBeNull();
    expect(columns[1].querySelector('[data-testid="terminal-p3"]')).not.toBeNull();
    expect(columns[2].querySelector('[data-testid="terminal-p2"]')).not.toBeNull();
  });

  test('uses the last native-activated terminal as the split source for global split controls', async () => {
    persistWorkspaceState({
      workspaces: [
        {
          id: 'ws1',
          name: 'Workspace 1',
          columns: [
            {
              id: 'c1',
              panels: [{ id: 'p1', cwd: '/workspace/devhub', initialCommand: 'opencode' }],
            },
            {
              id: 'c2',
              panels: [
                {
                  id: 'p2',
                  cwd: '/workspace/devhub',
                  initialCommand: 'opencode --session ses_split',
                },
              ],
            },
          ],
        },
      ],
      activeWsId: 'ws1',
      activePanelIds: { ws1: 'p2' },
    });

    const view = await renderManager();

    view.container
      .querySelector('[data-testid="terminal-activate-p1"]')
      ?.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
    await Promise.resolve();

    expect(view.container.querySelector('[data-testid="terminal-active-p1"]')?.textContent).toBe(
      'active'
    );
    expect(view.container.querySelector('[data-testid="terminal-active-p2"]')?.textContent).toBe(
      'inactive'
    );

    view.container
      .querySelector('[data-testid="panel-subtabs-split-right"]')
      ?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await Promise.resolve();

    const columns = Array.from(
      view.container.querySelectorAll('[data-testid^="workspace-column-"]')
    );
    expect(columns).toHaveLength(3);
    expect(columns[0].querySelector('[data-testid="terminal-p1"]')).not.toBeNull();
    expect(columns[1].querySelector('[data-testid="terminal-p3"]')).not.toBeNull();
    expect(columns[2].querySelector('[data-testid="terminal-p2"]')).not.toBeNull();
  });

  test('suspends native surfaces while Grid dropdown is open and restores them when it closes', async () => {
    persistWorkspaceState({
      workspaces: [
        {
          id: 'ws1',
          name: 'Workspace 1',
          columns: [
            {
              id: 'c1',
              panels: [{ id: 'p1', cwd: '/workspace/devhub', initialCommand: 'opencode' }],
            },
            {
              id: 'c2',
              panels: [
                {
                  id: 'p2',
                  cwd: '/workspace/devhub',
                  initialCommand: 'opencode --session ses_split',
                },
              ],
            },
          ],
        },
      ],
      activeWsId: 'ws1',
      activePanelIds: { ws1: 'p2' },
    });

    const view = await renderManager();
    const trigger = view.container.querySelector('[data-testid="workspace-grid-launcher-trigger"]');

    expect(view.container.querySelector('[data-testid="terminal-suspend-p1"]')?.textContent).toBe(
      'live'
    );
    expect(view.container.querySelector('[data-testid="terminal-suspend-p2"]')?.textContent).toBe(
      'live'
    );

    trigger?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await Promise.resolve();

    expect(view.container.querySelector('[data-testid="terminal-suspend-p1"]')?.textContent).toBe(
      'suspended'
    );
    expect(view.container.querySelector('[data-testid="terminal-suspend-p2"]')?.textContent).toBe(
      'suspended'
    );

    trigger?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await Promise.resolve();

    expect(view.container.querySelector('[data-testid="terminal-suspend-p1"]')?.textContent).toBe(
      'live'
    );
    expect(view.container.querySelector('[data-testid="terminal-suspend-p2"]')?.textContent).toBe(
      'live'
    );
  });

  test('suspends native surfaces during internal split drag and restores them on drag end without changing active panel', async () => {
    persistWorkspaceState({
      workspaces: [
        {
          id: 'ws1',
          name: 'Workspace 1',
          columns: [
            {
              id: 'c1',
              panels: [{ id: 'p1', cwd: '/workspace/devhub', initialCommand: 'opencode' }],
            },
            {
              id: 'c2',
              panels: [
                {
                  id: 'p2',
                  cwd: '/workspace/devhub',
                  initialCommand: 'opencode --session ses_split',
                },
              ],
            },
          ],
        },
      ],
      activeWsId: 'ws1',
      activePanelIds: { ws1: 'p2' },
    });

    const view = await renderManager();
    const handle = view.container.querySelector(
      '[data-testid="split-column-resize-handle-ws1-c1"]'
    );

    expect(view.container.querySelector('[data-testid="terminal-active-p1"]')?.textContent).toBe(
      'inactive'
    );
    expect(view.container.querySelector('[data-testid="terminal-active-p2"]')?.textContent).toBe(
      'active'
    );

    handle?.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
    await Promise.resolve();

    expect(view.container.querySelector('[data-testid="terminal-suspend-p1"]')?.textContent).toBe(
      'suspended'
    );
    expect(view.container.querySelector('[data-testid="terminal-suspend-p2"]')?.textContent).toBe(
      'suspended'
    );
    expect(view.container.querySelector('[data-testid="terminal-active-p1"]')?.textContent).toBe(
      'inactive'
    );
    expect(view.container.querySelector('[data-testid="terminal-active-p2"]')?.textContent).toBe(
      'active'
    );

    handle?.dispatchEvent(new window.MouseEvent('mouseup', { bubbles: true }));
    await Promise.resolve();

    expect(view.container.querySelector('[data-testid="terminal-suspend-p1"]')?.textContent).toBe(
      'live'
    );
    expect(view.container.querySelector('[data-testid="terminal-suspend-p2"]')?.textContent).toBe(
      'live'
    );
    expect(view.container.querySelector('[data-testid="terminal-active-p1"]')?.textContent).toBe(
      'inactive'
    );
    expect(view.container.querySelector('[data-testid="terminal-active-p2"]')?.textContent).toBe(
      'active'
    );
  });
});
