/**
 * @jest-environment jsdom
 */

describe('dialogs.openDialog', () => {
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

  test('web fail-closed returns null (canceled)', async () => {
    const { openDialog } = require('../dialogs');
    await expect(openDialog({ directory: true })).resolves.toBeNull();
  });

  test('electron maps dialog_open paths to Tauri-compatible shape', async () => {
    const invoke = jest.fn().mockResolvedValue({
      canceled: false,
      path: 'D:\\projects\\devhub',
      paths: ['D:\\projects\\devhub'],
      filePaths: ['D:\\projects\\devhub'],
    });
    window.devhubDesktop = { isElectron: true, invoke };

    const { openDialog } = require('../dialogs');
    const selected = await openDialog({
      directory: true,
      multiple: false,
      title: 'Pick folder',
    });

    expect(invoke).toHaveBeenCalledWith('dialog_open', {
      directory: true,
      multiple: false,
      filters: undefined,
      title: 'Pick folder',
    });
    expect(selected).toBe('D:\\projects\\devhub');
  });

  test('electron multiple returns path array', async () => {
    const invoke = jest.fn().mockResolvedValue({
      canceled: false,
      paths: ['a.txt', 'b.txt'],
      filePaths: ['a.txt', 'b.txt'],
    });
    window.devhubDesktop = { isElectron: true, invoke };

    const { openDialog } = require('../dialogs');
    const selected = await openDialog({ multiple: true });
    expect(selected).toEqual(['a.txt', 'b.txt']);
  });

  test('electron canceled returns null', async () => {
    const invoke = jest.fn().mockResolvedValue({ canceled: true, paths: [] });
    window.devhubDesktop = { isElectron: true, invoke };

    const { openDialog } = require('../dialogs');
    await expect(openDialog({})).resolves.toBeNull();
  });

  test('tauri path uses plugin-dialog open', async () => {
    window.__TAURI_INTERNALS__ = {};
    const open = jest.fn().mockResolvedValue('/home/user/project');
    jest.doMock('@tauri-apps/plugin-dialog', () => ({ open }));

    const { openDialog } = require('../dialogs');
    const selected = await openDialog({ directory: true, title: 'Base' });
    expect(open).toHaveBeenCalledWith({
      directory: true,
      multiple: false,
      filters: undefined,
      title: 'Base',
    });
    expect(selected).toBe('/home/user/project');
  });
});
