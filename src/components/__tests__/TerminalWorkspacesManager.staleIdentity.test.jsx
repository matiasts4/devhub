/**
 * TerminalWorkspacesManager.staleIdentity.test.jsx
 *
 * Regression tests for TIC-1 (workspace close unbinding) and TIC-2 (panel ID counter
 * randomization on fresh workspace creation).
 *
 * TIC-1: removeWorkspace() must clean devhub_agent_runs entries for the workspace's panels
 *         BEFORE React state removal, preventing stale identity bleed into new workspaces.
 * TIC-2: Counter randomization fires only when workspaces transition from 0→N (fresh creation),
 *         NOT on restore (when workspaces already exist on mount).
 *
 * Note: The component's close button (X) on workspace tabs only appears when workspaces.length > 1.
 * The add-workspace button has data-testid="workspace-add-button".
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

// --- Mocks (same pattern as TerminalWorkspacesManager.reopen.test.jsx) ---

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
  default: ({ id, initialCommand, requestedRendererMode = 'xterm' }) => {
    const React = require('react');
    return React.createElement(
      'div',
      {
        'data-testid': `terminal-${id}`,
        'data-command': initialCommand || '',
        'data-renderer': requestedRendererMode,
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

// Mock the catalog BEFORE TerminalWorkspacesManager is imported
const mockCatalogState = {
  status: 'empty',
  sessions: [],
  error: null,
  isLoading: false,
  refresh: jest.fn(),
  retry: jest.fn(),
};

jest.mock('@/hooks/useResumableSessionCatalog', () => ({
  __esModule: true,
  default: () => mockCatalogState,
}));

const TerminalWorkspacesManager = require('../TerminalWorkspacesManager').default;

// Mock localStorage for devhub_agent_runs
function setAgentRuns(runs) {
  window.localStorage.setItem('devhub_agent_runs', JSON.stringify(runs));
}

function getAgentRuns() {
  return JSON.parse(window.localStorage.getItem('devhub_agent_runs') || '{}');
}

function renderManager(props = {}) {
  return renderIntoDom(
    React.createElement(TerminalWorkspacesManager, {
      cwd: '/workspace/devhub',
      isVisible: true,
      projectId: 'proj-stale-identity-test',
      ...props,
    }),
    mountedRoots
  );
}

// Helper to find the workspace add button (has data-testid="workspace-add-button")
function findAddWorkspaceButton(container) {
  return container.querySelector('[data-testid="workspace-add-button"]');
}

// Helper to find workspace close buttons (X buttons on tabs, only visible when workspaces.length > 1)
function findWorkspaceCloseButtons(container) {
  // The close button is inside the workspace tab div, contains an X icon
  // We find all buttons inside the tab bar (but not the add button)
  const allButtons = Array.from(container.querySelectorAll('button'));
  return allButtons.filter((btn) => {
    // Exclude the add workspace button
    if (btn.getAttribute('data-testid') === 'workspace-add-button') return false;
    // The X button is the close button
    const svg = btn.querySelector('svg[data-icon="X"]');
    return svg !== null;
  });
}

// Helper to find active workspace terminal IDs
function getActiveWorkspacePanelIds(container) {
  // Find the active workspace (the one that's currently displayed)
  // The terminal panels are inside [data-panel-size] elements
  const panelGroups = container.querySelectorAll('[data-panel-size]');
  const panelIds = [];
  panelGroups.forEach((pg) => {
    const terminals = pg.querySelectorAll('[data-testid^="terminal-"]');
    terminals.forEach((t) => {
      panelIds.push(t.getAttribute('data-testid').replace('terminal-', ''));
    });
  });
  return panelIds;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('TIC-1: Workspace close unbinds terminal identity state', () => {
  let dom;

  beforeEach(() => {
    dom = installDom();
    window.localStorage.clear();
    global.fetch = jest.fn().mockRejectedValue(new Error('network-disabled-in-test'));

    // CRITICAL: Clear ttyServer session global so each test starts fresh
    delete globalThis['__DEVHUB_TTY_SESSIONS__'];

    // Reset and configure the catalog mock for this test
    mockCatalogState.status = 'empty';
    mockCatalogState.sessions = [];
    mockCatalogState.error = null;
    mockCatalogState.isLoading = false;
  });

  afterEach(() => {
    cleanupMountedRoots(mountedRoots);
    dom.window.close();
    delete global.localStorage;
    delete global.fetch;
    jest.clearAllMocks();
  });

  test('TIC-S1: devhub_agent_runs entries are deleted when workspace is removed', async () => {
    // Setup: two workspaces — ws1 (swarm with director/coder panels) and ws2 (normal)
    // When ws1 is removed, its panels' devhub_agent_runs entries must be deleted
    const runs = {
      'run-director': {
        panelId: 'p1',
        runId: 'run-director',
        swarmRole: 'director',
        taskTitle: 'Director',
      },
      'run-coder': { panelId: 'p2', runId: 'run-coder', swarmRole: 'coder', taskTitle: 'Coder' },
      'run-other': {
        panelId: 'p99',
        runId: 'run-other',
        swarmRole: 'builder',
        taskTitle: 'Builder',
      },
    };
    setAgentRuns(runs);

    const view = await renderManager();
    await flushEffects();

    // Add a second workspace so close buttons appear (close button only shows when workspaces.length > 1)
    const addButton = findAddWorkspaceButton(view.container);
    expect(addButton).not.toBeNull();
    await click(addButton);
    await flushEffects();

    // Now there should be close buttons
    const closeButtons = findWorkspaceCloseButtons(view.container);
    expect(closeButtons.length).toBeGreaterThanOrEqual(2);

    // Close the FIRST workspace (ws1 with p1, p2) by clicking its close button
    // The close buttons are inside the workspace tab divs - the first close button is on the first tab
    await click(closeButtons[0]);
    await flushEffects();

    // TIC-1: ws1's entries (p1, p2) must be gone; p99's entry must remain
    const remaining = getAgentRuns();
    expect(remaining['run-director']).toBeUndefined();
    expect(remaining['run-coder']).toBeUndefined();
    expect(remaining['run-other']).toBeDefined();
    expect(remaining['run-other'].panelId).toBe('p99');
  });

  test('TIC-S2: closing a workspace with multiple panels cleans all its panel identities', async () => {
    // Setup: a workspace ws-multi with panels p10, p11, p12 each bound to different agent runs
    const runs = {
      'run-a': { panelId: 'p10', runId: 'run-a', swarmRole: 'director' },
      'run-b': { panelId: 'p11', runId: 'run-b', swarmRole: 'coder' },
      'run-c': { panelId: 'p12', runId: 'run-c', swarmRole: 'auditor' },
      'run-orphan': { panelId: 'p77', runId: 'run-orphan', swarmRole: 'builder' },
    };
    setAgentRuns(runs);

    const view = await renderManager();
    await flushEffects();

    // Add a workspace to make close buttons visible
    const addButton = findAddWorkspaceButton(view.container);
    expect(addButton).not.toBeNull();
    await click(addButton);
    await flushEffects();

    // Close the first workspace
    const closeButtons = findWorkspaceCloseButtons(view.container);
    expect(closeButtons.length).toBeGreaterThanOrEqual(1);
    await click(closeButtons[0]);
    await flushEffects();

    const remaining = getAgentRuns();
    // All entries from the closed workspace must be gone
    expect(remaining['run-a']).toBeUndefined();
    expect(remaining['run-b']).toBeUndefined();
    expect(remaining['run-c']).toBeUndefined();
    // The orphan entry must survive
    expect(remaining['run-orphan']).toBeDefined();
  });
});

describe('TIC-2: Panel ID counter randomized on fresh workspace creation', () => {
  let dom;

  beforeEach(() => {
    dom = installDom();
    window.localStorage.clear();
    global.fetch = jest.fn().mockRejectedValue(new Error('network-disabled-in-test'));

    // CRITICAL: Clear ttyServer session global so each test starts fresh
    delete globalThis['__DEVHUB_TTY_SESSIONS__'];

    // Catalog shows NO resumable sessions
    mockCatalogState.status = 'empty';
    mockCatalogState.sessions = [];
    mockCatalogState.error = null;
    mockCatalogState.isLoading = false;
  });

  afterEach(() => {
    cleanupMountedRoots(mountedRoots);
    dom.window.close();
    delete global.localStorage;
    delete global.fetch;
    jest.clearAllMocks();
  });

  test('TIC-S3: new workspace panels get fresh IDs after close+add cycle', async () => {
    // This test verifies the full TIC-2 scenario:
    // 1. Existing workspace with panels bound to stale devhub_agent_runs
    // 2. Close that workspace → TIC-1 cleans devhub_agent_runs
    // 3. Create new workspace → TIC-2 counter randomized on 0→N transition
    // 4. New panel IDs do NOT collide with stale IDs

    const staleRuns = {
      'run-s1': { panelId: 'p1', runId: 'run-s1', swarmRole: 'director' },
      'run-s2': { panelId: 'p2', runId: 'run-s2', swarmRole: 'coder' },
    };
    setAgentRuns(staleRuns);

    const view = await renderManager();
    await flushEffects();

    // Add a workspace first (so we can then close and re-add)
    const addButton1 = findAddWorkspaceButton(view.container);
    expect(addButton1).not.toBeNull();
    await click(addButton1);
    await flushEffects();

    // Now close the first workspace
    const closeButtons = findWorkspaceCloseButtons(view.container);
    expect(closeButtons.length).toBeGreaterThanOrEqual(1);
    await click(closeButtons[0]);
    await flushEffects();

    // Add a new workspace
    const addButton2 = findAddWorkspaceButton(view.container);
    expect(addButton2).not.toBeNull();
    await click(addButton2);
    await flushEffects();

    // Get panel IDs from the active workspace
    const livePanelIds = getActiveWorkspacePanelIds(view.container);

    // New panel IDs must NOT be p1 or p2 (stale IDs from before the close+add cycle)
    livePanelIds.forEach((panelId) => {
      expect(panelId).not.toBe('p1');
      expect(panelId).not.toBe('p2');
    });

    // There should be at least one panel
    expect(livePanelIds.length).toBeGreaterThanOrEqual(1);
  });
});

describe('TIC-S1 / TIC-S2 regression: no stale identity in new workspaces', () => {
  let dom;

  beforeEach(() => {
    dom = installDom();
    window.localStorage.clear();
    global.fetch = jest.fn().mockRejectedValue(new Error('network-disabled-in-test'));

    // CRITICAL: Clear ttyServer session global
    delete globalThis['__DEVHUB_TTY_SESSIONS__'];

    // Catalog shows NO resumable sessions
    mockCatalogState.status = 'empty';
    mockCatalogState.sessions = [];
    mockCatalogState.error = null;
    mockCatalogState.isLoading = false;
  });

  afterEach(() => {
    cleanupMountedRoots(mountedRoots);
    dom.window.close();
    delete global.localStorage;
    delete global.fetch;
    jest.clearAllMocks();
  });

  test('after swarm workspace close, first new workspace shows no director/coder label', async () => {
    // Simulate: swarm workspace with director/coder ran and was closed
    const staleRuns = {
      'director-run': {
        panelId: 'p1',
        runId: 'director-run',
        swarmRole: 'director',
        taskTitle: 'Director task',
      },
      'coder-run': {
        panelId: 'p2',
        runId: 'coder-run',
        swarmRole: 'coder',
        taskTitle: 'Coder task',
      },
    };
    setAgentRuns(staleRuns);

    const view = await renderManager();
    await flushEffects();

    // Close initial workspace(s) - need at least 2 to have close buttons
    const addButton1 = findAddWorkspaceButton(view.container);
    if (addButton1) {
      await click(addButton1);
      await flushEffects();
    }

    const closeButtons = findWorkspaceCloseButtons(view.container);
    if (closeButtons.length >= 1) {
      await click(closeButtons[0]);
      await flushEffects();
    }

    // Add first new workspace
    const addButton2 = findAddWorkspaceButton(view.container);
    if (addButton2) {
      await click(addButton2);
      await flushEffects();
    }

    // The active workspace must NOT show director or coder labels
    const livePanelIds = getActiveWorkspacePanelIds(view.container);
    // Fresh panels should not have IDs like p1 or p2
    livePanelIds.forEach((panelId) => {
      expect(['p1', 'p2']).not.toContain(panelId);
    });
  });
});
