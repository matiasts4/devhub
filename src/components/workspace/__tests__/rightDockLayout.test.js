const {
  applyRightDockTabSelect,
  applyZedOpenUrlDockFocus,
  isRightDockSplitLayout,
  isRightDockWorkspacePaneVisible,
  isRightDockZedPaneVisible,
} = require('../rightDockLayout');
const { sanitizeRightDockState } = require('../rightDockState');

describe('rightDockLayout', () => {
  test('browser + zed split when zed was open and user opens browser tab', () => {
    const next = applyRightDockTabSelect(
      { visible: true, activeTab: 'zed', zedVisible: true },
      'browser'
    );
    expect(next.activeTab).toBe('browser');
    expect(next.zedVisible).toBe(true);
    expect(isRightDockSplitLayout(next)).toBe(true);
  });

  test('open_url focus keeps zed visible with browser', () => {
    const next = applyZedOpenUrlDockFocus(
      { visible: true, activeTab: 'zed', zedVisible: true },
      { focus: true }
    );
    expect(next.activeTab).toBe('browser');
    expect(next.zedVisible).toBe(true);
    expect(next.visible).toBe(true);
    expect(next.maximized).toBe(false);
    expect(isRightDockSplitLayout(next)).toBe(true);
  });

  test('applyZedOpenUrlDockUpdate opens dock from zed-only state', () => {
    const { applyZedOpenUrlDockUpdate } = require('../rightDockLayout');
    const next = applyZedOpenUrlDockUpdate(
      { visible: true, activeTab: 'zed', zedVisible: true, browserHistory: [], browserHistoryIndex: 0 },
      { url: 'https://github.com', focus: true }
    );
    expect(next.browserUrl).toBe('https://github.com');
    expect(next.activeTab).toBe('browser');
    expect(next.visible).toBe(true);
    expect(isRightDockSplitLayout(next)).toBe(true);
  });

  test('workspace tabs are mutually exclusive', () => {
    const withBrowser = applyRightDockTabSelect({ visible: true, activeTab: 'browser' }, 'editor');
    expect(withBrowser.activeTab).toBe('editor');
    expect(isRightDockWorkspacePaneVisible(withBrowser)).toBe(true);
  });

  test('toggling browser off while zed open leaves zed only', () => {
    const split = { visible: true, activeTab: 'browser', zedVisible: true };
    const next = applyRightDockTabSelect(split, 'browser');
    expect(next.activeTab).toBe('zed');
    expect(isRightDockZedPaneVisible(next)).toBe(true);
    expect(isRightDockWorkspacePaneVisible(next)).toBe(false);
  });

  test('sanitize migrates legacy activeTab zed to zedVisible', () => {
    const state = sanitizeRightDockState({ activeTab: 'zed', visible: true });
    expect(state.zedVisible).toBe(true);
    expect(state.activeTab).toBe('zed');
  });
});