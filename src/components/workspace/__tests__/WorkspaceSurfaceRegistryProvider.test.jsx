/**
 * WorkspaceSurfaceRegistryProvider — Phase B.2b bridge.
 */

const React = require('react');
const { act } = require('@testing-library/react');
const { installDom, cleanupMountedRoots } = require('@/test-support/domHarness');

const mountedRoots = [];
let dom;

function loadModules(flagValue) {
  delete require.cache[require.resolve('@/lib/pizarra/featureFlag')];
  delete require.cache[require.resolve('@/components/workspace/WorkspaceSurfaceRegistryProvider')];
  delete require.cache[require.resolve('@/lib/pizarra/useSharedSurfaceRegistry')];
  delete require.cache[require.resolve('@/lib/pizarra/useLiveSurfaceRegistry')];

  const prevFlag = process.env.NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE;
  const prevNodeEnv = process.env.NODE_ENV;
  process.env.NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE = flagValue;
  process.env.NODE_ENV = 'development';

  const { _resetFlagForTests } = require('@/lib/pizarra/featureFlag');
  _resetFlagForTests();

  const Provider = require('@/components/workspace/WorkspaceSurfaceRegistryProvider').default;
  const { LiveSurfaceRegistryContext } = require('@/lib/pizarra/useLiveSurfaceRegistry');
  const { useSharedSurfaceRegistry } = require('@/lib/pizarra/useSharedSurfaceRegistry');

  return {
    Provider,
    LiveSurfaceRegistryContext,
    useSharedSurfaceRegistry,
    restore() {
      if (prevFlag === undefined) delete process.env.NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE;
      else process.env.NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE = prevFlag;
      if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = prevNodeEnv;
      _resetFlagForTests();
    },
  };
}

beforeEach(() => {
  dom = installDom();
});

afterEach(() => {
  cleanupMountedRoots(mountedRoots);
  if (dom?.window?.close) {
    try {
      dom.window.close();
    } catch (_e) {
      // ignore
    }
  }
});

describe('WorkspaceSurfaceRegistryProvider', () => {
  test('flag OFF — provides LiveSurfaceRegistryContext only', () => {
    const { Provider, LiveSurfaceRegistryContext, useSharedSurfaceRegistry, restore } =
      loadModules('0');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = require('react-dom/client').createRoot(container);
    mountedRoots.push({ root, container });

    const registryValue = {
      surfaces: [{ id: 's1', type: 'terminal' }],
      isLoaded: true,
      addSurface: jest.fn(),
      removeSurface: jest.fn(),
      updatePizarraLayout: jest.fn(),
      updateSurface: jest.fn(),
      resetSurfaces: jest.fn(),
    };

    let liveCtx;
    let sharedApi;
    function Consumer() {
      liveCtx = React.useContext(LiveSurfaceRegistryContext);
      sharedApi = useSharedSurfaceRegistry();
      return React.createElement('div', { 'data-testid': 'consumer' });
    }

    act(() => {
      root.render(
        React.createElement(
          Provider,
          { projectId: 'p', workspaceId: 'w', registryValue },
          React.createElement(Consumer)
        )
      );
    });

    expect(liveCtx).toBe(registryValue);
    expect(sharedApi.surfaces).toEqual([]);
    restore();
  });

  test('flag ON — mounts SharedSurfaceRegistryProvider with external registryInstance', () => {
    const {
      Provider,
      LiveSurfaceRegistryContext: _LiveSurfaceRegistryContext,
      useSharedSurfaceRegistry,
      restore,
    } = loadModules('1');
    const { createSharedSurfaceRegistry } = require('@/lib/pizarra/useSharedSurfaceRegistry');
    const externalRegistry = createSharedSurfaceRegistry({ projectId: 'p', workspaceId: 'w' });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = require('react-dom/client').createRoot(container);
    mountedRoots.push({ root, container });

    const registryValue = {
      surfaces: [],
      isLoaded: true,
      addSurface: jest.fn(),
      removeSurface: jest.fn(),
      updatePizarraLayout: jest.fn(),
      updateSurface: jest.fn(),
      resetSurfaces: jest.fn(),
    };

    let sharedApi;
    function Consumer() {
      sharedApi = useSharedSurfaceRegistry();
      return React.createElement('div', { 'data-testid': 'consumer' });
    }

    act(() => {
      root.render(
        React.createElement(
          Provider,
          {
            projectId: 'p',
            workspaceId: 'w',
            registryValue,
            registryInstance: externalRegistry,
          },
          React.createElement(Consumer)
        )
      );
    });

    act(() => {
      externalRegistry.register(
        { id: 'pz-1', type: 'terminal', source: 'pizarra', panelId: 'pz-1' },
        { writer: 'pizarra' }
      );
    });

    expect(sharedApi.surfaces).toHaveLength(1);
    expect(sharedApi.surfaces[0].source).toBe('pizarra');
    restore();
  });
});
