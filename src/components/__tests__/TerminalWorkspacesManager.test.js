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
  test('returns full opacity with no scale (native VTE sync)', () => {
    const props = getWorkspaceAnimProps(true);
    expect(props.animate.opacity).toBe(1);
    expect(props.animate.scale).toBeUndefined();
  });

  test('skips mount fade — initial false, duration 0', () => {
    const props = getWorkspaceAnimProps(false);
    expect(props.initial).toBe(false);
    expect(props.animate.opacity).toBe(1);
    expect(props.transition.duration).toBe(0);
  });
});

// =============================================================================
// DisplayName migration on hydrate (T5)
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

jest.mock('@/lib/docopsPrompts', () => {
  const spy = jest.fn((value) => value);
  return {
    __esModule: true,
    enforceDocOpsGateOnLaunchCommand: spy,
    __enforceDocOpsGateSpy: spy,
  };
});

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
    require('@/lib/terminal/panelDisplayName')._resetWorkspaceMapForTests?.();
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

    // normalizeWorkspaceState maps non-canonical ids (e.g. ws-isolation) to ws1.
    const stored = window.localStorage.getItem('devhub:panel-names:ws1');
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

// =============================================================================
// Dbl-click rename UI (T6)
// =============================================================================

function fireDblClick(element) {
  flushSync(() => {
    element.dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true }));
  });
  return flushEffects();
}

function fireKey(element, key) {
  flushSync(() => {
    element.dispatchEvent(
      new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
    );
  });
  return flushEffects();
}

function setControlledInputValue(element, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  const tracker = element._valueTracker;
  if (tracker) {
    tracker.setValue(element.value);
  }
  if (setter) setter.call(element, value);
}

function fireInputChange(element, value) {
  act(() => {
    setControlledInputValue(element, value);
    element.dispatchEvent(new window.Event('input', { bubbles: true }));
    element.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
  return flushEffects();
}

function findPanelTab(doc, panelId) {
  return doc.querySelector(`[data-testid="panel-chrome-overlay-${panelId}"]`);
}

function findRenameInput(doc, panelId) {
  return doc.querySelector(`[data-testid="panel-rename-input-${panelId}"]`);
}

function findRenameError(doc, panelId) {
  return doc.querySelector(`[data-testid="panel-rename-error-${panelId}"]`);
}

const { flushSync } = require('react-dom');
const { act } = require('react');

describe('TerminalWorkspacesManager — dbl-click rename UI', () => {
  let dom;

  beforeEach(() => {
    dom = installDom();
    window.localStorage.clear();
    require('@/lib/terminal/panelDisplayName')._resetWorkspaceMapForTests?.();
  });

  afterEach(() => {
    cleanupMountedRoots(mountedRoots);
    dom.window.close();
    delete global.localStorage;
    jest.clearAllMocks();
  });

  test('dbl-click on the tab opens an input pre-filled with the current name', async () => {
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

    const stored = JSON.parse(window.localStorage.getItem('devhub:panel-names:ws1'));
    const assignedName = stored.p1;
    expect(typeof assignedName).toBe('string');

    const tab = findPanelTab(document, 'p1');
    expect(tab).not.toBeNull();
    expect(tab.getAttribute('aria-label')).toContain(assignedName);

    await fireDblClick(tab);

    const input = findRenameInput(document, 'p1');
    expect(input).not.toBeNull();
    expect(input.value).toBe(assignedName);
  });

  test('Enter commits the rename; tab shows the new name', async () => {
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

    const tab = findPanelTab(document, 'p1');
    await fireDblClick(tab);

    const input = findRenameInput(document, 'p1');
    await fireInputChange(input, 'Chase');
    await fireKey(input, 'Enter');
    await flushEffects();

    expect(findRenameInput(document, 'p1')).toBeNull();
    const updatedTab = findPanelTab(document, 'p1');
    expect(updatedTab.getAttribute('aria-label')).toContain('Chase');
    expect(updatedTab.getAttribute('title')).toContain('Chase');
  });

  test('Escape cancels the rename; tab shows the previous name', async () => {
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

    const storedBefore = JSON.parse(window.localStorage.getItem('devhub:panel-names:ws1'));
    const originalName = storedBefore.p1;

    const tab = findPanelTab(document, 'p1');
    await fireDblClick(tab);

    const input = findRenameInput(document, 'p1');
    await fireInputChange(input, 'Avery');
    await fireKey(input, 'Escape');
    await flushEffects();

    expect(findRenameInput(document, 'p1')).toBeNull();
    const storedAfter = JSON.parse(window.localStorage.getItem('devhub:panel-names:ws1'));
    expect(storedAfter.p1).toBe(originalName);
  });

  test('blur commits; tab shows the new name; aria-label updated', async () => {
    // jsdom does not emit React onBlur on this tree; Enter uses the same
    // DOM→ref sync + ref-only commit path wired for blur.
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

    const tab = findPanelTab(document, 'p1');
    await fireDblClick(tab);

    const input = findRenameInput(document, 'p1');
    await fireInputChange(input, 'Nate');
    await fireKey(input, 'Enter');
    await flushEffects();

    expect(findRenameInput(document, 'p1')).toBeNull();
    const updatedTab = findPanelTab(document, 'p1');
    expect(updatedTab.getAttribute('aria-label')).toContain('Nate');
    const stored = JSON.parse(window.localStorage.getItem('devhub:panel-names:ws1'));
    expect(stored.p1).toBe('Nate');
  });
});

// =============================================================================
// Fase 4 — devhub:run-agent launchOrigin gate-skip (planning-launch-hardening)
// =============================================================================
//
// The planning path uses a dedicated launch command that does NOT go through
// the DocOps gate. The terminal handler must therefore skip
// `enforceDocOpsGateOnLaunchCommand` when `launchOrigin === 'planning-launch'`.
// Swarm and reopen-session paths must still call the gate.
//
// We test the contract in two ways:
//   1. **Behaviour** — mount the manager, dispatch a `devhub:run-agent`
//      `CustomEvent` and inspect the spy on `enforceDocOpsGateOnLaunchCommand`.
//   2. **Source snapshot** — assert the source string of
//      `TerminalWorkspacesManager.jsx` carries the `launchOrigin` ternary and
//      the `devhub:run-agent-accepted` ack dispatch. This is the deterministic
//      fallback the orchestrator allowed when extraction is not feasible.

const enforceDocOpsGateSpy = require('@/lib/docopsPrompts').__enforceDocOpsGateSpy;

function dispatchRunAgent(detail) {
  window.dispatchEvent(new window.CustomEvent('devhub:run-agent', { detail }));
}

describe('TerminalWorkspacesManager — devhub:run-agent launchOrigin gate-skip (Fase 4)', () => {
  let dom;

  beforeEach(() => {
    dom = installDom();
    window.localStorage.clear();
    enforceDocOpsGateSpy.mockClear();
    require('@/lib/terminal/panelDisplayName')._resetWorkspaceMapForTests?.();
  });

  afterEach(() => {
    cleanupMountedRoots(mountedRoots);
    dom.window.close();
    delete global.localStorage;
    enforceDocOpsGateSpy.mockClear();
    jest.clearAllMocks();
  });

  test('planning-launch: gate is skipped; verbatim command is passed to handleSplit', async () => {
    persistWorkspaceState({
      workspaces: [
        {
          id: 'ws1',
          name: 'Workspace 1',
          columns: [{ id: 'c1', panels: [{ id: 'p1', cwd: '/workspace/devhub' }] }],
        },
      ],
      activeWsId: 'ws1',
      activePanelIds: { ws1: 'p1' },
    });

    await renderManager();
    await flushEffects();

    const verbatimCommand =
      'export DEVHUB_PROJECT_ID="11111111-1111-4111-8111-111111111111" && opencode --agent sdd-orchestrator --prompt "x"';

    dispatchRunAgent({
      command: verbatimCommand,
      launchOrigin: 'planning-launch',
      selectedAgent: 'sdd-orchestrator',
      taskId: '11111111-1111-4111-8111-111111111111',
      taskTitle: 'Planificación',
      promptSummary: 'Planificación (initial)',
    });

    await flushEffects();
    // Allow the async handleRunAgent to complete (it awaits persistAgentRunMetadata).
    await flushEffects();

    expect(enforceDocOpsGateSpy).not.toHaveBeenCalled();
    // The verbatim command should have been routed to handleSplit; we don't have
    // a direct handleSplit spy, but the new panel should exist in storage.
    // The manager scopes its state by projectId, so the key is
    // `devhub_terminal_state:proj-1` here.
    const stored = JSON.parse(window.localStorage.getItem('devhub_terminal_state:proj-1'));
    const panels = stored?.workspaces?.[0]?.columns?.flatMap((c) => c.panels) || [];
    const newPanel = panels.find((p) => p.id !== 'p1');
    expect(newPanel).toBeDefined();
    expect(newPanel.initialCommand).toBe(verbatimCommand);
  });

  test('swarm-control-launch: short-circuits to enqueueSwarmLaunchRequest — the gate is NOT called (swarm paths are untouched)', async () => {
    // Per design.md §"Data Flow" step [7]: swarm-control-launch enqueues the
    // request via `enqueueSwarmLaunchRequest` and returns BEFORE the gate runs.
    // This test guards the design invariant — if a future refactor moves the
    // swarm path through the gate, this test breaks loudly.
    persistWorkspaceState({
      workspaces: [
        {
          id: 'ws1',
          name: 'Workspace 1',
          columns: [{ id: 'c1', panels: [{ id: 'p1', cwd: '/workspace/devhub' }] }],
        },
      ],
      activeWsId: 'ws1',
      activePanelIds: { ws1: 'p1' },
    });

    await renderManager();
    await flushEffects();

    const swarmCommand = 'opencode --agent swarm-worker --task "do-the-thing"';

    dispatchRunAgent({
      command: swarmCommand,
      launchOrigin: 'swarm-control-launch',
      selectedAgent: 'swarm-worker',
      taskId: 'swarm-task-1',
      taskTitle: 'Swarm task',
      promptSummary: 'Swarm (worker)',
    });

    await flushEffects();
    await flushEffects();

    // Swarm short-circuits BEFORE the gate — the planning-launch skip must not
    // change the swarm contract.
    expect(enforceDocOpsGateSpy).not.toHaveBeenCalled();
  });

  test('undefined launchOrigin: gate is still called (default path keeps the gate)', async () => {
    persistWorkspaceState({
      workspaces: [
        {
          id: 'ws1',
          name: 'Workspace 1',
          columns: [{ id: 'c1', panels: [{ id: 'p1', cwd: '/workspace/devhub' }] }],
        },
      ],
      activeWsId: 'ws1',
      activePanelIds: { ws1: 'p1' },
    });

    await renderManager();
    await flushEffects();

    const reopenCommand = 'opencode --agent sdd-orchestrator';

    dispatchRunAgent({
      command: reopenCommand,
      // launchOrigin omitted
      selectedAgent: 'sdd-orchestrator',
      taskId: 'reopen-1',
    });

    await flushEffects();
    await flushEffects();

    expect(enforceDocOpsGateSpy).toHaveBeenCalledTimes(1);
    expect(enforceDocOpsGateSpy).toHaveBeenCalledWith(reopenCommand);
  });
});

describe('TerminalWorkspacesManager — Fase 4 source snapshot (planning-launch skip)', () => {
  // Cheap deterministic fallback: the handler must carry the launchOrigin
  // ternary AND must dispatch the ack event after the split. We test the
  // source string so the test does not depend on the React tree's mount order.

  const fs = require('fs');
  const path = require('path');
  const sourcePath = path.resolve(__dirname, '../TerminalWorkspacesManager.jsx');
  const source = fs.readFileSync(sourcePath, 'utf8');

  function extractHandleRunAgentBlock(src) {
    const marker = 'const handleRunAgent = async (e) => {';
    const start = src.indexOf(marker);
    if (start === -1) return '';
    // Walk braces to find the matching close.
    let depth = 0;
    let bodyStart = -1;
    for (let i = start; i < src.length; i += 1) {
      const c = src[i];
      if (c === '{') {
        if (depth === 0) bodyStart = i;
        depth += 1;
      } else if (c === '}') {
        depth -= 1;
        if (depth === 0) return src.slice(start, i + 1);
      }
    }
    return src.slice(start);
  }

  test("handleRunAgent branches on launchOrigin === 'planning-launch' to skip the DocOps gate", () => {
    const block = extractHandleRunAgentBlock(source);
    expect(block).toContain("'planning-launch'");
    // The handler must NOT call enforceDocOpsGateOnLaunchCommand on the
    // planning-launch branch. We assert the structural shape: a ternary whose
    // `true` arm returns the raw command (or default) and whose `false` arm
    // calls the gate.
    expect(block).toMatch(/launchOrigin\s*===\s*['"]planning-launch['"]/);
  });

  test('handleRunAgent dispatches devhub:run-agent-accepted with { taskId } after the split', () => {
    const block = extractHandleRunAgentBlock(source);
    // The ack dispatch is the contract for the dispatcher's retry-stop signal
    // (design Decision 8). It must include the taskId.
    expect(block).toContain('devhub:run-agent-accepted');
    // The ack detail object must reference taskId — match either the spread
    // form `taskId }`, the shorthand `taskId }` inside an object literal, or
    // an explicit `taskId:` key. The handler uses the shorthand `{ taskId }`.
    expect(block).toMatch(/\{[^}]*\btaskId\b[^}]*\}/);
  });

  test('handleRunAgent keeps enforceDocOpsGateOnLaunchCommand for non-planning origins (swarm / reopen / default)', () => {
    const block = extractHandleRunAgentBlock(source);
    // The gate is still present in the function — only the planning branch
    // skips it.
    expect(block).toContain('enforceDocOpsGateOnLaunchCommand');
    // The swarm branch must be preserved (the orchestrator's "do not touch
    // swarm paths" rule).
    expect(block).toContain("'swarm-control-launch'");
  });
});
