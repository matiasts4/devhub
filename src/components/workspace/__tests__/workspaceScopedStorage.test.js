/**
 * workspaceScopedStorage — purge/seed/prune for sequential workspace ids.
 */

const {
  clearWorkspaceScopedStorage,
  seedFreshWorkspaceDockState,
  pruneOrphanWorkspaceScopedStorage,
  buildSurfaceStorageKey,
  buildPizarraViewportKey,
  buildRightDockStorageKey,
} = require('../workspaceScopedStorage');
const { readRightDockState, sanitizeRightDockState } = require('../rightDockState');
const { readBrowserWindowStates, writeBrowserWindowStates } = require('../browserWindowState');

function makeStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    get length() {
      return store.size;
    },
    key(index) {
      return Array.from(store.keys())[index] ?? null;
    },
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    _dump() {
      return Object.fromEntries(store.entries());
    },
  };
}

describe('workspaceScopedStorage', () => {
  test('clearWorkspaceScopedStorage removes dock, surfaces, viewport and browser entry', () => {
    const projectId = 'proj-a';
    const wsId = 'ws2';
    const storage = makeStorage({
      [buildRightDockStorageKey(projectId, wsId)]: JSON.stringify(
        sanitizeRightDockState({
          visible: true,
          activeTab: 'pizarra',
          maximized: true,
          maximizedView: 'pizarra',
          browserUrl: 'https://wordpress.example/',
        })
      ),
      [buildSurfaceStorageKey(projectId, wsId)]: JSON.stringify([
        { id: 'shape-1', type: 'browser', panelId: 'b1' },
      ]),
      [buildPizarraViewportKey(projectId, wsId)]: JSON.stringify({
        zoom: 2,
        pan: { x: 1, y: 2 },
      }),
    });
    writeBrowserWindowStates(storage, projectId, {
      ws2: { open: true, url: 'https://wordpress.example/', label: 'WP', updatedAt: 1 },
      ws1: { open: false, url: '', label: '', updatedAt: 0 },
    });

    const { removedKeys } = clearWorkspaceScopedStorage(storage, projectId, wsId);
    expect(removedKeys.length).toBeGreaterThanOrEqual(3);
    expect(storage.getItem(buildRightDockStorageKey(projectId, wsId))).toBeNull();
    expect(storage.getItem(buildSurfaceStorageKey(projectId, wsId))).toBeNull();
    expect(storage.getItem(buildPizarraViewportKey(projectId, wsId))).toBeNull();

    const browsers = readBrowserWindowStates(storage, projectId);
    expect(browsers.ws2).toBeUndefined();
    expect(browsers.ws1).toBeDefined();
  });

  test('seedFreshWorkspaceDockState overwrites zombie pizarra/browser URL', () => {
    const projectId = 'proj-b';
    const wsId = 'ws3';
    const storage = makeStorage({
      [buildRightDockStorageKey(projectId, wsId)]: JSON.stringify(
        sanitizeRightDockState({
          visible: true,
          activeTab: 'pizarra',
          maximized: true,
          maximizedView: 'pizarra',
          browserUrl: 'https://old-wordpress.local/',
        })
      ),
    });

    const fresh = seedFreshWorkspaceDockState(storage, projectId, wsId);
    expect(fresh.maximized).toBe(false);
    expect(fresh.maximizedView).not.toBe('pizarra');
    expect(fresh.activeTab).not.toBe('pizarra');
    expect(String(fresh.browserUrl || '')).not.toMatch(/wordpress/i);

    const reread = readRightDockState(storage, projectId, wsId);
    expect(reread.maximized).toBe(false);
    expect(reread.activeTab).not.toBe('pizarra');
    expect(storage.getItem(buildSurfaceStorageKey(projectId, wsId))).toBe('[]');
  });

  test('pruneOrphanWorkspaceScopedStorage keeps live workspaces only', () => {
    const projectId = 'proj-c';
    const storage = makeStorage({
      [buildRightDockStorageKey(projectId, 'ws1')]: JSON.stringify({ visible: false }),
      [buildRightDockStorageKey(projectId, 'ws2')]: JSON.stringify({
        visible: true,
        activeTab: 'pizarra',
        maximized: true,
        maximizedView: 'pizarra',
      }),
      [buildSurfaceStorageKey(projectId, 'ws2')]: '[]',
      [buildPizarraViewportKey(projectId, 'ws2')]: JSON.stringify({
        zoom: 1,
        pan: { x: 0, y: 0 },
      }),
    });
    writeBrowserWindowStates(storage, projectId, {
      ws1: { open: false, url: '', label: '', updatedAt: 0 },
      ws2: { open: true, url: 'https://stale.test/', label: 'S', updatedAt: 9 },
    });

    const { removedKeys } = pruneOrphanWorkspaceScopedStorage(storage, projectId, ['ws1']);
    expect(removedKeys.some((k) => k.includes('ws2'))).toBe(true);
    expect(storage.getItem(buildRightDockStorageKey(projectId, 'ws1'))).not.toBeNull();
    expect(storage.getItem(buildRightDockStorageKey(projectId, 'ws2'))).toBeNull();
    expect(storage.getItem(buildSurfaceStorageKey(projectId, 'ws2'))).toBeNull();
    expect(readBrowserWindowStates(storage, projectId).ws2).toBeUndefined();
    expect(readBrowserWindowStates(storage, projectId).ws1).toBeDefined();
  });
});
