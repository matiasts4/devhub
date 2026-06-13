/**
 * ModeTransitionShell.wiring.singleOwner — single-owner regression test.
 *
 * Pins the contract that there is exactly ONE `[data-testid="mode-transition-shell"]`
 * in the rendered tree when the pizarra is active and the feature flag is ON.
 *
 * Before the P-MP-3 fix, BOTH `WorkspaceRightDock` and `PizarraPane` wrapped
 * their content in `<ModeTransitionShell>`, producing two sibling shells
 * that ran parallel phase machines (NFR-P03 violation).
 *
 * After the transition-polish fix, `WorkspaceRightDock` is the SINGLE
 * owner because it exists before/after the pizarra pane itself. This test asserts:
 *   1. Exactly one shell testid is in the rendered tree.
 *   2. The shell wraps the right dock host and contains the pizarra canvas.
 *   3. With the feature flag OFF, zero shells appear (no-op path).
 *
 * This file is intentionally self-contained: it does NOT depend on
 * `@testing-library/react` (which is currently uninstalled in this
 * repo). It uses the project's `domHarness` to install JSDOM and
 * `flushSync` from `react-dom` for committing the render.
 */

const React = require('react');
const { flushSync } = require('react-dom');
const { createRoot } = require('react-dom/client');
const domHarness = require('@/test-support/domHarness');

let dom;
let mountedRoots = [];

beforeEach(() => {
  mountedRoots = [];
  dom = domHarness.installDom();
  if (typeof global.ResizeObserver === 'undefined') {
    global.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  // Always reset the feature flag cache so env edits take effect.
  const { _resetFlagForTests } = require('@/lib/pizarra/featureFlag');
  _resetFlagForTests();
});

afterEach(() => {
  while (mountedRoots.length > 0) {
    const { root, container } = mountedRoots.pop();
    try {
      flushSync(() => root.unmount());
    } catch {
      // best-effort
    }
    container.remove();
  }
  if (dom && dom.window && dom.window.close) {
    try {
      dom.window.close();
    } catch {
      // ignore
    }
  }
});

function makeRoot() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.push({ root, container });
  return { container, root };
}

function setEnvFlag(value) {
  const prev = process.env.NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE;
  const prevNodeEnv = process.env.NODE_ENV;
  if (value === null) {
    delete process.env.NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE;
  } else {
    process.env.NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE = value;
  }
  process.env.NODE_ENV = 'development';
  delete require.cache[require.resolve('@/lib/pizarra/featureFlag')];
  const { _resetFlagForTests } = require('@/lib/pizarra/featureFlag');
  _resetFlagForTests();
  return () => {
    if (prev === undefined) delete process.env.NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE;
    else process.env.NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE = prev;
    if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNodeEnv;
  };
}

function renderOnce(root, element) {
  flushSync(() => {
    root.render(element);
  });
  return document.querySelectorAll('[data-testid="mode-transition-shell"]');
}

// ── Mocks shared by every test in this file ──────────────────────────────
// The mocks mirror the existing wiring test: a static PizarraCanvas stub
// (since next/dynamic + react-konva would not load in JSDOM anyway) and
// shallow stubs for the rest of the children that WorkspaceRightDock and
// PizarraPane would otherwise try to mount.

jest.mock('lucide-react', () => {
  const ReactLocal = require('react');
  const icon = (name) => (props) =>
    ReactLocal.createElement('svg', { ...props, 'data-icon': name });
  return new Proxy({}, { get: (_, key) => icon(String(key)) });
});

jest.mock('next/dynamic', () => () => {
  const ReactLocal = require('react');
  return function DynamicCanvas(props) {
    return ReactLocal.createElement(
      'div',
      { 'data-testid': 'pizarra-canvas-mock' },
      `${props.elements ? props.elements.length : 0} elements`
    );
  };
});

// Stub framer-motion so the shell's AnimatePresence doesn't trip
// over React 19 internals in JSDOM. We only need the testids
// from the shell; we don't care about the actual transition.
jest.mock('framer-motion', () => {
  const ReactLocal = require('react');
  return {
    __esModule: true,
    AnimatePresence: ({ children }) => children,
    motion: new Proxy(
      {},
      {
        get: () => (props) => ReactLocal.createElement('div', props, props.children),
      }
    ),
  };
});

jest.mock('@/lib/pizarra/canvasViewport', () => ({
  useCanvasViewport: () => ({
    zoom: 1,
    setZoom: () => {},
    pan: { x: 0, y: 0 },
    setPan: () => {},
    viewportToCanvas: (x, y) => ({ x, y }),
    canvasRect: { width: 800, height: 600 },
  }),
  CanvasViewportProvider: ({ children }) => children,
}));

jest.mock('@/components/pizarra/PizarraLiveSurfaceLayer', () => {
  const ReactLocal = require('react');
  return {
    __esModule: true,
    default: () => ReactLocal.createElement('div', { 'data-testid': 'pizarra-live-layer' }),
  };
});

jest.mock('@/components/pizarra/PizarraPropertyInspector', () => {
  const ReactLocal = require('react');
  return {
    __esModule: true,
    default: () => ReactLocal.createElement('div', { 'data-testid': 'pizarra-inspector' }),
  };
});

jest.mock('@/components/commandBar/CommandBar', () => {
  const ReactLocal = require('react');
  return {
    __esModule: true,
    default: () => null,
  };
});

jest.mock('@/components/workspace/FileExplorerEditorPane', () => {
  const ReactLocal = require('react');
  return {
    __esModule: true,
    default: () => ReactLocal.createElement('div', { 'data-testid': 'file-explorer-mock' }),
  };
});

jest.mock('@/components/workspace/OperatorActionCard', () => {
  const ReactLocal = require('react');
  return {
    __esModule: true,
    default: () => ReactLocal.createElement('div', { 'data-testid': 'operator-card-mock' }),
  };
});

jest.mock('@/components/workspace/WorkspaceBrowserPane', () => {
  const ReactLocal = require('react');
  return {
    __esModule: true,
    default: () => ReactLocal.createElement('div', { 'data-testid': 'workspace-browser-mock' }),
  };
});

jest.mock('@/components/workspace/WorkspaceSwarmPane', () => {
  const ReactLocal = require('react');
  return {
    __esModule: true,
    default: () => ReactLocal.createElement('div', { 'data-testid': 'workspace-swarm-mock' }),
  };
});

jest.mock('@/components/workspace/WorkspaceOperatorObserverPane', () => {
  const ReactLocal = require('react');
  return {
    __esModule: true,
    default: () => ReactLocal.createElement('div', { 'data-testid': 'workspace-observer-mock' }),
  };
});

// ── Tests ─────────────────────────────────────────────────────────────────

describe('ModeTransitionShell wiring — single owner (P-MP-3)', () => {
  test('exactly one mode-transition-shell testid when the feature flag is ON', () => {
    const restore = setEnvFlag('true');
    try {
      const WorkspaceRightDock = require('@/components/workspace/WorkspaceRightDock').default;
      const { root } = makeRoot();
      renderOnce(
        root,
        React.createElement(WorkspaceRightDock, {
          project: { id: 'p1' },
          workspaceId: 'w1',
          dockState: { activeTab: 'pizarra', maximizedView: 'pizarra' },
          onDockStateChange: () => {},
          browserWindowState: {},
          onBrowserWindowStateChange: () => {},
          workspaceWindows: [],
          activeWorkspaceWindowId: null,
          onWorkspaceWindowSelect: () => {},
          onWorkspaceWindowAdd: () => {},
          onWorkspaceWindowRemove: () => {},
        })
      );
      const shells = document.querySelectorAll('[data-testid="mode-transition-shell"]');
      expect(shells.length).toBe(1);
    } finally {
      restore();
    }
  });

  test('the lone shell wraps the right dock host and contains the pizarra canvas', () => {
    const restore = setEnvFlag('true');
    try {
      const WorkspaceRightDock = require('@/components/workspace/WorkspaceRightDock').default;
      const { root } = makeRoot();
      renderOnce(
        root,
        React.createElement(WorkspaceRightDock, {
          project: { id: 'p1' },
          workspaceId: 'w1',
          dockState: { activeTab: 'pizarra', maximizedView: 'pizarra' },
          onDockStateChange: () => {},
          browserWindowState: {},
          onBrowserWindowStateChange: () => {},
          workspaceWindows: [],
          activeWorkspaceWindowId: null,
          onWorkspaceWindowSelect: () => {},
          onWorkspaceWindowAdd: () => {},
          onWorkspaceWindowRemove: () => {},
        })
      );
      const dock = document.querySelector('[data-testid="workspace-right-dock"]');
      const pizarraCanvas = document.querySelector('[data-testid="pizarra-canvas"]');
      expect(dock).toBeTruthy();
      expect(pizarraCanvas).toBeTruthy();

      const shells = document.querySelectorAll('[data-testid="mode-transition-shell"]');
      expect(shells.length).toBe(1);

      // The shell is the dock-level owner: it wraps WorkspaceRightDock and
      // therefore also contains the pizarra canvas when the pizarra tab is active.
      expect(shells[0].contains(pizarraCanvas)).toBe(true);
      expect(shells[0].contains(dock)).toBe(true);
      const pizarraHost = document.querySelector('[data-testid="pizarra-host"]');
      expect(pizarraHost.contains(shells[0])).toBe(false);
    } finally {
      restore();
    }
  });

  test('zero mode-transition-shell testids when the feature flag is OFF', () => {
    const restore = setEnvFlag('false');
    try {
      const WorkspaceRightDock = require('@/components/workspace/WorkspaceRightDock').default;
      const { root } = makeRoot();
      renderOnce(
        root,
        React.createElement(WorkspaceRightDock, {
          project: { id: 'p1' },
          workspaceId: 'w1',
          dockState: { activeTab: 'pizarra', maximizedView: 'pizarra' },
          onDockStateChange: () => {},
          browserWindowState: {},
          onBrowserWindowStateChange: () => {},
          workspaceWindows: [],
          activeWorkspaceWindowId: null,
          onWorkspaceWindowSelect: () => {},
          onWorkspaceWindowAdd: () => {},
          onWorkspaceWindowRemove: () => {},
        })
      );
      const shells = document.querySelectorAll('[data-testid="mode-transition-shell"]');
      expect(shells.length).toBe(0);
    } finally {
      restore();
    }
  });
});
