const { JSDOM } = require('jsdom');

describe('nativeBrowserBridge', () => {
  let dom;
  let invokeMock;
  let listenMock;

  beforeEach(() => {
    jest.resetModules();
    dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'https://devhub.test',
    });

    global.window = dom.window;
    global.document = dom.window.document;
    window.__TAURI_INTERNALS__ = {};

    invokeMock = jest.fn();
    listenMock = jest.fn();

    jest.doMock('@tauri-apps/api/core', () => ({
      invoke: invokeMock,
    }));
    jest.doMock('@tauri-apps/api/event', () => ({
      listen: listenMock,
    }));
  });

  afterEach(() => {
    dom.window.close();
    delete global.window;
    delete global.document;
    jest.clearAllMocks();
    jest.resetModules();
  });

  test('wraps native browser command payloads under the Rust request argument', async () => {
    invokeMock
      .mockResolvedValueOnce({
        ready: true,
        reason: null,
        persistentProfile: true,
        capabilities: { persistentProfile: true, selector: { inspect: true } },
      })
      .mockResolvedValueOnce({ opened: true, reason: null })
      .mockResolvedValueOnce({ loaded: true, reason: null })
      .mockResolvedValueOnce({ reloaded: true, reason: null })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ supported: true, reason: null })
      .mockResolvedValueOnce({ supported: true, reason: null })
      .mockResolvedValueOnce({ supported: true, reason: null })
      .mockResolvedValueOnce(undefined);

    const bridge = require('../nativeBrowserBridge');
    const openPayload = {
      panelId: 'browser-panel',
      url: 'https://example.com',
      bounds: { x: 20, y: 24, width: 960, height: 640 },
    };

    await bridge.probeNativeBrowser({
      panelId: 'browser-panel',
      requestedMode: 'native-gtk',
      tauriAvailable: true,
    });
    await bridge.openNativeBrowser(openPayload);
    await bridge.loadNativeBrowserUrl({
      panelId: 'browser-panel',
      url: 'https://example.com/docs',
    });
    await bridge.reloadNativeBrowser({ panelId: 'browser-panel' });
    await bridge.resizeNativeBrowser({ panelId: 'browser-panel', bounds: openPayload.bounds });
    await bridge.focusNativeBrowser({ panelId: 'browser-panel' });
    await bridge.setNativeBrowserVisibility({
      panelId: 'browser-panel',
      visible: true,
      bounds: openPayload.bounds,
    });
    await bridge.nativeBrowserSelectorCommand({
      panelId: 'browser-panel',
      action: 'activate',
      mode: 'select',
    });
    await bridge.selectAllNativeBrowser({ panelId: 'browser-panel' });
    await bridge.copyNativeBrowser({ panelId: 'browser-panel' });
    await bridge.closeNativeBrowser({ panelId: 'browser-panel', reason: 'cleanup' });

    expect(invokeMock).toHaveBeenNthCalledWith(1, 'native_browser_probe', {
      request: { panelId: 'browser-panel', requestedMode: 'native-gtk', tauriAvailable: true },
    });
    expect(invokeMock).toHaveBeenNthCalledWith(2, 'native_browser_open', { request: openPayload });
    expect(invokeMock).toHaveBeenNthCalledWith(3, 'native_browser_load_url', {
      request: { panelId: 'browser-panel', url: 'https://example.com/docs' },
    });
    expect(invokeMock).toHaveBeenNthCalledWith(4, 'native_browser_reload', {
      request: { panelId: 'browser-panel' },
    });
    expect(invokeMock).toHaveBeenNthCalledWith(5, 'native_browser_resize', {
      request: { panelId: 'browser-panel', bounds: openPayload.bounds },
    });
    expect(invokeMock).toHaveBeenNthCalledWith(6, 'native_browser_focus', {
      request: { panelId: 'browser-panel' },
    });
    expect(invokeMock).toHaveBeenNthCalledWith(7, 'native_browser_set_visibility', {
      request: { panelId: 'browser-panel', visible: true, bounds: openPayload.bounds },
    });
    expect(invokeMock).toHaveBeenNthCalledWith(8, 'native_browser_selector_command', {
      request: { panelId: 'browser-panel', action: 'activate', mode: 'select' },
    });
    expect(invokeMock).toHaveBeenNthCalledWith(9, 'native_browser_select_all', {
      request: { panelId: 'browser-panel' },
    });
    expect(invokeMock).toHaveBeenNthCalledWith(10, 'native_browser_copy', {
      request: { panelId: 'browser-panel' },
    });
    expect(invokeMock).toHaveBeenNthCalledWith(11, 'native_browser_close', {
      request: { panelId: 'browser-panel', reason: 'cleanup' },
    });
  });

  test('subscribes native selector events and re-dispatches them on window', async () => {
    const unlisten = jest.fn();
    let callback = null;
    listenMock.mockImplementation(async (_eventName, handler) => {
      callback = handler;
      return unlisten;
    });

    const bridge = require('../nativeBrowserBridge');
    const payloads = [];
    window.addEventListener('devhub:native-browser-event', (event) => payloads.push(event.detail));

    const teardown = await bridge.subscribeNativeBrowserEvents();
    expect(listenMock).toHaveBeenCalledWith('native-browser-event', expect.any(Function));

    callback?.({
      payload: {
        panelId: 'browser-panel',
        type: 'selector-selected',
        element: { tagName: 'button' },
      },
    });
    expect(payloads).toEqual([
      { panelId: 'browser-panel', type: 'selector-selected', element: { tagName: 'button' } },
    ]);

    teardown();
    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  test('reports desktop-unavailable when the desktop runtime is missing', async () => {
    delete window.__TAURI_INTERNALS__;
    const bridge = require('../nativeBrowserBridge');

    await expect(bridge.probeNativeBrowser({ panelId: 'browser-panel' })).resolves.toEqual({
      ready: false,
      reason: 'desktop-unavailable',
    });
  });

  test('E2 avoid/hide/workspace helpers fail-closed without desktop runtime', async () => {
    delete window.__TAURI_INTERNALS__;
    const bridge = require('../nativeBrowserBridge');

    await expect(bridge.setNativeBrowserAvoidRects({ panelId: 'p1', rects: [] })).resolves.toEqual({
      reason: 'desktop-unavailable',
    });
    await expect(bridge.hideAllNativeBrowsers({ reason: 'modal' })).resolves.toEqual({
      hidden: false,
      reason: 'desktop-unavailable',
    });
    await expect(bridge.showNativeBrowsersForWorkspace({ workspaceId: 'ws-1' })).resolves.toEqual({
      reason: 'desktop-unavailable',
    });
  });

  test('E2 avoid/hide/workspace helpers wrap request on Tauri', async () => {
    invokeMock.mockResolvedValue({});
    const bridge = require('../nativeBrowserBridge');

    await bridge.setNativeBrowserAvoidRects({
      panelId: 'p1',
      rects: [{ x: 0, y: 0, width: 10, height: 10 }],
    });
    await bridge.hideAllNativeBrowsers({ reason: 'overlay' });
    await bridge.showNativeBrowsersForWorkspace({ workspaceId: null });

    expect(invokeMock).toHaveBeenCalledWith('native_browser_set_avoid_rects', {
      request: { panelId: 'p1', rects: [{ x: 0, y: 0, width: 10, height: 10 }] },
    });
    expect(invokeMock).toHaveBeenCalledWith('native_browser_hide_all', {
      request: { reason: 'overlay' },
    });
    expect(invokeMock).toHaveBeenCalledWith('native_browser_show_workspace', {
      request: { workspaceId: null },
    });
  });
});
