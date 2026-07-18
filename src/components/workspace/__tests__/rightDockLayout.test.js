const {
  applyRightDockTabSelect,
  applyWorkspaceWindowSelectDockState,
  applyZedOpenUrlDockFocus,
  isRightDockWorkspacePaneVisible,
} = require('../rightDockLayout');
const { sanitizeRightDockState } = require('../rightDockState');

describe('rightDockLayout', () => {
  test('selecting legacy browser does not open overlay dock', () => {
    const next = applyRightDockTabSelect({ visible: false, activeTab: 'swarm' }, 'browser');
    expect(next.activeTab).toBe('browser');
    expect(next.visible).toBe(false);
    expect(isRightDockWorkspacePaneVisible(next)).toBe(false);
  });

  test('selecting legacy editor does not open overlay dock', () => {
    const next = applyRightDockTabSelect({ visible: true, activeTab: 'swarm' }, 'editor');
    expect(next.activeTab).toBe('editor');
    expect(next.visible).toBe(false);
    expect(isRightDockWorkspacePaneVisible(next)).toBe(false);
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

  test('swarm tabs remain mutually exclusive overlay tools', () => {
    const withSwarm = applyRightDockTabSelect({ visible: false, activeTab: 'operator' }, 'swarm');
    expect(withSwarm.activeTab).toBe('swarm');
    expect(withSwarm.visible).toBe(true);
    expect(isRightDockWorkspacePaneVisible(withSwarm)).toBe(true);
  });

  test('toggling the same swarm tab hides the dock', () => {
    const next = applyRightDockTabSelect({ visible: true, activeTab: 'swarm' }, 'swarm');
    expect(next.visible).toBe(false);
  });

  test('legacy zed tab select is a no-op', () => {
    const state = { visible: true, activeTab: 'swarm' };
    expect(applyRightDockTabSelect(state, 'zed')).toEqual(state);
  });

  test('sanitize migrates legacy activeTab zed to browser and clears overlay', () => {
    const state = sanitizeRightDockState({ activeTab: 'zed', visible: true });
    expect(state.activeTab).toBe('browser');
    expect(state.visible).toBe(false);
    expect(state.zedVisible).toBeUndefined();
  });

  test('sanitize clears overlay for persisted browser/editor tabs', () => {
    expect(
      sanitizeRightDockState({ activeTab: 'browser', visible: true, maximized: true })
    ).toEqual(expect.objectContaining({ visible: false, maximized: false, activeTab: 'browser' }));
    expect(sanitizeRightDockState({ activeTab: 'editor', visible: true })).toEqual(
      expect.objectContaining({ visible: false, activeTab: 'editor' })
    );
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
