const React = require('react');
const { createRoot } = require('react-dom/client');
const { flushSync } = require('react-dom');
const { JSDOM } = require('jsdom');
const {
  DEFAULT_RIGHT_DOCK_STATE,
  buildRightDockStorageKey,
} = require('../workspace/rightDockState');
const {
  buildBrowserWindowStorageKey,
  buildBrowserWindowLabel,
} = require('../workspace/browserWindowState');

const mockInvoke = jest.fn();
const mockListen = jest.fn();

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
  return new Proxy(
    {},
    {
      get: (_, key) => icon(String(key)),
    }
  );
});

jest.mock('react-resizable-panels', () => ({
  PanelGroup: ({ children, ...props }) => {
    const React = require('react');
    return React.createElement('div', props, children);
  },
  Panel: ({ children, defaultSize, minSize, maxSize, onResize, ...props }) => {
    const React = require('react');
    return React.createElement('div', { ...props, 'data-panel-size': defaultSize }, children);
  },
  PanelResizeHandle: (props) => {
    const React = require('react');
    const { onDragging, onMouseDown, onMouseUp, onPointerUp, ...rest } = props;
    return React.createElement('div', {
      ...rest,
      onMouseDown: (event) => {
        onDragging?.(true);
        onMouseDown?.(event);
      },
      onMouseUp: (event) => {
        onDragging?.(false);
        onMouseUp?.(event);
      },
      onPointerUp: (event) => {
        onDragging?.(false);
        onPointerUp?.(event);
      },
    });
  },
}));

jest.mock('@tauri-apps/api/core', () => ({
  invoke: (...args) => mockInvoke(...args),
}));

jest.mock('@tauri-apps/api/event', () => ({
  listen: (...args) => mockListen(...args),
}));

jest.mock('../TerminalTTY', () => ({
  __esModule: true,
  default: ({
    id,
    isVisibleInLayout = true,
    suspendNativeSurface,
    nativeSurfacePolicy = 'live',
  }) => {
    const React = require('react');
    return React.createElement('div', { 'data-testid': `terminal-${id}` }, [
      React.createElement('span', { key: 'id' }, id),
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
        { key: 'policy', 'data-testid': `terminal-native-policy-${id}` },
        nativeSurfacePolicy
      ),
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

jest.mock('@/components/pizarra/PizarraPane', () => ({
  __esModule: true,
  default: () => {
    const React = require('react');
    return React.createElement('div', { 'data-testid': 'pizarra-pane' }, 'pizarra');
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

let sharedEditorPaneMountCount = 0;
let sharedEditorPaneUnmountCount = 0;

jest.mock(
  '../workspace/FileExplorerEditorPane',
  () => ({
    __esModule: true,
    default: ({ workspaceId }) => {
      const React = require('react');

      React.useEffect(() => {
        sharedEditorPaneMountCount += 1;
        return () => {
          sharedEditorPaneUnmountCount += 1;
        };
      }, []);

      return React.createElement(
        'div',
        {
          'data-testid': 'shared-editor-pane',
          'data-workspace-id': workspaceId || 'missing-workspace-id',
        },
        React.createElement('div', { 'data-testid': 'editor-pane-title' }, 'Workspace files')
      );
    },
  }),
  { virtual: true }
);

jest.mock(
  '../workspace/WorkspaceBridgePane',
  () => ({
    __esModule: true,
    default: ({ dockState }) => {
      const React = require('react');
      return React.createElement(
        'div',
        { 'data-testid': 'shared-bridge-pane' },
        React.createElement(
          'div',
          { 'data-testid': 'bridge-pane-url' },
          dockState?.browserUrl || 'no-url'
        )
      );
    },
  }),
  { virtual: true }
);

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

const TerminalWorkspacesManagerModule = require('../TerminalWorkspacesManager');
const TerminalWorkspacesManager = TerminalWorkspacesManagerModule.default;
const { resolveMeasuredRightDockBounds, resolveRightDockLayerStyle } =
  TerminalWorkspacesManagerModule;
const { applyRightDockLayerBounds } = require('../terminal/rightDockLayerSync');

function installDom() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://devhub.test',
  });

  global.window = dom.window;
  global.document = dom.window.document;
  global.navigator = dom.window.navigator;
  global.CustomEvent = dom.window.CustomEvent;
  global.HTMLElement = dom.window.HTMLElement;
  global.Node = dom.window.Node;
  global.MouseEvent = dom.window.MouseEvent;
  global.Event = dom.window.Event;
  global.localStorage = dom.window.localStorage;

  return dom;
}

function getVisibleWorkspaceShell(container) {
  return (
    Array.from(container.querySelectorAll('[data-testid^="workspace-shell-"]')).find(
      (node) => node.getAttribute('data-ws-active') === 'true'
    ) || null
  );
}

const mountedRoots = [];

async function flushEffects() {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function renderIntoDom(element) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.push({ root, container });

  flushSync(() => {
    root.render(element);
  });
  await flushEffects();
  return { container };
}

async function click(element) {
  flushSync(() => {
    element.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  });
  await flushEffects();
}

async function confirmNewWorkspaceSetup(count = 1) {
  const modal = document.querySelector('[data-testid="workspace-terminal-setup-modal"]');
  expect(modal).not.toBeNull();
  if (count !== 1) {
    const preset = document.querySelector(
      `[data-testid="workspace-terminal-count-preset-${count}"]`
    );
    expect(preset).not.toBeNull();
    await click(preset);
  }
  const confirm = document.querySelector('[data-testid="workspace-terminal-setup-confirm"]');
  expect(confirm).not.toBeNull();
  await click(confirm);
}

async function changeInput(element, value) {
  const valueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value'
  )?.set;

  flushSync(() => {
    valueSetter?.call(element, value);
    element.dispatchEvent(new window.Event('input', { bubbles: true }));
    element.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
  await flushEffects();
}

async function submitForm(element) {
  flushSync(() => {
    element.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  });
  await flushEffects();
}

describe('TerminalWorkspacesManager right dock', () => {
  let dom;
  let consoleErrorSpy;

  beforeEach(() => {
    dom = installDom();
    window.localStorage.clear();
    delete window.__TAURI_INTERNALS__;
    consoleErrorSpy = jest.spyOn(console, 'error');
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    sharedEditorPaneMountCount = 0;
    sharedEditorPaneUnmountCount = 0;
    mockInvoke.mockReset();
    mockListen.mockReset();
  });

  afterEach(() => {
    while (mountedRoots.length > 0) {
      const { root, container } = mountedRoots.pop();
      flushSync(() => {
        root.unmount();
      });
      container.remove();
    }

    consoleErrorSpy?.mockRestore();
    dom.window.close();
    delete global.localStorage;
    delete global.fetch;
    jest.clearAllMocks();
  });

  test('keeps terminal-only layout by default and exposes dock tab controls without PageHeader', async () => {
    const view = await renderIntoDom(
      React.createElement(TerminalWorkspacesManager, {
        cwd: '/workspace/devhub',
        isVisible: true,
        projectId: 'project-1',
      })
    );

    expect(view.container.textContent).not.toContain('Terminals');
    expect(view.container.querySelector('[data-testid="workspace-right-dock"]')).toBeNull();
    expect(view.container.querySelector('[data-testid="right-dock-toggle"]')).toBeNull();
    expect(view.container.querySelector('[data-testid="right-dock-tab-browser"]')).not.toBeNull();
    expect(view.container.querySelector('[data-testid="right-dock-tab-editor"]')).not.toBeNull();
    expect(
      view.container.querySelector('[data-testid="workspace-right-dock-maximize"]')
    ).toBeNull();
  });

  test('browser tab shows the dock shell and keeps the switch in the top toolbar', async () => {
    const view = await renderIntoDom(
      React.createElement(TerminalWorkspacesManager, {
        cwd: '/workspace/devhub',
        isVisible: true,
        projectId: 'project-1',
      })
    );

    await click(view.container.querySelector('[data-testid="right-dock-tab-browser"]'));
    expect(view.container.querySelector('[data-testid="workspace-right-dock"]')).not.toBeNull();
    expect(
      view.container.querySelector('[data-testid="workspace-right-dock-shell"]')
    ).not.toBeNull();
    expect(
      view.container.querySelector('[data-testid="workspace-right-dock-description"]')
    ).toBeNull();
    expect(view.container.querySelector('[data-testid="workspace-browser-pane"]')).not.toBeNull();
    expect(
      view.container.querySelector('[data-testid="browser-toggle-workspace-maximize"]')
    ).not.toBeNull();
  });

  test('opening right dock browser side-by-side keeps native terminal policy live', async () => {
    const view = await renderIntoDom(
      React.createElement(TerminalWorkspacesManager, {
        cwd: '/workspace/devhub',
        isVisible: true,
        projectId: 'project-1',
      })
    );

    expect(
      view.container.querySelector('[data-testid="terminal-native-policy-p1"]')?.textContent
    ).toBe('live');

    await click(view.container.querySelector('[data-testid="right-dock-tab-browser"]'));

    expect(view.container.querySelector('[data-testid="terminal-suspend-p1"]')?.textContent).toBe(
      'live'
    );
    expect(
      view.container.querySelector('[data-testid="terminal-native-policy-p1"]')?.textContent
    ).toBe('live');

    await click(view.container.querySelector('[data-testid="right-dock-tab-browser"]'));

    expect(view.container.querySelector('[data-testid="terminal-suspend-p1"]')?.textContent).toBe(
      'live'
    );
    expect(
      view.container.querySelector('[data-testid="terminal-native-policy-p1"]')?.textContent
    ).toBe('live');
  });

  test('pizarra fullscreen marks workspace terminals hidden in layout so native layers can disappear', async () => {
    // Force shared-view flag OFF for this test so ModeTransitionShell is no-op and
    // dockBody (incl pizarra) is returned directly — guarantees the pizarra-pane testid
    // is queryable without AnimatePresence passthrough quirks in the jsdom framer mock.
    const prev = process.env.NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE;
    process.env.NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE = '0';
    try {
      // reset cached flag
      try {
        const flagMod = require('@/lib/pizarra/featureFlag');
        flagMod._resetFlagForTests?.();
      } catch {}
      const view = await renderIntoDom(
        React.createElement(TerminalWorkspacesManager, {
          cwd: '/workspace/devhub',
          isVisible: true,
          projectId: 'project-1',
        })
      );

      expect(view.container.querySelector('[data-testid="terminal-visible-p1"]')?.textContent).toBe(
        'visible'
      );
      expect(view.container.querySelector('[data-testid="terminal-suspend-p1"]')?.textContent).toBe(
        'live'
      );

      await click(view.container.querySelector('[data-testid="pizarra-mode-switch"]'));

      // pizarra visibility: after toggle to pizarra mode the pane (with its tool palette buttons)
      // must be present in the DOM. The host wrapper provides relative + size for the absolute
      // canvas + palette inside PizarraPane. Prevents the "submarino blank, no buttons" UX.
      expect(view.container.querySelector('[data-testid="pizarra-pane"]')).not.toBeNull();
      expect(view.container.querySelector('[data-testid="pizarra-host"]')).not.toBeNull();

      expect(view.container.querySelector('[data-testid="terminal-visible-p1"]')?.textContent).toBe(
        'hidden'
      );
      expect(view.container.querySelector('[data-testid="terminal-suspend-p1"]')?.textContent).toBe(
        'live'
      );
      expect(
        view.container.querySelector('[data-testid="terminal-native-policy-p1"]')?.textContent
      ).toBe('live');

      await click(view.container.querySelector('[data-testid="pizarra-mode-switch"]'));

      expect(view.container.querySelector('[data-testid="terminal-visible-p1"]')?.textContent).toBe(
        'visible'
      );
    } finally {
      if (prev === undefined) delete process.env.NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE;
      else process.env.NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE = prev;
      try {
        const flagMod = require('@/lib/pizarra/featureFlag');
        flagMod._resetFlagForTests?.();
      } catch {}
    }
  });

  test('opening swarm wizard suspends native terminal surfaces and renders modal above the terminal layer', async () => {
    const view = await renderIntoDom(
      React.createElement(TerminalWorkspacesManager, {
        cwd: '/workspace/devhub',
        isVisible: true,
        projectId: 'project-1',
      })
    );

    expect(view.container.querySelector('[data-testid="terminal-suspend-p1"]')?.textContent).toBe(
      'live'
    );
    expect(document.getElementById('devhub-hide-next-dev-overlay-on-terminals')).not.toBeNull();

    await click(view.container.querySelector('[data-testid="workspace-swarm-launch-button"]'));

    expect(view.container.querySelector('[data-testid="terminal-suspend-p1"]')?.textContent).toBe(
      'live'
    );
    expect(
      view.container.querySelector('[data-testid="terminal-native-policy-p1"]')?.textContent
    ).toBe('live');
    expect(document.body.textContent).toContain('Asistente de lanzamiento');
  });

  test('shows active swarm summary without End swarm button (close workspace to terminate)', async () => {
    window.localStorage.setItem(
      'devhub_agent_runs',
      JSON.stringify({
        'launch-1:director': {
          panelId: 'p1',
          taskId: 'launch-1:director',
          taskTitle: 'Terminal swarm · Director',
          launchOrigin: 'swarm-control-launch',
          launchedAt: 100,
        },
      })
    );

    global.fetch = jest.fn((url, options) => {
      if (url === '/api/swarm/runtime-diagnostics') {
        return Promise.resolve({ ok: true, json: async () => ({}) });
      }
      if (url === '/api/agenthub/operations/health') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            terminate_result: { launchId: 'launch-1', terminated: true },
            control_room_snapshot_input: {
              mission_control: { mission: { mission_id: 'launch-1' } },
            },
          }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    const view = await renderIntoDom(
      React.createElement(TerminalWorkspacesManager, {
        cwd: '/workspace/devhub',
        isVisible: true,
        projectId: 'project-1',
      })
    );

    expect(
      view.container.querySelector('[data-testid="workspace-swarm-active-summary"]')?.textContent
    ).toContain('Terminal swarm');
    expect(
      view.container.querySelector('[data-testid="workspace-swarm-terminate-button"]')
    ).toBeNull();
  });

  test('shows active swarm summary from cached control snapshot when devhub_agent_runs is empty', async () => {
    window.localStorage.removeItem('devhub_agent_runs');
    window.localStorage.setItem(
      'devhub_swarm_control_snapshot:project-1',
      JSON.stringify({
        mission_control: {
          mission: {
            mission_id: 'launch-cached-123',
            title: 'Cached Swarm Title',
            status: 'active',
          },
        },
      })
    );

    global.fetch = jest.fn((url, options) => {
      if (url === '/api/swarm/runtime-diagnostics') {
        return Promise.resolve({ ok: true, json: async () => ({}) });
      }
      if (url.startsWith('/api/agenthub/operations/health')) {
        if (options?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              terminate_result: { launchId: 'launch-cached-123', terminated: true },
              control_room_snapshot_input: {
                mission_control: { mission: { status: 'terminated' } },
              },
            }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({
            control_room_snapshot_input: {
              mission_control: {
                mission: {
                  mission_id: 'launch-cached-123',
                  title: 'Cached Swarm Title',
                  status: 'active',
                },
              },
            },
          }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    const view = await renderIntoDom(
      React.createElement(TerminalWorkspacesManager, {
        cwd: '/workspace/devhub',
        isVisible: true,
        projectId: 'project-1',
      })
    );

    expect(
      view.container.querySelector('[data-testid="workspace-swarm-active-summary"]')?.textContent
    ).toContain('Cached Swarm Title');
    expect(
      view.container.querySelector('[data-testid="workspace-swarm-terminate-button"]')
    ).toBeNull();
  });

  test('batches swarm runtime requests into a dedicated workspace instead of replacing the same split', async () => {
    const view = await renderIntoDom(
      React.createElement(TerminalWorkspacesManager, {
        cwd: '/workspace/devhub',
        isVisible: true,
        projectId: 'project-1',
      })
    );

    // Capture the batch deadline timer so we can fire it manually
    let batchDeadlineCallback = null;
    const origSetTimeout = window.setTimeout;
    const setTimeoutSpy = jest.spyOn(window, 'setTimeout').mockImplementation((fn, delay) => {
      if (delay === 4500) {
        batchDeadlineCallback = fn;
        return origSetTimeout(() => {}, 0); // dummy timer ID
      }
      return origSetTimeout(fn, delay);
    });

    try {
      ['director', 'coder', 'auditor', 'devops', 'architect'].forEach((role) => {
        window.dispatchEvent(
          new window.CustomEvent('devhub:run-agent', {
            detail: {
              taskId: `launch-1:${role}`,
              selectedAgent: 'opencode',
              command: `opencode --prompt ${role}`,
              launchOrigin: 'swarm-control-launch',
              taskTitle: `Lanzar Arranque limpio guiado · ${role}`,
              launchId: 'launch-1',
              roleKey: role,
            },
          })
        );
      });

      await flushEffects();
      await flushEffects();

      // Before firing deadline: no workspace created yet
      const visibleShellBefore = getVisibleWorkspaceShell(view.container);
      expect(visibleShellBefore?.querySelectorAll('[data-testid^="terminal-p"]')).toHaveLength(1);

      // Fire the batch deadline to flush all accumulated requests
      if (batchDeadlineCallback) batchDeadlineCallback();
      await flushEffects();
      await flushEffects();

      const visibleShell = getVisibleWorkspaceShell(view.container);
      expect(visibleShell?.querySelectorAll('[data-testid^="terminal-p"]')).toHaveLength(5);
      expect(view.container.textContent).toContain('Lanzar Arranque limpio guiado');

      const persistedRuns = JSON.parse(window.localStorage.getItem('devhub_agent_runs') || '{}');
      expect(Object.keys(persistedRuns)).toHaveLength(5);
    } finally {
      setTimeoutSpy.mockRestore();
    }
  });

  test('materializes all swarm panels in one workspace from a single launch event', async () => {
    const { SWARM_LAUNCH_MATERIALIZED_EVENT } = require('@/lib/terminal/swarmLaunchBatch');
    const view = await renderIntoDom(
      React.createElement(TerminalWorkspacesManager, {
        cwd: '/workspace/devhub',
        isVisible: true,
        projectId: 'project-1',
      })
    );

    const runtimeRequests = [
      'zed',
      'sdd_worker_1',
      'sdd_worker_2',
      'sdd_worker_3',
      'sdd_worker_4',
    ].map((roleKey, index) => ({
      taskId: `launch-mat:${roleKey}`,
      selectedAgent: 'opencode',
      command: `opencode --prompt ${roleKey}`,
      launchOrigin: 'swarm-control-launch',
      taskTitle: `ZED Pod · ${roleKey}`,
      launchId: 'launch-mat',
      roleKey,
      startAfterMs: 0,
      workerBootstrapDelayMs: index === 0 ? 0 : 2000 + (index - 1) * 750,
    }));

    window.dispatchEvent(
      new window.CustomEvent(SWARM_LAUNCH_MATERIALIZED_EVENT, {
        detail: { runtimeRequests },
      })
    );

    await flushEffects();
    await flushEffects();

    const visibleShell = getVisibleWorkspaceShell(view.container);
    expect(visibleShell?.querySelectorAll('[data-testid^="terminal-p"]')).toHaveLength(5);
    expect(view.container.textContent).toContain('ZED Pod');

    const columnContainers = visibleShell?.querySelectorAll('[data-testid^="workspace-column-c"]');
    expect(columnContainers.length).toBeGreaterThanOrEqual(3);
  });

  test('preserves 3-column layout when director arrives first and workers arrive later (two-phase dispatch)', async () => {
    const view = await renderIntoDom(
      React.createElement(TerminalWorkspacesManager, {
        cwd: '/workspace/devhub',
        isVisible: true,
        projectId: 'project-1',
      })
    );

    let batchDeadlineCallback = null;
    const origSetTimeout = window.setTimeout;
    const setTimeoutSpy = jest.spyOn(window, 'setTimeout').mockImplementation((fn, delay) => {
      if (delay === 4500) {
        batchDeadlineCallback = fn;
        return origSetTimeout(() => {}, 0);
      }
      return origSetTimeout(fn, delay);
    });

    try {
      // Phase 1: director arrives immediately (simulates startAfterMs: 0)
      window.dispatchEvent(
        new window.CustomEvent('devhub:run-agent', {
          detail: {
            taskId: 'launch-2:director',
            selectedAgent: 'opencode',
            command: 'opencode --prompt director',
            launchOrigin: 'swarm-control-launch',
            taskTitle: 'Lanzar Arranque limpio guiado · director',
            launchId: 'launch-2',
            roleKey: 'director',
            startAfterMs: 0,
          },
        })
      );

      await flushEffects();

      // Director is buffered, no workspace yet
      const shellAfterDirector = getVisibleWorkspaceShell(view.container);
      expect(shellAfterDirector?.querySelectorAll('[data-testid^="terminal-p"]')).toHaveLength(1);

      // Phase 2: workers arrive later (simulates deferred fanout batch)
      ['coder', 'auditor', 'devops', 'architect'].forEach((role) => {
        window.dispatchEvent(
          new window.CustomEvent('devhub:run-agent', {
            detail: {
              taskId: `launch-2:${role}`,
              selectedAgent: 'opencode',
              command: `opencode --prompt ${role}`,
              launchOrigin: 'swarm-control-launch',
              taskTitle: `Lanzar Arranque limpio guiado · ${role}`,
              launchId: 'launch-2',
              roleKey: role,
              startAfterMs: 0,
            },
          })
        );
      });

      await flushEffects();

      // Still buffered, no flush yet
      expect(batchDeadlineCallback).not.toBeNull();

      // Fire deadline — all 5 roles should be in one batch
      batchDeadlineCallback();
      await flushEffects();
      await flushEffects();

      const visibleShell = getVisibleWorkspaceShell(view.container);
      // 3-column layout: 5 panels total with director in its own column
      expect(visibleShell?.querySelectorAll('[data-testid^="terminal-p"]')).toHaveLength(5);
      expect(view.container.textContent).toContain('Lanzar Arranque limpio guiado');

      // Verify 3 columns exist (director + 2 worker columns)
      const columnContainers = visibleShell?.querySelectorAll(
        '[data-testid^="workspace-column-c"]'
      );
      expect(columnContainers.length).toBeGreaterThanOrEqual(3);
    } finally {
      setTimeoutSpy.mockRestore();
    }
  });

  test('opening right dock editor side-by-side keeps native terminal policy live without mutating fullscreen state', async () => {
    const view = await renderIntoDom(
      React.createElement(TerminalWorkspacesManager, {
        cwd: '/workspace/devhub',
        isVisible: true,
        projectId: 'project-1',
      })
    );

    await click(view.container.querySelector('[data-testid="right-dock-tab-browser"]'));
    await click(view.container.querySelector('[data-testid="right-dock-tab-editor"]'));

    expect(
      view.container.querySelector('[data-testid="terminal-native-policy-p1"]')?.textContent
    ).toBe('live');
    expect(
      view.container.querySelector('[data-testid="workspace-right-dock-panel"]')
    ).not.toBeNull();
  });

  test('dock tab buttons toggle visibility when pressing the same tab twice', async () => {
    const view = await renderIntoDom(
      React.createElement(TerminalWorkspacesManager, {
        cwd: '/workspace/devhub',
        isVisible: true,
        projectId: 'project-1',
      })
    );

    await click(view.container.querySelector('[data-testid="right-dock-tab-browser"]'));
    expect(view.container.querySelector('[data-testid="workspace-right-dock"]')).not.toBeNull();
    expect(view.container.querySelector('[data-testid="workspace-browser-pane"]')).not.toBeNull();

    await click(view.container.querySelector('[data-testid="right-dock-tab-browser"]'));
    expect(view.container.querySelector('[data-testid="workspace-right-dock-panel"]')).toBeNull();

    await click(view.container.querySelector('[data-testid="right-dock-tab-editor"]'));
    expect(view.container.querySelector('[data-testid="workspace-right-dock"]')).not.toBeNull();
    expect(view.container.querySelector('[data-testid="shared-editor-pane"]')).not.toBeNull();

    await click(view.container.querySelector('[data-testid="right-dock-tab-editor"]'));
    expect(view.container.querySelector('[data-testid="workspace-right-dock-panel"]')).toBeNull();

    await click(view.container.querySelector('[data-testid="right-dock-tab-swarm"]'));
    expect(view.container.querySelector('[data-testid="workspace-right-dock"]')).not.toBeNull();
    expect(view.container.querySelector('[data-testid="workspace-swarm-pane"]')).not.toBeNull();

    await click(view.container.querySelector('[data-testid="right-dock-tab-swarm"]'));
    expect(view.container.querySelector('[data-testid="workspace-right-dock-panel"]')).toBeNull();
  });

  test('switching to editor reveals the shared pane with contextual subtitle', async () => {
    const view = await renderIntoDom(
      React.createElement(TerminalWorkspacesManager, {
        cwd: '/workspace/devhub',
        isVisible: true,
        projectId: 'project-1',
      })
    );

    await click(view.container.querySelector('[data-testid="right-dock-tab-browser"]'));
    await click(view.container.querySelector('[data-testid="right-dock-tab-editor"]'));
    expect(view.container.querySelector('[data-testid="shared-editor-pane"]')).not.toBeNull();
    expect(
      view.container.querySelector('[data-testid="editor-pane-title"]')?.textContent
    ).toContain('Workspace files');
  });

  test('legacy bridge state hydrates as browser edit mode and persists normalized state', async () => {
    window.localStorage.setItem(
      buildRightDockStorageKey('project-1', 'ws1'),
      JSON.stringify({
        visible: true,
        activeTab: 'bridge',
        maximized: false,
        size: 38,
        browserUrl: 'http://localhost:4173/',
        browserHistory: ['http://localhost:4173/'],
        browserHistoryIndex: 0,
      })
    );

    const view = await renderIntoDom(
      React.createElement(TerminalWorkspacesManager, {
        cwd: '/workspace/devhub',
        isVisible: true,
        projectId: 'project-1',
      })
    );

    await flushEffects();

    expect(view.container.querySelector('[data-testid="workspace-browser-pane"]')).not.toBeNull();
    const iframeSrc =
      view.container.querySelector('[data-testid="browser-iframe"]')?.getAttribute('src') || '';
    expect(iframeSrc).toContain('/api/preview-proxy/?url=');
    expect(iframeSrc).toContain('http%3A%2F%2Flocalhost%3A4173%2F');
    expect(view.container.querySelector('[data-testid="browser-edit-toggle"]')).not.toBeNull();
    expect(view.container.querySelector('[data-testid="bridge-selection-summary"]')).not.toBeNull();

    const persistedState = JSON.parse(
      window.localStorage.getItem(buildRightDockStorageKey('project-1', 'ws1'))
    );
    expect(persistedState.activeTab).toBe('browser');
    expect(persistedState.editMode).toBe(true);
  });

  test('rehydrates persisted visible editor dock state for the same project', async () => {
    window.localStorage.setItem(
      buildRightDockStorageKey('project-1', 'ws1'),
      JSON.stringify({
        visible: true,
        activeTab: 'editor',
        maximized: false,
        size: 44,
        browserUrl: 'http://localhost:4173/',
        browserHistory: ['http://localhost:3200/', 'http://localhost:4173/'],
        browserHistoryIndex: 1,
      })
    );

    const view = await renderIntoDom(
      React.createElement(TerminalWorkspacesManager, {
        cwd: '/workspace/devhub',
        isVisible: true,
        projectId: 'project-1',
      })
    );

    expect(view.container.querySelector('[data-testid="workspace-right-dock"]')).not.toBeNull();
    expect(view.container.querySelector('[data-testid="shared-editor-pane"]')).not.toBeNull();
    expect(
      view.container
        .querySelector('[data-testid="workspace-right-dock-panel"]')
        ?.getAttribute('data-panel-size')
    ).toBe('44');
  });

  test('right dock visibility and tab state stay isolated per workspace', async () => {
    const view = await renderIntoDom(
      React.createElement(TerminalWorkspacesManager, {
        cwd: '/workspace/devhub',
        isVisible: true,
        projectId: 'project-1',
      })
    );

    await click(view.container.querySelector('[data-testid="right-dock-tab-browser"]'));
    await click(view.container.querySelector('[data-testid="right-dock-tab-editor"]'));
    expect(view.container.querySelector('[data-testid="workspace-right-dock"]')).not.toBeNull();
    expect(view.container.querySelector('[data-testid="shared-editor-pane"]')).not.toBeNull();

    await click(view.container.querySelector('[data-testid="workspace-add-button"]'));
    await confirmNewWorkspaceSetup(1);
    await flushEffects();

    expect(view.container.querySelector('[data-testid="workspace-right-dock"]')).not.toBeNull();
    expect(
      view.container
        .querySelector('[data-testid="workspace-right-dock-layer"]')
        ?.getAttribute('data-dock-layer-visible')
    ).toBe('false');

    await click(view.container.querySelector('[title="Workspace 1"]'));
    await flushEffects();

    expect(view.container.querySelector('[data-testid="workspace-right-dock"]')).not.toBeNull();
    expect(view.container.querySelector('[data-testid="shared-editor-pane"]')).not.toBeNull();

    const ws1State = JSON.parse(
      window.localStorage.getItem(buildRightDockStorageKey('project-1', 'ws1'))
    );
    const ws2State = JSON.parse(
      window.localStorage.getItem(buildRightDockStorageKey('project-1', 'ws2'))
    );

    expect(ws1State.visible).toBe(true);
    expect(ws1State.activeTab).toBe('editor');
    expect(ws2State.visible).toBe(false);
  });

  test('switching to a new workspace keeps a hidden native browser from staying visible on top', async () => {
    window.__TAURI_INTERNALS__ = {};
    mockInvoke.mockImplementation(async (command) => {
      if (command === 'native_browser_probe') {
        return {
          ready: true,
          reason: null,
          persistentProfile: true,
          capabilities: { persistentProfile: true, selector: { inspect: true } },
        };
      }
      if (command === 'native_browser_open') return { opened: true, reason: null };
      if (command === 'native_browser_load_url') return { loaded: true, reason: null };
      return null;
    });

    window.localStorage.setItem(
      buildRightDockStorageKey('project-1', 'ws1'),
      JSON.stringify({
        visible: true,
        activeTab: 'browser',
        browserRuntime: 'native-gtk',
        maximized: false,
        maximizedView: 'browser',
        browserUrl: 'https://example.com',
        browserHistory: ['https://example.com'],
        browserHistoryIndex: 0,
      })
    );

    const view = await renderIntoDom(
      React.createElement(TerminalWorkspacesManager, {
        cwd: '/workspace/devhub',
        isVisible: true,
        projectId: 'project-1',
      })
    );

    await flushEffects();
    mockInvoke.mockClear();

    await click(view.container.querySelector('[data-testid="workspace-add-button"]'));
    await confirmNewWorkspaceSetup(1);

    expect(mockInvoke).toHaveBeenCalledWith('native_browser_set_visibility', {
      request: expect.objectContaining({
        panelId: 'browser-project-1-ws1',
        visible: false,
      }),
    });
    const activeShell = getVisibleWorkspaceShell(view.container);
    expect(activeShell.querySelector('[data-testid="workspace-browser-pane"]')).toBeNull();
  });

  test('keeps a single shared editor dock mounted while switching ws1 → ws2 → ws1', async () => {
    const view = await renderIntoDom(
      React.createElement(TerminalWorkspacesManager, {
        cwd: '/workspace/devhub',
        isVisible: true,
        projectId: 'project-1',
      })
    );

    await click(view.container.querySelector('[data-testid="right-dock-tab-browser"]'));
    await click(view.container.querySelector('[data-testid="right-dock-tab-editor"]'));

    const editorPane = view.container.querySelector('[data-testid="shared-editor-pane"]');
    expect(editorPane).not.toBeNull();
    expect(editorPane?.getAttribute('data-workspace-id')).toBe('ws1');
    expect(view.container.querySelectorAll('[data-testid="shared-editor-pane"]')).toHaveLength(1);
    expect(
      view.container.querySelectorAll('[data-testid="workspace-right-dock-layer"]')
    ).toHaveLength(1);

    await click(view.container.querySelector('[data-testid="workspace-add-button"]'));
    await confirmNewWorkspaceSetup(1);
    await flushEffects();

    const editorPaneAfterAdd = view.container.querySelector('[data-testid="shared-editor-pane"]');
    expect(editorPaneAfterAdd).toBe(editorPane);
    expect(editorPaneAfterAdd?.getAttribute('data-workspace-id')).toBe('ws2');
    expect(view.container.querySelectorAll('[data-testid="shared-editor-pane"]')).toHaveLength(1);
    expect(
      view.container.querySelectorAll('[data-testid="workspace-right-dock-layer"]')
    ).toHaveLength(1);

    await click(view.container.querySelector('[title="Workspace 1"]'));
    await flushEffects();

    const editorPaneAfterReturn = view.container.querySelector(
      '[data-testid="shared-editor-pane"]'
    );
    expect(editorPaneAfterReturn).toBe(editorPane);
    expect(editorPaneAfterReturn?.getAttribute('data-workspace-id')).toBe('ws1');
    expect(sharedEditorPaneMountCount).toBe(1);
    expect(sharedEditorPaneUnmountCount).toBe(0);
  });

  test('tracks dedicated browser state without visible workspace-tab badges', async () => {
    window.localStorage.setItem(
      buildBrowserWindowStorageKey('project-1'),
      JSON.stringify({
        ws1: {
          open: true,
          label: buildBrowserWindowLabel('project-1', 'ws1'),
          url: 'http://localhost:4173/',
          updatedAt: Date.now(),
        },
      })
    );

    const view = await renderIntoDom(
      React.createElement(TerminalWorkspacesManager, {
        cwd: '/workspace/devhub',
        isVisible: true,
        projectId: 'project-1',
      })
    );

    const tabIndicator = view.container.querySelector(
      '[data-testid="workspace-browser-indicator-ws1"]'
    );
    expect(tabIndicator).not.toBeNull();
    // Must not paint the old emerald badge/chip on the workspace strip.
    expect(tabIndicator?.closest('.sr-only')).not.toBeNull();
    expect(tabIndicator?.className || '').not.toMatch(/bg-emerald/);
    expect(
      view.container.querySelector('[data-testid="right-dock-tab-browser-indicator"]')
    ).not.toBeNull();

    await click(view.container.querySelector('[data-testid="workspace-browser-close-ws1"]'));

    expect(
      view.container.querySelector('[data-testid="workspace-browser-indicator-ws1"]')
    ).toBeNull();
    expect(view.container.querySelector('[data-testid="workspace-browser-close-ws1"]')).toBeNull();
    expect(
      view.container.querySelector('[data-testid="right-dock-tab-browser-indicator"]')
    ).toBeNull();

    const persisted = JSON.parse(
      window.localStorage.getItem(buildBrowserWindowStorageKey('project-1'))
    );
    expect(persisted.ws1.open).toBe(false);
    expect(persisted.ws1.url).toBe('');
  });

  test('browser tab submits localhost urls, navigates back-forward, and reload remounts the iframe', async () => {
    const view = await renderIntoDom(
      React.createElement(TerminalWorkspacesManager, {
        cwd: '/workspace/devhub',
        isVisible: true,
        projectId: 'project-1',
      })
    );

    await click(view.container.querySelector('[data-testid="right-dock-tab-browser"]'));

    const urlInput = view.container.querySelector('[data-testid="browser-url-input"]');
    await changeInput(urlInput, '4173');
    await submitForm(view.container.querySelector('[data-testid="workspace-browser-pane"] form'));

    const firstIframe = view.container.querySelector('[data-testid="browser-iframe"]');
    expect(firstIframe?.getAttribute('src')).toBe('http://localhost:4173/');

    await changeInput(urlInput, 'localhost:52827/#community');
    await submitForm(view.container.querySelector('[data-testid="workspace-browser-pane"] form'));

    const iframeAfterNavigation = view.container.querySelector('[data-testid="browser-iframe"]');
    expect(iframeAfterNavigation).toBe(firstIframe);
    expect(iframeAfterNavigation?.getAttribute('src')).toBe('http://localhost:52827/#community');

    await click(view.container.querySelector('[data-testid="browser-back"]'));
    expect(view.container.querySelector('[data-testid="browser-iframe"]')).toBe(firstIframe);
    expect(
      view.container.querySelector('[data-testid="browser-iframe"]')?.getAttribute('src')
    ).toBe('http://localhost:4173/');

    await click(view.container.querySelector('[data-testid="browser-forward"]'));
    expect(view.container.querySelector('[data-testid="browser-iframe"]')).toBe(firstIframe);
    expect(
      view.container.querySelector('[data-testid="browser-iframe"]')?.getAttribute('src')
    ).toBe('http://localhost:52827/#community');

    const iframeBeforeReload = view.container.querySelector('[data-testid="browser-iframe"]');
    await click(view.container.querySelector('[data-testid="browser-reload"]'));
    const iframeAfterReload = view.container.querySelector('[data-testid="browser-iframe"]');

    expect(iframeAfterReload).not.toBe(iframeBeforeReload);
    expect(iframeAfterReload?.getAttribute('src')).toBe('http://localhost:52827/#community');

    const persistedState = JSON.parse(
      window.localStorage.getItem(buildRightDockStorageKey('project-1', 'ws1'))
    );
    expect(persistedState.browserHistory).toEqual([
      // Fresh dock home resolves to the live origin (JSDOM: https://devhub.test/),
      // no longer the legacy localhost:3200 default.
      'https://devhub.test/',
      'http://localhost:4173/',
      'http://localhost:52827/#community',
    ]);
    expect(persistedState.browserHistoryIndex).toBe(2);
  });

  test('does not preemptively block localhost:3100 with framing warning', async () => {
    const view = await renderIntoDom(
      React.createElement(TerminalWorkspacesManager, {
        cwd: '/workspace/devhub',
        isVisible: true,
        projectId: 'project-1',
      })
    );

    await click(view.container.querySelector('[data-testid="right-dock-tab-browser"]'));
    await changeInput(
      view.container.querySelector('[data-testid="browser-url-input"]'),
      'http://localhost:3100/'
    );
    await submitForm(view.container.querySelector('[data-testid="workspace-browser-pane"] form'));

    expect(view.container.querySelector('[data-testid="browser-frame-warning"]')).toBeNull();
    expect(view.container.querySelector('[data-testid="browser-iframe"]')).not.toBeNull();
  });

  test('browser pane uses an isolated solid viewport shell for smoother embedded rendering', async () => {
    const view = await renderIntoDom(
      React.createElement(TerminalWorkspacesManager, {
        cwd: '/workspace/devhub',
        isVisible: true,
        projectId: 'project-1',
      })
    );

    await click(view.container.querySelector('[data-testid="right-dock-tab-browser"]'));

    const toolbar = view.container.querySelector('[data-testid="workspace-browser-toolbar"]');
    const viewportShell = view.container.querySelector('[data-testid="browser-viewport-shell"]');

    expect(toolbar).not.toBeNull();
    expect(toolbar.className).not.toContain('backdrop-blur');
    expect(viewportShell).not.toBeNull();
    expect(viewportShell.style.contain).toBe('layout paint size');
    expect(viewportShell.style.isolation).toBe('isolate');
  });

  test('browser toolbar exposes an explicit maximize toggle for workspace-only browser mode', async () => {
    const view = await renderIntoDom(
      React.createElement(TerminalWorkspacesManager, {
        cwd: '/workspace/devhub',
        isVisible: true,
        projectId: 'project-1',
      })
    );

    await click(view.container.querySelector('[data-testid="right-dock-tab-browser"]'));

    const maximizeFromBrowser = view.container.querySelector(
      '[data-testid="browser-toggle-workspace-maximize"]'
    );
    expect(maximizeFromBrowser).not.toBeNull();

    await click(maximizeFromBrowser);
    expect(view.container.querySelector('[data-testid="workspace-right-dock-panel"]')).toBeNull();
    expect(
      view.container.querySelector('[data-testid="workspace-right-dock-layer"]')?.style.width
    ).toBe('100%');

    await click(view.container.querySelector('[data-testid="browser-toggle-workspace-maximize"]'));
    expect(
      view.container.querySelector('[data-testid="workspace-right-dock-panel"]')
    ).not.toBeNull();
    expect(
      view.container.querySelector('[data-testid="workspace-right-dock-layer"]')?.style.width
    ).toBe(`${DEFAULT_RIGHT_DOCK_STATE.size}%`);
  });

  test('keeps the same browser iframe mounted when switching between browser and editor tabs', async () => {
    const view = await renderIntoDom(
      React.createElement(TerminalWorkspacesManager, {
        cwd: '/workspace/devhub',
        isVisible: true,
        projectId: 'project-1',
      })
    );

    await click(view.container.querySelector('[data-testid="right-dock-tab-browser"]'));

    const browserIframe = view.container.querySelector('[data-testid="browser-iframe"]');
    expect(browserIframe).not.toBeNull();

    await click(view.container.querySelector('[data-testid="right-dock-tab-editor"]'));
    expect(document.body.contains(browserIframe)).toBe(true);
    expect(view.container.querySelector('[data-testid="shared-editor-pane"]')).not.toBeNull();

    await click(view.container.querySelector('[data-testid="right-dock-tab-browser"]'));
    expect(view.container.querySelector('[data-testid="browser-iframe"]')).toBe(browserIframe);
  });

  test('keeps the same browser iframe mounted while toggling browser and terminal fullscreen views', async () => {
    const view = await renderIntoDom(
      React.createElement(TerminalWorkspacesManager, {
        cwd: '/workspace/devhub',
        isVisible: true,
        projectId: 'project-1',
      })
    );

    await click(view.container.querySelector('[data-testid="right-dock-tab-browser"]'));
    const browserIframe = view.container.querySelector('[data-testid="browser-iframe"]');

    await click(view.container.querySelector('[data-testid="browser-toggle-workspace-maximize"]'));
    expect(view.container.querySelector('[data-testid="workspace-right-dock-panel"]')).toBeNull();
    expect(view.container.querySelector('[data-testid="browser-iframe"]')).toBe(browserIframe);
    expect(
      view.container.querySelector('[data-testid="workspace-right-dock-layer"]')?.style.width
    ).toBe('100%');

    await click(view.container.querySelector('[data-testid="browser-workspace-window-tab-1"]'));
    expect(view.container.querySelector('[data-testid="workspace-right-dock-panel"]')).toBeNull();
    expect(document.body.contains(browserIframe)).toBe(true);

    await click(view.container.querySelector('[data-testid="panel-tab-browser"]'));
    expect(view.container.querySelector('[data-testid="workspace-right-dock-panel"]')).toBeNull();
    expect(view.container.querySelector('[data-testid="browser-iframe"]')).toBe(browserIframe);
    expect(
      view.container.querySelector('[data-testid="workspace-right-dock-layer"]')?.style.width
    ).toBe('100%');
  });

  test('browser maximized mode exposes workspace window tabs so terminal views remain reachable', async () => {
    const view = await renderIntoDom(
      React.createElement(TerminalWorkspacesManager, {
        cwd: '/workspace/devhub',
        isVisible: true,
        projectId: 'project-1',
      })
    );

    await click(view.container.querySelector('[data-testid="right-dock-tab-browser"]'));
    await click(view.container.querySelector('[data-testid="browser-toggle-workspace-maximize"]'));

    const browserToolbar = view.container.querySelector(
      '[data-testid="workspace-browser-toolbar"]'
    );
    expect(browserToolbar).not.toBeNull();
    expect(browserToolbar.className).toContain('h-11');
    expect(
      view.container.querySelector('[data-testid="browser-workspace-window-selector"]')
    ).not.toBeNull();
    expect(
      view.container.querySelector('[data-testid="browser-workspace-window-tab-1"]')
    ).not.toBeNull();
    expect(
      view.container.querySelector('[data-testid="browser-workspace-window-browser"]')
    ).not.toBeNull();

    await click(view.container.querySelector('[data-testid="browser-workspace-window-add"]'));
    expect(
      view.container.querySelector('[data-testid="browser-workspace-window-tab-2"]')
    ).not.toBeNull();

    await click(view.container.querySelector('[data-testid="browser-workspace-window-tab-2"]'));
    expect(view.container.querySelector('[data-testid="workspace-right-dock-panel"]')).toBeNull();
    const subtabsBar = view.container.querySelector('[data-testid="panel-subtabs-bar"]');
    expect(subtabsBar).not.toBeNull();
    expect(subtabsBar.className).toContain('h-10');
    expect(view.container.querySelector('[data-testid="panel-tab-browser"]')).not.toBeNull();
    expect(view.container.querySelector('[data-testid="panel-tab-p2"]')).not.toBeNull();

    await click(view.container.querySelector('[data-testid="panel-tab-browser"]'));
    expect(view.container.querySelector('[data-testid="workspace-right-dock-panel"]')).toBeNull();
    expect(view.container.querySelector('[data-testid="workspace-browser-pane"]')).not.toBeNull();
  });

  test('rehydrates duplicated workspace window ids with unique replacements before rendering tabs', async () => {
    window.localStorage.setItem(
      'devhub_terminal_state:project-1',
      JSON.stringify({
        workspaces: [
          {
            id: 'ws1',
            name: 'Workspace 1',
            columns: [{ id: 'c1', panels: [{ id: 'p1' }] }],
          },
        ],
        activeWsId: 'ws1',
        activePanelIds: { ws1: 'p1' },
        workspaceWindows: {
          ws1: [
            {
              id: 'v6',
              name: 'V1',
              columns: [{ id: 'c1', panels: [{ id: 'p1' }] }],
              activePanelId: 'p1',
            },
            {
              id: 'v6',
              name: 'V2',
              columns: [{ id: 'c2', panels: [{ id: 'p2' }] }],
              activePanelId: 'p2',
            },
          ],
        },
        activeWindowIds: { ws1: 'v6' },
      })
    );

    const view = await renderIntoDom(
      React.createElement(TerminalWorkspacesManager, {
        cwd: '/workspace/devhub',
        isVisible: true,
        projectId: 'project-1',
      })
    );

    expect(view.container.querySelector('[data-testid="panel-tab-p1"]')).not.toBeNull();
    expect(view.container.querySelector('[data-testid="panel-tab-p2"]')).not.toBeNull();
    await click(view.container.querySelector('[data-testid="panel-subtabs-add"]'));
    expect(view.container.querySelector('[data-testid="panel-tab-p3"]')).not.toBeNull();

    const duplicateKeyWarnings = consoleErrorSpy.mock.calls.filter(([message]) =>
      String(message || '').includes('Encountered two children with the same key')
    );
    expect(duplicateKeyWarnings).toHaveLength(0);
  });

  test('hides the workspace path chip when the subtabs bar gets too narrow and restores it when space returns', async () => {
    const view = await renderIntoDom(
      React.createElement(TerminalWorkspacesManager, {
        cwd: '/home/matias/ArxonLabs/devhub',
        isVisible: true,
        projectId: 'project-1',
      })
    );

    const subtabsBar = view.container.querySelector('[data-testid="panel-subtabs-bar"]');
    expect(subtabsBar).not.toBeNull();

    subtabsBar.getBoundingClientRect = () => ({ width: 980 });
    window.dispatchEvent(new window.Event('resize'));
    await flushEffects();
    expect(view.container.querySelector('[data-testid="panel-subtabs-cwd-chip"]')).not.toBeNull();

    subtabsBar.getBoundingClientRect = () => ({ width: 520 });
    window.dispatchEvent(new window.Event('resize'));
    await flushEffects();
    expect(view.container.querySelector('[data-testid="panel-subtabs-cwd-chip"]')).toBeNull();

    subtabsBar.getBoundingClientRect = () => ({ width: 980 });
    window.dispatchEvent(new window.Event('resize'));
    await flushEffects();
    expect(view.container.querySelector('[data-testid="panel-subtabs-cwd-chip"]')).not.toBeNull();
  });

  test('active tab in right-dock tab strip has 1px accent inner border', async () => {
    const view = await renderIntoDom(
      React.createElement(TerminalWorkspacesManager, {
        cwd: '/workspace/devhub',
        isVisible: true,
        projectId: 'project-1',
      })
    );

    // The browser tab starts as the active tab (default), but is inactive at mount because right dock is hidden.
    const browserTab = view.container.querySelector('[data-testid="right-dock-tab-browser"]');
    expect(browserTab).not.toBeNull();
    expect(browserTab.getAttribute('data-pizarra-active-tab')).toBe('false');
    expect(browserTab.className).not.toContain('outline-inset');

    // Clicking the tab makes it visible and thus active
    await click(browserTab);
    expect(browserTab.getAttribute('data-pizarra-active-tab')).toBe('true');
    // The className includes the outline-inset accent border.
    expect(browserTab.className).toContain('outline-inset');
    expect(browserTab.className).toContain('outline-[var(--accent-primary)]');

    // Inactive tabs (editor) carry data-pizarra-active-tab="false"
    // and do NOT include the outline-inset accent border.
    const editorTab = view.container.querySelector('[data-testid="right-dock-tab-editor"]');
    expect(editorTab).not.toBeNull();
    expect(editorTab.getAttribute('data-pizarra-active-tab')).toBe('false');
    expect(editorTab.className).not.toContain('outline-inset');
  });

  test('inactive tabs in right-dock tab strip do not have accent border', async () => {
    const view = await renderIntoDom(
      React.createElement(TerminalWorkspacesManager, {
        cwd: '/workspace/devhub',
        isVisible: true,
        projectId: 'project-1',
      })
    );

    // Switch to editor so browser becomes inactive.
    await click(view.container.querySelector('[data-testid="right-dock-tab-editor"]'));

    const browserTab = view.container.querySelector('[data-testid="right-dock-tab-browser"]');
    const editorTab = view.container.querySelector('[data-testid="right-dock-tab-editor"]');

    expect(browserTab.getAttribute('data-pizarra-active-tab')).toBe('false');
    expect(browserTab.className).not.toContain('outline-inset');
    expect(editorTab.getAttribute('data-pizarra-active-tab')).toBe('true');
    expect(editorTab.className).toContain('outline-inset');
  });

  test('dock maximize toggles between persisted panel size and full width', async () => {
    const view = await renderIntoDom(
      React.createElement(TerminalWorkspacesManager, {
        cwd: '/workspace/devhub',
        isVisible: true,
        projectId: 'project-1',
      })
    );

    await click(view.container.querySelector('[data-testid="right-dock-tab-browser"]'));
    expect(
      view.container
        .querySelector('[data-testid="workspace-right-dock-panel"]')
        ?.getAttribute('data-panel-size')
    ).toBe(String(DEFAULT_RIGHT_DOCK_STATE.size));

    await click(view.container.querySelector('[data-testid="browser-toggle-workspace-maximize"]'));
    expect(view.container.querySelector('[data-testid="workspace-right-dock-panel"]')).toBeNull();
    expect(view.container.querySelector('[data-testid="workspace-right-dock"]')).not.toBeNull();

    await click(view.container.querySelector('[data-testid="browser-toggle-workspace-maximize"]'));
    expect(
      view.container
        .querySelector('[data-testid="workspace-right-dock-panel"]')
        ?.getAttribute('data-panel-size')
    ).toBe(String(DEFAULT_RIGHT_DOCK_STATE.size));
  });

  test('dock drag overlay never blocks editor interactions and clears after pointer release', async () => {
    const view = await renderIntoDom(
      React.createElement(TerminalWorkspacesManager, {
        cwd: '/workspace/devhub',
        isVisible: true,
        projectId: 'project-1',
      })
    );

    await click(view.container.querySelector('[data-testid="right-dock-tab-browser"]'));
    await click(view.container.querySelector('[data-testid="right-dock-tab-editor"]'));

    const resizeHandle = view.container.querySelector(
      '[data-testid="workspace-right-dock-resize-handle"]'
    );
    expect(resizeHandle).not.toBeNull();

    resizeHandle.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
    await flushEffects();

    const overlayWhileDragging = view.container.querySelector(
      '[data-testid="workspace-right-dock-drag-overlay"]'
    );
    expect(overlayWhileDragging).not.toBeNull();
    expect(overlayWhileDragging?.className).toContain('pointer-events-none');

    flushSync(() => {
      window.dispatchEvent(new window.MouseEvent('mouseup', { bubbles: true }));
    });
    await flushEffects();

    expect(
      view.container.querySelector('[data-testid="workspace-right-dock-drag-overlay"]')
    ).toBeNull();
    expect(view.container.querySelector('[data-testid="shared-editor-pane"]')).not.toBeNull();
  });

  test('right dock layout placeholder never captures pointer events above the real dock layer', async () => {
    const view = await renderIntoDom(
      React.createElement(TerminalWorkspacesManager, {
        cwd: '/workspace/devhub',
        isVisible: true,
        projectId: 'project-1',
      })
    );

    await click(view.container.querySelector('[data-testid="right-dock-tab-browser"]'));
    await click(view.container.querySelector('[data-testid="right-dock-tab-editor"]'));

    const dockPanelPlaceholder = view.container.querySelector(
      '[data-testid="workspace-right-dock-panel"]'
    );
    const dockPlaceholderAnchor = view.container.querySelector(
      '[data-testid="workspace-right-dock-placeholder"]'
    );
    const dockLayer = view.container.querySelector('[data-testid="workspace-right-dock-layer"]');

    expect(dockPanelPlaceholder).not.toBeNull();
    expect(dockPanelPlaceholder?.className).toContain('pointer-events-none');
    expect(dockPlaceholderAnchor).not.toBeNull();
    expect(dockPlaceholderAnchor?.className).toContain('pointer-events-none');
    expect(dockLayer).not.toBeNull();
    expect(dockLayer?.style.zIndex).toBe('50');
    expect(view.container.querySelector('[data-testid="shared-editor-pane"]')).not.toBeNull();
  });

  test('resolveRightDockLayerStyle anchors the dock to measured placeholder bounds when available', () => {
    expect(
      resolveRightDockLayerStyle({
        isFullscreenBrowser: false,
        size: 44,
        measuredBounds: { left: 612, right: 0, width: 468 },
      })
    ).toEqual({
      top: 0,
      right: 'auto',
      bottom: 0,
      left: '612px',
      width: '468px',
    });

    expect(
      resolveRightDockLayerStyle({
        isFullscreenBrowser: false,
        size: 44,
        measuredBounds: null,
      })
    ).toEqual({
      top: 0,
      right: 'auto',
      bottom: 0,
      left: '56%',
      width: '44%',
    });
  });

  test('resolveMeasuredRightDockBounds derives exact left and width from the real placeholder rect', () => {
    expect(
      resolveMeasuredRightDockBounds(
        { left: 40, right: 1000, width: 960 },
        { left: 620, right: 1000, width: 380 }
      )
    ).toEqual({
      left: 580,
      right: 0,
      width: 380,
    });

    expect(
      resolveMeasuredRightDockBounds(
        { left: 40, right: 1000, width: 960 },
        { left: 1000, right: 1000, width: 0 }
      )
    ).toBeNull();
  });

  test('measured right dock bounds realign the absolute dock layer after workspace switches', async () => {
    const view = await renderIntoDom(
      React.createElement(TerminalWorkspacesManager, {
        cwd: '/workspace/devhub',
        isVisible: true,
        projectId: 'project-1',
      })
    );

    await click(view.container.querySelector('[data-testid="right-dock-tab-browser"]'));
    await click(view.container.querySelector('[data-testid="right-dock-tab-editor"]'));
    await flushEffects();

    const workspaceGrid = view.container.querySelector('.flex-1.relative.min-w-0');
    const getActivePlaceholder = () =>
      getVisibleWorkspaceShell(view.container)?.querySelector(
        '[data-testid="workspace-right-dock-placeholder"]'
      ) || null;
    const dockLayer = view.container.querySelector('[data-testid="workspace-right-dock-layer"]');

    workspaceGrid.getBoundingClientRect = () => ({
      left: 40,
      right: 1000,
      width: 960,
      top: 0,
      bottom: 700,
      height: 700,
    });
    getActivePlaceholder().getBoundingClientRect = () => ({
      left: 620,
      right: 1000,
      width: 380,
      top: 0,
      bottom: 700,
      height: 700,
    });
    window.dispatchEvent(new window.Event('resize'));
    await flushEffects();

    const initialBounds = resolveMeasuredRightDockBounds(
      workspaceGrid.getBoundingClientRect(),
      getActivePlaceholder().getBoundingClientRect()
    );
    applyRightDockLayerBounds(dockLayer, initialBounds);

    expect(dockLayer.style.left).toBe('580px');
    expect(dockLayer.style.width).toBe('380px');

    await click(view.container.querySelector('[data-testid="workspace-add-button"]'));
    await confirmNewWorkspaceSetup(1);

    await click(view.container.querySelector('[data-testid="right-dock-tab-browser"]'));
    await click(view.container.querySelector('[data-testid="right-dock-tab-editor"]'));
    await flushEffects();

    workspaceGrid.getBoundingClientRect = () => ({
      left: 40,
      right: 1000,
      width: 960,
      top: 0,
      bottom: 700,
      height: 700,
    });
    const latestPlaceholder = getActivePlaceholder();
    latestPlaceholder.getBoundingClientRect = () => ({
      left: 700,
      right: 1000,
      width: 300,
      top: 0,
      bottom: 700,
      height: 700,
    });
    window.dispatchEvent(new window.Event('resize'));
    await flushEffects();

    const switchedBounds = resolveMeasuredRightDockBounds(
      workspaceGrid.getBoundingClientRect(),
      latestPlaceholder.getBoundingClientRect()
    );
    applyRightDockLayerBounds(dockLayer, switchedBounds);

    expect(dockLayer.style.left).toBe('660px');
    expect(dockLayer.style.width).toBe('300px');
  });

  test('browser tab resolves free-text input into a searchable web url', async () => {
    const view = await renderIntoDom(
      React.createElement(TerminalWorkspacesManager, {
        cwd: '/workspace/devhub',
        isVisible: true,
        projectId: 'project-1',
      })
    );

    await click(view.container.querySelector('[data-testid="right-dock-tab-browser"]'));
    await changeInput(view.container.querySelector('[data-testid="browser-url-input"]'), 'cocleo');
    await submitForm(view.container.querySelector('[data-testid="workspace-browser-pane"] form'));

    expect(view.container.querySelector('[data-testid="browser-frame-warning"]')).not.toBeNull();
    expect(
      view.container.querySelector('[data-testid="browser-open-external"]')?.getAttribute('href')
    ).toBe('https://duckduckgo.com/?q=cocleo');
  });

  test('browser tab defaults plain domains to https navigation', async () => {
    const view = await renderIntoDom(
      React.createElement(TerminalWorkspacesManager, {
        cwd: '/workspace/devhub',
        isVisible: true,
        projectId: 'project-1',
      })
    );

    await click(view.container.querySelector('[data-testid="right-dock-tab-browser"]'));
    await changeInput(
      view.container.querySelector('[data-testid="browser-url-input"]'),
      'arxonlabs.com'
    );
    await submitForm(view.container.querySelector('[data-testid="workspace-browser-pane"] form'));

    expect(view.container.querySelector('[data-testid="browser-url-input"]')?.value).toBe(
      'https://arxonlabs.com/'
    );
    expect(
      view.container.querySelector('[data-testid="browser-iframe"]')?.getAttribute('src')
    ).toBe('https://arxonlabs.com/');
  });

  test('shows a visible localhost error state instead of leaving the browser blank', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => ({
        error: 'Failed to fetch preview target',
        detail: 'connect ECONNREFUSED 127.0.0.1:5999',
        code: 'ECONNREFUSED',
        address: '127.0.0.1',
        port: 5999,
      }),
    });

    const view = await renderIntoDom(
      React.createElement(TerminalWorkspacesManager, {
        cwd: '/workspace/devhub',
        isVisible: true,
        projectId: 'project-1',
      })
    );

    await click(view.container.querySelector('[data-testid="right-dock-tab-browser"]'));
    await changeInput(
      view.container.querySelector('[data-testid="browser-url-input"]'),
      'localhost:5999'
    );
    await submitForm(view.container.querySelector('[data-testid="workspace-browser-pane"] form'));
    await flushEffects();

    expect(view.container.querySelector('[data-testid="browser-error-state"]')).not.toBeNull();
    expect(
      view.container.querySelector('[data-testid="browser-error-title"]')?.textContent
    ).toContain('localhost');
    expect(
      view.container.querySelector('[data-testid="browser-error-copy"]')?.textContent
    ).toContain('5999');
  });

  test('rendering the visible right dock does not emit React key warnings', async () => {
    const view = await renderIntoDom(
      React.createElement(TerminalWorkspacesManager, {
        cwd: '/workspace/devhub',
        isVisible: true,
        projectId: 'project-1',
      })
    );

    await click(view.container.querySelector('[data-testid="right-dock-tab-browser"]'));

    const keyWarnings = consoleErrorSpy.mock.calls.filter(([message]) =>
      String(message || '').includes('Each child in a list should have a unique "key" prop')
    );

    expect(keyWarnings).toHaveLength(0);
  });

  test('right dock browser state stays mounted across slower timer advances', async () => {
    const view = await renderIntoDom(
      React.createElement(TerminalWorkspacesManager, {
        cwd: '/workspace/devhub',
        isVisible: true,
        projectId: 'project-1',
      })
    );

    await click(view.container.querySelector('[data-testid="right-dock-tab-browser"]'));
    expect(view.container.querySelector('[data-testid="workspace-browser-pane"]')).not.toBeNull();

    await flushEffects();
    await flushEffects();

    expect(view.container.querySelector('[data-testid="workspace-browser-pane"]')).not.toBeNull();
  });
});
