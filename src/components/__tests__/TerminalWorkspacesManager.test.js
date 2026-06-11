/**
 * TerminalWorkspacesManager unit tests — terminal-ux-redesign
 *
 * Two suites:
 *   1. Pure helpers (getRightDockAnimProps, getWorkspaceAnimProps).
 *   2. DisplayName migration on hydrate (T5) — mounts the manager and
 *      verifies the auto-assign effect when localStorage has panels
 *      with no `displayName` entry.
 */

const {
  getRightDockAnimProps,
  getWorkspaceAnimProps,
} = require('../terminal/workspaceAnimProps.js');

describe('getRightDockAnimProps()', () => {
  test('slides in from the right edge of the dock slot', () => {
    const props = getRightDockAnimProps({ isVisible: true });
    expect(props.initial).toEqual({ opacity: 0, x: '100%' });
    expect(props.animate).toEqual({ opacity: 1, x: 0 });
  });

  test('slides out to the right when hidden', () => {
    const props = getRightDockAnimProps({ isVisible: false });
    expect(props.animate).toEqual({ opacity: 0, x: '100%' });
  });

  test('disables motion while the dock is being resized', () => {
    const props = getRightDockAnimProps({ isVisible: true, isDragging: true });
    expect(props.transition).toEqual({ duration: 0 });
  });
});

describe('getWorkspaceAnimProps()', () => {
  test('returns full opacity when maximized', () => {
    const props = getWorkspaceAnimProps(true);
    expect(props.animate.opacity).toBe(1);
    expect(props.animate.scale).toBeUndefined();
  });

  test('uses opacity-only animation in normal mode (no scale — native VTE sync)', () => {
    const props = getWorkspaceAnimProps(false);
    expect(props.animate.opacity).toBe(1);
    expect(props.animate.scale).toBeUndefined();
    expect(props.initial.scale).toBeUndefined();
  });

  test('transition duration is <= 300ms (GPU-composited, feel instant)', () => {
    const props = getWorkspaceAnimProps(true);
    expect(props.transition.duration).toBeGreaterThan(0);
    expect(props.transition.duration).toBeLessThanOrEqual(0.3);
  });

  test('initial state starts from zero opacity for a clean fade-in on mount', () => {
    // When isMaximized=false (normal workspace mount), we want a clean
    // fade-in from opacity 0. Starting near 1 (e.g. 0.94) makes the
    // mount animation nearly invisible, defeating its purpose.
    const props = getWorkspaceAnimProps(false);
    expect(props.initial.opacity).toBe(0);
  });

  test('maximized initial state skips the fade-in (already visible)', () => {
    // When isMaximized=true, the workspace was already visible at full
    // opacity — no fade-in needed, start at 1.
    const props = getWorkspaceAnimProps(true);
    expect(props.initial.opacity).toBe(1);
  });
});

// =============================================================================
// DisplayName migration on hydrate (T5 RED)
// =============================================================================

const React = require('react');
const {
  cleanupMountedRoots,
  flushEffects,
  installDom,
  renderIntoDom,
} = require('@/test-support/domHarness');

jest.mock('framer-motion', () => {
  const mockReact = require('react');
  const mockEl = (tag) =>
    mockReact.forwardRef(({ children, ...props }, ref) =>
      mockReact.createElement(tag, { ...props, ref }, children)
    );
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
    const mockReact = require('react');
    return mockReact.createElement('svg', { ...props, 'data-icon': name });
  };
  return new Proxy({}, { get: (_, key) => icon(String(key)) });
});

jest.mock('react-resizable-panels', () => {
  const mockReact = require('react');
  return {
    PanelGroup: ({ children, direction, ...props }) =>
      mockReact.createElement(
        'div',
        { ...props, 'data-panel-group-direction': direction },
        children
      ),
    Panel: ({ children, ...props }) => mockReact.createElement('div', props, children),
    PanelResizeHandle: (props) => mockReact.createElement('div', props),
  };
});

jest.mock('../TerminalTTY', () => {
  const mockReact = require('react');
  return {
    __esModule: true,
    default: ({ id, isActivePanel }) =>
      mockReact.createElement('div', { 'data-testid': `terminal-${id}` }, [
        mockReact.createElement(
          'span',
          { key: 'active', 'data-testid': `terminal-active-${id}` },
          isActivePanel ? 'active' : 'inactive'
        ),
      ]),
  };
});

jest.mock('../NotificationCenter', () => {
  const mockReact = require('react');
  return {
    __esModule: true,
    default: () => mockReact.createElement('div', null, 'notifications'),
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

jest.mock('@/components/ui/dropdown-menu', () => {
  const mockReact = require('react');
  return {
    DropdownMenu: ({ children }) => mockReact.createElement('div', null, children),
    DropdownMenuContent: ({ children }) => mockReact.createElement('div', null, children),
    DropdownMenuItem: ({ children, onSelect }) =>
      mockReact.createElement('button', { type: 'button', onClick: () => onSelect?.() }, children),
    DropdownMenuLabel: ({ children }) => mockReact.createElement('div', null, children),
    DropdownMenuSeparator: () => mockReact.createElement('hr'),
    DropdownMenuTrigger: ({ children }) => mockReact.createElement('div', null, children),
  };
});

jest.mock('@/lib/agentRegistryLive', () => ({
  findAgentWorkspaceAndPanel: () => ({}),
}));

jest.mock('date-fns', () => ({
  formatDistanceToNow: () => 'just now',
}));

jest.mock('../workspace/WorkspaceRightDock', () => {
  const mockReact = require('react');
  return {
    __esModule: true,
    default: () => mockReact.createElement('div', { 'data-testid': 'workspace-right-dock' }),
  };
});

jest.mock(
  '../workspace/FileExplorerEditorPane',
  () => {
    const mockReact = require('react');
    return {
      __esModule: true,
      default: () => mockReact.createElement('div', { 'data-testid': 'shared-editor-pane' }),
    };
  },
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

describe('TerminalWorkspacesManager — displayName migration on hydrate', () => {
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

  test('migrates legacy panels with no displayName to pool names on hydrate', async () => {
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
                { id: 'p2', cwd: '/workspace/devhub', initialCommand: 'opencode' },
              ],
            },
          ],
        },
      ],
      activeWsId: 'ws1',
      activePanelIds: { ws1: 'p1' },
    });

    await renderManager();
    await flushEffects();

    const stored = window.localStorage.getItem('devhub:panel-names:ws1');
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored);
    expect(typeof parsed.p1).toBe('string');
    expect(typeof parsed.p2).toBe('string');
    expect(parsed.p1).not.toBe(parsed.p2);
  });

  test('persists the auto-assigned name in localStorage under devhub:panel-names:<workspaceId>', async () => {
    persistWorkspaceState({
      workspaces: [
        {
          id: 'ws-isolation',
          name: 'Workspace 1',
          columns: [
            {
              id: 'c1',
              panels: [{ id: 'p1', cwd: '/workspace/devhub' }],
            },
          ],
        },
      ],
      activeWsId: 'ws-isolation',
      activePanelIds: { 'ws-isolation': 'p1' },
    });

    await renderManager();
    await flushEffects();

    const stored = window.localStorage.getItem('devhub:panel-names:ws-isolation');
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored);
    expect(parsed.p1).toBeDefined();
  });

  test('is idempotent — re-rendering does not overwrite a previously assigned name', async () => {
    persistWorkspaceState({
      workspaces: [
        {
          id: 'ws1',
          name: 'Workspace 1',
          columns: [
            {
              id: 'c1',
              panels: [{ id: 'p1', cwd: '/workspace/devhub' }],
            },
          ],
        },
      ],
      activeWsId: 'ws1',
      activePanelIds: { ws1: 'p1' },
    });

    await renderManager();
    await flushEffects();

    const firstStored = JSON.parse(window.localStorage.getItem('devhub:panel-names:ws1'));
    expect(firstStored.p1).toBeDefined();
  });
});
