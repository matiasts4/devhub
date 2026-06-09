/**
 * ModeTransitionShell wiring — wraps PizarraPane and WorkspaceRightDock
 * in <ModeTransitionShell> when the feature flag is ON, and renders
 * the children UNWRAPPED when the flag is OFF.
 *
 * Phase 7 of pizarra-shared-view-state (see design.md §7 and the
 * pizarra-mode-transition spec). The shell + hook already exist and
 * are tested; this file pins the WIRING point — the shell must
 * appear in the rendered tree of each chrome component, driven by
 * the feature flag and `maximizedView`.
 *
 * Contract (this file pins):
 *   1. PizarraPane renders its children inside <ModeTransitionShell>
 *      when isPizarraSharedViewEnabled() === true.
 *   2. PizarraPane renders its children UNWRAPPED when the flag is
 *      OFF (legacy hard-cut behavior preserved).
 *   3. WorkspaceRightDock renders its children inside
 *      <ModeTransitionShell> when the flag is ON.
 *   4. WorkspaceRightDock renders its children UNWRAPPED when the
 *      flag is OFF.
 *   5. A maximizedView change at the parent (PizarraPane or
 *      WorkspaceRightDock) drives the shell into the leaving phase
 *      via useModeTransition (asserted by spying on the hook).
 *   6. prefers-reduced-motion: reduce collapses the transition to
 *      a <= 50 ms cross-fade.
 *
 * The mode prop drives the AnimatePresence `key` so workspace↔
 * pizarra flips play the transition. Reduced motion collapses to
 * opacity-only; full motion runs the fade + slide + scale.
 */

const React = require('react');
const { act } = require('@testing-library/react');
const domHarness = require('@/test-support/domHarness');

let dom;
let mountedRoots = [];

beforeEach(() => {
  mountedRoots = [];
  dom = domHarness.installDom();
  // PizarraPane uses ResizeObserver in a useEffect; jsdom doesn't
  // ship one. Stub a no-op shim.
  if (typeof global.ResizeObserver === 'undefined') {
    global.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  // Always reset the feature flag cache before each test so the
  // env var edits between cases take effect.
  const { _resetFlagForTests } = require('@/lib/pizarra/featureFlag');
  _resetFlagForTests();
});

afterEach(() => {
  domHarness.cleanupMountedRoots(mountedRoots);
  if (dom && dom.window && dom.window.close) {
    try {
      dom.window.close();
    } catch (e) {
      // ignore
    }
  }
});

// ── Mocks shared by every test in this file ──────────────────────────────

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

// ── Helpers ──────────────────────────────────────────────────────────────

function makeRoot() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = require('react-dom/client').createRoot(container);
  return { container, root };
}

function renderInto(root, element) {
  act(() => {
    root.render(element);
  });
}

function setEnvFlag(value) {
  const prev = process.env.NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE;
  const prevNodeEnv = process.env.NODE_ENV;
  if (value === null) {
    delete process.env.NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE;
  } else {
    process.env.NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE = value;
  }
  // Pin NODE_ENV to dev so the env-default-dev path returns true;
  // tests that want the OFF path will set the env var to a falsy value.
  process.env.NODE_ENV = 'development';
  // Reload the flag module so the cache picks up the new env.
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

// ── Tests ────────────────────────────────────────────────────────────────

describe('ModeTransitionShell wiring — PizarraPane', () => {
  test('1. PizarraPane wraps its children in <ModeTransitionShell> when the feature flag is ON', () => {
    const restore = setEnvFlag('true');
    try {
      const PizarraPane = require('@/components/pizarra/PizarraPane').default;
      const { container, root } = makeRoot();
      renderInto(
        root,
        React.createElement(PizarraPane, {
          // max viewport is irrelevant — the shell just needs a
          // valid maximizedView string to drive the AnimatePresence.
          dockState: { activeTab: 'pizarra', maximizedView: 'pizarra' },
        })
      );
      const shell = document.querySelector('[data-testid="mode-transition-shell"]');
      expect(shell).toBeTruthy();
      // The shell sits inside the pizarra root; the pizarra chrome
      // (tool palette) is still mounted under it.
      expect(shell.contains(document.querySelector('[data-testid="pizarra-add-terminal"]'))).toBe(
        true
      );
    } finally {
      restore();
    }
  });

  test('2. PizarraPane renders its children UNWRAPPED when the feature flag is OFF', () => {
    const restore = setEnvFlag('false');
    try {
      const PizarraPane = require('@/components/pizarra/PizarraPane').default;
      const { container, root } = makeRoot();
      renderInto(
        root,
        React.createElement(PizarraPane, {
          dockState: { activeTab: 'pizarra', maximizedView: 'pizarra' },
        })
      );
      // No <ModeTransitionShell> wrapper when the flag is off.
      expect(document.querySelector('[data-testid="mode-transition-shell"]')).toBeNull();
      // The pizarra chrome still mounts.
      expect(document.querySelector('[data-testid="pizarra-add-terminal"]')).toBeTruthy();
    } finally {
      restore();
    }
  });
});

describe('ModeTransitionShell wiring — WorkspaceRightDock', () => {
  test('3. WorkspaceRightDock wraps its children in <ModeTransitionShell> when the feature flag is ON', () => {
    const restore = setEnvFlag('true');
    try {
      const WorkspaceRightDock = require('@/components/workspace/WorkspaceRightDock').default;
      const { container, root } = makeRoot();
      renderInto(
        root,
        React.createElement(WorkspaceRightDock, {
          project: { id: 'p1' },
          workspaceId: 'w1',
          dockState: { activeTab: 'browser', maximizedView: 'browser' },
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
      const shell = document.querySelector('[data-testid="mode-transition-shell"]');
      expect(shell).toBeTruthy();
      // The right-dock chrome is inside the shell.
      expect(shell.contains(document.querySelector('[data-testid="workspace-right-dock"]'))).toBe(
        true
      );
    } finally {
      restore();
    }
  });

  test('4. WorkspaceRightDock renders its children UNWRAPPED when the feature flag is OFF', () => {
    const restore = setEnvFlag('false');
    try {
      const WorkspaceRightDock = require('@/components/workspace/WorkspaceRightDock').default;
      const { container, root } = makeRoot();
      renderInto(
        root,
        React.createElement(WorkspaceRightDock, {
          project: { id: 'p1' },
          workspaceId: 'w1',
          dockState: { activeTab: 'browser', maximizedView: 'browser' },
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
      // No <ModeTransitionShell> wrapper when the flag is off.
      expect(document.querySelector('[data-testid="mode-transition-shell"]')).toBeNull();
      // The right-dock chrome is still mounted.
      expect(document.querySelector('[data-testid="workspace-right-dock"]')).toBeTruthy();
    } finally {
      restore();
    }
  });
});

describe('ModeTransitionShell wiring — phase machine drives the shell', () => {
  test('5. maximizedView change at the parent drives the shell into the leaving phase', () => {
    jest.useFakeTimers('modern');
    const restore = setEnvFlag('true');

    // We assert end-to-end via the shell's `data-transition-phase`
    // attribute (driven by `useModeTransition.phase`) and the
    // pointer-events guard. A maximizedView change MUST take the
    // shell through `idle → leaving → entering → idle` and back
    // to `leaving` on the next change. This proves the wiring
    // point forwards the new maximizedView into the hook and the
    // hook drives the phase machine.
    const WorkspaceRightDock = require('@/components/workspace/WorkspaceRightDock').default;

    let setView;
    function Tree({ view }) {
      const [v, set] = React.useState(view);
      setView = set;
      return React.createElement(WorkspaceRightDock, {
        project: { id: 'p1' },
        workspaceId: 'w1',
        dockState: { activeTab: v === 'pizarra' ? 'pizarra' : 'browser', maximizedView: v },
        onDockStateChange: () => {},
        browserWindowState: {},
        onBrowserWindowStateChange: () => {},
        workspaceWindows: [],
        activeWorkspaceWindowId: null,
        onWorkspaceWindowSelect: () => {},
        onWorkspaceWindowAdd: () => {},
        onWorkspaceWindowRemove: () => {},
      });
    }

    const { container, root } = makeRoot();
    renderInto(root, React.createElement(Tree, { view: 'browser' }));

    // Initial: shell exists, in 'idle' phase, pointer-events auto.
    let shell = document.querySelector('[data-testid="mode-transition-shell"]');
    expect(shell).toBeTruthy();
    expect(shell.getAttribute('data-transition-phase')).toBe('idle');
    expect(shell.style.pointerEvents).toBe('auto');

    // Flip maximizedView to 'pizarra'. After the 200ms debounce
    // the shell enters the 'leaving' phase.
    act(() => {
      setView('pizarra');
    });
    act(() => {
      jest.advanceTimersByTime(210);
    });
    shell = document.querySelector('[data-testid="mode-transition-shell"]');
    expect(shell.getAttribute('data-transition-phase')).toBe('leaving');
    expect(shell.style.pointerEvents).toBe('none');

    // Advance past leaving (110ms) — phase flips to 'entering'.
    act(() => {
      jest.advanceTimersByTime(120);
    });
    shell = document.querySelector('[data-testid="mode-transition-shell"]');
    expect(shell.getAttribute('data-transition-phase')).toBe('entering');

    // Advance past entering (220ms) → back to idle. Pointer
    // events are restored.
    act(() => {
      jest.advanceTimersByTime(230);
    });
    shell = document.querySelector('[data-testid="mode-transition-shell"]');
    expect(shell.getAttribute('data-transition-phase')).toBe('idle');
    expect(shell.style.pointerEvents).toBe('auto');

    // Toggle back to 'browser' (workspace). The leaving phase
    // fires again with the new value — the wiring point is
    // reactive.
    act(() => {
      setView('browser');
    });
    act(() => {
      jest.advanceTimersByTime(210);
    });
    shell = document.querySelector('[data-testid="mode-transition-shell"]');
    expect(shell.getAttribute('data-transition-phase')).toBe('leaving');
  });
});

describe('ModeTransitionShell wiring — reduced motion', () => {
  test('6. prefers-reduced-motion: reduce collapses the shell transition to a <= 50 ms cross-fade', () => {
    jest.useFakeTimers('modern');
    const restore = setEnvFlag('true');

    // Stub matchMedia to report reduced-motion BEFORE the component
    // reads it.
    const orig = dom.window.matchMedia;
    dom.window.matchMedia = (q) => ({
      matches: /prefers-reduced-motion/.test(q),
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
    });

    try {
      const PizarraPane = require('@/components/pizarra/PizarraPane').default;
      let setView;
      // The Tree wrapper holds a stateful maximizedView so the
      // shell actually animates when we flip it.
      function Tree() {
        const [view, set] = React.useState('workspace');
        setView = set;
        return React.createElement(PizarraPane, {
          dockState: { activeTab: 'pizarra', maximizedView: view },
        });
      }
      const { container, root } = makeRoot();
      renderInto(root, React.createElement(Tree));

      act(() => {
        setView('pizarra');
      });

      // Debounce 200ms + <= 50ms reduced-motion total = under 250ms
      // the shell should be back at phase=idle.
      act(() => {
        jest.advanceTimersByTime(260);
      });

      const shell = document.querySelector('[data-testid="mode-transition-shell"]');
      expect(shell).toBeTruthy();
      expect(shell.getAttribute('data-transition-phase')).toBe('idle');
      expect(shell.style.pointerEvents).toBe('auto');
    } finally {
      dom.window.matchMedia = orig;
      restore();
      jest.useRealTimers();
    }
  });
});
