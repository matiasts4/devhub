/**
 * Unit tests for src/lib/appVersion.js — version resolution order:
 * Electron ping → NEXT_PUBLIC_APP_VERSION → 'dev'.
 *
 * @jest-environment jsdom
 */

describe('getAppVersion()', () => {
  const ORIGINAL_ENV = process.env.NEXT_PUBLIC_APP_VERSION;

  beforeEach(() => {
    jest.resetModules();
    delete window.devhubDesktop;
    delete process.env.NEXT_PUBLIC_APP_VERSION;
  });

  afterAll(() => {
    delete window.devhubDesktop;
    if (ORIGINAL_ENV === undefined) {
      delete process.env.NEXT_PUBLIC_APP_VERSION;
    } else {
      process.env.NEXT_PUBLIC_APP_VERSION = ORIGINAL_ENV;
    }
  });

  function load() {
    return require('../appVersion');
  }

  test('prefers the Electron host version from desktop_ping', async () => {
    window.devhubDesktop = {
      isElectron: true,
      invoke: jest.fn(async () => ({ ok: true, host: 'electron', version: '0.1.1' })),
    };
    process.env.NEXT_PUBLIC_APP_VERSION = '0.1.0';

    const { getAppVersion } = load();
    await expect(getAppVersion()).resolves.toBe('0.1.1');
    expect(window.devhubDesktop.invoke).toHaveBeenCalledWith('desktop_ping');
  });

  test('falls back to NEXT_PUBLIC_APP_VERSION outside Electron', async () => {
    process.env.NEXT_PUBLIC_APP_VERSION = '0.1.0';

    const { getAppVersion } = load();
    await expect(getAppVersion()).resolves.toBe('0.1.0');
  });

  test('falls back to build-time version when the ping has no version', async () => {
    window.devhubDesktop = {
      isElectron: true,
      invoke: jest.fn(async () => ({ ok: true, host: 'electron' })),
    };
    process.env.NEXT_PUBLIC_APP_VERSION = '0.1.0';

    const { getAppVersion } = load();
    await expect(getAppVersion()).resolves.toBe('0.1.0');
  });

  test('falls back to build-time version when the ping rejects', async () => {
    window.devhubDesktop = {
      isElectron: true,
      invoke: jest.fn(async () => Promise.reject(new Error('ipc down'))),
    };
    process.env.NEXT_PUBLIC_APP_VERSION = '0.1.0';

    const { getAppVersion } = load();
    await expect(getAppVersion()).resolves.toBe('0.1.0');
  });

  test("returns 'dev' when no source has a version", async () => {
    const { getAppVersion } = load();
    await expect(getAppVersion()).resolves.toBe('dev');
  });

  test('caches the resolution (single ping)', async () => {
    window.devhubDesktop = {
      isElectron: true,
      invoke: jest.fn(async () => ({ ok: true, version: '0.1.1' })),
    };

    const { getAppVersion } = load();
    await getAppVersion();
    await getAppVersion();
    expect(window.devhubDesktop.invoke).toHaveBeenCalledTimes(1);
  });
});
