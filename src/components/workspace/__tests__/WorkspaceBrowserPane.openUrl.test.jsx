/**
 * T-WSR-zed-003 — `devhub:zed-open-url` dock state updates.
 * Listener lives in TerminalWorkspacesManager (not WorkspaceBrowserPane).
 */

const { applyZedOpenUrlDockUpdate } = require('../rightDockLayout');

function makeFixture(overrides = {}) {
  return {
    visible: true,
    activeTab: 'browser',
    maximized: false,
    maximizedView: 'browser',
    browserUrl: null,
    browserHistory: [],
    browserHistoryIndex: 0,
    // Matches the real default in rightDockState.js (post embedded-WebView2
    // rollout); applyZedOpenUrlDockUpdate doesn't branch on this today, but
    // the fixture should reflect production so future runtime-aware changes
    // don't get validated against a stale 'iframe' assumption.
    browserRuntime: 'native-gtk',
    editMode: false,
    browserLoadFallback: false,
    ...overrides,
  };
}

describe('applyZedOpenUrlDockUpdate (T-WSR-zed-003)', () => {
  test('sets browserUrl + appends to history', () => {
    const dockState = makeFixture();
    const next = applyZedOpenUrlDockUpdate(dockState, {
      url: 'https://github.com',
      focus: false,
    });
    expect(next.browserUrl).toBe('https://github.com');
    expect(next.browserHistory).toEqual(['https://github.com']);
    expect(next.browserHistoryIndex).toBe(0);
  });

  test('focus enters pizarra from hidden dock state', () => {
    const dockState = makeFixture({ visible: false, activeTab: 'editor' });
    const next = applyZedOpenUrlDockUpdate(dockState, {
      url: 'https://github.com',
      focus: true,
    });
    expect(next.activeTab).toBe('pizarra');
    expect(next.visible).toBe(true);
    expect(next.maximized).toBe(true);
    expect(next.maximizedView).toBe('pizarra');
  });

  test('without focus, pizarra maximized state is preserved', () => {
    const dockState = makeFixture({ maximized: true, maximizedView: 'pizarra' });
    const next = applyZedOpenUrlDockUpdate(dockState, {
      url: 'https://github.com',
      focus: false,
    });
    expect(next.maximized).toBe(true);
    expect(next.maximizedView).toBe('pizarra');
  });

  test('with focus, stays in (or enters) pizarra and sets browser url', () => {
    const dockState = makeFixture({ maximized: true, maximizedView: 'pizarra' });
    const next = applyZedOpenUrlDockUpdate(dockState, {
      url: 'https://github.com',
      focus: true,
    });
    expect(next.maximized).toBe(true);
    expect(next.maximizedView).toBe('pizarra');
    expect(next.activeTab).toBe('pizarra');
    expect(next.browserUrl).toBe('https://github.com');
  });

  test('leaves browserRuntime untouched (native-gtk default, embedded WebView2)', () => {
    const dockState = makeFixture();
    const next = applyZedOpenUrlDockUpdate(dockState, {
      url: 'https://github.com',
      focus: true,
    });
    expect(next.browserRuntime).toBe('native-gtk');
  });
});
