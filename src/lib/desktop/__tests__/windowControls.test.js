/**
 * @jest-environment jsdom
 */

describe('windowControls', () => {
  beforeEach(() => {
    jest.resetModules();
    delete window.devhubDesktop;
    delete window.__TAURI_INTERNALS__;
    delete window.__TAURI__;
  });

  afterEach(() => {
    delete window.devhubDesktop;
    delete window.__TAURI_INTERNALS__;
    jest.clearAllMocks();
    jest.resetModules();
  });

  test('web fail-closed returns desktop-unavailable style reason', async () => {
    const controls = require('../windowControls');
    await expect(controls.minimize()).resolves.toMatchObject({
      ok: false,
      reason: 'web-no-window-controls',
    });
    await expect(controls.isMaximized()).resolves.toBe(false);
  });

  test('electron routes to invokeDesktop commands', async () => {
    const invoke = jest.fn(async (command) => {
      if (command === 'window_is_maximized') return true;
      return { ok: true };
    });
    window.devhubDesktop = { isElectron: true, invoke };

    const controls = require('../windowControls');
    await controls.minimize();
    await controls.maximize();
    await controls.unmaximize();
    await controls.toggleMaximize();
    await controls.close();
    const max = await controls.isMaximized();

    expect(invoke).toHaveBeenCalledWith('window_minimize', {});
    expect(invoke).toHaveBeenCalledWith('window_maximize', {});
    expect(invoke).toHaveBeenCalledWith('window_unmaximize', {});
    expect(invoke).toHaveBeenCalledWith('window_toggle_maximize', {});
    expect(invoke).toHaveBeenCalledWith('window_close', {});
    expect(invoke).toHaveBeenCalledWith('window_is_maximized', {});
    expect(max).toBe(true);
  });
});
