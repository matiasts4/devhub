const {
  applyRightDockTabSelect,
  applyWorkspaceWindowSelectDockState,
  applyZedOpenUrlDockFocus,
  isRightDockWorkspacePaneVisible,
} = require('../rightDockLayout');
const { sanitizeRightDockState } = require('../rightDockState');

describe('rightDockLayout', () => {
  test('selecting browser opens browser tab', () => {
    const next = applyRightDockTabSelect({ visible: false, activeTab: 'editor' }, 'browser');
    expect(next.activeTab).toBe('browser');
    expect(next.visible).toBe(true);
    expect(isRightDockWorkspacePaneVisible(next)).toBe(true);
  });

  test('open_url focus enters pizarra canvas', () => {
    const next = applyZedOpenUrlDockFocus({ visible: false, activeTab: 'editor' }, { focus: true });
    expect(next.activeTab).toBe('pizarra');
    expect(next.visible).toBe(true);
    expect(next.maximized).toBe(true);
    expect(next.maximizedView).toBe('pizarra');
  });

  test('applyZedOpenUrlDockUpdate opens dock and sets url', () => {
    const { applyZedOpenUrlDockUpdate } = require('../rightDockLayout');
    const next = applyZedOpenUrlDockUpdate(
      { visible: false, activeTab: 'editor', browserHistory: [], browserHistoryIndex: 0 },
      { url: 'https://github.com', focus: true }
    );
    expect(next.browserUrl).toBe('https://github.com');
    expect(next.activeTab).toBe('pizarra');
    expect(next.visible).toBe(true);
    expect(next.maximizedView).toBe('pizarra');
  });

  test('workspace tabs are mutually exclusive', () => {
    const withBrowser = applyRightDockTabSelect({ visible: true, activeTab: 'browser' }, 'editor');
    expect(withBrowser.activeTab).toBe('editor');
    expect(isRightDockWorkspacePaneVisible(withBrowser)).toBe(true);
  });

  test('toggling the same workspace tab hides the dock', () => {
    const next = applyRightDockTabSelect({ visible: true, activeTab: 'browser' }, 'browser');
    expect(next.visible).toBe(false);
  });

  test('legacy zed tab select is a no-op', () => {
    const state = { visible: true, activeTab: 'browser' };
    expect(applyRightDockTabSelect(state, 'zed')).toEqual(state);
  });

  test('sanitize migrates legacy activeTab zed to browser', () => {
    const state = sanitizeRightDockState({ activeTab: 'zed', visible: true });
    expect(state.activeTab).toBe('browser');
    expect(state.zedVisible).toBeUndefined();
  });

  test('workspace window select stays in pizarra when maximized', () => {
    const pizarra = {
      visible: true,
      maximized: true,
      maximizedView: 'pizarra',
      activeTab: 'pizarra',
    };
    expect(applyWorkspaceWindowSelectDockState(pizarra)).toEqual(pizarra);
  });

  test('workspace window select enters window takeover from browser fullscreen', () => {
    const next = applyWorkspaceWindowSelectDockState({
      visible: true,
      maximized: true,
      maximizedView: 'browser',
      activeTab: 'browser',
    });
    expect(next.maximizedView).toBe('window');
  });
});
