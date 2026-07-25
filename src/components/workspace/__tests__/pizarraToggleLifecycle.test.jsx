/**
 * pizarraToggleLifecycle — A1.8 integration test.
 *
 * Simulates a singleton terminal surface registered in
 * SharedSurfacesProvider, then flips the preferred projection
 * host between workspace-dock and pizarra-canvas five times
 * (workspace ↔ pizarra). The surfaceId and refcount must stay
 * stable; no hard release (keepAlive: false) may run.
 */

const React = require('react');
const { installDom } = require('@/test-support/domHarness');
const { act } = require('@testing-library/react');

const {
  SharedSurfacesProvider,
  useSurfaceRegistry,
  useSurfaceContent,
} = require('../SharedSurfacesProvider');
const SurfacePortal = require('../SurfacePortal').default;

const WORKSPACE_HOST = 'workspace-dock';
const PIZARRA_HOST = 'pizarra-canvas';
const SURFACE_ID = 'pz-1';

let dom;

beforeEach(() => {
  dom = installDom();
});

afterEach(() => {
  if (dom && dom.window && dom.window.close) {
    try {
      dom.window.close();
    } catch (e) {
      // ignore
    }
  }
});

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

function HiddenSurfaceMount({ surfaceId, content }) {
  useSurfaceContent(surfaceId, () => content);
  return null;
}

describe('pizarra toggle lifecycle (A1.8)', () => {
  test('5 preferred-host flips preserve surfaceId, stable refcount, no hard release', () => {
    const onDestroy = jest.fn();
    const hardReleaseCalls = [];
    let registry;

    function App() {
      registry = useSurfaceRegistry();

      React.useEffect(() => {
        const unregister = registry.registerSurface(SURFACE_ID, { type: 'terminal' });
        return unregister;
      }, [registry]);

      return React.createElement(
        React.Fragment,
        null,
        React.createElement(HiddenSurfaceMount, {
          surfaceId: SURFACE_ID,
          content: React.createElement('div', {
            'data-testid': 'surface-content',
            'data-surface-id': SURFACE_ID,
          }),
        }),
        React.createElement(SurfacePortal, {
          surfaceId: SURFACE_ID,
          hostId: WORKSPACE_HOST,
        }),
        React.createElement(SurfacePortal, {
          surfaceId: SURFACE_ID,
          hostId: PIZARRA_HOST,
        })
      );
    }

    const { root } = makeRoot();
    renderInto(
      root,
      React.createElement(
        SharedSurfacesProvider,
        { onSurfaceDestroy: onDestroy },
        React.createElement(App)
      )
    );

    const originalRelease = registry.releaseSurface.bind(registry);
    registry.releaseSurface = (id, opts = {}) => {
      if (opts.keepAlive === false) {
        hardReleaseCalls.push({ id, opts });
      }
      return originalRelease(id, opts);
    };

    expect(registry.getRefCount(SURFACE_ID)).toBe(1);
    expect(registry.get(SURFACE_ID).id).toBe(SURFACE_ID);

    const hostCycle = [PIZARRA_HOST, WORKSPACE_HOST, PIZARRA_HOST, WORKSPACE_HOST, PIZARRA_HOST];

    for (const hostId of hostCycle) {
      act(() => {
        registry.setPreferredHostForSurface(SURFACE_ID, hostId);
      });
      expect(registry.getRefCount(SURFACE_ID)).toBe(1);
      expect(registry.get(SURFACE_ID)).toBeDefined();
      expect(registry.get(SURFACE_ID).id).toBe(SURFACE_ID);
      expect(registry.getPreferredHostForSurface(SURFACE_ID)).toBe(hostId);
    }

    expect(hardReleaseCalls).toHaveLength(0);
    expect(onDestroy).not.toHaveBeenCalled();

    const content = document.querySelector('[data-testid="surface-content"]');
    expect(content).toBeTruthy();
    expect(content.getAttribute('data-surface-id')).toBe(SURFACE_ID);
  });
});
