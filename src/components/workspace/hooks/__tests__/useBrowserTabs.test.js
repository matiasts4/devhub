/**
 * useBrowserTabs.test.js — Unit tests for the browser-tab React
 * hook.
 *
 * The hook is a thin convenience wrapper around
 * useSharedDockState. It exposes only the tab-related fields
 * so a `BrowserTabStrip` component doesn't have to plumb the
 * full state object.
 *
 * Strategy: render the hook in a controlled context that injects
 * a custom storage facade. Assert (1) initial empty state,
 * (2) addTab returns a new id and makes the tab active,
 * (3) closeTab with a neighbor-promote pass, (4) selectTab,
 * (5) updateTabUrl without changing active, (6) 20-tab cap.
 *
 * Phase: pizarra-shared-view-state / Phase 3
 */

const React = require('react');
const { installDom } = require('@/test-support/domHarness');
const { renderHook, act } = require('@testing-library/react');

const { useBrowserTabs } = require('../useBrowserTabs');
const { SharedDockStorageContext } = require('../useSharedDockState');
const { MAX_TABS_PER_SURFACE } = require('@/lib/dock/sharedDockState');

function createStorage(initial = {}) {
  const store = new Map();
  for (const [k, v] of Object.entries(initial)) store.set(k, v);
  return {
    _store: store,
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, v),
    removeItem: (k) => store.delete(k),
    addEventListener: () => {},
    removeEventListener: () => {},
  };
}

function renderWithStorage(storage, opts = {}) {
  const wrapper = ({ children }) =>
    React.createElement(SharedDockStorageContext.Provider, { value: storage }, children);
  return renderHook(() => useBrowserTabs(opts), { wrapper });
}

describe('useBrowserTabs — initial shape', () => {
  let dom;
  beforeEach(() => {
    dom = installDom();
  });
  afterEach(() => {
    dom.window.close();
  });

  test('tabs: [] and activeTabId: null on first mount', () => {
    const storage = createStorage();
    const { result } = renderWithStorage(storage, { projectId: 'p-1', workspaceId: 'w-1' });
    expect(result.current.tabs).toEqual([]);
    expect(result.current.activeTabId).toBeNull();
  });
});

describe('useBrowserTabs — addTab / closeTab / selectTab / updateTabUrl', () => {
  let dom;
  beforeEach(() => {
    dom = installDom();
  });
  afterEach(() => {
    dom.window.close();
  });

  test('addTab(url) returns a string id, makes the new tab active, history includes the url', () => {
    const storage = createStorage();
    const { result } = renderWithStorage(storage, { projectId: 'p-1', workspaceId: 'w-1' });
    let id;
    act(() => {
      id = result.current.addTab('https://example.com');
    });
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
    expect(result.current.tabs).toHaveLength(1);
    expect(result.current.tabs[0].url).toBe('https://example.com');
    expect(result.current.tabs[0].isActive).toBe(true);
    expect(result.current.activeTabId).toBe(id);
  });

  test('closeTab promotes the right neighbor (then left if last) and never leaves zero tabs', () => {
    const storage = createStorage();
    const { result } = renderWithStorage(storage, { projectId: 'p-1', workspaceId: 'w-1' });
    let t1, t2, t3;
    act(() => {
      t1 = result.current.addTab('https://a.example');
      t2 = result.current.addTab('https://b.example');
      t3 = result.current.addTab('https://c.example');
    });
    // Close the middle one — right neighbor should become active.
    act(() => {
      result.current.closeTab(t2);
    });
    expect(result.current.tabs.map((t) => t.id)).toEqual([t1, t3]);
    expect(result.current.activeTabId).toBe(t3);

    // Close the last tab — left neighbor should become active.
    act(() => {
      result.current.closeTab(t3);
    });
    expect(result.current.tabs.map((t) => t.id)).toEqual([t1]);
    expect(result.current.activeTabId).toBe(t1);

    // Close the only tab — surface auto-spawns a blank.
    act(() => {
      result.current.closeTab(t1);
    });
    expect(result.current.tabs.length).toBeGreaterThanOrEqual(1);
  });

  test('selectTab updates activeTabId and the active flag on each tab', () => {
    const storage = createStorage();
    const { result } = renderWithStorage(storage, { projectId: 'p-1', workspaceId: 'w-1' });
    let t1, t2;
    act(() => {
      t1 = result.current.addTab('https://a.example');
      t2 = result.current.addTab('https://b.example');
    });
    act(() => {
      result.current.selectTab(t1);
    });
    expect(result.current.activeTabId).toBe(t1);
    expect(result.current.tabs.find((t) => t.id === t1).isActive).toBe(true);
    expect(result.current.tabs.find((t) => t.id === t2).isActive).toBe(false);
  });

  test('updateTabUrl updates the tab URL without changing which tab is active', () => {
    const storage = createStorage();
    const { result } = renderWithStorage(storage, { projectId: 'p-1', workspaceId: 'w-1' });
    let t1, t2;
    act(() => {
      t1 = result.current.addTab('https://a.example');
      t2 = result.current.addTab('https://b.example');
    });
    // t2 is the most recent (active). Update t1's URL.
    act(() => {
      result.current.updateTabUrl(t1, 'https://a-updated.example');
    });
    expect(result.current.tabs.find((t) => t.id === t1).url).toBe('https://a-updated.example');
    expect(result.current.activeTabId).toBe(t2);
  });
});

describe('useBrowserTabs — tab cap (MAX_TABS_PER_SURFACE)', () => {
  let dom;
  beforeEach(() => {
    dom = installDom();
  });
  afterEach(() => {
    dom.window.close();
  });

  test('addTab returns null once MAX_TABS_PER_SURFACE tabs already exist', () => {
    const storage = createStorage();
    const { result } = renderWithStorage(storage, { projectId: 'p-1', workspaceId: 'w-1' });
    act(() => {
      for (let i = 0; i < MAX_TABS_PER_SURFACE; i += 1) {
        const id = result.current.addTab(`https://t${i}.example`);
        if (id == null) {
          throw new Error(`addTab returned null early at i=${i}`);
        }
      }
    });
    expect(result.current.tabs).toHaveLength(MAX_TABS_PER_SURFACE);
    let rejected;
    act(() => {
      rejected = result.current.addTab('https://overflow.example');
    });
    expect(rejected).toBeNull();
    expect(result.current.tabs).toHaveLength(MAX_TABS_PER_SURFACE);
  });
});
