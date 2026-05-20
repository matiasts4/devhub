const { JSDOM } = require('jsdom');

describe('nativeBrowserBridge', () => {
  let dom;
  let invokeMock;

  beforeEach(() => {
    jest.resetModules();
    dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'https://devhub.test',
    });

    global.window = dom.window;
    global.document = dom.window.document;
    window.__TAURI_INTERNALS__ = {};

    invokeMock = jest.fn();

    jest.doMock('@tauri-apps/api/core', () => ({
      invoke: invokeMock,
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
      .mockResolvedValueOnce({ ready: true, reason: null })
      .mockResolvedValueOnce({ opened: true, reason: null })
      .mockResolvedValueOnce({ loaded: true, reason: null })
      .mockResolvedValueOnce({ reloaded: true, reason: null })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ supported: true, reason: null })
      .mockResolvedValueOnce({ supported: true, reason: null })
      .mockResolvedValueOnce(undefined);

    const bridge = require('../nativeBrowserBridge');
    const openPayload = {
      panelId: 'browser-panel',
      url: 'https://example.com',
      bounds: { x: 20, y: 24, width: 960, height: 640 },
    };

    await bridge.probeNativeBrowser({ panelId: 'browser-panel', requestedMode: 'native-gtk', tauriAvailable: true });
    await bridge.openNativeBrowser(openPayload);
    await bridge.loadNativeBrowserUrl({ panelId: 'browser-panel', url: 'https://example.com/docs' });
    await bridge.reloadNativeBrowser({ panelId: 'browser-panel' });
    await bridge.resizeNativeBrowser({ panelId: 'browser-panel', bounds: openPayload.bounds });
    await bridge.focusNativeBrowser({ panelId: 'browser-panel' });
    await bridge.setNativeBrowserVisibility({ panelId: 'browser-panel', visible: true, bounds: openPayload.bounds });
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
    expect(invokeMock).toHaveBeenNthCalledWith(8, 'native_browser_select_all', {
      request: { panelId: 'browser-panel' },
    });
    expect(invokeMock).toHaveBeenNthCalledWith(9, 'native_browser_copy', {
      request: { panelId: 'browser-panel' },
    });
    expect(invokeMock).toHaveBeenNthCalledWith(10, 'native_browser_close', {
      request: { panelId: 'browser-panel', reason: 'cleanup' },
    });
  });

  test('reports tauri-unavailable when the desktop runtime is missing', async () => {
    delete window.__TAURI_INTERNALS__;
    const bridge = require('../nativeBrowserBridge');

    await expect(bridge.probeNativeBrowser({ panelId: 'browser-panel' })).resolves.toEqual({
      ready: false,
      reason: 'tauri-unavailable',
    });
  });
});
