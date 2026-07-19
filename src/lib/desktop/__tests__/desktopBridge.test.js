/**
 * @jest-environment jsdom
 */

describe('desktopBridge', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    delete window.devhubDesktop;
    delete window.__TAURI_INTERNALS__;
    jest.clearAllMocks();
    jest.resetModules();
  });

  test('fail-closed on web returns failureShape', async () => {
    const { invokeDesktop } = require('../desktopBridge');
    await expect(
      invokeDesktop(
        'native_browser_probe',
        {},
        { failureShape: { ready: false, reason: 'tauri-unavailable' } }
      )
    ).resolves.toEqual({ ready: false, reason: 'tauri-unavailable' });
  });

  test('electron path uses devhubDesktop.invoke without request wrapper', async () => {
    const invoke = jest.fn().mockResolvedValue({ ready: true, reason: null });
    window.devhubDesktop = { isElectron: true, invoke };

    const { invokeDesktop } = require('../desktopBridge');
    const result = await invokeDesktop(
      'native_browser_probe',
      { panelId: 'p1' },
      { failureShape: { ready: false, reason: 'tauri-unavailable' } }
    );

    expect(invoke).toHaveBeenCalledWith('native_browser_probe', { panelId: 'p1' });
    expect(result).toEqual({ ready: true, reason: null });
  });

  test('tauri path wraps payload in request', async () => {
    window.__TAURI_INTERNALS__ = {};
    const invoke = jest.fn().mockResolvedValue({ opened: true });
    jest.doMock('@tauri-apps/api/core', () => ({ invoke }));

    const { invokeDesktop } = require('../desktopBridge');
    await invokeDesktop('native_browser_open', { panelId: 'p1', url: 'https://example.com' });

    expect(invoke).toHaveBeenCalledWith('native_browser_open', {
      request: { panelId: 'p1', url: 'https://example.com' },
    });
  });
});
