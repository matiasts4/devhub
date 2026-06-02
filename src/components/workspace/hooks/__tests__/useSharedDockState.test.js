/**
 * useSharedDockState.test.js — Unit tests for the React hook
 * that exposes sharedDockState to workspace + pizarra.
 *
 * Strategy: install JSDOM in-process (via the project's
 * `domHarness`) so the test runs in the default `node` jest
 * env that `pnpm test` uses. Render the hook with a
 * controlled storage facade and an in-memory event bus that
 * mimics localStorage's `storage` event. Assert (1) initial
 * shape, (2) cross-consumer reactivity, (3) tab ops mutate
 * state, (4) cross-tab `storage` events merge new state.
 *
 * Phase: pizarra-shared-view-state / Phase 2
 */

const React = require('react');
const { installDom } = require('@/test-support/domHarness');
const { renderHook, act } = require('@testing-library/react');

const { DEFAULT_SHARED_DOCK_STATE } = require('@/lib/dock/sharedDockState');
const { SharedDockStorageContext, useSharedDockState } = require('../useSharedDockState');

function createStorage(initial = {}) {
  const store = new Map();
  for (const [k, v] of Object.entries(initial)) store.set(k, v);
  const listeners = new Set();
  return {
    _store: store,
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => {
      const oldValue = store.has(k) ? store.get(k) : null;
      store.set(k, v);
      for (const l of listeners) {
        l({ key: k, oldValue, newValue: v, storageArea: store });
      }
    },
    removeItem: (k) => {
      const oldValue = store.has(k) ? store.get(k) : null;
      store.delete(k);
      for (const l of listeners) {
        l({ key: k, oldValue, newValue: null, storageArea: store });
      }
    },
    addEventListener: (event, cb) => {
      if (event === 'storage') listeners.add(cb);
    },
    removeEventListener: (event, cb) => {
      if (event === 'storage') listeners.delete(cb);
    },
    fire: (key, newValue, oldValue = null) => {
      for (const l of listeners) {
        l({ key, oldValue, newValue, storageArea: store });
      }
    },
  };
}

function renderWithStorage(storage, opts = {}) {
  const wrapper = ({ children }) =>
    React.createElement(SharedDockStorageContext.Provider, { value: storage }, children);
  return renderHook(() => useSharedDockState(opts), { wrapper });
}

describe('useSharedDockState — initial state', () => {
  let dom;
  beforeEach(() => {
    dom = installDom();
  });
  afterEach(() => {
    dom.window.close();
  });

  test('returns DEFAULT_SHARED_DOCK_STATE on first mount with no storage data', () => {
    const storage = createStorage();
    const { result } = renderWithStorage(storage, { projectId: 'p-1', workspaceId: 'w-1' });
    expect(result.current.state.tabs).toEqual([]);
    expect(result.current.state.activeTabId).toBeNull();
  });
});

describe('useSharedDockState — tab ops dispatch through reducer', () => {
  let dom;
  beforeEach(() => {
    dom = installDom();
  });
  afterEach(() => {
    dom.window.close();
  });

  test('addTab appends a new tab and makes it active', () => {
    const storage = createStorage();
    const { result } = renderWithStorage(storage, { projectId: 'p-1', workspaceId: 'w-1' });

    act(() => {
      const id = result.current.addTab('https://example.com');
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });

    expect(result.current.state.tabs).toHaveLength(1);
    expect(result.current.state.tabs[0].url).toBe('https://example.com');
    expect(result.current.state.tabs[0].isActive).toBe(true);
    expect(result.current.state.activeTabId).toBe(result.current.state.tabs[0].id);
  });

  test('closeTab removes a tab and auto-spawns a default if last', () => {
    const storage = createStorage();
    const { result } = renderWithStorage(storage, { projectId: 'p-1', workspaceId: 'w-1' });

    let t1;
    act(() => {
      t1 = result.current.addTab('https://a.example');
    });
    expect(result.current.state.tabs).toHaveLength(1);

    act(() => {
      result.current.closeTab(t1);
    });

    // A surface MUST NOT go to zero tabs while visible — spec
    // "Closing the last tab auto-creates a blank tab". The hook
    // must surface a default tab.
    expect(result.current.state.tabs.length).toBeGreaterThanOrEqual(1);
  });

  test('closeTab on a middle tab promotes the next-right tab to active (triangulation)', () => {
    const storage = createStorage();
    const { result } = renderWithStorage(storage, { projectId: 'p-1', workspaceId: 'w-1' });

    let t1, t2, t3;
    act(() => {
      t1 = result.current.addTab('https://a.example');
      t2 = result.current.addTab('https://b.example');
      t3 = result.current.addTab('https://c.example');
    });
    // t3 is the most recent (active). Close t2.
    act(() => {
      result.current.closeTab(t2);
    });
    expect(result.current.state.tabs).toHaveLength(2);
    expect(result.current.state.tabs.map((t) => t.id)).toEqual([t1, t3]);
    // The active tab is t3 (the right neighbor) — not t1.
    expect(result.current.state.activeTabId).toBe(t3);
  });

  test('selectTab updates activeTabId', () => {
    const storage = createStorage();
    const { result } = renderWithStorage(storage, { projectId: 'p-1', workspaceId: 'w-1' });

    let t1, t2;
    act(() => {
      t1 = result.current.addTab('https://a.example');
      t2 = result.current.addTab('https://b.example');
    });
    expect(result.current.state.activeTabId).toBe(t2);

    act(() => {
      result.current.selectTab(t1);
    });
    expect(result.current.state.activeTabId).toBe(t1);
    expect(result.current.state.tabs.find((t) => t.id === t1).isActive).toBe(true);
    expect(result.current.state.tabs.find((t) => t.id === t2).isActive).toBe(false);
  });
});

describe('useSharedDockState — cross-consumer reactivity', () => {
  let dom;
  beforeEach(() => {
    dom = installDom();
  });
  afterEach(() => {
    dom.window.close();
  });

  test('two hook consumers see the same state and updates', () => {
    const storage = createStorage();
    const wrapper = ({ children }) =>
      React.createElement(SharedDockStorageContext.Provider, { value: storage }, children);
    const a = renderHook(() => useSharedDockState({ projectId: 'p-1', workspaceId: 'w-1' }), {
      wrapper,
    });
    const b = renderHook(() => useSharedDockState({ projectId: 'p-1', workspaceId: 'w-1' }), {
      wrapper,
    });

    expect(a.result.current.state.tabs).toEqual(b.result.current.state.tabs);

    act(() => {
      a.result.current.addTab('https://example.com');
    });

    expect(b.result.current.state.tabs).toHaveLength(1);
    expect(b.result.current.state.activeTabId).toBe(a.result.current.state.activeTabId);
  });
});

describe('useSharedDockState — cross-tab storage event merge', () => {
  let dom;
  beforeEach(() => {
    dom = installDom();
  });
  afterEach(() => {
    dom.window.close();
  });

  test('an external storage event brings new state into the consumer', () => {
    const storage = createStorage();
    const wrapper = ({ children }) =>
      React.createElement(SharedDockStorageContext.Provider, { value: storage }, children);
    const a = renderHook(() => useSharedDockState({ projectId: 'p-1', workspaceId: 'w-1' }), {
      wrapper,
    });

    // Simulate another browser tab writing to the same key.
    const externalState = {
      ...DEFAULT_SHARED_DOCK_STATE,
      tabs: [
        {
          id: 'remote-1',
          url: 'https://remote.example',
          label: 'Remote',
          isActive: true,
          canClose: true,
        },
      ],
      activeTabId: 'remote-1',
    };

    act(() => {
      storage.fire('devhub_shared_dock_state_p-1_w-1', JSON.stringify(externalState), null);
    });

    expect(a.result.current.state.tabs).toHaveLength(1);
    expect(a.result.current.state.tabs[0].id).toBe('remote-1');
  });
});
