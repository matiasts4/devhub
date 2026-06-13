/**
 * sharedDockState.crossMode.test.jsx — Cross-mode integration test.
 *
 * Phase 3 of pizarra-shared-view-state. Verifies that the tab
 * list is the single source of truth for both the workspace
 * right-dock and the pizarra browser surface.
 *
 * Strategy: mount a `SharedDockStoreProvider` (the TWM root
 * equivalent for tests) so two consumers in the same tab share
 * the same store. Add/close/switch on one side; the other
 * side must reflect the change.
 */

const React = require('react');
const { installDom, renderIntoDom, cleanupMountedRoots } = require('@/test-support/domHarness');
const { fireEvent } = require('@testing-library/react');

const BrowserTabStrip = require('../../BrowserTabStrip').default;
const { useBrowserTabs } = require('../useBrowserTabs');
const { SharedDockStoreProvider, SharedDockStorageContext } = require('../useSharedDockState');

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

function ModeStrip({ api, currentUrl }) {
  return React.createElement(BrowserTabStrip, {
    tabs: api.tabs,
    activeTabId: api.activeTabId,
    onSelectTab: api.selectTab,
    onCloseTab: api.closeTab,
    onAddTab: api.addTab,
    currentUrl,
    tabCap: 20,
  });
}

function Consumer({ id, currentUrl, children }) {
  const api = useBrowserTabs({ projectId: 'p-1', workspaceId: 'w-1' });
  return React.createElement('div', { 'data-testid': id }, children({ api, currentUrl }));
}

const mountedRoots = [];

afterEach(() => {
  cleanupMountedRoots(mountedRoots);
});

describe('sharedDockState — cross-mode consistency', () => {
  let dom;
  beforeEach(() => {
    dom = installDom();
  });
  afterEach(() => {
    dom.window.close();
  });

  test('adding a tab in workspace makes it visible in pizarra (single source of truth)', async () => {
    const storage = createStorage();

    function BothViews() {
      return React.createElement(
        'div',
        null,
        React.createElement(Consumer, {
          id: 'workspace-view',
          currentUrl: 'https://ws.example',
          children: ({ api, currentUrl }) => React.createElement(ModeStrip, { api, currentUrl }),
        }),
        React.createElement(Consumer, {
          id: 'pizarra-view',
          currentUrl: 'https://pz.example',
          children: ({ api, currentUrl }) => React.createElement(ModeStrip, { api, currentUrl }),
        })
      );
    }

    await renderIntoDom(
      React.createElement(
        SharedDockStorageContext.Provider,
        { value: storage },
        React.createElement(
          SharedDockStoreProvider,
          { storage, projectId: 'p-1', workspaceId: 'w-1' },
          React.createElement(BothViews)
        )
      ),
      mountedRoots
    );

    // Initially both views have no chips.
    expect(
      document.querySelectorAll(
        '[data-testid="workspace-view"] [data-testid^="browser-tab-strip-tab-"]'
      )
    ).toHaveLength(0);
    expect(
      document.querySelectorAll(
        '[data-testid="pizarra-view"] [data-testid^="browser-tab-strip-tab-"]'
      )
    ).toHaveLength(0);

    // Click the + button on the workspace view.
    fireEvent.click(
      document.querySelector('[data-testid="workspace-view"] [data-testid="browser-tab-strip-add"]')
    );

    // Both views should now have one chip.
    expect(
      document.querySelectorAll(
        '[data-testid="workspace-view"] [data-testid^="browser-tab-strip-tab-"]'
      )
    ).toHaveLength(1);
    expect(
      document.querySelectorAll(
        '[data-testid="pizarra-view"] [data-testid^="browser-tab-strip-tab-"]'
      )
    ).toHaveLength(1);
  });

  test('closing a tab in pizarra removes it from workspace', async () => {
    const storage = createStorage();

    function BothViews() {
      return React.createElement(
        'div',
        null,
        React.createElement(Consumer, {
          id: 'workspace-view',
          currentUrl: 'https://ws.example',
          children: ({ api, currentUrl }) => React.createElement(ModeStrip, { api, currentUrl }),
        }),
        React.createElement(Consumer, {
          id: 'pizarra-view',
          currentUrl: 'https://pz.example',
          children: ({ api, currentUrl }) => React.createElement(ModeStrip, { api, currentUrl }),
        })
      );
    }

    await renderIntoDom(
      React.createElement(
        SharedDockStorageContext.Provider,
        { value: storage },
        React.createElement(
          SharedDockStoreProvider,
          { storage, projectId: 'p-1', workspaceId: 'w-1' },
          React.createElement(BothViews)
        )
      ),
      mountedRoots
    );

    // Add 2 tabs from workspace.
    fireEvent.click(
      document.querySelector('[data-testid="workspace-view"] [data-testid="browser-tab-strip-add"]')
    );
    fireEvent.click(
      document.querySelector('[data-testid="workspace-view"] [data-testid="browser-tab-strip-add"]')
    );

    const wsTabs = document.querySelectorAll(
      '[data-testid="workspace-view"] [data-testid^="browser-tab-strip-tab-"]'
    );
    expect(wsTabs).toHaveLength(2);
    const pzTabs = document.querySelectorAll(
      '[data-testid="pizarra-view"] [data-testid^="browser-tab-strip-tab-"]'
    );
    expect(pzTabs).toHaveLength(2);

    // Find the first tab id and close it from pizarra.
    const firstTabId = pzTabs[0].getAttribute('data-testid').replace('browser-tab-strip-tab-', '');
    fireEvent.click(
      document.querySelector(
        `[data-testid="pizarra-view"] [data-testid="browser-tab-strip-close-${firstTabId}"]`
      )
    );

    // Both views should now have 1 tab.
    expect(
      document.querySelectorAll(
        '[data-testid="workspace-view"] [data-testid^="browser-tab-strip-tab-"]'
      )
    ).toHaveLength(1);
    expect(
      document.querySelectorAll(
        '[data-testid="pizarra-view"] [data-testid^="browser-tab-strip-tab-"]'
      )
    ).toHaveLength(1);
  });

  test('switching active tab in pizarra updates workspace indicator', async () => {
    const storage = createStorage();

    function BothViews() {
      return React.createElement(
        'div',
        null,
        React.createElement(Consumer, {
          id: 'workspace-view',
          currentUrl: 'https://ws.example',
          children: ({ api, currentUrl }) => React.createElement(ModeStrip, { api, currentUrl }),
        }),
        React.createElement(Consumer, {
          id: 'pizarra-view',
          currentUrl: 'https://pz.example',
          children: ({ api, currentUrl }) => React.createElement(ModeStrip, { api, currentUrl }),
        })
      );
    }

    await renderIntoDom(
      React.createElement(
        SharedDockStorageContext.Provider,
        { value: storage },
        React.createElement(
          SharedDockStoreProvider,
          { storage, projectId: 'p-1', workspaceId: 'w-1' },
          React.createElement(BothViews)
        )
      ),
      mountedRoots
    );

    // Add 2 tabs.
    fireEvent.click(
      document.querySelector('[data-testid="workspace-view"] [data-testid="browser-tab-strip-add"]')
    );
    fireEvent.click(
      document.querySelector('[data-testid="workspace-view"] [data-testid="browser-tab-strip-add"]')
    );

    // The second tab is active (most recently added). Click the first one in pizarra.
    const pzTabs = document.querySelectorAll(
      '[data-testid="pizarra-view"] [data-testid^="browser-tab-strip-tab-"]'
    );
    fireEvent.click(pzTabs[0]);

    // First tab is now active in BOTH views.
    expect(pzTabs[0].getAttribute('data-active')).toBe('true');
    expect(
      document
        .querySelector(
          '[data-testid="workspace-view"] [data-testid="' +
            pzTabs[0].getAttribute('data-testid') +
            '"]'
        )
        .getAttribute('data-active')
    ).toBe('true');
  });
});
