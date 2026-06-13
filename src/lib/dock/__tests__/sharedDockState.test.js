/**
 * sharedDockState.test.js — Unit tests for the pure helpers in
 * src/lib/dock/sharedDockState.js.
 *
 * Strategy: All operations work against a minimal storage facade
 * (Map-backed) that the production code uses via the `storage`
 * argument. We avoid touching global localStorage so tests run
 * in the default `node` test environment.
 *
 * Coverage:
 * - sanitizeSharedDockState defaults
 * - sanitizeSharedDockState preserves tabs/activeTabId
 * - readSharedDockState returns default when missing
 * - writeSharedDockState round-trips
 * - migrateDockState migrates legacy `pizarra.dockState.v1` (legacy spec)
 * - migrateDockState migrates legacy `twm.dockState.v1` (legacy impl)
 * - migrateDockState missing legacy keys → defaults + no .bak
 * - migrateDockState corrupted JSON → fallback to defaults + .bak + console error
 * - migrateDockState idempotent (running twice produces same result)
 * - buildSharedDockStorageKey + .bak key shape
 *
 * Phase: pizarra-shared-view-state / Phase 2 (foundation)
 */

const {
  DEFAULT_SHARED_DOCK_STATE,
  MAX_TABS_PER_SURFACE,
  buildSharedDockStorageKey,
  buildSharedDockBakKey,
  sanitizeSharedDockState,
  readSharedDockState,
  writeSharedDockState,
  mergeDockState,
  migrateDockState,
  mergeRightDockChromeIntoSharedDock,
} = require('../sharedDockState');

function createStorage(initial = {}) {
  const store = new Map();
  for (const [k, v] of Object.entries(initial)) store.set(k, v);
  const listeners = new Set();
  return {
    _store: store,
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => {
      const previous = store.has(k) ? store.get(k) : null;
      store.set(k, v);
      // Fire storage event for cross-tab parity with real localStorage.
      for (const l of listeners) {
        l({ key: k, oldValue: previous, newValue: v, storageArea: store });
      }
    },
    removeItem: (k) => {
      const previous = store.has(k) ? store.get(k) : null;
      store.delete(k);
      for (const l of listeners) {
        l({ key: k, oldValue: previous, newValue: null, storageArea: store });
      }
    },
    addEventListener: (event, cb) => {
      if (event === 'storage') listeners.add(cb);
    },
    removeEventListener: (event, cb) => {
      if (event === 'storage') listeners.delete(cb);
    },
  };
}

describe('sharedDockState — storage key builders', () => {
  test('buildSharedDockStorageKey uses project + workspace', () => {
    expect(buildSharedDockStorageKey('p-1', 'w-1')).toBe('devhub_shared_dock_state_p-1_w-1');
  });

  test('buildSharedDockStorageKey falls back to "global" when missing', () => {
    expect(buildSharedDockStorageKey()).toBe('devhub_shared_dock_state_global');
    expect(buildSharedDockStorageKey('p-1')).toBe('devhub_shared_dock_state_p-1');
  });

  test('buildSharedDockBakKey appends .bak to the new key', () => {
    expect(buildSharedDockBakKey('p-1', 'w-1')).toBe('devhub_shared_dock_state_p-1_w-1.bak');
  });
});

describe('sharedDockState — sanitizeSharedDockState', () => {
  test('returns DEFAULT_SHARED_DOCK_STATE on empty input', () => {
    const result = sanitizeSharedDockState();
    expect(result).toEqual(DEFAULT_SHARED_DOCK_STATE);
    expect(result.tabs).toEqual([]);
    expect(result.activeTabId).toBeNull();
  });

  test('preserves valid tabs/activeTabId', () => {
    const result = sanitizeSharedDockState({
      tabs: [
        { id: 't1', url: 'https://example.com', label: 'Example', isActive: true, canClose: true },
      ],
      activeTabId: 't1',
    });
    expect(result.tabs).toHaveLength(1);
    expect(result.tabs[0].id).toBe('t1');
    expect(result.activeTabId).toBe('t1');
  });

  test('rejects non-array tabs', () => {
    const result = sanitizeSharedDockState({ tabs: 'not-an-array' });
    expect(result.tabs).toEqual([]);
  });

  test('caps tabs at MAX_TABS_PER_SURFACE', () => {
    const tooMany = Array.from({ length: MAX_TABS_PER_SURFACE + 5 }, (_, i) => ({
      id: `t${i}`,
      url: `https://example.com/${i}`,
      isActive: false,
      canClose: true,
    }));
    const result = sanitizeSharedDockState({ tabs: tooMany });
    expect(result.tabs).toHaveLength(MAX_TABS_PER_SURFACE);
  });
});

describe('sharedDockState — read/write roundtrip', () => {
  test('readSharedDockState returns default when key absent', () => {
    const storage = createStorage();
    const result = readSharedDockState(storage, 'p-1', 'w-1');
    expect(result).toEqual(DEFAULT_SHARED_DOCK_STATE);
  });

  test('writeSharedDockState + readSharedDockState roundtrips tabs', () => {
    const storage = createStorage();
    const state = sanitizeSharedDockState({
      tabs: [
        { id: 't1', url: 'https://a.example', isActive: true, canClose: true },
        { id: 't2', url: 'https://b.example', isActive: false, canClose: true },
      ],
      activeTabId: 't1',
    });
    writeSharedDockState(storage, 'p-1', 'w-1', state);
    const back = readSharedDockState(storage, 'p-1', 'w-1');
    expect(back.tabs).toEqual(state.tabs);
    expect(back.activeTabId).toBe('t1');
  });
});

describe('sharedDockState — mergeDockState', () => {
  test('returns a new state when both inputs are null', () => {
    const result = mergeDockState(null, null);
    expect(result).toEqual(DEFAULT_SHARED_DOCK_STATE);
  });

  test('prefers pizarra tabs over right-dock tabs on conflict (pizarra is newer in the proposal)', () => {
    const pizarra = sanitizeSharedDockState({
      tabs: [{ id: 'p1', url: 'https://pizarra', isActive: true, canClose: true }],
      activeTabId: 'p1',
    });
    const rightDock = sanitizeSharedDockState({
      tabs: [{ id: 'r1', url: 'https://right', isActive: true, canClose: true }],
      activeTabId: 'r1',
    });
    const merged = mergeDockState(pizarra, rightDock);
    // mergeDockState: if both present, pizarra wins on tab list because
    // pizarra is the consumer that needed the upgrade.
    expect(merged.tabs.map((t) => t.id)).toEqual(['p1']);
    expect(merged.activeTabId).toBe('p1');
  });

  test('falls back to right-dock when pizarra is empty (triangulation)', () => {
    const rightDock = sanitizeSharedDockState({
      tabs: [{ id: 'r1', url: 'https://right', isActive: true, canClose: true }],
      activeTabId: 'r1',
    });
    const merged = mergeDockState(null, rightDock);
    expect(merged.tabs.map((t) => t.id)).toEqual(['r1']);
    expect(merged.activeTabId).toBe('r1');
  });
});

describe('sharedDockState — migrateDockState (legacy keys)', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  test('migrates legacy pizarra.dockState.v1 shape', () => {
    const storage = createStorage({
      pizarra_dockState_v1_p_w: JSON.stringify({
        tabs: [{ id: 'legacy-t1', url: 'https://legacy.example', isActive: true, canClose: true }],
        activeTabId: 'legacy-t1',
      }),
    });
    const result = migrateDockState(storage, 'p', 'w');
    expect(result.tabs.map((t) => t.id)).toEqual(['legacy-t1']);
    expect(result.activeTabId).toBe('legacy-t1');
    // .bak was written
    expect(storage.getItem('pizarra_dockState_v1_p_w.bak')).toBeDefined();
    // New key was written
    expect(storage.getItem('devhub_shared_dock_state_p_w')).toBeDefined();
  });

  test('migrates legacy twm.dockState.v1 shape', () => {
    const storage = createStorage({
      devhub_twm_dockState_v1_p_w: JSON.stringify({
        tabs: [{ id: 'twm-t1', url: 'https://twm.example', isActive: true, canClose: true }],
        activeTabId: 'twm-t1',
      }),
    });
    const result = migrateDockState(storage, 'p', 'w');
    expect(result.tabs.map((t) => t.id)).toEqual(['twm-t1']);
    expect(storage.getItem('devhub_twm_dockState_v1_p_w.bak')).toBeDefined();
  });

  test('returns defaults when no legacy keys exist (no .bak written)', () => {
    const storage = createStorage();
    const result = migrateDockState(storage, 'p', 'w');
    expect(result).toEqual(DEFAULT_SHARED_DOCK_STATE);
    expect(storage.getItem('devhub_shared_dock_state_p_w.bak')).toBeNull();
  });

  test('corrupted JSON in legacy key → defaults + .bak + error logged', () => {
    const storage = createStorage({
      pizarra_dockState_v1_p_w: '{not valid json',
    });
    const result = migrateDockState(storage, 'p', 'w');
    expect(result).toEqual(DEFAULT_SHARED_DOCK_STATE);
    // The corrupted original was preserved as a .bak so the user can recover manually.
    expect(storage.getItem('pizarra_dockState_v1_p_w.bak')).toBe('{not valid json');
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  test('idempotent — running twice produces same result without duplicating .bak', () => {
    const storage = createStorage({
      pizarra_dockState_v1_p_w: JSON.stringify({
        tabs: [{ id: 't1', url: 'https://a.example', isActive: true, canClose: true }],
        activeTabId: 't1',
      }),
    });
    const first = migrateDockState(storage, 'p', 'w');
    // First run wrote new key + removed legacy. Capture state.
    const bakAfterFirst = storage.getItem('pizarra_dockState_v1_p_w.bak');
    const newKeyAfterFirst = storage.getItem('devhub_shared_dock_state_p_w');
    expect(bakAfterFirst).toBeDefined();
    expect(newKeyAfterFirst).toBeDefined();

    // Second run: no legacy key present, no-op.
    const second = migrateDockState(storage, 'p', 'w');
    expect(second).toEqual(first);
    expect(storage.getItem('pizarra_dockState_v1_p_w.bak')).toBe(bakAfterFirst);
    expect(storage.getItem('devhub_shared_dock_state_p_w')).toBe(newKeyAfterFirst);
  });
});

describe('mergeRightDockChromeIntoSharedDock (B.2c)', () => {
  test('mirrors right-dock chrome fields into shared dock state', () => {
    const base = sanitizeSharedDockState(DEFAULT_SHARED_DOCK_STATE);
    const merged = mergeRightDockChromeIntoSharedDock(base, {
      visible: true,
      activeTab: 'pizarra',
      maximized: true,
      maximizedView: 'pizarra',
      size: 40,
    });
    expect(merged.rightDockChrome).toEqual({
      visible: true,
      activeTab: 'pizarra',
      maximized: true,
      maximizedView: 'pizarra',
      size: 40,
    });
  });
});
