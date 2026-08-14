/**
 * @jest-environment jsdom
 */

describe('nativeBrowserFeatureFlag', () => {
  const originalEnv = process.env.NEXT_PUBLIC_DEVHUB_NATIVE_BROWSER;

  beforeEach(() => {
    jest.resetModules();
    delete process.env.NEXT_PUBLIC_DEVHUB_NATIVE_BROWSER;
    try {
      window.localStorage.removeItem('devhub_native_browser');
    } catch {
      // ignore
    }
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.NEXT_PUBLIC_DEVHUB_NATIVE_BROWSER;
    } else {
      process.env.NEXT_PUBLIC_DEVHUB_NATIVE_BROWSER = originalEnv;
    }
  });

  test('FORCE_DISABLED true keeps browser off by default', () => {
    jest.isolateModules(() => {
      // Re-require after reset so module re-evaluates with env cleared.
      // The constant NATIVE_BROWSER_FORCE_DISABLED is true in source.
      const {
        isNativeBrowserEnabled,
        getNativeBrowserDisableReason,
        NATIVE_BROWSER_FORCE_DISABLED,
        _resetNativeBrowserFlagForTests,
      } = require('../nativeBrowserFeatureFlag');
      _resetNativeBrowserFlagForTests();
      expect(NATIVE_BROWSER_FORCE_DISABLED).toBe(true);
      expect(isNativeBrowserEnabled()).toBe(false);
      expect(getNativeBrowserDisableReason()).toBe('force-disabled');
    });
  });

  test('localStorage=1 re-enables even when force-disabled', () => {
    window.localStorage.setItem('devhub_native_browser', '1');
    jest.isolateModules(() => {
      const {
        isNativeBrowserEnabled,
        _resetNativeBrowserFlagForTests,
      } = require('../nativeBrowserFeatureFlag');
      _resetNativeBrowserFlagForTests();
      expect(isNativeBrowserEnabled()).toBe(true);
    });
  });

  test('env=0 disables even if test override not set', () => {
    process.env.NEXT_PUBLIC_DEVHUB_NATIVE_BROWSER = '0';
    // Storage empty; force-disabled also true — still off.
    jest.isolateModules(() => {
      const {
        isNativeBrowserEnabled,
        getNativeBrowserDisableReason,
        _resetNativeBrowserFlagForTests,
      } = require('../nativeBrowserFeatureFlag');
      _resetNativeBrowserFlagForTests();
      expect(isNativeBrowserEnabled()).toBe(false);
      // storage wins only if set; force-disabled is the reason when no storage
      expect(['force-disabled', 'env']).toContain(getNativeBrowserDisableReason());
    });
  });

  test('test override can force enable', () => {
    jest.isolateModules(() => {
      const {
        isNativeBrowserEnabled,
        _setNativeBrowserEnabledForTests,
        _resetNativeBrowserFlagForTests,
      } = require('../nativeBrowserFeatureFlag');
      _resetNativeBrowserFlagForTests();
      _setNativeBrowserEnabledForTests(true);
      expect(isNativeBrowserEnabled()).toBe(true);
      _setNativeBrowserEnabledForTests(false);
      expect(isNativeBrowserEnabled()).toBe(false);
    });
  });
});
