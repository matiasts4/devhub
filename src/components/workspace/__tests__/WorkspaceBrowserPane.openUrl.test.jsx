/**
 * WorkspaceBrowserPane.openUrl.test.jsx — T-WSR-zed-003
 *
 * Component test for the new `devhub:zed-open-url` listener in
 * WorkspaceBrowserPane.jsx.
 *
 * Spec coverage (tasks.md 4.3):
 *   (a) addEventListener('devhub:zed-open-url', …) on mount,
 *       removeEventListener on unmount
 *   (b) Dispatch { url, label } → onDockStateChange called once with
 *       updater that sets browserUrl + browserHistory
 *   (c) Dispatch the SAME event again → onDockStateChange NOT called
 *       (idempotence on (url, label))
 *   (d) Dispatch a different URL with the same label → onDockStateChange
 *       called with the new URL (no re-spawn, just URL update)
 *   (e) Render with maximizedView='pizarra', dispatch event WITHOUT
 *       focus → no maximized:false call
 *   (f) Same render, dispatch event WITH focus:true → onDockStateChange
 *       called with maximized:false, maximizedView:'browser', activeTab:'browser'
 *
 * The component has many heavy dependencies (browser tabs, native
 * surface, bridge agent). We mount it with minimal required props and
 * stub the upstream hooks via the `useBrowserPreviewController` and
 * `useNativeBrowserSurface` modules. For this test we only assert on
 * the listener behavior, so we provide a working `dockState` + the
 * `onDockStateChange` spy.
 */

const React = require('react');
const { flushSync } = require('react-dom');
const { installDom, renderIntoDom, cleanupMountedRoots } = require('@/test-support/domHarness');

const mountedRoots = [];

afterEach(() => {
  cleanupMountedRoots(mountedRoots);
});

/**
 * Build a minimal dockState and onDockStateChange spy. The listener
 * reads `dockState.maximizedView` (for the opt-in pizarra de-max) and
 * `dockState.browserHistory` (for the history append).
 */
function makeFixture(overrides = {}) {
  const dockState = {
    visible: true,
    activeTab: 'browser',
    maximized: false,
    maximizedView: null,
    browserUrl: null,
    browserHistory: [],
    browserHistoryIndex: 0,
    browserRuntime: 'iframe',
    editMode: false,
    browserLoadFallback: false,
    ...overrides,
  };
  return dockState;
}

describe('WorkspaceBrowserPane — devhub:zed-open-url listener (T-WSR-zed-003)', () => {
  let dom;
  let WorkspaceBrowserPane;

  beforeEach(() => {
    dom = installDom();
    WorkspaceBrowserPane = require('../WorkspaceBrowserPane').default;
  });

  afterEach(() => {
    dom.window.close();
  });

  function fireOpenUrl(detail) {
    const ev = new dom.window.CustomEvent('devhub:zed-open-url', { detail });
    dom.window.dispatchEvent(ev);
  }

  test('(a) addEventListener on mount, removeEventListener on unmount', async () => {
    const addSpy = jest.spyOn(dom.window, 'addEventListener');
    const removeSpy = jest.spyOn(dom.window, 'removeEventListener');

    const onDockStateChange = jest.fn();
    const dockState = makeFixture();

    const mounted = await renderIntoDom(
      React.createElement(WorkspaceBrowserPane, {
        dockState,
        onDockStateChange,
        projectId: 'p1',
        workspaceId: 'ws1',
      }),
      mountedRoots
    );

    const addCalls = addSpy.mock.calls.filter((c) => c[0] === 'devhub:zed-open-url');
    expect(addCalls).toHaveLength(1);

    flushSync(() => mounted.root.unmount());
    // After unmount, removeEventListener must have been called.
    const removeCalls = removeSpy.mock.calls.filter((c) => c[0] === 'devhub:zed-open-url');
    expect(removeCalls.length).toBeGreaterThanOrEqual(1);

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });

  test('(b) dispatch → onDockStateChange called with updater that sets browserUrl + appends to history', async () => {
    const onDockStateChange = jest.fn();
    const dockState = makeFixture();
    await renderIntoDom(
      React.createElement(WorkspaceBrowserPane, {
        dockState,
        onDockStateChange,
        projectId: 'p1',
        workspaceId: 'ws1',
      }),
      mountedRoots
    );

    fireOpenUrl({ url: 'https://github.com', label: 'repo' });

    expect(onDockStateChange).toHaveBeenCalledTimes(1);
    const updater = onDockStateChange.mock.calls[0][0];
    expect(typeof updater).toBe('function');
    const next = updater(dockState);
    expect(next.browserUrl).toBe('https://github.com');
    expect(next.browserHistory).toEqual(['https://github.com']);
    expect(next.browserHistoryIndex).toBe(0);
  });

  test('(c) dispatching the SAME (url, label) twice → idempotent (no second call)', async () => {
    const onDockStateChange = jest.fn();
    const dockState = makeFixture();
    await renderIntoDom(
      React.createElement(WorkspaceBrowserPane, {
        dockState,
        onDockStateChange,
        projectId: 'p1',
        workspaceId: 'ws1',
      }),
      mountedRoots
    );

    fireOpenUrl({ url: 'https://github.com', label: 'repo' });
    fireOpenUrl({ url: 'https://github.com', label: 'repo' });

    expect(onDockStateChange).toHaveBeenCalledTimes(1);
  });

  test('(d) different URL, same label → onDockStateChange called (URL update, no re-spawn)', async () => {
    const onDockStateChange = jest.fn();
    const dockState = makeFixture();
    await renderIntoDom(
      React.createElement(WorkspaceBrowserPane, {
        dockState,
        onDockStateChange,
        projectId: 'p1',
        workspaceId: 'ws1',
      }),
      mountedRoots
    );

    fireOpenUrl({ url: 'https://github.com', label: 'repo' });
    fireOpenUrl({ url: 'https://gitlab.com', label: 'repo' });

    expect(onDockStateChange).toHaveBeenCalledTimes(2);
    const updater = onDockStateChange.mock.calls[1][0];
    const next = updater(dockState);
    expect(next.browserUrl).toBe('https://gitlab.com');
    expect(next.browserHistory).toEqual(['https://gitlab.com']);
  });

  test('(e) maximizedView="pizarra" + dispatch without focus → no maximized:false', async () => {
    const onDockStateChange = jest.fn();
    const dockState = makeFixture({ maximized: true, maximizedView: 'pizarra' });
    await renderIntoDom(
      React.createElement(WorkspaceBrowserPane, {
        dockState,
        onDockStateChange,
        projectId: 'p1',
        workspaceId: 'ws1',
      }),
      mountedRoots
    );

    fireOpenUrl({ url: 'https://github.com', label: 'repo' }); // no focus

    // Exactly one call (the URL update) — none with maximized:false.
    expect(onDockStateChange).toHaveBeenCalledTimes(1);
    const updater = onDockStateChange.mock.calls[0][0];
    const next = updater(dockState);
    expect(next.maximized).toBe(true);
    expect(next.maximizedView).toBe('pizarra');
  });

  test('(f) maximizedView="pizarra" + dispatch WITH focus:true → de-max (maximized:false, maximizedView:"browser", activeTab:"browser")', async () => {
    const onDockStateChange = jest.fn();
    const dockState = makeFixture({ maximized: true, maximizedView: 'pizarra' });
    await renderIntoDom(
      React.createElement(WorkspaceBrowserPane, {
        dockState,
        onDockStateChange,
        projectId: 'p1',
        workspaceId: 'ws1',
      }),
      mountedRoots
    );

    fireOpenUrl({ url: 'https://github.com', label: 'repo', focus: true });

    // Two calls: URL update + de-max.
    expect(onDockStateChange).toHaveBeenCalledTimes(2);
    const demaxUpdater = onDockStateChange.mock.calls[1][0];
    const next = demaxUpdater(dockState);
    expect(next.maximized).toBe(false);
    expect(next.maximizedView).toBe('browser');
    expect(next.activeTab).toBe('browser');
  });
});
