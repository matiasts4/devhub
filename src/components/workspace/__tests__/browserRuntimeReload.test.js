const mockReloadNativeBrowser = jest.fn();

jest.mock('@/lib/browser/nativeBrowserBridge', () => ({
  reloadNativeBrowser: mockReloadNativeBrowser,
}));

describe('reloadBrowserRuntime', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('falls back to handleReload when native reload fails', async () => {
    mockReloadNativeBrowser.mockRejectedValueOnce(new Error('bridge down'));
    const handleReload = jest.fn();
    const { reloadBrowserRuntime } = require('../browserRuntimeReload');

    await reloadBrowserRuntime({
      nativeRuntimeActive: true,
      nativePanelId: 'browser-project-workspace',
      handleReload,
    });

    expect(mockReloadNativeBrowser).toHaveBeenCalledWith({ panelId: 'browser-project-workspace' });
    expect(handleReload).toHaveBeenCalledTimes(1);
  });

  test('uses the regular reload path when native runtime is inactive', async () => {
    const handleReload = jest.fn();
    const { reloadBrowserRuntime } = require('../browserRuntimeReload');

    await reloadBrowserRuntime({
      nativeRuntimeActive: false,
      nativePanelId: 'browser-project-workspace',
      handleReload,
    });

    expect(mockReloadNativeBrowser).not.toHaveBeenCalled();
    expect(handleReload).toHaveBeenCalledTimes(1);
  });
});
