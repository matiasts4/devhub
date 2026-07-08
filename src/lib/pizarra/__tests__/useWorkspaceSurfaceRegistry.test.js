/**
 * useWorkspaceSurfaceRegistry — unified TWM surface registry.
 *
 * Contract:
 *   1. Flag OFF → legacy localStorage behavior (same as useLegacyLiveSurfaceRegistry).
 *   2. Flag ON  → createSharedSurfaceRegistry with legacy-compatible API.
 *   3. Exposes { surfaces, isLoaded, addSurface, removeSurface,
 *      updatePizarraLayout, updateSurface, resetSurfaces }.
 */

const { act, renderHook, waitFor } = require('@testing-library/react');
const { installDom } = require('@/test-support/domHarness');

function loadModules(flagValue) {
  delete require.cache[require.resolve('../featureFlag')];
  delete require.cache[require.resolve('../useSharedSurfaceRegistry')];
  delete require.cache[require.resolve('../useWorkspaceSurfaceRegistry')];

  const prevFlag = process.env.NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE;
  const prevNodeEnv = process.env.NODE_ENV;
  process.env.NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE = flagValue;
  process.env.NODE_ENV = 'development';

  const { _resetFlagForTests } = require('../featureFlag');
  _resetFlagForTests();

  const mod = require('../useWorkspaceSurfaceRegistry');
  return {
    mod,
    restore() {
      if (prevFlag === undefined) delete process.env.NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE;
      else process.env.NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE = prevFlag;
      if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = prevNodeEnv;
      _resetFlagForTests();
    },
  };
}

let dom;

beforeEach(() => {
  dom = installDom();
  dom.window.localStorage.clear();
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

describe('useWorkspaceSurfaceRegistry — flag OFF (legacy)', () => {
  test('loads persisted surfaces and exposes legacy API', async () => {
    const key = 'devhub_pizarra_surfaces_proj-a_ws-1';
    dom.window.localStorage.setItem(
      key,
      JSON.stringify([{ id: 's1', type: 'terminal', panelId: 'p1' }])
    );

    const { mod, restore } = loadModules('0');
    const { result } = renderHook(() => mod.useWorkspaceSurfaceRegistry('proj-a', 'ws-1'));

    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    expect(result.current.surfaces).toHaveLength(1);
    expect(result.current.surfaces[0].id).toBe('s1');
    expect(typeof result.current.addSurface).toBe('function');
    restore();
  });

  test('addSurface persists to localStorage', async () => {
    const { mod, restore } = loadModules('0');
    const { result } = renderHook(() => mod.useWorkspaceSurfaceRegistry('p', 'w'));

    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    act(() => {
      result.current.addSurface({ id: 't1', type: 'terminal', panelId: 't1' });
    });

    expect(result.current.surfaces).toHaveLength(1);
    const raw = dom.window.localStorage.getItem('devhub_pizarra_surfaces_p_w');
    expect(JSON.parse(raw)).toHaveLength(1);
    restore();
  });

  test('updatePizarraLayout routes layout fields into pizarra sub-object', async () => {
    const { mod, restore } = loadModules('0');
    const { result } = renderHook(() => mod.useWorkspaceSurfaceRegistry('p', 'w'));

    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    act(() => {
      result.current.addSurface({ id: 's1', type: 'terminal' });
      result.current.updatePizarraLayout('s1', { x: 10, y: 20, label: 'dock' });
    });

    expect(result.current.surfaces[0].pizarra).toEqual({ x: 10, y: 20 });
    expect(result.current.surfaces[0].label).toBe('dock');
    restore();
  });

  // pizarra-editing-ux Phase 4: zIndex + locked ride under surface.pizarra.
  // splitPizarraLayout (shared by the legacy + shared registry paths) must
  // route them into pizarra, not root, so they persist + hydrate correctly.
  test('updatePizarraLayout routes zIndex + locked into pizarra (Phase 4)', async () => {
    const { mod, restore } = loadModules('0');
    const { result } = renderHook(() => mod.useWorkspaceSurfaceRegistry('p', 'w'));

    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    act(() => {
      result.current.addSurface({ id: 's1', type: 'terminal' });
      result.current.updatePizarraLayout('s1', { locked: true, zIndex: 5, label: 'ops' });
    });

    expect(result.current.surfaces[0].pizarra).toEqual({ locked: true, zIndex: 5 });
    expect(result.current.surfaces[0].pizarra.locked).toBe(true);
    expect(result.current.surfaces[0].label).toBe('ops');
    restore();
  });
});

describe('useWorkspaceSurfaceRegistry — flag ON (shared registry)', () => {
  test('addSurface registers with source workspace', async () => {
    const { mod, restore } = loadModules('1');
    const { result } = renderHook(() => mod.useWorkspaceSurfaceRegistry('p', 'w'));

    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    act(() => {
      result.current.addSurface({ id: 't1', type: 'terminal', panelId: 't1' });
    });

    expect(result.current.surfaces).toHaveLength(1);
    expect(result.current.surfaces[0].source).toBe('workspace');
    restore();
  });

  test('removeSurface and updateSurface mutate registry list', async () => {
    const { mod, restore } = loadModules('1');
    const { result } = renderHook(() => mod.useWorkspaceSurfaceRegistry('p', 'w'));

    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    act(() => {
      result.current.addSurface({ id: 't1', type: 'terminal' });
      result.current.updateSurface('t1', { requestedRendererMode: 'webgl' });
    });
    expect(result.current.surfaces[0].requestedRendererMode).toBe('webgl');

    act(() => {
      result.current.removeSurface('t1');
    });
    expect(result.current.surfaces).toHaveLength(0);
    restore();
  });

  test('resetSurfaces replaces all entries in registry', async () => {
    const { mod, restore } = loadModules('1');
    const { result } = renderHook(() => mod.useWorkspaceSurfaceRegistry('p', 'w'));

    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    act(() => {
      result.current.addSurface({ id: 'old', type: 'terminal' });
      result.current.resetSurfaces([{ id: 'new', type: 'browser', panelId: 'new' }]);
    });

    expect(result.current.surfaces).toHaveLength(1);
    expect(result.current.surfaces[0].id).toBe('new');
    expect(result.current.surfaces[0].source).toBe('workspace');
    restore();
  });

  test('reloads on workspace change', async () => {
    const key1 = 'devhub_pizarra_surfaces_p_ws-1';
    const key2 = 'devhub_pizarra_surfaces_p_ws-2';
    dom.window.localStorage.setItem(key1, JSON.stringify([{ id: 'a', type: 'terminal' }]));
    dom.window.localStorage.setItem(key2, JSON.stringify([{ id: 'b', type: 'terminal' }]));

    const { mod, restore } = loadModules('1');
    const { result, rerender } = renderHook(
      ({ wsId }) => mod.useWorkspaceSurfaceRegistry('p', wsId),
      { initialProps: { wsId: 'ws-1' } }
    );

    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    expect(result.current.surfaces[0].id).toBe('a');

    rerender({ wsId: 'ws-2' });
    await waitFor(() => expect(result.current.surfaces[0]?.id).toBe('b'));
    restore();
  });
});

describe('useLiveSurfaceRegistry shim', () => {
  test('re-exports useWorkspaceSurfaceRegistry', () => {
    const shim = require('../useLiveSurfaceRegistry');
    const main = require('../useWorkspaceSurfaceRegistry');
    expect(shim.useLiveSurfaceRegistry).toBe(main.useWorkspaceSurfaceRegistry);
  });
});
