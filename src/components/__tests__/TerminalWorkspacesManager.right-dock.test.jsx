const React = require('react');
const { createRoot } = require('react-dom/client');
const { flushSync } = require('react-dom');
const { JSDOM } = require('jsdom');
const { buildRightDockStorageKey } = require('../workspace/rightDockState');

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
  default: ({ resumableSessions = [], resumableStatus = 'empty' }) => {
    const React = require('react');
    return React.createElement(
      'div',
      {
        'data-testid': 'agent-room-sidebar-stub',
        'data-status': resumableStatus,
        'data-count': String(resumableSessions.length),
      },
      'agent room'
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
  DropdownMenu: ({ children }) => {
    const React = require('react');
    return React.createElement('div', null, children);
  },
  DropdownMenuContent: ({ children }) => {
    const React = require('react');
    return React.createElement('div', null, children);
  },
  DropdownMenuItem: ({ children, onSelect }) =>
    {
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

jest.mock('../workspace/FileExplorerEditorPane', () => ({
  __esModule: true,
  default: ({ embedded }) => {
    const React = require('react');
    return React.createElement(
      'div',
      { 'data-testid': 'shared-editor-pane' },
      React.createElement(
        'div',
        { 'data-testid': 'editor-pane-subtitle' },
        embedded ? 'Explore project context without leaving the terminal layout.' : 'Editor'
      )
    );
  },
}), { virtual: true });

jest.mock('../workspace/WorkspaceBridgePane', () => ({
  __esModule: true,
  default: ({ dockState }) => {
    const React = require('react');
    return React.createElement(
      'div',
      { 'data-testid': 'shared-bridge-pane' },
      React.createElement('div', { 'data-testid': 'bridge-pane-url' }, dockState?.browserUrl || 'no-url')
    );
  },
}), { virtual: true });

const TerminalWorkspacesManager = require('../TerminalWorkspacesManager').default;

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
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
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
    jest.clearAllMocks();
  });

  test('keeps terminal-only layout by default and exposes dock toolbar controls without PageHeader', async () => {
    const view = await renderIntoDom(
      React.createElement(TerminalWorkspacesManager, {
        cwd: '/workspace/devhub',
        isVisible: true,
        projectId: 'project-1',
      })
    );

    expect(view.container.textContent).toContain('Terminals');
    expect(view.container.querySelector('[data-testid="workspace-right-dock"]')).toBeNull();
    expect(view.container.querySelector('[data-testid="right-dock-toggle"]')).not.toBeNull();
    expect(view.container.querySelector('[data-testid="right-dock-toolbar-switch"]')).not.toBeNull();
    expect(view.container.querySelector('[data-testid="right-dock-tab-browser"]')).not.toBeNull();
    expect(view.container.querySelector('[data-testid="right-dock-tab-editor"]')).not.toBeNull();
    expect(view.container.querySelector('[data-testid="workspace-right-dock-maximize"]')).toBeNull();
  });

  test('toolbar toggle shows the dock shell and keeps the switch in the top toolbar', async () => {
    const view = await renderIntoDom(
      React.createElement(TerminalWorkspacesManager, {
        cwd: '/workspace/devhub',
        isVisible: true,
        projectId: 'project-1',
      })
    );

    await click(view.container.querySelector('[data-testid="right-dock-toggle"]'));
    expect(view.container.querySelector('[data-testid="workspace-right-dock"]')).not.toBeNull();
    expect(view.container.querySelector('[data-testid="workspace-right-dock-shell"]')).not.toBeNull();
    expect(view.container.querySelector('[data-testid="workspace-right-dock-description"]')).toBeNull();
    expect(view.container.querySelector('[data-testid="right-dock-toolbar-switch"]')).not.toBeNull();
    expect(view.container.querySelector('[data-testid="workspace-browser-pane"]')).not.toBeNull();
    expect(view.container.querySelector('[data-testid="workspace-right-dock-maximize"]')).not.toBeNull();
  });

  test('switching to editor reveals the shared pane with contextual subtitle', async () => {
    const view = await renderIntoDom(
      React.createElement(TerminalWorkspacesManager, {
        cwd: '/workspace/devhub',
        isVisible: true,
        projectId: 'project-1',
      })
    );

    await click(view.container.querySelector('[data-testid="right-dock-toggle"]'));
    await click(view.container.querySelector('[data-testid="right-dock-tab-editor"]'));
    expect(view.container.querySelector('[data-testid="shared-editor-pane"]')).not.toBeNull();
    expect(view.container.querySelector('[data-testid="editor-pane-subtitle"]')?.textContent).toContain('Explore project context');
  });

  test('legacy bridge state hydrates as browser edit mode and persists normalized state', async () => {
    window.localStorage.setItem(
      buildRightDockStorageKey('project-1', 'ws1'),
      JSON.stringify({
        visible: true,
        activeTab: 'bridge',
        maximized: false,
        size: 38,
        browserUrl: 'http://localhost:3200/',
        browserHistory: ['http://localhost:3200/'],
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
    const iframeSrc = view.container.querySelector('[data-testid="browser-iframe"]')?.getAttribute('src') || '';
    expect(iframeSrc).toContain('/api/preview-proxy/?url=');
    expect(iframeSrc).toContain('http%3A%2F%2Flocalhost%3A3200%2F');
    expect(view.container.querySelector('[data-testid="browser-edit-toggle"]')).not.toBeNull();
    expect(view.container.querySelector('[data-testid="bridge-selection-summary"]')).not.toBeNull();

    const persistedState = JSON.parse(window.localStorage.getItem(buildRightDockStorageKey('project-1', 'ws1')));
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
    expect(view.container.querySelector('[data-testid="workspace-right-dock-panel"]')?.getAttribute('data-panel-size')).toBe('44');
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

    expect(view.container.querySelector('[data-testid="browser-iframe"]')?.getAttribute('src')).toBe(
      'http://localhost:52827/#community'
    );

    await click(view.container.querySelector('[data-testid="browser-back"]'));
    expect(view.container.querySelector('[data-testid="browser-iframe"]')?.getAttribute('src')).toBe(
      'http://localhost:4173/'
    );

    await click(view.container.querySelector('[data-testid="browser-forward"]'));
    expect(view.container.querySelector('[data-testid="browser-iframe"]')?.getAttribute('src')).toBe(
      'http://localhost:52827/#community'
    );

    const iframeBeforeReload = view.container.querySelector('[data-testid="browser-iframe"]');
    await click(view.container.querySelector('[data-testid="browser-reload"]'));
    const iframeAfterReload = view.container.querySelector('[data-testid="browser-iframe"]');

    expect(iframeAfterReload).not.toBe(iframeBeforeReload);
    expect(iframeAfterReload?.getAttribute('src')).toBe('http://localhost:52827/#community');

    const persistedState = JSON.parse(window.localStorage.getItem(buildRightDockStorageKey('project-1', 'ws1')));
    expect(persistedState.browserHistory).toEqual([
      'http://localhost:3200/',
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
    await changeInput(view.container.querySelector('[data-testid="browser-url-input"]'), 'http://localhost:3100/');
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

  test('dock maximize toggles between persisted panel size and full width', async () => {
    const view = await renderIntoDom(
      React.createElement(TerminalWorkspacesManager, {
        cwd: '/workspace/devhub',
        isVisible: true,
        projectId: 'project-1',
      })
    );

    await click(view.container.querySelector('[data-testid="right-dock-toggle"]'));
    expect(view.container.querySelector('[data-testid="workspace-right-dock-panel"]')?.getAttribute('data-panel-size')).toBe('44');

    await click(view.container.querySelector('[data-testid="workspace-right-dock-maximize"]'));
    expect(view.container.querySelector('[data-testid="workspace-right-dock-panel"]')).toBeNull();
    expect(view.container.querySelector('[data-testid="workspace-right-dock"]')).not.toBeNull();

    await click(view.container.querySelector('[data-testid="workspace-right-dock-maximize"]'));
    expect(view.container.querySelector('[data-testid="workspace-right-dock-panel"]')?.getAttribute('data-panel-size')).toBe('44');
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

    expect(view.container.querySelector('[data-testid="browser-iframe"]')?.getAttribute('src')).toBe(
      'https://duckduckgo.com/?q=cocleo'
    );
  });

  test('rendering the visible right dock does not emit React key warnings', async () => {
    const view = await renderIntoDom(
      React.createElement(TerminalWorkspacesManager, {
        cwd: '/workspace/devhub',
        isVisible: true,
        projectId: 'project-1',
      })
    );

    await click(view.container.querySelector('[data-testid="right-dock-toggle"]'));

    const keyWarnings = consoleErrorSpy.mock.calls.filter(([message]) =>
      String(message || '').includes('Each child in a list should have a unique "key" prop')
    );

    expect(keyWarnings).toHaveLength(0);
  });
});
