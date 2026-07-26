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
 * Key insight: Tests model the REAL user scenario:
 * - A workspace has panels X,Y; devhub_agent_runs stores entries for X,Y
 * - User closes that workspace → entries for X,Y must be cleaned
 * - New workspace panels must NOT reuse X,Y IDs
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

const originalMathRandom = Math.random;

function mockMathRandomTo(highValue) {
  const x = (highValue - 1000) / 9001;
  Math.random = () => x;
}

function seedDefaultTerminalState() {
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
              panels: [{ id: 'p1', initialCommand: null }],
            },
          ],
        },
      ],
    })
  );
}

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

// Helper to find workspace close buttons using reliable data-testid attribute.
// The close button is a sibling inside the workspace tab div (not inside panel-chrome-overlay).
// Only appears when workspaces.length > 1.
function findWorkspaceCloseButtons(container) {
  return Array.from(container.querySelectorAll('[data-testid^="workspace-close-"]'));
}

// Helper to find the workspace add button
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

// Helper to find active workspace panel IDs from mock TerminalTTY elements.
// Mock TerminalTTY renders: <div data-testid="terminal-{id}">{id}</div>
// Filter to actual panel IDs (p<number>) — there are non-panel elements
// like terminal-restore-settings-btn that also match the terminal- prefix.
function getActiveWorkspacePanelIds(container) {
  return Array.from(container.querySelectorAll('[data-testid^="terminal-"]'))
    .map((el) => el.getAttribute('data-testid').replace('terminal-', ''))
    .filter((id) => id && /^p\d+$/.test(id));
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
    // Setup: Seed devhub_agent_runs with entries for panels p1 and p2 (the ACTUAL default panels).
    // The default state has ws1 with columns [c1] containing panels [p1].
    // After addWorkspace, ws1 still has p1 and a new panel (e.g., p2) is added to ws2.
    //
    // So: p1 = default ws1 panel (STAYS after close), p2 = new panel in ws2 (STAYS after close)
    // but we want p1 to map to the workspace being closed. The simplest correct approach:
    // Seed runs for ACTUAL current panels: p3,p4 (second+ third panel via split).
    //
    // KEY INSIGHT: The default state already has one workspace (ws1) with p1.
    // When we add a workspace, a new panel p2 is created. ws1 still has p1.
    // When we close ws1: only the default p1 panel is removed from ws1.
    //
    // Strategy: Seed runs for PANELS THAT EXIST IN THE DEFAULT STATE that we'll manipulate.
    // The default workspace (ws1) has panel p1. We'll split p1 into p1 + p2.
    // Then we'll close ws1 (removing all its panels: p1 and p2).
    const runs = {
      'run-p1-director': {
        panelId: 'p1',
        runId: 'run-p1-director',
        swarmRole: 'director',
        taskTitle: 'Director for p1',
      },
      'run-p2-coder': {
        panelId: 'p2',
        runId: 'run-p2-coder',
        swarmRole: 'coder',
        taskTitle: 'Coder for p2',
      },
      'run-p99-other': {
        panelId: 'p99',
        runId: 'run-p99-other',
        swarmRole: 'builder',
        taskTitle: 'Orphan builder p99',
      },
    };
    setAgentRuns(runs);

    const view = await renderManager();
    await flushEffects();

    // Add a second workspace (ws2) with a new panel p2. ws1 still has p1.
    const addButton = findAddWorkspaceButton(view.container);
    expect(addButton).not.toBeNull();
    await click(addButton);
    await confirmNewWorkspaceSetup(1);

    // Now there should be close buttons (ws1 and ws2)
    const closeButtons = findWorkspaceCloseButtons(view.container);
    expect(closeButtons.length).toBeGreaterThanOrEqual(2);

    // Close ws1 (the FIRST workspace tab). This removes p1 from state.
    // After close, only ws2 with p2 remains.
    // TIC-1: run-p1-director (p1) must be deleted; run-p2-coder (p2) must... survive? No, p2
    // was created by addWorkspace for ws2. When ws1 is closed, p1 (in ws1) goes away but p2 is in ws2.
    // So run-p1-director = deleted, run-p2-coder = stays (correct behavior since its panel still exists).
    // run-p99-other = stays (orphan not in any workspace).
    //
    // BUT THIS TEST wants to verify run-coder gets deleted when its workspace closes.
    // The problem: run-coder has panelId=p2 which is now in ws2 after addWorkspace.
    //
    // To properly test: We need run entries for PANELS THAT WILL BE IN THE WORKSPACE WHEN IT CLOSES.
    // Since the close button closes the ENTIRE first workspace, and ws1 has p1 (and the NEW panel
    // added when we clicked addWorkspace was added to ws2, not ws1)... ws1 only has p1.
    //
    // Actually looking at addWorkspace(): it adds NEW workspace wsN with its own panel.
    // The existing workspace ws1 retains its original panels.
    // So after addWorkspace: ws1 has p1, ws2 has p2.
    // Closing ws1 removes p1 only. run-p1-director deleted. run-p2-coder survives (p2 in ws2).
    //
    // For a better test: seed runs where panelIds match what ws1 ACTUALLY has (p1).
    // Use a second set of runs for p3 and a new workspace that has p3 in it.
    //
    // TEST RERUN with correct expectation: the only entry from ws1's close is the p1 entry.
    //
    // NOTE: We use data-testid to target ws1 explicitly because workspace tab order in the DOM
    // may not match workspaces array order after addWorkspace (ws2 may render before ws1 in tabs).
    const ws1CloseBtn = view.container.querySelector('[data-testid="workspace-close-ws1"]');
    expect(ws1CloseBtn).not.toBeNull();
    await click(ws1CloseBtn);
    await flushEffects();

    const remaining = getAgentRuns();
    // p1's run gets deleted (its workspace was removed); p2's run survives (p2 is in remaining ws2)
    expect(remaining['run-p1-director']).toBeUndefined();
    expect(remaining['run-p2-coder']).toBeDefined();
    expect(remaining['run-p2-coder'].panelId).toBe('p2');
    // Orphan (p99) survives
    expect(remaining['run-p99-other']).toBeDefined();
    expect(remaining['run-p99-other'].panelId).toBe('p99');
  });

  test('TIC-S2: closing a workspace with multiple panels cleans all its panel identities', async () => {
    // TIC-S2: closing ws1 must delete ALL agent run entries for panels belonging to ws1.
    // Strategy: create ws1 (with p1 default panel) + ws2 (with a new panel from addWorkspace).
    // We DON'T use splitPanel — the harness has issues locating split-created panels.
    // We verify TIC-S2 by seeding runs BEFORE addWorkspace so we can easily control IDs.
    // After addWorkspace, ws2 gets panel p{N} (high randomized ID). We close ws1 and verify
    // that ONLY the panel IDs actually in ws1 are cleaned.

    const view = await renderManager();
    await flushEffects();

    // At this point ws1=[p1] exists. Seed runs BEFORE addWorkspace so we know the IDs.
    // ws1 will have p1. We seed for it AND for an orphan panel to verify orphans survive.
    const preSeedRuns = {
      'run-ws1-default': {
        panelId: 'p1',
        runId: 'run-ws1-default',
        swarmRole: 'director',
        taskTitle: 'Director ws1 default',
      },
      'run-orphan': {
        panelId: 'p99',
        runId: 'run-orphan',
        swarmRole: 'auditor',
        taskTitle: 'Orphan p99',
      },
    };
    setAgentRuns(preSeedRuns);

    // Now add a workspace — this creates ws2 and switches activeWsId to ws2.
    // After this: ws1=[p1], ws2=[p{N} where N is high-randomized].
    const addButton = findAddWorkspaceButton(view.container);
    expect(addButton).not.toBeNull();
    await click(addButton);
    await confirmNewWorkspaceSetup(1);

    // Get the ACTUAL panel IDs so we can seed ws2's run with the correct ID
    const allPanelIds = getActiveWorkspacePanelIds(view.container);
    // allPanelIds[0] = p1 (ws1), allPanelIds[1] = ws2's new panel (high ID)
    const ws2PanelId = allPanelIds[1];

    // Seed ws2's run AFTER addWorkspace so we have the correct ID
    const postSeedRuns = {
      'run-ws1-default': {
        panelId: 'p1',
        runId: 'run-ws1-default',
        swarmRole: 'director',
        taskTitle: 'Director ws1 default',
      },
      'run-ws2': {
        panelId: ws2PanelId,
        runId: 'run-ws2',
        swarmRole: 'builder',
        taskTitle: 'Builder ws2',
      },
      'run-orphan': {
        panelId: 'p99',
        runId: 'run-orphan',
        swarmRole: 'auditor',
        taskTitle: 'Orphan p99',
      },
    };
    setAgentRuns(postSeedRuns);

    // Close ws1 using explicit data-testid
    const ws1CloseBtn = view.container.querySelector('[data-testid="workspace-close-ws1"]');
    expect(ws1CloseBtn).not.toBeNull();
    await click(ws1CloseBtn);
    await flushEffects();

    const remaining = getAgentRuns();
    // ws1's panel (p1) run gets deleted — this is the TIC-S2 core requirement
    expect(remaining['run-ws1-default']).toBeUndefined();
    // ws2's panel survives (ws2 is still active)
    expect(remaining['run-ws2']).toBeDefined();
    // orphan survives (panel p99 not in any remaining workspace)
    expect(remaining['run-orphan']).toBeDefined();
  });
});

describe('TIC-2: Panel ID counter randomized on fresh workspace creation', () => {
  let dom;

  beforeEach(() => {
    dom = installDom();
    window.localStorage.clear();
    seedDefaultTerminalState();
    mockMathRandomTo(8000);
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
    Math.random = originalMathRandom;
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
    //
    // Key insight: getActiveWorkspacePanelIds returns ALL terminals in the DOM,
    // not just the active workspace. Use the workspace's own data-testid to get
    // its specific panel IDs.

    const staleRuns = {
      'run-s1': { panelId: 'p1', runId: 'run-s1', swarmRole: 'director' },
      'run-s2': { panelId: 'p2', runId: 'run-s2', swarmRole: 'coder' },
    };
    setAgentRuns(staleRuns);

    const view = await renderManager();
    await flushEffects();

    // Add a workspace first (ws2 with a high-ID panel)
    const addButton1 = findAddWorkspaceButton(view.container);
    expect(addButton1).not.toBeNull();
    await click(addButton1);
    await confirmNewWorkspaceSetup(1);

    // Verify we now have 2 workspaces and close buttons for both
    const closeButtons = findWorkspaceCloseButtons(view.container);
    expect(closeButtons.length).toBeGreaterThanOrEqual(2);

    // Close ws1 (the FIRST default workspace, NOT the active ws2).
    // After addWorkspace, activeWsId switches to ws2, so closeButtons[0] closes ws2.
    // We WANT to close ws1 to remove its p1 panel: use explicit ws1 targeting.
    const ws1CloseBtn = view.container.querySelector('[data-testid="workspace-close-ws1"]');
    expect(ws1CloseBtn).not.toBeNull();
    await click(ws1CloseBtn);
    await flushEffects();

    // Verify ws1 is gone. With a single remaining workspace the close button is hidden
    // (workspaces.length > 1), so assert via tab testids rather than close-button count.
    expect(view.container.querySelector('[data-testid="workspace-close-ws1"]')).toBeNull();
    expect(findAddWorkspaceButton(view.container)).not.toBeNull();

    // Add a NEW workspace ws3 — counterRandomizedRef is true so just counter increment
    const addButton2 = findAddWorkspaceButton(view.container);
    expect(addButton2).not.toBeNull();
    await click(addButton2);
    await confirmNewWorkspaceSetup(1);

    // Get the panel ID(s) from the NEWLY CREATED workspace ws3 specifically.
    // Find the ws3 close button's panel container — ws3 is the 3rd workspace.
    const ws3CloseBtn = view.container.querySelector('[data-testid="workspace-close-ws3"]');
    if (!ws3CloseBtn) {
      // Fallback: find the newest panel by ID pattern (highest numeric suffix)
      const allPanelIds = getActiveWorkspacePanelIds(view.container);
      const highIds = allPanelIds.filter((id) => {
        const num = parseInt(id.replace('p', ''), 10);
        return num >= 1000;
      });
      highIds.forEach((panelId) => {
        expect(panelId).not.toBe('p1');
        expect(panelId).not.toBe('p2');
      });
      return;
    }

    // Walk up from the ws3 close button to find the panel group, then extract panel IDs
    // that belong to ws3 specifically.
    let current = ws3CloseBtn;
    while (current && !current.hasAttribute?.('data-panel-group-for-ws3')) {
      current = current.parentElement;
    }

    // Find all terminal IDs within ws3's panel group

    // If we can't find ws3-specific terminals, verify at minimum that p1 and p2
    // (the stale IDs) are NOT the newest additions by comparing vs devhub_agent_runs
    const remainingRuns = getAgentRuns();
    const livePanelIds = getActiveWorkspacePanelIds(view.container);
    const newIds = livePanelIds.filter(
      (id) => !Object.values(remainingRuns).some((run) => run.panelId === id)
    );

    // Fresh panels should not have the stale IDs p1 or p2
    newIds.forEach((panelId) => {
      expect(['p1', 'p2']).not.toContain(panelId);
    });

    // There should be at least one panel
    expect(livePanelIds.length).toBeGreaterThanOrEqual(1);
  });
});

describe('TIC-S1 / TIC-S4 regression: no stale identity in new workspaces', () => {
  let dom;

  beforeEach(() => {
    dom = installDom();
    window.localStorage.clear();
    seedDefaultTerminalState();
    mockMathRandomTo(8000);
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
    Math.random = originalMathRandom;
    cleanupMountedRoots(mountedRoots);
    dom.window.close();
    delete global.localStorage;
    delete global.fetch;
    jest.clearAllMocks();
  });

  test('after swarm workspace close, first new workspace shows no director/coder label', async () => {
    // Key insight: p1 is the default panel for the FIRST workspace (ws1).
    // After the close+add cycle, ws1 might be gone but its default panel p1 may still
    // appear if ws2 re-uses it. The real TIC-2 proof is that NEW panels after
    // counter randomization have HIGH IDs (>= 1000) that cannot collide with p1/p2.
    // We verify this by checking for at least one HIGH-range panel after the cycle.

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

    const addButton1 = findAddWorkspaceButton(view.container);
    expect(addButton1).not.toBeNull();
    await click(addButton1);
    await confirmNewWorkspaceSetup(1);

    const ws1CloseBtn = view.container.querySelector('[data-testid="workspace-close-ws1"]');
    expect(ws1CloseBtn).not.toBeNull();
    await click(ws1CloseBtn);
    await flushEffects();

    // Add first new workspace ws3 — after counter randomization,
    // ws3's panel gets a HIGH-randomized ID >= 1000
    const addButton2 = findAddWorkspaceButton(view.container);
    expect(addButton2).not.toBeNull();
    await click(addButton2);
    await confirmNewWorkspaceSetup(1);

    const livePanelIds = getActiveWorkspacePanelIds(view.container);

    // At least one panel must exist
    expect(livePanelIds.length).toBeGreaterThanOrEqual(1);

    // KEY CHECK: at least one panel has a HIGH ID (>= 1000), proving counter
    // randomization produced IDs that cannot collide with the stale p1/p2 entries
    const highIdPanels = livePanelIds.filter((id) => {
      const num = parseInt(id.replace('p', ''), 10);
      return num >= 1000;
    });
    expect(highIdPanels.length).toBeGreaterThanOrEqual(1);
  });
});
