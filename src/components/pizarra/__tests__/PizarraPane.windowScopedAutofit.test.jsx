const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const { JSDOM } = require('jsdom');

let lastLiveLayerProps = null;
let layoutUpdates = [];

jest.mock('lucide-react', () => {
  const ReactLocal = require('react');
  const icon = (name) => (props) =>
    ReactLocal.createElement('svg', { ...props, 'data-icon': name });
  return new Proxy({}, { get: (_, key) => icon(String(key)) });
});

jest.mock('next/dynamic', () => () => {
  const ReactLocal = require('react');
  return function DynamicCanvas() {
    return ReactLocal.createElement('div', { 'data-testid': 'pizarra-canvas-mock' });
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
    setWheelViewNavigateHandler: () => {},
  }),
  CanvasViewportProvider: ({ children }) => children,
}));

jest.mock('@/lib/pizarra/featureFlag', () => ({
  isPizarraSharedViewEnabled: () => false,
}));

jest.mock('../PizarraLiveSurfaceLayer', () => {
  const ReactLocal = require('react');
  return {
    __esModule: true,
    default: (props) => {
      lastLiveLayerProps = props;
      return ReactLocal.createElement('div', { 'data-testid': 'pizarra-live-layer' });
    },
  };
});

function installDom() {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: 'http://localhost:3100/',
  });
  global.document = dom.window.document;
  global.window = dom.window;
  global.navigator = dom.window.navigator;
  global.HTMLElement = dom.window.HTMLElement;
  global.MouseEvent = dom.window.MouseEvent;
  global.Event = dom.window.Event;
  global.CustomEvent = dom.window.CustomEvent;
  global.IS_REACT_ACT_ENVIRONMENT = true;
  global.requestAnimationFrame = (callback) => setTimeout(callback, 0);
  global.cancelAnimationFrame = (id) => clearTimeout(id);
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    disconnect() {}
  };
  return dom;
}

function RegistryHarness({ initialSurfaces, paneProps }) {
  const { default: PizarraPane } = require('../PizarraPane');
  const { LiveSurfaceRegistryContext } = require('@/lib/pizarra/useLiveSurfaceRegistry');
  const [surfaces, setSurfaces] = React.useState(initialSurfaces);

  const addSurface = React.useCallback((surface) => {
    setSurfaces((current) => [...current, surface]);
    return surface;
  }, []);
  const removeSurface = React.useCallback((id) => {
    setSurfaces((current) => current.filter((surface) => surface.id !== id));
  }, []);
  const updatePizarraLayout = React.useCallback((id, changes) => {
    layoutUpdates.push({ id, changes });
    setSurfaces((current) =>
      current.map((surface) =>
        surface.id === id ? { ...surface, pizarra: { ...surface.pizarra, ...changes } } : surface
      )
    );
  }, []);
  const resetSurfaces = React.useCallback((next) => setSurfaces(next || []), []);

  const registry = React.useMemo(
    () => ({
      surfaces,
      isLoaded: true,
      addSurface,
      removeSurface,
      updatePizarraLayout,
      updateSurface: () => {},
      resetSurfaces,
    }),
    [surfaces, addSurface, removeSurface, updatePizarraLayout, resetSurfaces]
  );

  return React.createElement(
    LiveSurfaceRegistryContext.Provider,
    { value: registry },
    React.createElement(PizarraPane, paneProps)
  );
}

function terminal(id, panelId, viewId, x) {
  return {
    id,
    type: 'terminal',
    panelId,
    label: panelId,
    pizarra: { x, y: 20, width: 360, height: 320, visible: true, viewId },
  };
}

describe('PizarraPane window-scoped auto-fit', () => {
  let dom;
  let container;
  let root;

  const views = [
    { id: 'v1', columns: [{ id: 'c1', panels: [{ id: 'p1' }] }] },
    { id: 'v2', columns: [{ id: 'c2', panels: [{ id: 'p2' }] }] },
  ];

  beforeEach(() => {
    jest.useFakeTimers();
    dom = installDom();
    window.localStorage.setItem('devhub_pizarra_view_locked', '0');
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    lastLiveLayerProps = null;
    layoutUpdates = [];
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    jest.clearAllTimers();
    jest.useRealTimers();
    delete global.IS_REACT_ACT_ENVIRONMENT;
    dom.window.close();
  });

  async function renderWith(surfaces, workspaceWindows = views) {
    await act(async () => {
      root.render(
        React.createElement(RegistryHarness, {
          initialSurfaces: surfaces,
          paneProps: {
            projectId: 'project-1',
            workspaceId: 'workspace-1',
            workspaceWindows,
            activeWorkspaceWindowId: 'v1',
            initialHudRevealed: true,
          },
        })
      );
    });
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    layoutUpdates = [];
  }

  test('auto-fit does not mix workspace windows during a view transition', async () => {
    await renderWith([
      terminal('shape-term-p1', 'p1', 'v1', 20),
      terminal('shape-term-p2', 'p2', 'v2', 1820),
    ]);

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent('devhub:pizarra-select-view', {
          detail: { workspaceId: 'workspace-1', windowId: 'v2' },
        })
      );
    });
    expect(lastLiveLayerProps.isViewTransitioning).toBe(true);

    layoutUpdates = [];
    await act(async () => {
      window.dispatchEvent(new CustomEvent('pizarra:arrange-fit'));
    });

    expect(layoutUpdates).toEqual([]);
  });

  test('closing a terminal auto-fits the remaining terminal in the active view', async () => {
    await renderWith(
      [terminal('shape-term-p1', 'p1', 'v1', 20), terminal('shape-term-p2', 'p2', 'v1', 400)],
      [
        {
          id: 'v1',
          columns: [{ id: 'c1', panels: [{ id: 'p1' }, { id: 'p2' }] }],
        },
        { id: 'v2', columns: [] },
      ]
    );

    await act(async () => {
      lastLiveLayerProps.onRemoveElement('shape-term-p2');
    });

    const remainingUpdate = layoutUpdates.find((update) => update.id === 'shape-term-p1');
    expect(remainingUpdate).toBeTruthy();
    expect(remainingUpdate.changes.width).toBeGreaterThan(500);
    expect(layoutUpdates.some((update) => update.id === 'shape-term-p2')).toBe(false);
  });
});
