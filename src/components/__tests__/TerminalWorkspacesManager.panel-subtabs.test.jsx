/**
 * TerminalWorkspacesManager — Panel Sub-Tabs Bar tests
 *
 * Validates the P1/P2/P3 panel switcher bar that sits below the workspace tab bar.
 * - Renders P1 active by default with a disabled '+' (no additional panels yet)
 * - Clicking a Px tab activates that panel
 * - '+' button adds a second panel; tab count grows to P2
 * - '+' is disabled (and reports aria-label) after reaching the max of 3 panels
 * - '×' closes a panel (only visible when 2+ panels exist)
 */

const React = require('react');
const { createRoot } = require('react-dom/client');
const { flushSync } = require('react-dom');
const { JSDOM } = require('jsdom');

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }) => {
      const React = require('react');
      return React.createElement('div', props, children);
    },
  },
  AnimatePresence: ({ children }) => children,
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
  default: ({ id, autoFocus }) => {
    const React = require('react');
    return React.createElement(
      'div',
      { 'data-testid': `terminal-${id}`, 'data-autofocus': autoFocus ? 'true' : 'false' },
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
      update() { return this; },
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

jest.mock('../workspace/FileExplorerEditorPane', () => ({
  __esModule: true,
  default: ({ embedded }) => {
    const React = require('react');
    return React.createElement('div', { 'data-testid': 'shared-editor-pane' });
  },
}), { virtual: true });

jest.mock('../workspace/WorkspaceBridgePane', () => ({
  __esModule: true,
  default: ({ dockState }) => {
    const React = require('react');
    return React.createElement('div', { 'data-testid': 'shared-bridge-pane' });
  },
}), { virtual: true });

const TerminalWorkspacesManager = require('../TerminalWorkspacesManager').default;

// ── Helpers ───────────────────────────────────────────────────────────────────

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

  flushSync(() => { root.render(element); });
  await flushEffects();
  return { container };
}

async function click(element) {
  flushSync(() => {
    element.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  });
  await flushEffects();
}

function getSubtabsBar(container) {
  return container.querySelector('[data-testid="panel-subtabs-bar"]');
}

function getPanelTab(container, label) {
  return container.querySelector(`[data-testid="panel-tab-${label.toLowerCase()}"]`);
}

function expectAutoFocusedTerminal(container, panelId) {
  expect(container.querySelector(`[data-testid="terminal-${panelId}"]`)?.getAttribute('data-autofocus')).toBe('true');
}

function getAddButton(container) {
  return container.querySelector('[data-testid="panel-subtabs-add"]');
}

function getSplitRightButton(container) {
  return container.querySelector('[data-testid="panel-subtabs-split-right"]');
}

function getSplitDownButton(container) {
  return container.querySelector('[data-testid="panel-subtabs-split-down"]');
}

function defaultProps() {
  return { cwd: '/workspace/devhub', isVisible: true, projectId: 'proj-1' };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('TerminalWorkspacesManager — panel sub-tabs bar', () => {
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
      flushSync(() => { root.unmount(); });
      container.remove();
    }
    consoleErrorSpy?.mockRestore();
    dom.window.close();
    delete global.localStorage;
    jest.clearAllMocks();
  });

  test('renders sub-tabs bar with P1 active on initial load', async () => {
    const { container } = await renderIntoDom(
      React.createElement(TerminalWorkspacesManager, defaultProps())
    );

    const bar = getSubtabsBar(container);
    expect(bar).not.toBeNull();

    const p1 = getPanelTab(container, 'p1');
    expect(p1).not.toBeNull();
    expect(p1.textContent).toContain('P1');
  });

  test('+ button is enabled when only 1 panel exists', async () => {
    const { container } = await renderIntoDom(
      React.createElement(TerminalWorkspacesManager, defaultProps())
    );

    const addBtn = getAddButton(container);
    expect(addBtn).not.toBeNull();
    expect(addBtn.disabled).toBe(false);
    expect(addBtn.getAttribute('aria-label')).toBe('Agregar terminal');
  });

  test('clicking + adds a P2 tab', async () => {
    const { container } = await renderIntoDom(
      React.createElement(TerminalWorkspacesManager, defaultProps())
    );

    await click(getAddButton(container));

    expect(getPanelTab(container, 'p1')).not.toBeNull();
    expect(getPanelTab(container, 'p2')).not.toBeNull();
  });

  test('P2 tab is focused after clicking +', async () => {
    const { container } = await renderIntoDom(
      React.createElement(TerminalWorkspacesManager, defaultProps())
    );

    await click(getAddButton(container));

    expectAutoFocusedTerminal(container, 'p2');
  });

  test('clicking P1 while P2 is active re-activates P1', async () => {
    const { container } = await renderIntoDom(
      React.createElement(TerminalWorkspacesManager, defaultProps())
    );

    await click(getAddButton(container));
    expectAutoFocusedTerminal(container, 'p2');

    // Click P1
    await click(getPanelTab(container, 'p1'));
    expectAutoFocusedTerminal(container, 'p1');
  });

  test('+ button is disabled and shows max-reached label at 3 panels', async () => {
    const { container } = await renderIntoDom(
      React.createElement(TerminalWorkspacesManager, defaultProps())
    );

    await click(getAddButton(container)); // → 2 panels
    await click(getAddButton(container)); // → 3 panels

    const addBtn = getAddButton(container);
    expect(addBtn.disabled).toBe(true);
    expect(addBtn.getAttribute('aria-label')).toBe('Máximo 3 terminales alcanzado');
  });

  test('no 4th panel tab renders after reaching max', async () => {
    const { container } = await renderIntoDom(
      React.createElement(TerminalWorkspacesManager, defaultProps())
    );

    await click(getAddButton(container)); // → 2
    await click(getAddButton(container)); // → 3

    expect(getPanelTab(container, 'p1')).not.toBeNull();
    expect(getPanelTab(container, 'p2')).not.toBeNull();
    expect(getPanelTab(container, 'p3')).not.toBeNull();
    expect(getPanelTab(container, 'p4')).toBeNull();
  });

  test('close button is absent when only 1 panel exists', async () => {
    const { container } = await renderIntoDom(
      React.createElement(TerminalWorkspacesManager, defaultProps())
    );

    const p1 = getPanelTab(container, 'p1');
    const closeBtn = p1.querySelector('[role="button"][aria-label="Cerrar P1"]');
    expect(closeBtn).toBeNull();
  });

  test('close button appears on tabs when 2+ panels exist', async () => {
    const { container } = await renderIntoDom(
      React.createElement(TerminalWorkspacesManager, defaultProps())
    );

    await click(getAddButton(container)); // → 2 panels

    const p1 = getPanelTab(container, 'p1');
    const p2 = getPanelTab(container, 'p2');
    expect(p1.querySelector('[role="button"]')).not.toBeNull();
    expect(p2.querySelector('[role="button"]')).not.toBeNull();
  });

  test('renders visible split controls with accessible shortcut hints', async () => {
    const { container } = await renderIntoDom(
      React.createElement(TerminalWorkspacesManager, defaultProps())
    );

    const splitRight = getSplitRightButton(container);
    const splitDown = getSplitDownButton(container);

    expect(splitRight).not.toBeNull();
    expect(splitRight.getAttribute('aria-label')).toContain('Split Right');
    expect(splitRight.getAttribute('title')).toContain('Ctrl+Shift+R');

    expect(splitDown).not.toBeNull();
    expect(splitDown.getAttribute('aria-label')).toContain('Split Down');
    expect(splitDown.getAttribute('title')).toContain('Ctrl+Shift+D');

    const workspaceHint = container.querySelector('[data-testid="panel-subtabs-shortcuts-hint"]');
    expect(workspaceHint).not.toBeNull();
    expect(workspaceHint?.textContent).toContain('Ctrl+Alt+ArrowLeft');
    expect(workspaceHint?.textContent).toContain('Ctrl+Alt+ArrowRight');
    expect(workspaceHint?.getAttribute('title')).toContain('Workspace Ctrl+Alt+ArrowLeft / Ctrl+Alt+ArrowRight');
  });

  test('clicking Split Right creates a new column and activates the new panel', async () => {
    const { container } = await renderIntoDom(
      React.createElement(TerminalWorkspacesManager, defaultProps())
    );

    await click(getSplitRightButton(container));

    const columns = container.querySelectorAll('[data-testid^="workspace-column-"]');
    expect(columns).toHaveLength(2);
    expect(columns[0].querySelector('[data-testid="terminal-p1"]')).not.toBeNull();
    expect(columns[1].querySelector('[data-testid="terminal-p2"]')).not.toBeNull();
    expectAutoFocusedTerminal(container, 'p2');
  });

  test('clicking Split Down stacks a panel in the same column and activates the new panel', async () => {
    const { container } = await renderIntoDom(
      React.createElement(TerminalWorkspacesManager, defaultProps())
    );

    await click(getSplitDownButton(container));

    expect(container.querySelector('[data-testid="workspace-column-panels-c1"]')).not.toBeNull();
    const panelSlots = container.querySelectorAll('[data-testid^="panel-slot-"]');
    expect(panelSlots).toHaveLength(2);
    expect(panelSlots[0].querySelector('[data-testid="terminal-p1"]')).not.toBeNull();
    expect(panelSlots[1].querySelector('[data-testid="terminal-p2"]')).not.toBeNull();
    expectAutoFocusedTerminal(container, 'p2');
  });

  test('split controls disable with a limit reason after reaching the max panel count', async () => {
    const { container } = await renderIntoDom(
      React.createElement(TerminalWorkspacesManager, defaultProps())
    );

    await click(getAddButton(container));
    await click(getAddButton(container));

    const splitRight = getSplitRightButton(container);
    const splitDown = getSplitDownButton(container);

    expect(splitRight.disabled).toBe(true);
    expect(splitRight.getAttribute('aria-label')).toContain('Máximo 3 terminales alcanzado');
    expect(splitDown.disabled).toBe(true);
    expect(splitDown.getAttribute('title')).toContain('Máximo 3 terminales alcanzado');

    await click(splitRight);
    await click(splitDown);

    expect(container.querySelectorAll('[data-testid^="panel-slot-"]')).toHaveLength(3);
    expect(getPanelTab(container, 'p4')).toBeNull();
  });

  test('closing P2 removes its tab and leaves P1 active', async () => {
    const { container } = await renderIntoDom(
      React.createElement(TerminalWorkspacesManager, defaultProps())
    );

    await click(getAddButton(container)); // → 2 panels

    // Close P2 via its × button
    const p2 = getPanelTab(container, 'p2');
    const closeP2 = p2.querySelector('[role="button"]');
    await click(closeP2);

    expect(getPanelTab(container, 'p2')).toBeNull();
    expect(getPanelTab(container, 'p1')).not.toBeNull();
  });
});
