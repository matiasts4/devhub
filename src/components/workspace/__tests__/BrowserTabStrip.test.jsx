/**
 * BrowserTabStrip.test.jsx — Unit tests for the tab strip
 * presentational component.
 *
 * The component is pure: it takes `tabs`, `activeTabId`,
 * `onSelectTab`, `onCloseTab`, `onAddTab` props and renders
 * one chip per tab, an `+` button at the end, and visual
 * state for the active tab. Both the workspace right-dock
 * and the pizarra browser surface use this same component,
 * so the contract is shared.
 *
 * Phase: pizarra-shared-view-state / Phase 3
 */

const React = require('react');
const { installDom, renderIntoDom, cleanupMountedRoots } = require('@/test-support/domHarness');
const { fireEvent } = require('@testing-library/react');

const BrowserTabStrip = require('../BrowserTabStrip').default;

const mountedRoots = [];

afterEach(() => {
  cleanupMountedRoots(mountedRoots);
});

describe('BrowserTabStrip — rendering', () => {
  let dom;
  beforeEach(() => {
    dom = installDom();
  });
  afterEach(() => {
    dom.window.close();
  });

  test('renders one chip per tab in order', async () => {
    const tabs = [
      { id: 't1', url: 'https://a.example', label: 'A', isActive: false, canClose: true },
      { id: 't2', url: 'https://b.example', label: 'B', isActive: true, canClose: true },
      { id: 't3', url: 'https://c.example', label: 'C', isActive: false, canClose: true },
    ];
    await renderIntoDom(
      React.createElement(BrowserTabStrip, {
        tabs,
        activeTabId: 't2',
        onSelectTab: () => {},
        onCloseTab: () => {},
        onAddTab: () => {},
        tabCap: 20,
      }),
      mountedRoots
    );

    const chips = document.querySelectorAll('[data-testid^="browser-tab-strip-tab-"]');
    expect(chips).toHaveLength(3);
    expect(chips[0].getAttribute('data-testid')).toBe('browser-tab-strip-tab-t1');
    expect(chips[1].getAttribute('data-testid')).toBe('browser-tab-strip-tab-t2');
    expect(chips[2].getAttribute('data-testid')).toBe('browser-tab-strip-tab-t3');
  });

  test('active tab has data-active="true" and the others do not', async () => {
    const tabs = [
      { id: 't1', url: 'https://a', label: 'A', isActive: false, canClose: true },
      { id: 't2', url: 'https://b', label: 'B', isActive: true, canClose: true },
    ];
    await renderIntoDom(
      React.createElement(BrowserTabStrip, {
        tabs,
        activeTabId: 't2',
        onSelectTab: () => {},
        onCloseTab: () => {},
        onAddTab: () => {},
        tabCap: 20,
      }),
      mountedRoots
    );
    const t1 = document.querySelector('[data-testid="browser-tab-strip-tab-t1"]');
    const t2 = document.querySelector('[data-testid="browser-tab-strip-tab-t2"]');
    expect(t1.getAttribute('data-active')).toBe('false');
    expect(t2.getAttribute('data-active')).toBe('true');
  });

  test('clicking a tab calls onSelectTab(tabId)', async () => {
    const onSelectTab = jest.fn();
    const tabs = [
      { id: 't1', url: 'https://a', label: 'A', isActive: false, canClose: true },
      { id: 't2', url: 'https://b', label: 'B', isActive: true, canClose: true },
    ];
    await renderIntoDom(
      React.createElement(BrowserTabStrip, {
        tabs,
        activeTabId: 't2',
        onSelectTab,
        onCloseTab: () => {},
        onAddTab: () => {},
        tabCap: 20,
      }),
      mountedRoots
    );
    fireEvent.click(document.querySelector('[data-testid="browser-tab-strip-tab-t1"]'));
    expect(onSelectTab).toHaveBeenCalledWith('t1');
  });

  test('clicking the close button calls onCloseTab(tabId) and event does not propagate', async () => {
    const onSelectTab = jest.fn();
    const onCloseTab = jest.fn();
    const tabs = [{ id: 't1', url: 'https://a', label: 'A', isActive: false, canClose: true }];
    await renderIntoDom(
      React.createElement(BrowserTabStrip, {
        tabs,
        activeTabId: 't1',
        onSelectTab,
        onCloseTab,
        onAddTab: () => {},
        tabCap: 20,
      }),
      mountedRoots
    );
    const closeBtn = document.querySelector('[data-testid="browser-tab-strip-close-t1"]');
    fireEvent.click(closeBtn);
    expect(onCloseTab).toHaveBeenCalledWith('t1');
    expect(onSelectTab).not.toHaveBeenCalled();
  });

  test('clicking the + button calls onAddTab with the current browserUrl', async () => {
    const onAddTab = jest.fn();
    await renderIntoDom(
      React.createElement(BrowserTabStrip, {
        tabs: [],
        activeTabId: null,
        onSelectTab: () => {},
        onCloseTab: () => {},
        onAddTab,
        tabCap: 20,
        currentUrl: 'https://seed.example',
      }),
      mountedRoots
    );
    fireEvent.click(document.querySelector('[data-testid="browser-tab-strip-add"]'));
    expect(onAddTab).toHaveBeenCalledWith('https://seed.example');
  });

  test('the + button is disabled when tabCap is reached', async () => {
    const onAddTab = jest.fn();
    const tabs = Array.from({ length: 20 }, (_, i) => ({
      id: `t${i}`,
      url: `https://t${i}`,
      label: `T${i}`,
      isActive: i === 0,
      canClose: true,
    }));
    await renderIntoDom(
      React.createElement(BrowserTabStrip, {
        tabs,
        activeTabId: 't0',
        onSelectTab: () => {},
        onCloseTab: () => {},
        onAddTab,
        tabCap: 20,
      }),
      mountedRoots
    );
    const addBtn = document.querySelector('[data-testid="browser-tab-strip-add"]');
    expect(addBtn.disabled).toBe(true);
    expect(addBtn.getAttribute('aria-disabled')).toBe('true');
  });

  test('toolbar variant removes standalone row chrome', async () => {
    await renderIntoDom(
      React.createElement(BrowserTabStrip, {
        tabs: [],
        activeTabId: null,
        onSelectTab: () => {},
        onCloseTab: () => {},
        onAddTab: () => {},
        variant: 'toolbar',
      }),
      mountedRoots
    );

    const strip = document.querySelector('[data-testid="browser-tab-strip"]');
    expect(strip.getAttribute('data-variant')).toBe('toolbar');
    expect(strip.style.padding).toBe('0px');
    expect(strip.style.borderBottom).not.toContain('1px');
    expect(strip.style.background).toBe('transparent');
  });

  test('does not render a close button for a non-closeable tab', async () => {
    const tabs = [
      { id: 'pinned', url: 'https://pinned', label: 'Pinned', isActive: true, canClose: false },
    ];
    await renderIntoDom(
      React.createElement(BrowserTabStrip, {
        tabs,
        activeTabId: 'pinned',
        onSelectTab: () => {},
        onCloseTab: () => {},
        onAddTab: () => {},
        tabCap: 20,
      }),
      mountedRoots
    );
    const closeBtn = document.querySelector('[data-testid="browser-tab-strip-close-pinned"]');
    expect(closeBtn).toBeNull();
  });
});
