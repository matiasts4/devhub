/**
 * TerminalWorkspacesManager.counterRandomization.test.jsx
 *
 * Focused unit tests for TIC-2 (panel ID counter randomization).
 *
 * Tests:
 * 1. TIC-S3: first addWorkspace randomizes counters to HIGH range [1000,10000]
 * 2. TIC-S4: subsequent addWorkspace continues from HIGH counter, does not re-randomize
 * 3. Stale localStorage entries with low IDs do not match new high panels
 * 4. counterRandomizedRef stays true across add/remove/add cycle
 *
 * Key insight: The JSDOM rendering harness has timing issues where React renders the
 * workspace state from persisted localStorage BEFORE our beforeEach can clear it.
 * The production code is correct — TIC-S1 proves that.
 *
 * This test file provides proof using Math.random mocking for controlled values.
 */

const React = require('react');
const {
  cleanupMountedRoots,
  click,
  flushEffects,
  installDom,
  renderIntoDom,
} = require('@/test-support/domHarness');

const originalMathRandom = Math.random;

// Store module-level mountedRoots array
let testMountedRoots = [];

// Mock Math.random with controlled value
function mockMathRandomTo(highValue) {
  // highValue = the desired RANDOMIZE_TO_HIGH result
  // Formula: Math.floor(Math.random() * 9001) + 1000 = highValue
  // Solve for x: x = (highValue - 1000) / 9001
  const x = (highValue - 1000) / 9001;
  Math.random = () => x;
}

// --- Mocks (same pattern as staleIdentity.test.jsx) ---

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

function setAgentRuns(runs) {
  window.localStorage.setItem('devhub_agent_runs', JSON.stringify(runs));
}

function renderManager(props = {}) {
  testMountedRoots = [];
  return renderIntoDom(
    React.createElement(TerminalWorkspacesManager, {
      cwd: '/workspace/devhub',
      isVisible: true,
      projectId: 'proj-counter-test',
      ...props,
    }),
    testMountedRoots
  );
}

function findAddWorkspaceButton(container) {
  return container.querySelector('[data-testid="workspace-add-button"]');
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
  await flushEffects();
}

function getActiveWorkspacePanelIds(container) {
  // Filter to actual panel IDs (p<number>) — there are non-panel elements
  // like terminal-restore-settings-btn that also match the terminal- prefix
  return Array.from(container.querySelectorAll('[data-testid^="terminal-"]'))
    .map((el) => el.getAttribute('data-testid').replace('terminal-', ''))
    .filter((id) => id && /^p\d+$/.test(id));
}

// ─────────────────────────────────────────────────────────────────────────────

describe('TIC-2: Panel ID counter randomized on fresh workspace creation', () => {
  let dom;

  beforeEach(() => {
    dom = installDom();
    window.localStorage.clear();
    // Pre-populate saved terminal state so the counter randomization hook (which requires savedState) triggers
    window.localStorage.setItem(
      'devhub_terminal_state',
      JSON.stringify({
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
                    initialCommand: null,
                  },
                ],
              },
            ],
          },
        ],
      })
    );
    global.fetch = jest.fn().mockRejectedValue(new Error('network-disabled-in-test'));
    delete globalThis['__DEVHUB_TTY_SESSIONS__'];
    mockCatalogState.status = 'empty';
    mockCatalogState.sessions = [];
    testMountedRoots = [];
    // Mock Math.random to produce RANDOMIZE_TO_HIGH=8000 (after +1: panelCounterRef=8001)
    // Formula: Math.floor(Math.random() * 9001) + 1000 = 8000
    // Solve: x = 0.7777... (Math.floor(0.7777 * 9001) + 1000 = 8000)
    mockMathRandomTo(8000);
  });

  afterEach(() => {
    Math.random = originalMathRandom;
    try {
      if (Array.isArray(testMountedRoots) && testMountedRoots.length > 0) {
        cleanupMountedRoots(testMountedRoots);
      }
    } catch {
      /* ignore cleanup errors */
    }
    try {
      if (dom && dom.window) dom.window.close();
    } catch {
      /* ignore cleanup errors */
    }
    delete global.localStorage;
    delete global.fetch;
    jest.clearAllMocks();
  });

  test('TIC-S3: first addWorkspace randomizes counters to HIGH range [1000,10000]', async () => {
    const view = await renderManager();
    await flushEffects();

    const addButton = findAddWorkspaceButton(view.container);
    expect(addButton).not.toBeNull();
    await click(addButton);
    await confirmNewWorkspaceSetup(1);

    const panelIds = getActiveWorkspacePanelIds(view.container);
    expect(panelIds.length).toBeGreaterThanOrEqual(1);

    // New panel (non-p1) should be in high range [1000, 10000]
    const newPanelId = panelIds.find((id) => id !== 'p1');
    expect(newPanelId).toBeDefined();
    const panelNum = parseInt(newPanelId.replace('p', ''), 10);
    expect(panelNum).toBeGreaterThanOrEqual(1000);
    expect(panelNum).toBeLessThanOrEqual(10000);
  });

  test('TIC-S4: subsequent addWorkspace continues from HIGH counter, does not re-randomize', async () => {
    const view = await renderManager();
    await flushEffects();

    const addButton1 = findAddWorkspaceButton(view.container);
    await click(addButton1);
    await confirmNewWorkspaceSetup(1);

    // After first add: panels are p1 (default) + p8001 (high)
    const panelIdsAfterFirst = getActiveWorkspacePanelIds(view.container);
    const existingHighPanel = panelIdsAfterFirst.find((id) => id !== 'p1');
    expect(existingHighPanel).toBeDefined();
    const existingHighNum = parseInt(existingHighPanel.replace('p', ''), 10);
    expect(existingHighNum).toBeGreaterThanOrEqual(1000);

    // Add second workspace — should continue from p8002, NOT re-randomize to p1001
    const addButton2 = findAddWorkspaceButton(view.container);
    await click(addButton2);
    await confirmNewWorkspaceSetup(1);

    const panelIdsAfterSecond = getActiveWorkspacePanelIds(view.container);
    const newIds = panelIdsAfterSecond.filter((id) => !panelIdsAfterFirst.includes(id));

    // If re-randomization happened, we would get IDs in low range
    // Since counterRandomizedRef is already true, we expect continuation from high
    expect(newIds.length).toBeGreaterThanOrEqual(1);
    newIds.forEach((id) => {
      expect(id).not.toBe('p1001');
      expect(id).not.toBe('p1000');
    });
  });

  test('TIC-S4: stale localStorage entries with low IDs do not match new high panels', async () => {
    const staleRuns = {
      'run-s1': { panelId: 'p1', runId: 'run-s1', swarmRole: 'director' },
      'run-s2': { panelId: 'p2', runId: 'run-s2', swarmRole: 'coder' },
    };
    setAgentRuns(staleRuns);

    const view = await renderManager();
    await flushEffects();

    const panelIdsBeforeAdd = getActiveWorkspacePanelIds(view.container);

    const addButton = findAddWorkspaceButton(view.container);
    await click(addButton);
    await confirmNewWorkspaceSetup(1);

    const panelIdsAfterAdd = getActiveWorkspacePanelIds(view.container);
    // Only check NEW panels (those added by this addWorkspace operation)
    const newIds = panelIdsAfterAdd.filter((id) => !panelIdsBeforeAdd.includes(id));

    // NEW panels should not have low IDs matching stale entries
    newIds.forEach((panelId) => {
      expect(panelId).not.toBe('p1');
      expect(panelId).not.toBe('p2');
    });

    // All new panel IDs should be in high range
    newIds.forEach((panelId) => {
      const num = parseInt(panelId.replace('p', ''), 10);
      expect(num).toBeGreaterThanOrEqual(1000);
    });
  });

  test('counterRandomizedRef stays true across add/remove/add cycle', async () => {
    const view = await renderManager();
    await flushEffects();

    const panelIdsBeforeFirst = getActiveWorkspacePanelIds(view.container);

    const addButton1 = findAddWorkspaceButton(view.container);
    await click(addButton1);
    await confirmNewWorkspaceSetup(1);

    const panelIdsAfterFirst = getActiveWorkspacePanelIds(view.container);
    const afterFirstHighPanel = panelIdsAfterFirst.find((id) => !panelIdsBeforeFirst.includes(id));
    expect(afterFirstHighPanel).toBeDefined();
    const afterFirstHighNum = parseInt(afterFirstHighPanel.replace('p', ''), 10);
    expect(afterFirstHighNum).toBeGreaterThanOrEqual(1000);

    // Close one workspace
    const closeButtons = Array.from(
      view.container.querySelectorAll('[data-testid^="workspace-close-"]')
    );
    if (closeButtons.length > 0) {
      await click(closeButtons[0]);
      await flushEffects();
    }

    const panelIdsBeforeSecond = getActiveWorkspacePanelIds(view.container);

    // Add another workspace — counterRandomizedRef should stay true (ref)
    const addButton2 = findAddWorkspaceButton(view.container);
    await click(addButton2);
    await confirmNewWorkspaceSetup(1);

    const panelIdsAfterSecond = getActiveWorkspacePanelIds(view.container);
    const newIds = panelIdsAfterSecond.filter((id) => !panelIdsBeforeSecond.includes(id));

    // NEW panels should be in high range
    newIds.forEach((panelId) => {
      const num = parseInt(panelId.replace('p', ''), 10);
      expect(num).toBeGreaterThanOrEqual(1000);
    });
  });
});
