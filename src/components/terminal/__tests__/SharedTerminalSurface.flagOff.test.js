/**
 * SharedTerminalSurface — flag OFF kill-switch contract (B.1).
 *
 * When NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE is OFF, the shared-view
 * singleton path must be inert: no surface content registration and no
 * portal host targets in the DOM.
 */

const React = require('react');
const { installDom, renderIntoDom, cleanupMountedRoots } = require('@/test-support/domHarness');

const {
  SharedSurfacesProvider,
  useSurfaceRegistry,
} = require('@/components/workspace/SharedSurfacesProvider');
const {
  SharedTerminalSurfaceRegistrar,
  SharedTerminalSurfacePortal,
  _resetSharedTerminalSurfacePropsForTests,
} = require('../SharedTerminalSurface');

let dom;
const mountedRoots = [];

function RegistryProbe({ onRegistry }) {
  const registry = useSurfaceRegistry();
  React.useEffect(() => {
    onRegistry(registry);
  }, [registry, onRegistry]);
  return null;
}

function restoreEnv(prevFlag, prevNodeEnv) {
  if (prevFlag === undefined) delete process.env.NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE;
  else process.env.NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE = prevFlag;
  if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = prevNodeEnv;
  try {
    delete require.cache[require.resolve('@/lib/pizarra/featureFlag')];
    delete require.cache[require.resolve('../SharedTerminalSurface')];
    const { _resetFlagForTests } = require('@/lib/pizarra/featureFlag');
    _resetFlagForTests();
  } catch {
    // ignore
  }
}

function enableFlagOff() {
  delete require.cache[require.resolve('@/lib/pizarra/featureFlag')];
  delete require.cache[require.resolve('../SharedTerminalSurface')];
  process.env.NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE = '0';
  process.env.NODE_ENV = 'development';
  const { _resetFlagForTests, isPizarraSharedViewEnabled } = require('@/lib/pizarra/featureFlag');
  _resetFlagForTests();
  expect(isPizarraSharedViewEnabled()).toBe(false);
}

describe('SharedTerminalSurface — flag OFF (B.1 kill switch)', () => {
  let prevFlag;
  let prevNodeEnv;

  beforeEach(() => {
    prevFlag = process.env.NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE;
    prevNodeEnv = process.env.NODE_ENV;
    enableFlagOff();
    dom = installDom();
    _resetSharedTerminalSurfacePropsForTests();
  });

  afterEach(() => {
    cleanupMountedRoots(mountedRoots);
    _resetSharedTerminalSurfacePropsForTests();
    restoreEnv(prevFlag, prevNodeEnv);
    if (dom && dom.window && dom.window.close) {
      try {
        dom.window.close();
      } catch {
        // ignore
      }
    }
  });

  test('SharedTerminalSurfaceRegistrar renders null and does not register surface content', async () => {
    let registryRef = null;
    const terminalProps = { panelId: 'p1', isVisibleInLayout: true };

    const view = await renderIntoDom(
      React.createElement(
        SharedSurfacesProvider,
        null,
        React.createElement(RegistryProbe, {
          onRegistry: (registry) => {
            registryRef = registry;
          },
        }),
        React.createElement(SharedTerminalSurfaceRegistrar, {
          surfaceId: 'p1',
          terminalProps,
        })
      ),
      mountedRoots
    );

    expect(registryRef).not.toBeNull();
    expect(registryRef.getActiveTarget('p1')).toBeUndefined();
    expect(registryRef.getPreferredHostForSurface('p1')).toBeUndefined();
    expect(
      view.container.querySelector('[data-testid="surface-portal-host-workspace-dock-p1"]')
    ).toBeNull();
    expect(view.container.textContent).toBe('');
  });

  test('SharedTerminalSurfacePortal renders null and does not register a portal host', async () => {
    let registryRef = null;

    const view = await renderIntoDom(
      React.createElement(
        SharedSurfacesProvider,
        null,
        React.createElement(RegistryProbe, {
          onRegistry: (registry) => {
            registryRef = registry;
          },
        }),
        React.createElement(SharedTerminalSurfacePortal, {
          surfaceId: 'p1',
          hostId: 'workspace-dock',
          isActiveHost: true,
        })
      ),
      mountedRoots
    );

    expect(registryRef).not.toBeNull();
    expect(registryRef.getActiveTarget('p1')).toBeUndefined();
    expect(registryRef.getPreferredHostForSurface('p1')).toBeUndefined();
    expect(
      view.container.querySelector('[data-testid="surface-portal-host-workspace-dock-p1"]')
    ).toBeNull();
    expect(view.container.textContent).toBe('');
  });
});
