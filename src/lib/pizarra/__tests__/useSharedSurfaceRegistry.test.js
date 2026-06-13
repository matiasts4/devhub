/**
 * useSharedSurfaceRegistry — bidirectional surface registry.
 *
 * Phase 5 of pizarra-shared-view-state. Promotes the existing
 * one-way `useLiveSurfaceRegistry` to a bidirectional registry:
 *   - workspace AND pizarra can both publish
 *   - workspace AND pizarra can both subscribe
 *   - single-writer rule: a workspace surface is owned by
 *     the workspace source; a pizarra surface is owned by
 *     the pizarra source. The other source can read but
 *     cannot write.
 *   - last-write-wins merge on `lastUpdatedAt` when both
 *     sources publish the same `id`
 *   - stale writes (with an earlier lastUpdatedAt than the
 *     current descriptor) are rejected with a console.warn
 *   - persistence to localStorage under
 *     `devhub_pizarra_surfaces_{projectId}_{workspaceId}`
 *
 * The contract (this file pins):
 *   1. `register(surface)` adds a surface with the caller's
 *      source. The writer must own the source (e.g. a
 *      workspace writer can only write `source: 'workspace'`).
 *   2. The registry dedupes by id. When two sources publish
 *      the same id, the LWW entry wins.
 *   3. `unregister(id, source)` removes the surface; only the
 *      owning source can unregister.
 *   4. `subscribe(id, cb)` notifies on changes to the
 *      surface with that id. Stale writes do NOT notify.
 *   5. `requestSurfaceUpdate(id, patch, source)` is the
 *      cross-source intent path. Only the workspace writer
 *      can apply cross-source updates.
 *   6. Legacy WIP `addSurface` / `updatePizarraLayout` are
 *      preserved as a re-export shim.
 */

const React = require('react');
const { installDom, renderIntoDom, cleanupMountedRoots } = require('@/test-support/domHarness');
const { act } = require('@testing-library/react');

const {
  useSharedSurfaceRegistry,
  SharedSurfaceRegistryProvider,
  createSharedSurfaceRegistry,
  surfaceWriteRejected,
} = require('../useSharedSurfaceRegistry');

const mountedRoots = [];
let dom;

beforeEach(() => {
  dom = installDom();
});

afterEach(() => {
  cleanupMountedRoots(mountedRoots);
  if (dom && dom.window && dom.window.close) {
    try {
      dom.window.close();
    } catch (e) {
      // ignore
    }
  }
});

// ── Tests for the pure registry (no React) ────────────────────────────────

describe('createSharedSurfaceRegistry — pure bidirectional registry', () => {
  test('register + list returns surfaces from both sources', () => {
    const reg = createSharedSurfaceRegistry();
    reg.register({
      id: 'term-1',
      type: 'terminal',
      source: 'workspace',
      panelId: 'term-1',
      surface: { x: 0, y: 0, w: 100, h: 100 },
    });
    reg.register({
      id: 'pz-1',
      type: 'terminal',
      source: 'pizarra',
      panelId: 'pz-1',
      surface: { x: 10, y: 20, w: 200, h: 300 },
    });

    const list = reg.list();
    expect(list).toHaveLength(2);
    expect(list.find((s) => s.id === 'term-1').source).toBe('workspace');
    expect(list.find((s) => s.id === 'pz-1').source).toBe('pizarra');
  });

  test('same id from both sources → one entry, lastUpdatedAt = max of two', () => {
    const reg = createSharedSurfaceRegistry();
    reg.register({
      id: 'shared-1',
      type: 'terminal',
      source: 'workspace',
      panelId: 'shared-1',
      lastUpdatedAt: 100,
    });
    reg.register({
      id: 'shared-1',
      type: 'terminal',
      source: 'pizarra',
      panelId: 'shared-1',
      lastUpdatedAt: 200,
    });
    const list = reg.list();
    expect(list).toHaveLength(1);
    expect(list[0].lastUpdatedAt).toBe(200);
  });

  test('stale write (earlier lastUpdatedAt) is rejected; console.warn called', () => {
    const reg = createSharedSurfaceRegistry();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    reg.register({
      id: 'term-1',
      type: 'terminal',
      source: 'workspace',
      panelId: 'term-1',
      lastUpdatedAt: 100,
    });
    // Stale write from pizarra: lastUpdatedAt 50 < 100
    reg.register({
      id: 'term-1',
      type: 'terminal',
      source: 'pizarra',
      panelId: 'term-1',
      lastUpdatedAt: 50,
    });
    const list = reg.list();
    expect(list).toHaveLength(1);
    expect(list[0].lastUpdatedAt).toBe(100);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  test('workspace source can only write surfaces with source=workspace', () => {
    const reg = createSharedSurfaceRegistry();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    // workspace writer tries to write a pizarra source: rejected
    reg.register(
      {
        id: 'pz-1',
        type: 'terminal',
        source: 'pizarra', // wrong source for the writer
        panelId: 'pz-1',
      },
      { writer: 'workspace' }
    );
    expect(reg.list()).toHaveLength(0);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  test('pizarra source can only write surfaces with source=pizarra', () => {
    const reg = createSharedSurfaceRegistry();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    reg.register(
      {
        id: 'ws-1',
        type: 'terminal',
        source: 'workspace', // wrong source for the writer
        panelId: 'ws-1',
      },
      { writer: 'pizarra' }
    );
    expect(reg.list()).toHaveLength(0);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  test('subscribers are notified on add/remove/update; NOT on stale write', () => {
    const reg = createSharedSurfaceRegistry();
    const cb = jest.fn();
    reg.subscribe('term-1', cb);

    reg.register({
      id: 'term-1',
      type: 'terminal',
      source: 'workspace',
      panelId: 'term-1',
      lastUpdatedAt: 100,
    });
    expect(cb).toHaveBeenCalledTimes(1);

    cb.mockClear();
    // Stale write: lastUpdatedAt 50 < 100
    reg.register({
      id: 'term-1',
      type: 'terminal',
      source: 'pizarra',
      panelId: 'term-1',
      lastUpdatedAt: 50,
    });
    expect(cb).toHaveBeenCalledTimes(0); // stale write does NOT notify

    cb.mockClear();
    reg.unregister('term-1', { source: 'workspace' });
    expect(cb).toHaveBeenCalledTimes(1);
  });

  test('unregister: only the owning source can remove', () => {
    const reg = createSharedSurfaceRegistry();
    reg.register({
      id: 'term-1',
      type: 'terminal',
      source: 'workspace',
      panelId: 'term-1',
    });

    // Pizarra source tries to unregister: rejected.
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    reg.unregister('term-1', { source: 'pizarra' });
    expect(reg.list()).toHaveLength(1);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();

    // Workspace source can unregister.
    reg.unregister('term-1', { source: 'workspace' });
    expect(reg.list()).toHaveLength(0);
  });

  test('update with newer lastUpdatedAt is applied; older is rejected', () => {
    const reg = createSharedSurfaceRegistry();
    const cb = jest.fn();
    reg.register({
      id: 'term-1',
      type: 'terminal',
      source: 'workspace',
      panelId: 'term-1',
      lastUpdatedAt: 100,
      surface: { x: 0, y: 0, w: 100, h: 100 },
    });
    reg.subscribe('term-1', cb);

    cb.mockClear();
    reg.update(
      'term-1',
      { surface: { x: 50, y: 50, w: 200, h: 200 }, lastUpdatedAt: 200 },
      { source: 'workspace' }
    );
    expect(cb).toHaveBeenCalledTimes(1);
    expect(reg.get('term-1').surface.x).toBe(50);

    cb.mockClear();
    // Older update: rejected.
    reg.update(
      'term-1',
      { surface: { x: 99, y: 99, w: 99, h: 99 }, lastUpdatedAt: 150 },
      { source: 'workspace' }
    );
    expect(cb).toHaveBeenCalledTimes(0);
    expect(reg.get('term-1').surface.x).toBe(50);
  });
});

describe('useSharedSurfaceRegistry — React hook', () => {
  test('hook returns { surfaces, register, unregister, update, subscribe }', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = require('react-dom/client').createRoot(container);
    mountedRoots.push({ root, container });

    let api;
    function Consumer() {
      api = useSharedSurfaceRegistry();
      return React.createElement('div', { 'data-testid': 'consumer' });
    }

    act(() => {
      root.render(
        React.createElement(
          SharedSurfaceRegistryProvider,
          { projectId: 'p-1', workspaceId: 'w-1' },
          React.createElement(Consumer)
        )
      );
    });

    expect(typeof api.register).toBe('function');
    expect(typeof api.unregister).toBe('function');
    expect(typeof api.update).toBe('function');
    expect(typeof api.subscribe).toBe('function');
    expect(Array.isArray(api.surfaces)).toBe(true);

    act(() => {
      api.register({
        id: 'term-1',
        type: 'terminal',
        source: 'workspace',
        panelId: 'term-1',
      });
    });
    expect(api.surfaces).toHaveLength(1);
  });

  test('legacy useLiveSurfaceRegistry fallback shim still works', () => {
    // Import the WIP file and check it co-exists.
    const WipFile = require('../useLiveSurfaceRegistry');
    expect(typeof WipFile.useLiveSurfaceRegistry).toBe('function');
  });
});
