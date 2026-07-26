const {
  buildSurfaceStorageKey,
  compactSurfaceForStorage,
  readSurfacesFromStorage,
  writeSurfacesToStorage,
  pruneStaleSurfaceStorageKeys,
  SURFACE_STORAGE_KEY_PREFIX,
} = require('../surfacePersistence');

function createMemoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    get length() {
      return map.size;
    },
    key(index) {
      return Array.from(map.keys())[index] ?? null;
    },
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
    removeItem(key) {
      map.delete(key);
    },
  };
}

describe('surfacePersistence', () => {
  test('compactSurfaceForStorage keeps only persistable fields', () => {
    const compact = compactSurfaceForStorage({
      id: 'shape-term-p1',
      type: 'terminal',
      panelId: 'p1',
      label: 'opencode',
      runtimeHandle: { heavy: true },
      pizarra: { x: 10, y: 20, width: 800, height: 500, visible: true, zIndex: 9 },
      extra: 'drop-me',
    });

    expect(compact).toEqual({
      id: 'shape-term-p1',
      type: 'terminal',
      panelId: 'p1',
      label: 'opencode',
      // pizarra-editing-ux Phase 4: zIndex + locked are now persistable.
      pizarra: { x: 10, y: 20, width: 800, height: 500, visible: true, zIndex: 9 },
    });
  });

  test('writeSurfacesToStorage skips unchanged payloads', () => {
    const storage = createMemoryStorage();
    const surfaces = [{ id: 'a', type: 'terminal', panelId: 'p1' }];
    const first = writeSurfacesToStorage(storage, 'proj', 'ws1', surfaces);
    const second = writeSurfacesToStorage(storage, 'proj', 'ws1', surfaces, {
      previousSerialized: first.serialized,
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(second.skipped).toBe(true);
  });

  test('readSurfacesFromStorage hydrates default pizarra layout', () => {
    const storage = createMemoryStorage({
      [buildSurfaceStorageKey('proj', 'ws1')]: JSON.stringify([
        { id: 'shape-term-p1', type: 'terminal', panelId: 'p1' },
      ]),
    });

    const surfaces = readSurfacesFromStorage(storage, 'proj', 'ws1');
    expect(surfaces[0].pizarra).toEqual({
      x: null,
      y: null,
      width: 640,
      height: 400,
      visible: true,
      // pizarra-editing-ux Phase 4: hydrate defaults for layer order + lock.
      zIndex: 0,
      locked: false,
    });
  });

  test('writeSurfacesToStorage prunes stale keys on quota errors', () => {
    const keepKey = buildSurfaceStorageKey('proj', 'ws1');
    const staleKey = `${SURFACE_STORAGE_KEY_PREFIX}oldproj_oldws`;
    const storage = createMemoryStorage({
      [staleKey]: 'x'.repeat(5000),
    });

    let setCalls = 0;
    const originalSetItem = storage.setItem.bind(storage);
    storage.setItem = (key, value) => {
      setCalls += 1;
      if (setCalls === 1) {
        const error = new Error('quota');
        error.name = 'QuotaExceededError';
        throw error;
      }
      return originalSetItem(key, value);
    };

    const result = writeSurfacesToStorage(storage, 'proj', 'ws1', [
      { id: 'shape-term-p1', type: 'terminal', panelId: 'p1' },
    ]);

    expect(result.ok).toBe(true);
    expect(result.recovered).toBe(true);
    expect(storage.getItem(staleKey)).toBeNull();
    expect(storage.getItem(keepKey)).toContain('shape-term-p1');
    expect(pruneStaleSurfaceStorageKeys(storage, { projectId: 'proj', workspaceId: 'ws1' })).toBe(
      0
    );
  });
});
