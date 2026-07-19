const {
  detectDesktopRuntime,
  isElectronDesktop,
  isTauriDesktop,
  isDesktopHost,
} = require('../desktopRuntime');

describe('desktopRuntime', () => {
  test('detects electron when devhubDesktop.isElectron is true', () => {
    const win = { devhubDesktop: { isElectron: true } };
    expect(detectDesktopRuntime(win)).toBe('electron');
    expect(isElectronDesktop(win)).toBe(true);
    expect(isDesktopHost(win)).toBe(true);
  });

  test('prefers electron over tauri markers', () => {
    const win = {
      devhubDesktop: { isElectron: true },
      __TAURI_INTERNALS__: {},
    };
    expect(detectDesktopRuntime(win)).toBe('electron');
  });

  test('detects tauri', () => {
    const win = { __TAURI_INTERNALS__: {} };
    expect(detectDesktopRuntime(win)).toBe('tauri');
    expect(isTauriDesktop(win)).toBe(true);
    expect(isDesktopHost(win)).toBe(true);
  });

  test('web when no desktop markers', () => {
    const win = {};
    expect(detectDesktopRuntime(win)).toBe('web');
    expect(isDesktopHost(win)).toBe(false);
  });
});
