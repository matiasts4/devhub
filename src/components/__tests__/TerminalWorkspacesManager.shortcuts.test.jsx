const React = require('react');
const { flushSync } = require('react-dom');
const {
  cleanupMountedRoots,
  click,
  flushEffects,
  installDom,
  renderIntoDom,
} = require('@/test-support/domHarness');

jest.mock('framer-motion', () => {
  const React = require('react');
  const mockEl = (tag) =>
    React.forwardRef(({ children, ...props }, ref) =>
      React.createElement(tag, { ...props, ref }, children)
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
  default: ({ id, autoFocus }) => {
    const React = require('react');
    return React.createElement(
      'div',
      { 'data-testid': 'terminal-viewport-shell' },
      React.createElement(
        'div',
        {
          'data-testid': `terminal-${id}`,
          'data-autofocus': autoFocus ? 'true' : 'false',
          tabIndex: -1,
        },
        id
      )
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

jest.mock('@/components/workspace/FileExplorerEditorPane', () => ({
  __esModule: true,
  default: () => {
    const React = require('react');
    return React.createElement('div', { 'data-testid': 'shared-editor-pane' });
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
const TERMINAL_STATE_KEY = 'devhub_terminal_state:proj-1';

const mountedRoots = [];

function persistWorkspaceState(state) {
  window.localStorage.setItem(TERMINAL_STATE_KEY, JSON.stringify(state));
}

function renderManager(props = {}) {
  return renderIntoDom(
    React.createElement(TerminalWorkspacesManager, {
      cwd: '/workspace/devhub',
      isVisible: true,
      projectId: 'proj-1',
      ...props,
    }),
    mountedRoots
  );
}

function getVisibleWorkspaceShell(container) {
  return (
    Array.from(container.querySelectorAll('[data-testid^="workspace-shell-"]')).find(
      (node) => node.getAttribute('data-ws-active') === 'true'
    ) || null
  );
}

function getVisibleWorkspaceId(container) {
  return (
    getVisibleWorkspaceShell(container)
      ?.getAttribute('data-testid')
      ?.replace('workspace-shell-', '') || null
  );
}

function getActiveWorkspaceTabLabel(container) {
  return (
    Array.from(container.querySelectorAll('[title^="Workspace "]'))
      .find((node) => String(node.getAttribute('style') || '').includes('box-shadow'))
      ?.getAttribute('title') || null
  );
}

function getAutoFocusedTerminal(container) {
  return getVisibleWorkspaceShell(container)?.querySelector('[data-autofocus="true"]') || null;
}

function getPersistedWorkspaceState() {
  return JSON.parse(window.localStorage.getItem(TERMINAL_STATE_KEY) || 'null');
}

function getVisibleWorkspaceColumns(container) {
  return (
    getVisibleWorkspaceShell(container)?.querySelectorAll('[data-testid^="workspace-column-"]') ||
    []
  );
}

function getVisiblePanelSlots(container) {
  return (
    getVisibleWorkspaceShell(container)?.querySelectorAll('[data-testid^="panel-slot-"].group') ||
    []
  );
}

async function dispatchShortcut(init) {
  const event = new window.KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    ...init,
  });
  flushSync(() => {
    document.dispatchEvent(event);
  });
  await flushEffects();
  return event;
}

function focusPanelTab(container, panelLabel = 'p1') {
  const scope = getVisibleWorkspaceShell(container) || container;
  const tab = scope.querySelector(`[data-testid="panel-tab-${panelLabel}"]`);
  tab?.focus();
  return tab;
}

describe('TerminalWorkspacesManager shortcuts', () => {
  let dom;

  beforeEach(() => {
    dom = installDom();
    global.KeyboardEvent = dom.window.KeyboardEvent;
    if (!dom.window.HTMLElement.prototype.attachEvent) {
      dom.window.HTMLElement.prototype.attachEvent = () => {};
    }
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanupMountedRoots(mountedRoots);
    dom.window.close();
    delete global.KeyboardEvent;
    delete global.localStorage;
    jest.clearAllMocks();
  });

  test('Ctrl+PageDown wraps to the first workspace in reordered state order', async () => {
    persistWorkspaceState({
      workspaces: [
        { id: 'ws2', name: 'Workspace 2', columns: [{ id: 'c2', panels: [{ id: 'p2' }] }] },
        { id: 'ws1', name: 'Workspace 1', columns: [{ id: 'c1', panels: [{ id: 'p1' }] }] },
        { id: 'ws3', name: 'Workspace 3', columns: [{ id: 'c3', panels: [{ id: 'p3' }] }] },
      ],
      activeWsId: 'ws3',
      activePanelIds: { ws1: 'p1', ws2: 'p2', ws3: 'p3' },
    });

    const view = await renderManager();
    focusPanelTab(view.container);

    const event = await dispatchShortcut({ key: 'PageDown', ctrlKey: true });

    expect(getVisibleWorkspaceId(view.container)).toBe('ws2');
    expect(getAutoFocusedTerminal(view.container)?.textContent).toBe('p2');
    expect(getPersistedWorkspaceState().activeWsId).toBe('ws2');
    expect(event.defaultPrevented).toBe(true);
  });

  test('Ctrl+PageUp wraps to the previous workspace in reordered state order', async () => {
    persistWorkspaceState({
      workspaces: [
        { id: 'ws2', name: 'Workspace 2', columns: [{ id: 'c2', panels: [{ id: 'p2' }] }] },
        { id: 'ws1', name: 'Workspace 1', columns: [{ id: 'c1', panels: [{ id: 'p1' }] }] },
        { id: 'ws3', name: 'Workspace 3', columns: [{ id: 'c3', panels: [{ id: 'p3' }] }] },
      ],
      activeWsId: 'ws2',
      activePanelIds: { ws1: 'p1', ws2: 'p2', ws3: 'p3' },
    });

    const view = await renderManager();
    focusPanelTab(view.container);

    const event = await dispatchShortcut({ key: 'PageUp', ctrlKey: true });

    expect(getVisibleWorkspaceId(view.container)).toBe('ws3');
    expect(getAutoFocusedTerminal(view.container)?.textContent).toBe('p3');
    expect(getPersistedWorkspaceState().activeWsId).toBe('ws3');
    expect(event.defaultPrevented).toBe(true);
  });

  test('Ctrl+PageDown activates the next adjacent workspace and preserves workspace order in storage', async () => {
    persistWorkspaceState({
      workspaces: [
        { id: 'ws2', name: 'Workspace 2', columns: [{ id: 'c2', panels: [{ id: 'p2' }] }] },
        { id: 'ws1', name: 'Workspace 1', columns: [{ id: 'c1', panels: [{ id: 'p1' }] }] },
        { id: 'ws3', name: 'Workspace 3', columns: [{ id: 'c3', panels: [{ id: 'p3' }] }] },
      ],
      activeWsId: 'ws1',
      activePanelIds: { ws1: 'p1', ws2: 'p2', ws3: 'p3' },
    });

    const view = await renderManager();
    focusPanelTab(view.container);

    await dispatchShortcut({ key: 'PageDown', ctrlKey: true });

    expect(getVisibleWorkspaceId(view.container)).toBe('ws3');
    expect(getAutoFocusedTerminal(view.container)?.textContent).toBe('p3');
    expect(getPersistedWorkspaceState().workspaces.map((workspace) => workspace.id)).toEqual([
      'ws2',
      'ws1',
      'ws3',
    ]);
    expect(getPersistedWorkspaceState().activeWsId).toBe('ws3');
  });

  test('Ctrl+PageUp activates the previous adjacent workspace and falls back to the first live panel when saved panel is missing', async () => {
    persistWorkspaceState({
      workspaces: [
        { id: 'ws1', name: 'Workspace 1', columns: [{ id: 'c1', panels: [{ id: 'p1' }] }] },
        {
          id: 'ws2',
          name: 'Workspace 2',
          columns: [{ id: 'c2', panels: [{ id: 'p2' }, { id: 'p3' }] }],
        },
        { id: 'ws3', name: 'Workspace 3', columns: [{ id: 'c3', panels: [{ id: 'p4' }] }] },
      ],
      activeWsId: 'ws3',
      activePanelIds: { ws1: 'p1', ws2: 'missing-panel', ws3: 'p4' },
    });

    const view = await renderManager();
    focusPanelTab(view.container);

    await dispatchShortcut({ key: 'PageUp', ctrlKey: true });

    expect(getVisibleWorkspaceId(view.container)).toBe('ws2');
    expect(getAutoFocusedTerminal(view.container)?.textContent).toBe('p2');
    expect(getPersistedWorkspaceState().activePanelIds.ws2).toBe('p2');
  });

  test('terminal navigation shortcuts do nothing when the terminal UI is hidden', async () => {
    persistWorkspaceState({
      workspaces: [
        { id: 'ws1', name: 'Workspace 1', columns: [{ id: 'c1', panels: [{ id: 'p1' }] }] },
        { id: 'ws2', name: 'Workspace 2', columns: [{ id: 'c2', panels: [{ id: 'p2' }] }] },
      ],
      activeWsId: 'ws1',
      activePanelIds: { ws1: 'p1', ws2: 'p2' },
    });

    const view = await renderManager({ isVisible: false });
    focusPanelTab(view.container);

    const event = await dispatchShortcut({ key: 'PageDown', ctrlKey: true });

    expect(getVisibleWorkspaceShell(view.container)).toBeNull();
    expect(event.defaultPrevented).toBe(false);
  });

  test('terminal shortcuts do nothing while an editable field inside the manager is focused', async () => {
    persistWorkspaceState({
      workspaces: [
        { id: 'ws1', name: 'Workspace 1', columns: [{ id: 'c1', panels: [{ id: 'p1' }] }] },
        { id: 'ws2', name: 'Workspace 2', columns: [{ id: 'c2', panels: [{ id: 'p2' }] }] },
      ],
      activeWsId: 'ws1',
      activePanelIds: { ws1: 'p1', ws2: 'p2' },
    });

    const view = await renderManager();
    const gridInput = view.container.querySelector('input[type="text"]');
    gridInput?.focus();

    const event = await dispatchShortcut({ key: 'PageDown', ctrlKey: true });

    expect(document.activeElement).toBe(gridInput);
    expect(getVisibleWorkspaceId(view.container)).toBe('ws1');
    expect(getAutoFocusedTerminal(view.container)?.textContent).toBe('p1');
    expect(event.defaultPrevented).toBe(false);
  });

  test('Ctrl+Shift+R preserves split-right behavior', async () => {
    const view = await renderManager();
    focusPanelTab(view.container);

    const event = await dispatchShortcut({ key: 'R', ctrlKey: true, shiftKey: true });

    const columns = getVisibleWorkspaceColumns(view.container);
    expect(columns).toHaveLength(2);
    expect(columns[0].querySelector('[data-testid="terminal-p1"]')).not.toBeNull();
    expect(columns[1].querySelector('[data-testid="terminal-p2"]')).not.toBeNull();
    expect(getAutoFocusedTerminal(view.container)?.textContent).toBe('p2');
    expect(event.defaultPrevented).toBe(true);
  });

  test('Ctrl+Shift+D preserves split-down behavior', async () => {
    const view = await renderManager();
    focusPanelTab(view.container);

    const event = await dispatchShortcut({ key: 'D', ctrlKey: true, shiftKey: true });

    expect(
      view.container.querySelector('[data-testid="workspace-column-panels-c1"]')
    ).not.toBeNull();
    const panelSlots = getVisiblePanelSlots(view.container);
    expect(panelSlots).toHaveLength(2);
    expect(panelSlots[0].querySelector('[data-testid="terminal-p1"]')).not.toBeNull();
    expect(panelSlots[1].querySelector('[data-testid="terminal-p2"]')).not.toBeNull();
    expect(getAutoFocusedTerminal(view.container)?.textContent).toBe('p2');
    expect(event.defaultPrevented).toBe(true);
  });

  test('Ctrl+Shift+W twice closes the active terminal panel', async () => {
    const view = await renderManager();
    focusPanelTab(view.container);
    await dispatchShortcut({ key: 'R', ctrlKey: true, shiftKey: true });

    const firstPress = await dispatchShortcut({ key: 'W', ctrlKey: true, shiftKey: true });
    expect(
      view.container.querySelector('[data-testid="terminal-shortcut-hint"]')?.textContent
    ).toMatch(/Ctrl\+Shift\+W/);
    expect(getVisibleWorkspaceColumns(view.container)).toHaveLength(2);

    const secondPress = await dispatchShortcut({ key: 'W', ctrlKey: true, shiftKey: true });

    expect(getVisibleWorkspaceColumns(view.container)).toHaveLength(1);
    expect(view.container.querySelector('[data-testid="terminal-p2"]')).toBeNull();
    expect(getAutoFocusedTerminal(view.container)?.textContent).toBe('p1');
    expect(firstPress.defaultPrevented).toBe(true);
    expect(secondPress.defaultPrevented).toBe(true);
  });

  test('Ctrl+Shift+B splits a browser space from terminal focus', async () => {
    const view = await renderManager();
    const terminal = view.container.querySelector('[data-testid="terminal-p1"]');
    terminal.focus();

    const event = await dispatchShortcut({ key: 'B', ctrlKey: true, shiftKey: true });

    expect(view.container.querySelector('[data-testid="workspace-right-dock"]')).toBeNull();
    expect(view.container.querySelector('[data-testid="workspace-browser-pane"]')).not.toBeNull();
    expect(view.container.querySelector('[data-testid="terminal-p1"]')).not.toBeNull();
    expect(event.defaultPrevented).toBe(true);
  });

  test('Ctrl+Shift+E splits a files space from terminal focus', async () => {
    const view = await renderManager();
    const terminal = view.container.querySelector('[data-testid="terminal-p1"]');
    terminal.focus();

    const event = await dispatchShortcut({ key: 'E', ctrlKey: true, shiftKey: true });

    expect(view.container.querySelector('[data-testid="workspace-right-dock"]')).toBeNull();
    expect(view.container.querySelector('[data-testid="shared-editor-pane"]')).not.toBeNull();
    expect(view.container.querySelector('[data-testid="terminal-p1"]')).not.toBeNull();
    expect(event.defaultPrevented).toBe(true);
  });

  test('Ctrl+Shift+. closes the right dock', async () => {
    const view = await renderManager();
    await click(view.container.querySelector('[data-testid="right-dock-tab-swarm"]'));
    expect(
      view.container.querySelector('[data-testid="workspace-right-dock-panel"]')
    ).not.toBeNull();

    const event = await dispatchShortcut({
      key: '.',
      ctrlKey: true,
      shiftKey: true,
      code: 'Period',
    });

    expect(view.container.querySelector('[data-testid="workspace-right-dock-panel"]')).toBeNull();
    expect(event.defaultPrevented).toBe(true);
  });

  test('Ctrl+Shift+N opens the new workspace setup modal', async () => {
    const view = await renderManager();
    const terminal = view.container.querySelector('[data-testid="terminal-p1"]');
    terminal.focus();

    const event = await dispatchShortcut({ key: 'N', ctrlKey: true, shiftKey: true });

    expect(document.querySelector('[data-testid="workspace-terminal-setup-modal"]')).not.toBeNull();
    expect(event.defaultPrevented).toBe(true);
  });

  test('Ctrl+ArrowDown switches workspace when no vertical split exists', async () => {
    persistWorkspaceState({
      workspaces: [
        { id: 'ws1', name: 'Workspace 1', columns: [{ id: 'c1', panels: [{ id: 'p1' }] }] },
        { id: 'ws2', name: 'Workspace 2', columns: [{ id: 'c2', panels: [{ id: 'p2' }] }] },
      ],
      activeWsId: 'ws1',
      activePanelIds: { ws1: 'p1', ws2: 'p2' },
    });

    const view = await renderManager();
    const terminal = view.container.querySelector('[data-testid="terminal-p1"]');
    terminal.focus();

    const event = await dispatchShortcut({ key: 'ArrowDown', ctrlKey: true });

    expect(getVisibleWorkspaceId(view.container)).toBe('ws2');
    expect(getAutoFocusedTerminal(view.container)?.textContent).toBe('p2');
    expect(event.defaultPrevented).toBe(true);
  });

  test('Ctrl+Shift+ArrowDown switches workspace when no vertical split exists', async () => {
    persistWorkspaceState({
      workspaces: [
        { id: 'ws1', name: 'Workspace 1', columns: [{ id: 'c1', panels: [{ id: 'p1' }] }] },
        { id: 'ws2', name: 'Workspace 2', columns: [{ id: 'c2', panels: [{ id: 'p2' }] }] },
      ],
      activeWsId: 'ws1',
      activePanelIds: { ws1: 'p1', ws2: 'p2' },
    });

    const view = await renderManager();
    const terminal = view.container.querySelector('[data-testid="terminal-p1"]');
    terminal.focus();

    const event = await dispatchShortcut({ key: 'ArrowDown', ctrlKey: true, shiftKey: true });

    expect(getVisibleWorkspaceId(view.container)).toBe('ws2');
    expect(getAutoFocusedTerminal(view.container)?.textContent).toBe('p2');
    expect(event.defaultPrevented).toBe(true);
  });

  test('Ctrl+PageDown from xterm-like textarea focus switches workspace', async () => {
    persistWorkspaceState({
      workspaces: [
        { id: 'ws1', name: 'Workspace 1', columns: [{ id: 'c1', panels: [{ id: 'p1' }] }] },
        { id: 'ws2', name: 'Workspace 2', columns: [{ id: 'c2', panels: [{ id: 'p2' }] }] },
      ],
      activeWsId: 'ws1',
      activePanelIds: { ws1: 'p1', ws2: 'p2' },
    });

    const view = await renderManager();
    const terminalViewport = view.container.querySelector(
      '[data-testid="terminal-viewport-shell"]'
    );
    const textarea = document.createElement('textarea');
    textarea.className = 'xterm-helper-textarea';
    terminalViewport?.appendChild(textarea);
    textarea.focus();

    const event = await dispatchShortcut({ key: 'PageDown', ctrlKey: true });

    expect(getVisibleWorkspaceId(view.container)).toBe('ws2');
    expect(getAutoFocusedTerminal(view.container)?.textContent).toBe('p2');
    expect(event.defaultPrevented).toBe(true);
  });

  test('Ctrl+Shift+ArrowRight inside the terminal viewport moves to the adjacent panel', async () => {
    persistWorkspaceState({
      workspaces: [
        {
          id: 'ws1',
          name: 'Workspace 1',
          columns: [
            { id: 'c1', panels: [{ id: 'p1' }] },
            { id: 'c2', panels: [{ id: 'p2' }] },
          ],
        },
      ],
      activeWsId: 'ws1',
      activePanelIds: { ws1: 'p1' },
    });

    const view = await renderManager();
    const terminal = view.container.querySelector('[data-testid="terminal-p1"]');
    terminal.focus();

    const event = new window.KeyboardEvent('keydown', {
      key: 'ArrowRight',
      ctrlKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    flushSync(() => {
      document.dispatchEvent(event);
    });
    await flushEffects();

    expect(getAutoFocusedTerminal(view.container)?.textContent).toBe('p2');
    expect(event.defaultPrevented).toBe(true);
  });

  test('Ctrl+PageDown and Ctrl+PageUp navigate workspaces from chrome focus', async () => {
    persistWorkspaceState({
      workspaces: [
        { id: 'ws1', name: 'Workspace 1', columns: [{ id: 'c1', panels: [{ id: 'p1' }] }] },
        { id: 'ws2', name: 'Workspace 2', columns: [{ id: 'c2', panels: [{ id: 'p2' }] }] },
      ],
      activeWsId: 'ws1',
      activePanelIds: { ws1: 'p1', ws2: 'p2' },
    });

    const view = await renderManager();
    focusPanelTab(view.container);

    await dispatchShortcut({ key: 'PageDown', ctrlKey: true });
    expect(getVisibleWorkspaceId(view.container)).toBe('ws2');

    await dispatchShortcut({ key: 'PageUp', ctrlKey: true });
    expect(getVisibleWorkspaceId(view.container)).toBe('ws1');
  });

  test('native VTE navigation-shortcut events move between adjacent panels', async () => {
    persistWorkspaceState({
      workspaces: [
        {
          id: 'ws1',
          name: 'Workspace 1',
          columns: [
            { id: 'c1', panels: [{ id: 'p1' }] },
            { id: 'c2', panels: [{ id: 'p2' }] },
          ],
        },
      ],
      activeWsId: 'ws1',
      activePanelIds: { ws1: 'p1' },
    });

    const view = await renderManager();

    flushSync(() => {
      window.dispatchEvent(
        new window.CustomEvent('devhub:terminal-native-vte-event', {
          detail: { type: 'navigation-shortcut', action: 'panelRight', panelId: 'p1' },
        })
      );
    });
    await flushEffects();

    expect(getAutoFocusedTerminal(view.container)?.textContent).toBe('p2');
  });

  test('workspace setup modal adjusts terminal count with arrows and confirms with Enter', async () => {
    const view = await renderManager();
    const tabsBefore = view.container.querySelectorAll('[title^="Workspace "]').length;

    await dispatchShortcut({ key: 'N', ctrlKey: true, shiftKey: true });

    const countValue = document.querySelector('[data-testid="workspace-terminal-count-value"]');
    expect(countValue).not.toBeNull();
    expect(document.activeElement?.getAttribute('data-testid')).toBe(
      'workspace-terminal-count-focus'
    );

    await dispatchShortcut({ key: 'ArrowRight' });
    expect(countValue.textContent).toBe('2');

    await dispatchShortcut({ key: 'ArrowDown' });
    await dispatchShortcut({ key: 'ArrowDown' });
    await dispatchShortcut({ key: 'Enter' });
    await flushEffects();

    expect(document.querySelector('[data-testid="workspace-terminal-setup-modal"]')).toBeNull();
    expect(view.container.querySelectorAll('[title^="Workspace "]').length).toBe(tabsBefore + 1);
  });

  test('terminal workspace shortcuts are suspended while the setup modal is open', async () => {
    persistWorkspaceState({
      workspaces: [
        { id: 'ws1', name: 'Workspace 1', columns: [{ id: 'c1', panels: [{ id: 'p1' }] }] },
        { id: 'ws2', name: 'Workspace 2', columns: [{ id: 'c2', panels: [{ id: 'p2' }] }] },
      ],
      activeWsId: 'ws1',
      activePanelIds: { ws1: 'p1', ws2: 'p2' },
    });

    const view = await renderManager();
    await dispatchShortcut({ key: 'N', ctrlKey: true, shiftKey: true });
    expect(document.querySelector('[data-testid="workspace-terminal-setup-modal"]')).not.toBeNull();

    await dispatchShortcut({ key: 'ArrowDown', ctrlKey: true });

    expect(getVisibleWorkspaceId(view.container)).toBe('ws1');
    expect(document.querySelector('[data-testid="workspace-terminal-setup-modal"]')).not.toBeNull();
  });

  test('Ctrl+Shift+V inside the terminal viewport does not trigger workspace shortcuts', async () => {
    const view = await renderManager();
    const terminal = view.container.querySelector('[data-testid="terminal-p1"]');
    terminal.focus();

    const event = new window.KeyboardEvent('keydown', {
      key: 'V',
      ctrlKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    terminal.dispatchEvent(event);
    await flushEffects();

    expect(getVisibleWorkspaceColumns(view.container)).toHaveLength(1);
    expect(getVisiblePanelSlots(view.container)).toHaveLength(1);
    expect(event.defaultPrevented).toBe(false);
  });
});
