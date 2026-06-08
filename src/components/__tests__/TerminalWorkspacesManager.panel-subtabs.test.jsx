/**
 * TerminalWorkspacesManager — Panel Sub-Tabs Bar tests
 *
 * Validates the P1/P2/P3 panel switcher bar that sits below the workspace tab bar.
 * - Renders P1 active by default with a disabled '+' (no additional panels yet)
 * - Clicking a Px tab activates that panel
 * - '+' button adds a second panel; tab count grows to P2
 * - '+' keeps adding panels (no hard max)
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

const mockTerminalTTYProps = [];

jest.mock('../TerminalTTY', () => ({
  __esModule: true,
  default: ({
    id,
    autoFocus,
    isActivePanel,
    requestedRendererMode = 'xterm',
    onResetRendererToXterm,
  }) => {
    const React = require('react');
    mockTerminalTTYProps.push({ id, autoFocus, isActivePanel, requestedRendererMode });
    return React.createElement(
      'div',
      { 'data-testid': `terminal-${id}`, 'data-autofocus': autoFocus ? 'true' : 'false' },
      [
        React.createElement(
          'span',
          { key: 'label', 'data-testid': `terminal-renderer-${id}` },
          requestedRendererMode
        ),
        React.createElement(
          'span',
          { key: 'active', 'data-testid': `terminal-active-${id}` },
          isActivePanel ? 'active' : 'inactive'
        ),
        onResetRendererToXterm
          ? React.createElement(
              'button',
              {
                key: 'reset',
                type: 'button',
                'data-testid': `terminal-renderer-reset-${id}`,
                onClick: onResetRendererToXterm,
              },
              'reset renderer'
            )
          : null,
      ]
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

jest.mock(
  '../workspace/FileExplorerEditorPane',
  () => ({
    __esModule: true,
    default: ({ embedded }) => {
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
    default: ({ dockState }) => {
      const React = require('react');
      return React.createElement('div', { 'data-testid': 'shared-bridge-pane' });
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

function getSubtabsBar(container) {
  return container.querySelector('[data-testid="panel-subtabs-bar"]');
}

function getPanelTab(container, label) {
  return container.querySelector(`[data-testid="panel-tab-${label.toLowerCase()}"]`);
}

function expectAutoFocusedTerminal(container, panelId) {
  expect(
    container.querySelector(`[data-testid="terminal-${panelId}"]`)?.getAttribute('data-autofocus')
  ).toBe('true');
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

function getVisibleWorkspaceShell(container) {
  return (
    Array.from(container.querySelectorAll('[data-testid^="workspace-shell-"]')).find(
      (node) =>
        !String(node.className || '').includes('hidden') &&
        !String(node.className || '').includes('pointer-events-none')
    ) || null
  );
}

function getTerminalRendererValues(container) {
  return Array.from(container.querySelectorAll('[data-testid^="terminal-renderer-p"]')).map(
    (node) => node.textContent
  );
}

function getLatestTerminalTTYProps(id) {
  return [...mockTerminalTTYProps].reverse().find((entry) => entry.id === id) || null;
}

async function changeSelect(element, value) {
  flushSync(() => {
    element.value = value;
    element.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
  await flushEffects();
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
    mockTerminalTTYProps.length = 0;
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
    mockTerminalTTYProps.length = 0;
    jest.clearAllMocks();
  });

  test('renders sub-tabs bar with V1 active on initial load', async () => {
    const { container } = await renderIntoDom(
      React.createElement(TerminalWorkspacesManager, defaultProps())
    );

    const bar = getSubtabsBar(container);
    expect(bar).not.toBeNull();

    const p1 = getPanelTab(container, 'p1');
    expect(p1).not.toBeNull();
    expect(p1.textContent).toContain('V1');
  });

  test('+ button is enabled when only 1 view exists', async () => {
    const { container } = await renderIntoDom(
      React.createElement(TerminalWorkspacesManager, defaultProps())
    );

    const addBtn = getAddButton(container);
    expect(addBtn).not.toBeNull();
    expect(addBtn.disabled).toBe(false);
    expect(addBtn.getAttribute('aria-label')).toBe('Agregar vista');
  });

  test('clicking + adds a V2 tab', async () => {
    const { container } = await renderIntoDom(
      React.createElement(TerminalWorkspacesManager, defaultProps())
    );

    await click(getAddButton(container));

    expect(getPanelTab(container, 'p1')).not.toBeNull();
    expect(getPanelTab(container, 'p2')).not.toBeNull();
  });

  test('V2 tab is focused after clicking +', async () => {
    const { container } = await renderIntoDom(
      React.createElement(TerminalWorkspacesManager, defaultProps())
    );

    await click(getAddButton(container));

    expectAutoFocusedTerminal(container, 'p2');
  });

  test('clicking V1 while V2 is active re-activates V1', async () => {
    const { container } = await renderIntoDom(
      React.createElement(TerminalWorkspacesManager, defaultProps())
    );

    await click(getAddButton(container));
    expectAutoFocusedTerminal(container, 'p2');

    // Click P1
    await click(getPanelTab(container, 'p1'));
    expectAutoFocusedTerminal(container, 'p1');
  });

  test('+ button stays enabled after creating 3 panels', async () => {
    const { container } = await renderIntoDom(
      React.createElement(TerminalWorkspacesManager, defaultProps())
    );

    await click(getAddButton(container)); // → 2 panels
    await click(getAddButton(container)); // → 3 panels

    const addBtn = getAddButton(container);
    expect(addBtn.disabled).toBe(false);
    expect(addBtn.getAttribute('aria-label')).toBe('Agregar vista');
  });

  test('allows rendering a 4th panel tab', async () => {
    const { container } = await renderIntoDom(
      React.createElement(TerminalWorkspacesManager, defaultProps())
    );

    await click(getAddButton(container)); // → 2
    await click(getAddButton(container)); // → 3
    await click(getAddButton(container)); // → 4

    expect(getPanelTab(container, 'p1')).not.toBeNull();
    expect(getPanelTab(container, 'p2')).not.toBeNull();
    expect(getPanelTab(container, 'p3')).not.toBeNull();
    expect(getPanelTab(container, 'p4')).not.toBeNull();
  });

  test('close button is absent when only 1 view exists', async () => {
    const { container } = await renderIntoDom(
      React.createElement(TerminalWorkspacesManager, defaultProps())
    );

    const p1 = getPanelTab(container, 'p1');
    const closeBtn = p1.querySelector('[role="button"][aria-label="Cerrar V1"]');
    expect(closeBtn).toBeNull();
  });

  test('close button appears on tabs when 2+ views exist', async () => {
    const { container } = await renderIntoDom(
      React.createElement(TerminalWorkspacesManager, defaultProps())
    );

    await click(getAddButton(container)); // → 2 views

    const p1 = getPanelTab(container, 'p1');
    const p2 = getPanelTab(container, 'p2');
    expect(p1.querySelector('[role="button"]')).not.toBeNull();
    expect(p2.querySelector('[role="button"]')).not.toBeNull();
  });

  test('renders visible split controls without shortcut hint badges', async () => {
    const { container } = await renderIntoDom(
      React.createElement(TerminalWorkspacesManager, defaultProps())
    );

    const splitRight = getSplitRightButton(container);
    const splitDown = getSplitDownButton(container);

    expect(splitRight).not.toBeNull();
    expect(splitRight.getAttribute('aria-label')).toContain('Dividir a la derecha');
    expect(splitRight.getAttribute('title')).toContain('Dividir a la derecha');
    expect(splitRight.textContent).toBe('');

    expect(splitDown).not.toBeNull();
    expect(splitDown.getAttribute('aria-label')).toContain('Dividir hacia abajo');
    expect(splitDown.getAttribute('title')).toContain('Dividir hacia abajo');
    expect(splitDown.textContent).toBe('');

    const workspaceHint = container.querySelector('[data-testid="panel-subtabs-shortcuts-hint"]');
    expect(workspaceHint).toBeNull();
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

  test('split controls remain enabled after creating multiple views and can keep splitting in the active view', async () => {
    const { container } = await renderIntoDom(
      React.createElement(TerminalWorkspacesManager, defaultProps())
    );

    await click(getAddButton(container));
    await click(getAddButton(container));

    const splitRight = getSplitRightButton(container);
    const splitDown = getSplitDownButton(container);

    expect(splitRight.disabled).toBe(false);
    expect(splitDown.disabled).toBe(false);

    await click(splitRight);
    await click(splitDown);

    const visibleShell = getVisibleWorkspaceShell(container);
    expect(visibleShell?.querySelectorAll('[data-testid^="panel-slot-"]')).toHaveLength(3);
    expect(getPanelTab(container, 'p4')).toBeNull();
    expect(getPanelTab(container, 'p5')).toBeNull();
  });

  test('closing V2 removes its tab and leaves V1 active', async () => {
    const { container } = await renderIntoDom(
      React.createElement(TerminalWorkspacesManager, defaultProps())
    );

    await click(getAddButton(container)); // → 2 views

    // Close V2 via its × button
    const p2 = getPanelTab(container, 'p2');
    const closeP2 = p2.querySelector('[role="button"]');
    await click(closeP2);

    expect(getPanelTab(container, 'p2')).toBeNull();
    expect(getPanelTab(container, 'p1')).not.toBeNull();
    expectAutoFocusedTerminal(container, 'p1');
  });

  test('closing a split V1 does not transfer its panels into the remaining V2', async () => {
    const { container } = await renderIntoDom(
      React.createElement(TerminalWorkspacesManager, defaultProps())
    );

    await click(getSplitRightButton(container));
    expect(
      getVisibleWorkspaceShell(container)?.querySelectorAll('[data-testid^="panel-slot-"]')
    ).toHaveLength(2);
    expect(
      getVisibleWorkspaceShell(container)?.querySelector('[data-testid="terminal-p1"]')
    ).not.toBeNull();
    expect(
      getVisibleWorkspaceShell(container)?.querySelector('[data-testid="terminal-p2"]')
    ).not.toBeNull();

    await click(getAddButton(container));
    expectAutoFocusedTerminal(container, 'p3');

    await click(getPanelTab(container, 'p1'));
    expect(
      getVisibleWorkspaceShell(container)?.querySelectorAll('[data-testid^="panel-slot-"]')
    ).toHaveLength(2);

    const closeV1 = getPanelTab(container, 'p1').querySelector('[role="button"]');
    await click(closeV1);

    expect(getPanelTab(container, 'p2')).toBeNull();
    expect(
      getVisibleWorkspaceShell(container)?.querySelectorAll('[data-testid^="panel-slot-"]')
    ).toHaveLength(1);
    expect(
      getVisibleWorkspaceShell(container)?.querySelector('[data-testid="terminal-p3"]')
    ).not.toBeNull();
    expect(
      getVisibleWorkspaceShell(container)?.querySelector('[data-testid="terminal-p1"]')
    ).toBeNull();
    expect(
      getVisibleWorkspaceShell(container)?.querySelector('[data-testid="terminal-p2"]')
    ).toBeNull();
  });

  test('stores an explicit renderer selection for the active panel and keeps other panels independent', async () => {
    window.localStorage.setItem(
      'devhub_terminal_renderer_preferences:proj-1',
      JSON.stringify({
        version: 1,
        workspaces: {
          ws1: {
            defaultMode: 'vte-experimental',
            panels: { p1: 'xterm' },
          },
        },
      })
    );

    const { container } = await renderIntoDom(
      React.createElement(TerminalWorkspacesManager, defaultProps())
    );

    expect(container.querySelector('[data-testid="terminal-renderer-p1"]')?.textContent).toBe(
      'xterm'
    );

    await click(getAddButton(container));
    expect(container.querySelector('[data-testid="terminal-renderer-p2"]')?.textContent).toBe(
      'vte-experimental'
    );

    await click(getPanelTab(container, 'p1'));
    expect(container.querySelector('[data-testid="terminal-renderer-p1"]')?.textContent).toBe(
      'xterm'
    );
  });

  test('lets the visible terminal recovery action force the active panel back to xterm', async () => {
    window.localStorage.setItem(
      'devhub_terminal_renderer_preferences:proj-1',
      JSON.stringify({
        version: 1,
        workspaces: {
          ws1: {
            defaultMode: 'vte-experimental',
            panels: { p1: 'vte-experimental' },
          },
        },
      })
    );

    const { container } = await renderIntoDom(
      React.createElement(TerminalWorkspacesManager, defaultProps())
    );

    await click(container.querySelector('[data-testid="terminal-renderer-reset-p1"]'));

    expect(container.querySelector('[data-testid="terminal-renderer-p1"]')?.textContent).toBe(
      'xterm'
    );
  });

  test('uses xterm-webgl as the default renderer for fresh workspaces and inherited views', async () => {
    const { container } = await renderIntoDom(
      React.createElement(TerminalWorkspacesManager, defaultProps())
    );

    expect(container.querySelector('[data-testid="terminal-renderer-p1"]')?.textContent).toBe(
      'xterm-webgl'
    );
  });

  test('persisted workspace default renderer from settings/preferences is reused after reload', async () => {
    window.localStorage.setItem('devhub_terminal_renderer_default_mode', 'xterm');
    window.localStorage.setItem(
      'devhub_terminal_renderer_preferences:proj-1',
      JSON.stringify({
        version: 1,
        defaultMode: 'xterm',
        workspaces: {
          ws1: {
            defaultMode: 'xterm',
            panels: {},
          },
        },
      })
    );

    const firstView = await renderIntoDom(
      React.createElement(TerminalWorkspacesManager, defaultProps())
    );

    await click(getAddButton(firstView.container));

    expect(
      firstView.container.querySelector('[data-testid="terminal-renderer-p2"]')?.textContent
    ).toBe('xterm');

    const secondView = await renderIntoDom(
      React.createElement(TerminalWorkspacesManager, defaultProps())
    );

    expect(getTerminalRendererValues(secondView.container)).toContain('xterm');
  });

  test('applies global Settings renderer default when no workspace override exists', async () => {
    window.localStorage.setItem('devhub_terminal_renderer_default_mode', 'xterm');

    const { container } = await renderIntoDom(
      React.createElement(TerminalWorkspacesManager, defaultProps())
    );

    expect(container.querySelector('[data-testid="terminal-renderer-p1"]')?.textContent).toBe(
      'xterm'
    );
  });

  test('keeps explicit panel override independent from workspace default settings', async () => {
    window.localStorage.setItem('devhub_terminal_renderer_default_mode', 'vte-experimental');
    window.localStorage.setItem(
      'devhub_terminal_renderer_preferences:proj-1',
      JSON.stringify({
        version: 1,
        defaultMode: 'vte-experimental',
        workspaces: {
          ws1: {
            defaultMode: 'vte-experimental',
            panels: { p1: 'xterm' },
          },
        },
      })
    );

    const { container } = await renderIntoDom(
      React.createElement(TerminalWorkspacesManager, defaultProps())
    );

    expect(container.querySelector('[data-testid="terminal-renderer-p1"]')?.textContent).toBe(
      'xterm'
    );
  });

  test('does not show operational renderer selectors in the terminal header anymore', async () => {
    const { container } = await renderIntoDom(
      React.createElement(TerminalWorkspacesManager, defaultProps())
    );

    expect(
      container.querySelector('[data-testid="terminal-renderer-workspace-select"]')
    ).toBeNull();
    expect(container.querySelector('[data-testid="terminal-renderer-panel-select"]')).toBeNull();
    expect(container.textContent).not.toContain('Renderer por defecto');
    expect(container.textContent).not.toContain('Vista activa');
  });

  test('marks only the active panel as native-eligible when switching between views', async () => {
    const { container } = await renderIntoDom(
      React.createElement(TerminalWorkspacesManager, defaultProps())
    );

    await click(getAddButton(container));

    expect(container.querySelector('[data-testid="terminal-active-p2"]')?.textContent).toBe(
      'active'
    );
    expect(getLatestTerminalTTYProps('p1')).toEqual(
      expect.objectContaining({ isActivePanel: true })
    );
    expect(getLatestTerminalTTYProps('p2')).toEqual(
      expect.objectContaining({ isActivePanel: true })
    );

    await click(getPanelTab(container, 'p1'));

    expect(container.querySelector('[data-testid="terminal-active-p1"]')?.textContent).toBe(
      'active'
    );
    expect(getLatestTerminalTTYProps('p1')).toEqual(
      expect.objectContaining({ isActivePanel: true })
    );
    expect(container.querySelector('[data-testid="terminal-p2"]')).toBeNull();
  });
});
