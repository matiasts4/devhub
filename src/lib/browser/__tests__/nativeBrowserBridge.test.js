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

  test('reports tauri-unavailable when the desktop runtime is missing', async () => {
    delete window.__TAURI_INTERNALS__;
    const bridge = require('../nativeBrowserBridge');

    await expect(bridge.probeNativeBrowser({ panelId: 'browser-panel' })).resolves.toEqual({
      ready: false,
      reason: 'tauri-unavailable',
    });
  });

  test('await blocks open until scheduleNativeBrowserStartupSweep finishes', async () => {
    invokeMock.mockResolvedValue({ purged: 0 });
    const bridge = require('../nativeBrowserBridge');

    let sweepDone = false;
    const awaiter = bridge.awaitNativeBrowserStartupSweep({ timeoutMs: 0 }).then(() => {
      expect(sweepDone).toBe(true);
    });

    await Promise.resolve();
    expect(sweepDone).toBe(false);

    bridge.scheduleNativeBrowserStartupSweep(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
      sweepDone = true;
    });

    await awaiter;
    expect(sweepDone).toBe(true);
  });

  test('resizeNativeBrowser returns reason when invoke fails', async () => {
    invokeMock.mockRejectedValueOnce(new Error('panel-not-found'));
    const bridge = require('../nativeBrowserBridge');

    await expect(
      bridge.resizeNativeBrowser({
        panelId: 'browser-panel',
        bounds: { x: 0, y: 48, width: 400, height: 300 },
      })
    ).resolves.toEqual(expect.objectContaining({ reason: 'panel-not-found' }));
  });

  test('scheduleNativeBrowserResize coalesces to latest bounds per frame', async () => {
    invokeMock.mockResolvedValue(undefined);
    const bridge = require('../nativeBrowserBridge');
    const rafQueue = [];
    window.requestAnimationFrame = (cb) => {
      rafQueue.push(cb);
      return rafQueue.length;
    };
    window.cancelAnimationFrame = (id) => {
      rafQueue[id - 1] = null;
    };

    bridge.scheduleNativeBrowserResize({
      panelId: 'browser-live',
      bounds: { x: 10, y: 80, width: 200, height: 300 },
    });
    bridge.scheduleNativeBrowserResize({
      panelId: 'browser-live',
      bounds: { x: 10, y: 80, width: 500, height: 300 },
    });

    expect(invokeMock).not.toHaveBeenCalled();
    expect(rafQueue.filter(Boolean)).toHaveLength(1);

    const frame = rafQueue.find(Boolean);
    frame();
    await bridge.flushNativeBrowserResize({ panelId: 'browser-live' });

    const resizeCalls = invokeMock.mock.calls.filter((c) => c[0] === 'native_browser_resize');
    expect(resizeCalls.length).toBeGreaterThanOrEqual(1);
    expect(resizeCalls[resizeCalls.length - 1][1].request.bounds.width).toBe(500);
    const visCalls = invokeMock.mock.calls.filter((c) => c[0] === 'native_browser_set_visibility');
    expect(visCalls.length).toBeGreaterThanOrEqual(1);
    expect(visCalls[visCalls.length - 1][1].request.visible).toBe(true);
    expect(visCalls[visCalls.length - 1][1].request.bounds.width).toBe(500);
  });

  test('flushNativeBrowserResize applies pending bounds immediately', async () => {
    invokeMock.mockResolvedValue(undefined);
    const bridge = require('../nativeBrowserBridge');
    const rafQueue = [];
    window.requestAnimationFrame = (cb) => {
      rafQueue.push(cb);
      return rafQueue.length;
    };
    window.cancelAnimationFrame = jest.fn((id) => {
      rafQueue[id - 1] = null;
    });

    bridge.scheduleNativeBrowserResize({
      panelId: 'browser-flush',
      bounds: { x: 1, y: 80, width: 100, height: 200 },
    });
    await bridge.flushNativeBrowserResize({
      panelId: 'browser-flush',
      bounds: { x: 1, y: 80, width: 333, height: 200 },
    });

    const resizeCalls = invokeMock.mock.calls.filter((c) => c[0] === 'native_browser_resize');
    expect(resizeCalls.length).toBeGreaterThanOrEqual(1);
    expect(resizeCalls[resizeCalls.length - 1][1].request.bounds.width).toBe(333);
  });

  test('emitNativeBrowserClosed dispatches window event', () => {
    const bridge = require('../nativeBrowserBridge');
    const payloads = [];
    window.addEventListener('devhub:native-browser-closed', (e) => payloads.push(e.detail));
    bridge.emitNativeBrowserClosed('browser-panel', 'dock-not-browser');
    expect(payloads).toEqual([{ panelId: 'browser-panel', reason: 'dock-not-browser' }]);
  });
});
